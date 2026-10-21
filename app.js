// Example values are provided so the calculator is useful as soon as it opens.
const exampleValues = {
  wallArea: "1200",
  paintCost: "450",
  coverage: "100",
  coats: "2",
  labourRate: "12",
  otherExpenses: "3500",
  margin: "20",
};

const fieldRules = {
  wallArea: { label: "Wall area", minimum: 0, exclusive: true },
  paintCost: { label: "Paint cost per litre", minimum: 0 },
  coverage: { label: "Paint coverage", minimum: 0, exclusive: true },
  coats: { label: "Number of coats", minimum: 1, integer: true },
  labourRate: { label: "Labour cost per square foot", minimum: 0 },
  otherExpenses: { label: "Other expenses", minimum: 0 },
  margin: { label: "Profit margin", minimum: 0, maximum: 100, exclusiveMaximum: true },
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

function getInputValue(id) {
  const rawValue = document.getElementById(id).value.trim();
  return rawValue === "" ? Number.NaN : Number(rawValue);
}

function validateField(id) {
  const input = document.getElementById(id);
  const error = document.getElementById(`${id}-error`);
  const rule = fieldRules[id];
  const value = getInputValue(id);
  let message = "";

  if (!Number.isFinite(value)) {
    message = `Enter ${rule.label.toLowerCase()}.`;
  } else if (rule.integer && !Number.isInteger(value)) {
    message = "Enter a whole number of coats (1 or more).";
  } else if (rule.exclusive && value <= rule.minimum) {
    message = `Enter a value greater than ${rule.minimum}.`;
  } else if (value < rule.minimum) {
    message = `Enter ${rule.label.toLowerCase()} of ${rule.minimum} or more.`;
  } else if (rule.exclusiveMaximum && value >= rule.maximum) {
    message = "Enter a margin below 100%.";
  }

  input.setAttribute("aria-invalid", String(Boolean(message)));
  error.textContent = message;

  return message ? null : value;
}

function formatCurrency(amount) {
  return currencyFormatter.format(amount);
}

function clearEstimate() {
  document.getElementById("quantityOutput").innerHTML = "— <small>litres</small>";
  document.getElementById("quantityNote").textContent = "Fix the highlighted inputs to see your estimate.";
  ["materialsOutput", "labourOutput", "expensesOutput", "projectCostOutput", "profitOutput", "quoteOutput"].forEach((id) => {
    document.getElementById(id).textContent = "—";
  });
  document.getElementById("actualMarginOutput").textContent = "";
}

function updateEstimate() {
  const values = Object.keys(fieldRules).map((id) => [id, validateField(id)]);
  const inputs = Object.fromEntries(values);

  if (Object.values(inputs).some((value) => value === null)) {
    clearEstimate();
    return;
  }

  const paintLitres = (inputs.wallArea * inputs.coats) / inputs.coverage;
  const materialsCost = paintLitres * inputs.paintCost;
  const labourCost = inputs.wallArea * inputs.labourRate;
  const projectCost = materialsCost + labourCost + inputs.otherExpenses;
  const marginRate = inputs.margin / 100;
  const quotation = projectCost / (1 - marginRate);
  const profit = quotation - projectCost;
  const actualMargin = quotation === 0 ? 0 : (profit / quotation) * 100;

  document.getElementById("quantityOutput").innerHTML = `${numberFormatter.format(paintLitres)} <small>litres</small>`;
  document.getElementById("quantityNote").textContent = `For ${numberFormatter.format(inputs.wallArea)} sq ft across ${numberFormatter.format(inputs.coats)} ${inputs.coats === 1 ? "coat" : "coats"}`;
  document.getElementById("materialsOutput").textContent = formatCurrency(materialsCost);
  document.getElementById("labourOutput").textContent = formatCurrency(labourCost);
  document.getElementById("expensesOutput").textContent = formatCurrency(inputs.otherExpenses);
  document.getElementById("projectCostOutput").textContent = formatCurrency(projectCost);
  document.getElementById("profitOutput").textContent = formatCurrency(profit);
  document.getElementById("actualMarginOutput").textContent = `${numberFormatter.format(actualMargin)}% margin`;
  document.getElementById("quoteOutput").textContent = formatCurrency(quotation);
}

Object.keys(fieldRules).forEach((id) => {
  document.getElementById(id).addEventListener("input", updateEstimate);
});

document.getElementById("resetButton").addEventListener("click", () => {
  Object.entries(exampleValues).forEach(([id, value]) => {
    document.getElementById(id).value = value;
  });
  updateEstimate();
});

updateEstimate();
