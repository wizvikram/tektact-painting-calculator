const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const core = require("../quotation-core.js");

test("painting room walls deduct one door and two windows exactly", () => {
  assert.deepEqual(core.measurement("room", { width: 20, breadth: 15, height: 10 }, 3 * 7 + 2 * 4 * 4), {
    quantity: 647, unit: "SFT", gross: 700, deduction: 53,
  });
});

for (const [title, method, dimensions, deduction, quantity, unit] of [
  ["single painting wall", "wall", { width: 12.5, height: 9 }, 7.5, 105, "SFT"],
  ["ceiling or waterproof terrace", "floor", { width: 20, breadth: 30 }, 50, 550, "SFT"],
  ["multiple flooring sections", "sections", { width: 10, breadth: 20, count: 3 }, 35, 565, "SFT"],
  ["waterproofing linear crack", "linear", { length: 18.25 }, 0, 18.25, "RFT"],
  ["waterproofing volume", "volume", { length: 6, width: 4, depth: 0.25 }, 0, 6, "CFT"],
  ["manual painting area", "manual", { quantity: 100 }, 12, 88, "SFT"],
]) {
  test(`${title} uses the correct dimensions and unit`, () => {
    const measured = core.measurement(method, dimensions, deduction);
    assert.equal(measured.quantity, quantity);
    assert.equal(measured.unit, unit);
  });
}

test("manual waterproofing quantity supports count and lump sum units", () => {
  assert.deepEqual(core.measurement("manual", { quantity: 1 }, 0, "LS"), { quantity: 1, unit: "LS", gross: 1, deduction: 0 });
  assert.equal(core.measurement("manual", { quantity: 3 }, 0, "UNIT").unit, "UNIT");
});

test("decimal dimensions retain useful precision without binary noise", () => {
  assert.equal(core.measurement("floor", { width: 0.1, breadth: 0.2 }).quantity, 0.02);
  assert.equal(core.measurement("wall", { width: "3.333333", height: "3" }).quantity, 9.999999);
  assert.equal(core.measurement("floor", { width: 10, breadth: 12 }, 120).quantity, 0);
});

test("missing, negative, nonfinite and impossible dimensions are rejected", () => {
  for (const value of ["", " ", -1, 0, Infinity, NaN, "Infinity", "not a number", true, null]) {
    assert.throws(() => core.measurement("wall", { width: value, height: 10 }), /required|number|zero/);
  }
  assert.throws(() => core.measurement("sections", { width: 10, breadth: 10, count: 1.5 }), /whole number/);
  assert.throws(() => core.measurement("floor", { width: 10, breadth: 10 }, -1), /zero or more/);
  assert.throws(() => core.measurement("floor", { width: 10, breadth: 10 }, ""), /required/);
  assert.throws(() => core.measurement("floor", { width: 10, breadth: 10 }, 101), /cannot exceed/);
  assert.throws(() => core.measurement("linear", { length: 20 }, 1), /only to area/);
  assert.throws(() => core.measurement("volume", { length: 2, width: 3, depth: 4 }, 1), /only to area/);
  assert.throws(() => core.measurement("manual", { quantity: 20 }, 1, "UNIT"), /only to area/);
  assert.throws(() => core.measurement("manual", { quantity: 20 }, 0, "UNKNOWN"), /supported manual unit/);
  assert.throws(() => core.measurement("floor", { width: 1e9, breadth: 1e9 }), /too large/);
  assert.throws(() => core.measurement("unsupported", {}), /supported measurement/);
});

test("each line rounds in paise before summing, avoiding floating point totals", () => {
  const result = core.calculateQuote([{ quantity: "1", rate: "1.005" }, { quantity: 1, rate: 1.005 }]);
  assert.deepEqual(result.items.map((item) => item.amount), [1.01, 1.01]);
  assert.equal(result.total, 2.02);
  assert.equal(result.totalPaise, 202);
  assert.equal(result.words, "Rupees Two and Two Paise Only.");
  assert.equal(core.calculateQuote([{ quantity: "0.1", rate: "0.1" }]).total, 0.01);
  assert.equal(core.calculateQuote([{ quantity: "1e2", rate: ".125" }]).total, 12.5);
});

