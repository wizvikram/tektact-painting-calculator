/* Pure calculation helpers shared by the browser and the automated tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TektactQuotation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_QUANTITY = 1_000_000_000;
  const MAX_RATE = 1_000_000_000;
  const MAX_PAISE = 99_999_999_999_999;
  const MAX_AMOUNT = MAX_PAISE / 100;

  function number(value, label, maximum, positive = false) {
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
      throw new RangeError(`${label} is required.`);
    }
    const result = Number(value);
    if (!Number.isFinite(result) || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim())) {
      throw new RangeError(`${label} must be a finite number.`);
    }
    if (positive ? result <= 0 : result < 0) {
      throw new RangeError(`${label} must be ${positive ? "greater than zero" : "zero or more"}.`);
    }
    if (result > maximum) throw new RangeError(`${label} is too large (maximum ${maximum}).`);
    return result;
  }

  // Convert a decimal to an exact fraction so values such as 1.005 round to 1.01.
  // A small precision limit also prevents accidentally processing enormous exponents.
  function fraction(value, label = "Value") {
    const text = String(value).trim().replace(/^\+/, "").toLowerCase();
    if (text.length > 64) throw new RangeError(`${label} has too many digits.`);
    const [mantissa, exponentText = "0"] = text.split("e");
    const exponent = Number(exponentText);
    const [whole, decimal = ""] = mantissa.split(".");
    const scale = decimal.length - exponent;
    if (Math.abs(scale) > 24) throw new RangeError(`${label} has too much decimal precision.`);
    const digits = BigInt((whole || "0") + decimal);
    return scale >= 0
      ? { numerator: digits, denominator: 10n ** BigInt(scale) }
      : { numerator: digits * 10n ** BigInt(-scale), denominator: 1n };
  }

  function roundFractionToPaise(numerator, denominator) {
    const paise = (numerator * 200n + denominator) / (denominator * 2n);
    if (paise > BigInt(MAX_PAISE)) throw new RangeError("Quotation amount is too large.");
    return Number(paise);
  }

  function toPaise(value, label = "Amount") {
    number(value, label, MAX_AMOUNT);
    const exact = fraction(value, label);
    return roundFractionToPaise(exact.numerator, exact.denominator);
  }

  function roundMoney(amount) {
    return toPaise(amount) / 100;
  }

  function measurement(method, values, deduction = 0, manualUnit = "SFT") {
    if (!values || typeof values !== "object") throw new RangeError("Measurement dimensions are required.");
    const dimension = (key) => number(values[key], key[0].toUpperCase() + key.slice(1), MAX_QUANTITY, true);
    let gross;
    let unit = "SFT";
    let isArea = true;
    switch (method) {
      case "room": gross = 2 * (dimension("width") + dimension("breadth")) * dimension("height"); break;
      case "wall": gross = dimension("width") * dimension("height"); break;
      case "floor": gross = dimension("width") * dimension("breadth"); break;
      case "sections": {
        const count = dimension("count");
        if (!Number.isInteger(count)) throw new RangeError("Number of sections must be a whole number.");
        gross = dimension("width") * dimension("breadth") * count;
        break;
      }
      case "linear": gross = dimension("length"); unit = "RFT"; isArea = false; break;
      case "volume": gross = dimension("length") * dimension("width") * dimension("depth"); unit = "CFT"; isArea = false; break;
      case "manual":
        gross = dimension("quantity");
        if (!["SFT", "RFT", "CFT", "UNIT", "LS"].includes(manualUnit)) throw new RangeError("Choose a supported manual unit.");
        unit = manualUnit;
        isArea = unit === "SFT";
        break;
      default: throw new RangeError("Choose a supported measurement method.");
    }
    number(gross, "Calculated quantity", MAX_QUANTITY);
    const deducted = number(deduction, "Deduction", MAX_QUANTITY);
    if (!isArea && deducted !== 0) throw new RangeError("Square-foot deductions apply only to area measurements.");
    // Keep dimensions precise; remove only insignificant binary arithmetic noise.
    gross = Number(gross.toPrecision(15));
    if (deducted > gross) throw new RangeError("Deduction cannot exceed the measured area.");
    const quantity = Number((gross - deducted).toPrecision(15));
    return { quantity, unit, gross, deduction: deducted };
  }

  const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function smallWords(value) {
    if (value >= 100) return ONES[Math.floor(value / 100)] + " Hundred" + (value % 100 ? " " + smallWords(value % 100) : "");
    if (value >= 20) return TENS[Math.floor(value / 10)] + (value % 10 ? " " + ONES[value % 10] : "");
    return ONES[value];
  }

  function integerWords(value) {
    if (value === 0) return "Zero";
    const parts = [];
    for (const [divisor, label] of [[10_000_000, "Crore"], [100_000, "Lakh"], [1000, "Thousand"]]) {
      if (value >= divisor) {
        const count = Math.floor(value / divisor);
        parts.push((divisor === 10_000_000 ? integerWords(count) : smallWords(count)) + " " + label);
        value %= divisor;
      }
    }
    if (value) parts.push(smallWords(value));
    return parts.join(" ");
  }

  function wordsFromPaise(paise) {
    const rupees = Math.floor(paise / 100);
    const remainder = paise % 100;
    return "Rupees " + integerWords(rupees) + (remainder ? " and " + integerWords(remainder) + " Paise" : "") + " Only.";
  }

  function amountInWords(amount) {
    return wordsFromPaise(toPaise(amount));
  }

  function calculateQuote(items) {
    if (!Array.isArray(items) || items.length > 500) throw new RangeError("Enter up to 500 quotation items.");
    let totalPaise = 0;
    const calculatedItems = items.map((item, index) => {
      if (!item || typeof item !== "object") throw new RangeError(`Complete quotation item ${index + 1}.`);
      const quantity = number(item.quantity, `Item ${index + 1} quantity`, MAX_QUANTITY, true);
      const rate = number(item.rate, `Item ${index + 1} rate`, MAX_RATE);
      const exactQuantity = fraction(item.quantity, "Quantity");
      const exactRate = fraction(item.rate, "Rate");
      const paise = roundFractionToPaise(exactQuantity.numerator * exactRate.numerator, exactQuantity.denominator * exactRate.denominator);
      totalPaise += paise;
      if (!Number.isSafeInteger(totalPaise) || totalPaise > MAX_PAISE) throw new RangeError("Quotation total is too large.");
      return { quantity, rate, amount: paise / 100, paise };
    });
    return { items: calculatedItems, total: totalPaise / 100, totalPaise, words: wordsFromPaise(totalPaise) };
  }

  return { measurement, calculateQuote, amountInWords, roundMoney, MAX_AMOUNT, MAX_QUANTITY, MAX_RATE };
});
