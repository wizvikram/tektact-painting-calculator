/* Customer quotation editor. No purchase costs or profit data enter this page. */
"use strict";

const $ = (id) => document.getElementById(id);
const core = window.TektactQuotation;
const money = (value) => new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);
const quantityText = (value) => new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 6,
}).format(value);

function fitTextarea(input) {
  input.style.height = "auto";
  input.style.height = Math.max(55, input.scrollHeight + 2) + "px";
  input.scrollTop = 0;
}

// Keep the worksheet separate from the customer document. Applying a worksheet
// copies its measured quantity into a normal, editable quotation item.
const measureModes = {
  Painting: [
    ["Full room walls", "room", [["width", "Length"], ["breadth", "Width"], ["height", "Height"]]],
    ["Single wall", "wall", [["width", "Length"], ["height", "Height"]]],
    ["Ceiling", "floor", [["width", "Length"], ["breadth", "Width"]]],
    ["Manual area", "manual", [["quantity", "Area"]], "SFT"],
  ],
  Waterproofing: [
    ["Terrace / slab area", "floor", [["width", "Length"], ["breadth", "Width"]]],
    ["Wall / parapet area", "wall", [["width", "Length"], ["height", "Height"]]],
    ["Linear joint / crack", "linear", [["length", "Length"]]],
    ["Volume", "volume", [["length", "Length"], ["width", "Width"], ["depth", "Depth"]]],
    ["Manual quantity / lump sum", "manual", [["quantity", "Quantity"]], "UNIT"],
  ],
  Flooring: [
    ["Floor area", "floor", [["width", "Length"], ["breadth", "Width"]]],
    ["Multiple identical sections", "sections", [["width", "Length"], ["breadth", "Width"], ["count", "Number of sections"]]],
    ["Manual area", "manual", [["quantity", "Area"]], "SFT"],
  ],
};

function showErrors(messages, focus = false) {
  const box = $("validationErrors");
  box.replaceChildren();
  box.hidden = messages.length === 0;
  if (!messages.length) return;
  const title = document.createElement("strong");
  title.textContent = "Please complete the quotation:";
  const list = document.createElement("ul");
  messages.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  });
  box.append(title, list);
  if (focus) box.focus();
}

function readItems() {
  return [...$("items").rows].map((row) => ({
    quantity: row.querySelector(".qty").value,
    rate: row.querySelector(".rate").value,
  }));
}

function recalc() {
  let valid = true;
  [...$("items").rows].forEach((row, index) => {
    row.querySelector(".serial").textContent = String(index + 1);
    const error = row.querySelector(".item-error");
    const qty = row.querySelector(".qty"), rate = row.querySelector(".rate");
    qty.setAttribute("aria-invalid", "false");
    rate.setAttribute("aria-invalid", "false");
    try {
      const result = core.calculateQuote([{ quantity: qty.value, rate: rate.value }]);
      row.querySelector(".amt").textContent = money(result.total);
      error.textContent = "";
    } catch (e) {
      row.querySelector(".amt").textContent = "—";
      error.textContent = e.message;
      qty.setAttribute("aria-invalid", "true");
      rate.setAttribute("aria-invalid", "true");
      valid = false;
    }
  });
  try {
    if (!valid) throw new Error("Complete the highlighted quantities and rates.");
    const result = core.calculateQuote(readItems());
    $("net").textContent = money(result.total);
    $("words").textContent = result.words;
    return result;
  } catch (e) {
    $("net").textContent = "—";
    $("words").textContent = "Complete valid quantities and rates to calculate the total.";
    return null;
  }
}