test("painting, waterproofing and flooring quote lines add correctly", () => {
  const quote = core.calculateQuote([
    { quantity: 647, rate: 25 },
    { quantity: 550, rate: 85 },
    { quantity: 565, rate: 120 },
  ]);
  assert.deepEqual(quote.items.map((item) => item.amount), [16175, 46750, 67800]);
  assert.equal(quote.total, 130725);
  assert.equal(quote.words, "Rupees One Lakh Thirty Thousand Seven Hundred Twenty Five Only.");
});

test("customer lump-sum transfer preserves its exact total using a unit quantity", () => {
  const imported = core.calculateQuote([{ quantity: 1, rate: "30637.01" }]);
  assert.equal(imported.total, 30637.01);
  assert.equal(imported.totalPaise, 3063701);
  assert.equal(core.calculateQuote([{ quantity: 647, rate: "47.3524" }]).total, 30637);
  // A separate amount field can never override the visible quantity and rate.
  assert.equal(core.calculateQuote([{ quantity: 2, rate: 10, amount: 999 }]).total, 20);
});

test("invalid quote rows never silently contribute zero", () => {
  for (const value of ["", " ", -1, 0, Infinity, NaN, "not a number", null]) {
    assert.throws(() => core.calculateQuote([{ quantity: value, rate: 50 }]), /quantity/);
  }
  for (const value of ["", " ", -1, Infinity, NaN, "not a number", null]) {
    assert.throws(() => core.calculateQuote([{ quantity: 10, rate: value }]), /rate/);
  }
  assert.equal(core.calculateQuote([{ quantity: 10, rate: 0 }]).total, 0);
  assert.equal(core.calculateQuote([]).total, 0);
  assert.throws(() => core.calculateQuote([{ quantity: 1e9, rate: 1e9 }]), /too large/);
  assert.throws(() => core.calculateQuote(Array(501).fill({ quantity: 1, rate: 1 })), /up to 500/);
  assert.throws(() => core.calculateQuote([{ quantity: 1, rate: "0.0000000000000000000000000001" }]), /precision/);
});

test("large money values are bounded and cannot overflow the integer paise sum", () => {
  assert.equal(core.roundMoney(core.MAX_AMOUNT), core.MAX_AMOUNT);
  assert.throws(() => core.calculateQuote([
    { quantity: 1000, rate: "999999999.99" },
    { quantity: 1000, rate: "0.01" },
  ]), /total is too large/);
});

for (const [amount, expected] of [
  [0, "Rupees Zero Only."],
  [0.01, "Rupees Zero and One Paise Only."],
  [1, "Rupees One Only."],
  [19.19, "Rupees Nineteen and Nineteen Paise Only."],
  [99.995, "Rupees One Hundred Only."],
  [1000, "Rupees One Thousand Only."],
  [100000, "Rupees One Lakh Only."],
  [10000000, "Rupees One Crore Only."],
  [12345678.9, "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Ninety Paise Only."],
]) {
  test(`amount in words agrees with displayed currency for ${amount}`, () => {
    assert.equal(core.amountInWords(amount), expected);
  });
}

test("amount in words rejects negative, blank, infinite and excessive amounts", () => {
  for (const amount of ["", -1, Infinity, NaN, 1e12]) assert.throws(() => core.amountInWords(amount));
});

test("browser module exposes the same API without a package loader", () => {
  const context = {};
  runInNewContext(readFileSync(require.resolve("../quotation-core.js"), "utf8"), context);
  assert.equal(typeof context.TektactQuotation.measurement, "function");
  assert.equal(context.TektactQuotation.calculateQuote([{ quantity: 20, rate: 85 }]).total, 1700);
});
