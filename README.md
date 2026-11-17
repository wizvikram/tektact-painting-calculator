# TEKTACT Universal Quotation Maker V1

The existing painting calculator (`index.html`) and the customer quotation maker
(`quotation.html`) run as plain HTML, CSS and JavaScript on GitHub Pages. No
backend, customer database, build step, or production dependency is required.

## Preview the quotation maker

Open this folder in a terminal and run `python -m http.server 8000`, then visit
<http://localhost:8000/quotation.html>. You can also open `quotation.html` directly.
The original calculator remains at <http://localhost:8000/index.html>.

1. Enter the date, contractor name, customer name and address, and attention/contact
   person. An optional internal quotation identification is available for future
   CRM integration. It is excluded from both the customer PDF and its title.
2. Select Painting, Waterproofing or Flooring. Enter the scope and application
   highlights that you have agreed with the customer.
3. Use the measurement worksheet, select a target row and apply its quantity.
   Add a row for each section/specification. Enter the agreed customer unit rate.
   Quantities, units, descriptions and rates remain editable. Selecting a row
   restores its saved worksheet dimensions for the currently selected service.
   Editing its quantity/unit manually clears the old measurement note.
4. Check the approved office and company contact details. Review the editable terms:
   they are draft terms, not a record of a customer agreement. No contact details,
   supplier prices, labour prices or paint coverage are invented by this tool.
5. Select **Print / Save PDF**. Fix any validation messages. In the print dialog,
   choose A4, scale 100%, use the page's margins, and turn off browser headers and
   footers. Save as PDF.

The customer-approved print composition shows the formatted date directly and
aligned Contractor / Client / Kind Attn. details. The selected service heading is
not printed. Editable application highlights lead the application section, with
scope text following without a separate heading. The service selector remains in
the editor for the service-specific measurements. The customer phone field is removed.
Sections spread vertically on A4 with readable specifications, separately spaced
totals, amount in words and terms. Every page reserves the actual office/contact
footer height and a clear gap. Long descriptions and terms continue onto additional
pages with table headings repeated and page numbers in the footer. A quotation is
limited to 200 pages; an excessively long footer is rejected rather than clipped.

The approved office/contact details are stored in the read-only footer fields.
They print as exactly two footer lines. The first starts with `Regd. Office : `
followed by the approved address; the second contains the company contact details.
There is no separate footer heading.
Do not use synthetic details in the test fixtures as company information.
The revised A4 preview remains subject to customer approval before release.

All prices in the quotation are customer prices in Indian rupees. Internal
purchase costs and profit margins are not transferred or rendered in it.
Quotations are not automatically saved; save a PDF before closing the page.

## Measurements and totals

- Painting room walls: `2 × (length + width) × height − deductions`.
- Wall/parapet: `length × height − deductions`.
- Ceiling, terrace or floor: `length × width − deductions`.
- Identical flooring sections: `length × width × whole number of sections − deductions`.
- Waterproofing joint/crack: length in running feet (RFT).
- Waterproofing volume: `length × width × depth` in cubic feet (CFT).
- Manual painting/flooring area uses SFT; waterproofing manual quantity uses UNIT.
  You may edit a quotation unit to LS for an agreed lump sum.

Dimensions are in feet. Area deductions are a **total across the selected
measurement**, not per identical section. Sum door/window openings before entering
the deduction. Deductions cannot exceed gross area or apply to lengths, volumes
or item counts. Dimensions and quoted quantities must be positive; rates may be
zero for an included item. Negative, blank, nonfinite and excessive values are
rejected. Up to 500 items are supported, each quantity/rate up to 1 billion, with
a quotation total limited to ₹9,99,99,99,99,999.99.

Each line's quantity × rate rounds to two decimal places first. Total = the sum
of those rounded line amounts. Amount in words uses the same integer paise total,
with Indian Lakh/Crore grouping. Taxes are not calculated in V1: the editable
default terms say taxes extra if applicable. Confirm the applicable arrangement
before issuing a quotation.

## Transfer from the painting calculator

**Use estimate in quotation** passes only measured area and the final customer
quotation. It imports one LS item, quantity 1, at the exact rounded customer
price, with measured area in the description. This avoids changing the price by
rounding a derived per-square-foot rate. Apply a worksheet and enter an agreed
unit rate if you prefer area billing. An invalid calculator estimate disables
transfer so an old price cannot be reused accidentally. Calculator defaults are
sample values until replaced with your real rates and coverage.

## Branding and approved design

The existing `logo 1 2026.jpeg` is retained byte for byte from owner upload commit
`9d0d509` (SHA-256 `26be735f886391f8ead97c368269a43804e6ed8814c7c66a2cb8b3c131b9c149`).
The quotation keeps PR #1's latest Agam-reference alignment: top-right logo,
borderless specification table, total, amount in words, terms and office footer.
It retains the existing Comic Sans MS/Trebuchet font fallback. Exact reference
font matching depends on installed fonts; there is no separate approved source
reference or licensed font asset in the repository to independently compare.

## Automated verification

Development checks require Node.js 22+ and Python 3.12+ (Python is only for PDF
verification). They are not needed to use the website:

```sh
npm ci
npx playwright install chromium
npm test
python -m pip install pypdf==6.21.4 pypdfium2==5.14.0 Pillow==13.0.0
python tests/verify-pdf.py
```

`npm run test:unit` runs calculations and calculator regressions without a browser.
`npm run test:quotation` runs the browser and PDF generation checks. If using an
existing Chrome installation, set `CHROMIUM_EXECUTABLE_PATH` to its executable.
Tests use an isolated local HTTP server and synthetic customer data. Generated
PDFs, screenshots and rendered pages go to ignored `test-artifacts/`.

The GitHub Actions workflow runs calculations, browser tests and PDF verification
for this feature branch and PRs to main, and uploads the verification artifacts.
Review those artifacts before releasing. Publish GitHub Pages from main only
after the feature PR is reviewed and merged; the feature branch is not the live
main site.

## Code map

- `quotation.html`: existing customer document and editor fields.
- `quotation.css`: approved design, responsive editor and A4 print styles.
- `quotation.js`: validation, editable items, measurements and safe transfer.
- `quotation-print.js`: customer-only A4 composition and pagination with repeated
  reserved footers; no internal identification is passed to the print renderer.
- `quotation-core.js`: pure measurement, exact currency and Indian words helpers.
- `tests/`: calculator/unit, browser, and generated-PDF verification.
- `index.html`, `styles.css`, `app.js`: original painting calculator.

---

## Original painting calculator guide

A small painting estimate calculator built with plain HTML, CSS, and JavaScript. There are no packages to install or build steps to learn.

## Run it locally

1. Open this folder in File Explorer.
2. Double-click `index.html` to open the calculator in your browser.

Or, if you prefer to use a local web server, open a terminal in this folder and run:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000> in your browser. Press `Ctrl+C` in the terminal to stop the server.

## Using the calculator

Change the example values to match your job. The estimate updates while you type. Paint quantity is calculated as:

```text
wall area × number of coats ÷ coverage per litre
```

The project cost adds paint, labour, and other expenses. The quotation uses the target margin as a share of the final price:

```text
quotation = project cost ÷ (1 − target margin)
```

For example, a 20% margin means profit is 20% of the quotation. All money is shown in Indian rupees. Inputs are examples; update them with current supplier and labour rates before quoting.

## Files

- `index.html` contains the calculator layout and input fields.
- `styles.css` contains the colors, spacing, and responsive layouts.
- `app.js` validates inputs and calculates the estimate.