function addItem(description = "", unit = "SFT", quantity = "", rate = "") {
  if ($("items").rows.length >= 500) {
    showErrors(["A quotation supports up to 500 items."], true);
    return null;
  }
  const row = document.createElement("tr");
  // Only fixed markup is inserted. User text is assigned through .value below.
  row.innerHTML = '<td class="serial"></td><td><textarea class="desc" aria-label="Description" rows="3" maxlength="8000"></textarea><p class="item-error no-print" role="status"></p></td><td><input class="unit" aria-label="Unit" maxlength="20"></td><td><input class="qty" aria-label="Quantity" type="number" min="0.000001" max="1000000000" step="any" inputmode="decimal"></td><td><input class="rate" aria-label="Rate" type="number" min="0" max="1000000000" step="any" inputmode="decimal"></td><td class="amt">—</td><td class="no-print"><button class="line-item-remove" type="button" aria-label="Remove item">×</button></td>';
  row.querySelector(".desc").value = description;
  row.querySelector(".unit").value = unit;
  row.querySelector(".qty").value = quantity;
  row.querySelector(".rate").value = rate;
  ["Item", "Description", "Unit", "Quantity", "Rate (₹)", "Amount (₹)", ""].forEach((label, index) => {
    row.cells[index].dataset.label = label;
  });
  const measurementNote = document.createElement("div");
  measurementNote.className = "measurement-note";
  row.querySelector(".desc").after(measurementNote);
  row.addEventListener("input", (event) => {
    if (event.target.matches(".qty, .unit")) {
      row.measurement = null;
      measurementNote.textContent = "";
    }
    recalc(); refreshTargets();
  });
  row.querySelector("button").addEventListener("click", () => {
    row.remove(); recalc(); refreshTargets();
  });
  $("items").append(row);
  fitTextarea(row.querySelector(".desc"));
  recalc(); refreshTargets();
  return row;
}

function refreshTargets() {
  const select = $("targetRow"), current = select.value;
  select.replaceChildren();
  [...$("items").rows].forEach((row, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    const description = row.querySelector(".desc").value.trim();
    option.textContent = `Row ${index + 1}${description ? ": " + description.slice(0, 50) : ""}`;
    select.append(option);
  });
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function currentMode() {
  return measureModes[$("service").value][Number($("measureMode").value) || 0];
}

function refreshModes() {
  $("measureMode").replaceChildren();
  measureModes[$("service").value].forEach((entry, index) => {
    const option = document.createElement("option");
    option.value = String(index); option.textContent = entry[0];
    $("measureMode").append(option);
  });
  refreshFields();
}

function refreshFields() {
  const wrap = $("measureFields");
  wrap.replaceChildren();
  const [, method, fields, manualUnit] = currentMode();
  fields.forEach(([key, label]) => {
    const div = document.createElement("div"), lab = document.createElement("label");
    const input = document.createElement("input");
    const suffix = key === "count" ? "" : key === "quantity" ? ` (${manualUnit})` : " (ft)";
    lab.textContent = label + suffix; lab.htmlFor = "m_" + key;
    input.type = "number"; input.min = "0.000001"; input.max = "1000000000";
    input.step = key === "count" ? "1" : "any";
    input.inputMode = key === "count" ? "numeric" : "decimal";
    input.id = "m_" + key; input.dataset.key = key;
    input.addEventListener("input", calculateMeasurement);
    div.append(lab, input); wrap.append(div);
  });
  const area = ["room", "wall", "floor", "sections"].includes(method) || (method === "manual" && manualUnit === "SFT");
  $("deduct").value = "0";
  $("deduct").disabled = !area;
  calculateMeasurement();
}

function calculateMeasurement() {
  const [, method, , manualUnit = "SFT"] = currentMode();
  const values = {};
  $("measureFields").querySelectorAll("input").forEach((input) => { values[input.dataset.key] = input.value; });
  try {
    const result = core.measurement(method, values, $("deduct").disabled ? 0 : $("deduct").value, manualUnit);
    $("measuredQty").textContent = quantityText(result.quantity);
    $("measuredUnit").textContent = result.unit;
    $("measurementError").textContent = result.quantity > 0 ? "" : "Deductions leave no area. Enter a positive net quantity.";
    $("applyMeasurement").disabled = result.quantity <= 0;
    return result;
  } catch (e) {
    $("measuredQty").textContent = "—";
    $("measuredUnit").textContent = "";
    $("measurementError").textContent = currentMode()[2].some(([key, label]) => key === "width" && label === "Length")
      ? e.message.replace(/\bWidth\b/g, "Length").replace(/\bBreadth\b/g, "Width")
      : e.message;
    $("applyMeasurement").disabled = true;
    return null;
  }
}

function applyMeasurement() {
  const measurement = calculateMeasurement();
  if (!measurement || measurement.quantity <= 0) return;
  const row = $("items").rows[Number($("targetRow").value)];
  if (!row) { showErrors(["Add a quotation row before applying a measurement."], true); return; }
  row.querySelector(".qty").value = String(measurement.quantity);
  row.querySelector(".unit").value = measurement.unit;
  const values = {};
  $("measureFields").querySelectorAll("input").forEach((input) => { values[input.dataset.key] = input.value; });
  row.measurement = { service: $("service").value, mode: $("measureMode").value, values, deduction: $("deduct").value };
  const dimensions = currentMode()[2].map(([key, label]) => `${label}: ${values[key]}${key === "count" ? " sections" : key === "quantity" ? " " + measurement.unit : " ft"}`).join("; ");
  row.querySelector(".measurement-note").textContent = `${dimensions}. Gross: ${quantityText(measurement.gross)} ${measurement.unit}; deduction: ${quantityText(measurement.deduction)} ${measurement.unit}; net: ${quantityText(measurement.quantity)} ${measurement.unit}.`;
  if (!row.querySelector(".desc").value.trim()) {
    row.querySelector(".desc").value = $("service").value + " — " + currentMode()[0];
  }
  recalc(); refreshTargets();
}

function restoreMeasurement() {
  const row = $("items").rows[Number($("targetRow").value)];
  const saved = row?.measurement;
  if (!saved || saved.service !== $("service").value) return;
  $("measureMode").value = saved.mode;
  refreshFields();
  Object.entries(saved.values).forEach(([key, value]) => { $("m_" + key).value = value; });
  $("deduct").value = saved.deduction;
  calculateMeasurement();
}

function validateQuotation(displayErrors = true) {
  const errors = [];
  const required = { date: "quotation date", contractor: "contractor name", client: "client name and address", scope: "scope of work", office: "verified office address", contact: "verified company contact details" };
  Object.entries(required).forEach(([id, label]) => {
    const control = $(id), invalid = !control.value.trim() || !control.validity.valid;
    control.setAttribute("aria-invalid", String(invalid));
    if (invalid) errors.push(`Enter ${label}.`);
  });
  if (!$("items").rows.length) errors.push("Add at least one quotation item.");
  [...$("items").rows].forEach((row, index) => {
    for (const [selector, label] of [[".desc", "description"], [".unit", "unit"]]) {
      const input = row.querySelector(selector), invalid = !input.value.trim();
      input.setAttribute("aria-invalid", String(invalid));
      if (invalid) errors.push(`Row ${index + 1}: enter a ${label}.`);
    }
  });
  if (!recalc()) errors.push("Complete all positive quantities and non-negative rates within the supported limits.");
  const logo = document.querySelector(".logo");
  if (!logo.complete || !logo.naturalWidth) errors.push("The TEKTACT logo has not loaded. Reload the page before printing.");
  if (displayErrors) showErrors(errors, errors.length > 0);
  return errors.length === 0;
}

// Build customer pages from an explicit allow-list. Internal identification stays
// in the editor for future CRM integration and never enters the PDF or its title.
function syncPrintContent() {
  const draft = !validateQuotation(false);
  const value = (id) => $(id).value.trim();
  const customer = $("client").value.trim().split("\n")[0].slice(0, 60);
  document.title = ["TEKTACT Quotation", customer].filter(Boolean).join(" - ");
  try {
    window.TektactPrint.build({
      date: value("date") ? new Date(value("date") + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "",
      contractor: value("contractor"), client: value("client"), attention: value("attention"),
      scope: value("scope"), highlights: value("highlights"),
      office: value("office"), contact: value("contact"), terms: value("terms"),
      total: $("net").textContent, words: $("words").textContent, draft,
      items: [...$("items").rows].map((row) => ({
        description: row.querySelector(".desc").value.trim(),
        unit: row.querySelector(".unit").value.trim(),
        quantity: row.querySelector(".qty").value,
        rate: row.querySelector(".rate").value,
        amount: row.querySelector(".amt").textContent,
        measurement: row.querySelector(".measurement-note").textContent,
      })),
    });
    return true;
  } catch (error) {
    showErrors([error.message], true);
    // Native browser printing cannot be cancelled from beforeprint. Print only
    // an error warning if pagination fails, never a clipped customer quotation.
    const warning = document.createElement("div");
    warning.className = "draft-warning";
    warning.textContent = "DRAFT - Unable to prepare A4 quotation. " + error.message;
    $("printDocument").replaceChildren(warning);
    return false;
  }
}


const crmState = { customers: [], leads: [] };

function crmBaseUrl() {
  const raw = $("crmUrl").value.trim();
  const parsed = new URL(raw);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Enter a valid Command Center URL.");
  if (parsed.protocol === "http:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw new Error("Use HTTPS for a non-local Command Center address.");
  }
  return parsed.origin;
}

async function crmRequest(method, payload) {
  const base = crmBaseUrl();
  const response = await fetch(base + "/api/integrations/quotations", {
    method,
    credentials: "include",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error("Not signed in. Open " + base + "/login in this browser, sign in as Admin, then load customers again.");
    const details = result.details ? " Details: " + JSON.stringify(result.details) : "";
    throw new Error((result.error || "Command Center request failed (" + response.status + ").") + details);
  }
  return result;
}

function refreshCrmLeads() {
  const customerId = $("crmCustomer").value;
  const select = $("crmLead");
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = customerId ? "Choose an enquiry" : "Choose a customer first";
  select.append(placeholder);
  crmState.leads.filter((lead) => lead.customerId === customerId).forEach((lead) => {
    const option = document.createElement("option");
    option.value = lead.id;
    option.textContent = lead.title + " (" + lead.serviceType + ")";
    select.append(option);
  });
  select.disabled = !customerId;
  $("saveCrm").disabled = !customerId || !select.value;
}

async function loadCrmOptions() {
  const button = $("loadCrmOptions");
  button.disabled = true;
  $("crmStatus").textContent = "Connecting to Command Center…";
  try {
    const result = await crmRequest("GET");
    crmState.customers = result.customers || [];
    crmState.leads = result.leads || [];
    const select = $("crmCustomer");
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose an existing CRM customer";
    select.append(placeholder);
    crmState.customers.forEach((customer) => {
      const option = document.createElement("option");
      option.value = customer.id;
      option.textContent = customer.displayName;
      select.append(option);
    });
    select.disabled = false;
    $("crmLead").disabled = true;
    $("crmStatus").textContent = crmState.customers.length
      ? "Connected. Choose the customer and its matching enquiry."
      : "Connected, but no customers with enquiries are available. Create the enquiry in CRM first.";
    refreshCrmLeads();
  } catch (error) {
    $("crmStatus").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function decimalPlaces(value) {
  const text = String(value).trim();
  return (text.split(".")[1] || "").length;
}

async function saveQuotationToCrm() {
  const button = $("saveCrm");
  button.disabled = true;
  $("crmStatus").textContent = "Validating and saving customer-facing quotation…";
  try {
    if (!validateQuotation()) throw new Error("Complete the required quotation and client fields first.");
    const referenceNumber = $("reference").value.trim();
    if (!referenceNumber) throw new Error("Enter an internal quotation reference before saving to CRM.");
    if (!$("crmCustomer").value || !$("crmLead").value) throw new Error("Select both a CRM customer and its linked enquiry.");
    const serviceMap = { Painting: "PAINTING", Waterproofing: "WATERPROOFING", Flooring: "FLOORING" };
    const selectedLead = crmState.leads.find((lead) => lead.id === $("crmLead").value);
    if (!selectedLead) throw new Error("Reconnect to Command Center and select an enquiry again.");
    if (selectedLead.serviceType !== serviceMap[$("service").value]) {
      const serviceName = { PAINTING: "Painting", WATERPROOFING: "Waterproofing", FLOORING: "Flooring" }[selectedLead.serviceType] || "the selected service";
      throw new Error("This enquiry is for " + serviceName + ". Match the quotation service before saving.");
    }
    const rows = [...$("items").rows];
    if (!rows.length) throw new Error("Add at least one quotation line item.");
    for (const row of rows) {
      if (decimalPlaces(row.querySelector(".qty").value) > 3) throw new Error("CRM stores quantity to 3 decimal places. Adjust the highlighted quotation quantity precision before saving.");
      if (decimalPlaces(row.querySelector(".rate").value) > 2) throw new Error("CRM stores unit rates to 2 decimal places. Adjust the quotation rate precision before saving.");
    }
    const calculation = core.calculateQuote(readItems());
    if (rows.some((row) => row.querySelector(".desc").value.trim().length > 240)) {
      throw new Error("CRM line item descriptions support up to 240 characters. Shorten the long item description before saving.");
    }
    const lineItems = rows.map((row, index) => ({
      description: row.querySelector(".desc").value.trim() || "Quotation item " + (index + 1),
      unit: row.querySelector(".unit").value.trim() || "UNIT",
      quantity: String(row.querySelector(".qty").value),
      unitRate: Number(row.querySelector(".rate").value).toFixed(2),
      lineTotal: calculation.items[index].amount.toFixed(2),
    }));
    const payload = {
      referenceNumber,
      customerId: $("crmCustomer").value,
      leadId: $("crmLead").value,
      serviceType: serviceMap[$("service").value],
      quotationDate: $("date").value,
      status: "DRAFT",
      quotedAmount: calculation.total.toFixed(2),
      scope: $("scope").value.trim(),
      highlights: $("highlights").value.trim(),
      terms: $("terms").value.trim(),
      lineItems,
    };
    const result = await crmRequest("POST", payload);
    $("crmStatus").textContent = "Saved to Command Center. Quotation ID: " + result.quotationId + " (Revision " + result.version + "). PDF printing remains available separately.";
  } catch (error) {
    $("crmStatus").textContent = error.message;
    button.disabled = false;
  }
}

$("loadCrmOptions").addEventListener("click", loadCrmOptions);
$("crmCustomer").addEventListener("change", refreshCrmLeads);
$("crmLead").addEventListener("change", () => {
  $("saveCrm").disabled = !$("crmLead").value;
});
$("saveCrm").addEventListener("click", saveQuotationToCrm);

function importCalculatorEstimate() {
  const params = new URLSearchParams(location.search);
  if (!params.has("area") && !params.has("quote")) return false;
  const area = Number(params.get("area")), quote = Number(params.get("quote"));
  const notice = $("transferNotice"); notice.hidden = false;
  if (!params.get("area")?.trim() || !params.get("quote")?.trim() || !Number.isFinite(area) || area <= 0 || area > 1e9 || !Number.isFinite(quote) || quote < 0 || quote > 999999999.99) {
    notice.textContent = "The calculator transfer is invalid. Return to the calculator and correct the estimate, or enter a quotation manually.";
    return false;
  }
  let customerPrice;
  try { customerPrice = core.roundMoney(quote); }
  catch {
    notice.textContent = "The calculator transfer has unsupported precision. Return to the calculator and transfer a valid customer price, or enter the quotation manually.";
    return false;
  }
  addItem(`Painting work — measured area ${quantityText(area)} sq ft. Confirm specification and inclusions.`, "LS", 1, customerPrice);
  $("scope").value = "Painting work — verify site measurements and application system.";
  notice.textContent = "Customer price imported as one lump sum to preserve the exact total. Confirm the scope and client details. To quote by area instead, apply the measurement and enter your agreed unit rate.";
  return true;
}

$("date").value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
$("add").addEventListener("click", () => addItem());
$("service").addEventListener("change", refreshModes);
$("measureMode").addEventListener("change", refreshFields);
$("deduct").addEventListener("input", calculateMeasurement);
$("applyMeasurement").addEventListener("click", applyMeasurement);
$("targetRow").addEventListener("change", restoreMeasurement);
$("print").addEventListener("click", () => {
  if (!validateQuotation()) return;
  if (syncPrintContent()) window.print();
});
window.addEventListener("beforeprint", syncPrintContent);
document.addEventListener("input", (event) => {
  if (event.target.tagName === "TEXTAREA") fitTextarea(event.target);
});
window.addEventListener("resize", () => document.querySelectorAll("textarea").forEach(fitTextarea));
if (!importCalculatorEstimate()) addItem();
refreshModes();
document.querySelectorAll("textarea").forEach(fitTextarea);
