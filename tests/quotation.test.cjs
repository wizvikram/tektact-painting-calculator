const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'test-artifacts');
let browser, server, baseURL;

// HTTP reflects GitHub Pages behavior; the test server only serves project assets.
before(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  server = http.createServer((request, response) => {
    let file;
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + path.sep) || !/\.(html|css|js|jpeg|png)$/i.test(file)) {
        response.writeHead(404).end(); return;
      }
    } catch { response.writeHead(400).end(); return; }
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpeg': 'image/jpeg', '.png': 'image/png' };
    fs.readFile(file, (error, content) => {
      if (error) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] + (file.endsWith('.html') ? '; charset=utf-8' : '') });
      response.end(content);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function openQuotation(suffix = '', viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL + '/quotation.html' + suffix);
  await page.waitForFunction(() => document.querySelector('.logo').complete);
  assert.deepEqual(errors, [], 'quotation starts without JavaScript errors');
  return page;
}
async function measure(page, service, mode, values, deduction = 0) {
  await page.locator('#service').selectOption(service);
  await page.locator('#measureMode').selectOption(String(mode));
  for (const [key, value] of Object.entries(values)) await page.locator('#m_' + key).fill(String(value));
  if (await page.locator('#deduct').isEnabled()) await page.locator('#deduct').fill(String(deduction));
}
async function completeCustomer(page, service = 'Painting') {
  for (const [id, value] of Object.entries({ date: '2026-11-16', reference: 'TEST-V1-' + service.toUpperCase(), client: 'TEST Customer\nTEST project address, Coimbatore', attention: 'TEST Customer Contact', phone: 'TEST phone', scope: service + ' scope for automated verification only.', highlights: 'TEST preparation and application methodology.', office: 'TEST office address - verification fixture only.', contact: 'TEST company contact - verification fixture only.' })) await page.locator('#' + id).fill(value);
}
async function setItem(page, index, { description, unit = 'SFT', quantity, rate }) {
  const row = page.locator('#items tr').nth(index);
  for (const [selector, value] of Object.entries({ '.desc': description, '.unit': unit, '.qty': quantity, '.rate': rate })) await row.locator(selector).fill(String(value));
}
async function preparePrint(page) {
  await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls += 1; }; });
  await page.locator('#print').click();
  assert.equal(await page.evaluate(() => window.__printCalls), 1, 'valid quotation reaches print');
  assert.equal(await page.locator('#validationErrors').isVisible(), false);
  await page.emulateMedia({ media: 'print' });
  for (const selector of ['.toolbar', '#measurementPanel', '#client']) assert.equal(await page.locator(selector).isVisible(), false);
  assert.ok(await page.locator('.print-value').first().isVisible());
  const text = await page.locator('.sheet').innerText();
  assert.doesNotMatch(text, /profit|margin|project cost|cost breakdown|paint cost per litre|other expenses|internal costs/i);
  return text;
}

test('all service measurement modes calculate editable net quantities and correct units', async () => {
  const page = await openQuotation();
  try {
    const cases = [
      ['Painting', 0, { width: 20, breadth: 15, height: 10 }, 53, '647', 'SFT'],
      ['Painting', 1, { width: 10, height: 9 }, 7, '83', 'SFT'],
      ['Painting', 2, { width: 12, breadth: 10 }, 10, '110', 'SFT'],
      ['Painting', 3, { quantity: 125.5 }, 5.5, '120', 'SFT'],
      ['Waterproofing', 0, { width: 20, breadth: 30 }, 50, '550', 'SFT'],
      ['Waterproofing', 1, { width: 12, height: 4 }, 3, '45', 'SFT'],
      ['Waterproofing', 2, { length: 12.5 }, 0, '12.5', 'RFT'],
      ['Waterproofing', 3, { length: 10, width: 4, depth: 0.5 }, 0, '20', 'CFT'],
      ['Waterproofing', 4, { quantity: 2 }, 0, '2', 'UNIT'],
      ['Flooring', 0, { width: 10, breadth: 20 }, 10, '190', 'SFT'],
      ['Flooring', 1, { width: 10, breadth: 20, count: 3 }, 25, '575', 'SFT'],
      ['Flooring', 2, { quantity: 220.25 }, 20.25, '200', 'SFT'],
    ];
    for (const [service, mode, values, deduction, expected, unit] of cases) {
      await measure(page, service, mode, values, deduction);
      assert.equal(await page.locator('#measuredQty').innerText(), expected, `${service} mode ${mode}`);
      assert.equal(await page.locator('#measuredUnit').innerText(), unit);
      await page.locator('#applyMeasurement').click();
      assert.equal(await page.locator('.qty').first().inputValue(), expected);
      assert.equal(await page.locator('.unit').first().inputValue(), unit);
    }
    await page.locator('.qty').first().fill('201');
    await page.locator('.rate').first().fill('10.5');
    assert.equal(await page.locator('#net').innerText(), '2,110.50');
  } finally { await page.close(); }
});

test('invalid dimensions, deductions, section counts and line values are blocked', async () => {
  const page = await openQuotation();
  try {
    assert.ok(await page.locator('#applyMeasurement').isDisabled());
    await measure(page, 'Painting', 1, { width: -2, height: 10 });
    assert.ok(await page.locator('#applyMeasurement').isDisabled());
    assert.match(await page.locator('#measurementError').innerText(), /greater than zero/);
    await measure(page, 'Painting', 1, { width: 10, height: 10 }, 101);
    assert.ok(await page.locator('#applyMeasurement').isDisabled());
    assert.match(await page.locator('#measurementError').innerText(), /exceed/);
    await page.locator('#deduct').fill('100');
    assert.ok(await page.locator('#applyMeasurement').isDisabled());
    await page.locator('#deduct').fill('-1');
    assert.ok(await page.locator('#applyMeasurement').isDisabled());
    await measure(page, 'Flooring', 1, { width: 10, breadth: 10, count: 1.5 });
    assert.ok(await page.locator('#applyMeasurement').isDisabled());
    assert.match(await page.locator('#measurementError').innerText(), /whole number/);
    await measure(page, 'Waterproofing', 2, { length: 5 });
    assert.ok(await page.locator('#deduct').isDisabled());
    await page.locator('#applyMeasurement').click();
    for (const rate of ['-1', '']) {
      await page.locator('.rate').first().fill(rate);
      assert.equal(await page.locator('#net').innerText(), '—');
    }
    await page.locator('.rate').first().fill('0');
    assert.equal(await page.locator('#net').innerText(), '0.00');
  } finally { await page.close(); }
});

test('each quotation row retains its worksheet and manual quantity edits remove stale measurement notes', async () => {
  const page = await openQuotation();
  try {
    await measure(page, 'Painting', 0, { width: 20, breadth: 15, height: 10 }, 53);
    await page.locator('#applyMeasurement').click();
    assert.match(await page.locator('.measurement-note').first().innerText(), /deduction: 53 SFT; net: 647 SFT/);
    await page.locator('#add').click();
    await page.locator('#targetRow').selectOption('1');
    await measure(page, 'Painting', 1, { width: 12, height: 10 }, 20);
    await page.locator('#applyMeasurement').click();
    assert.equal(await page.locator('.qty').nth(1).inputValue(), '100');
    await page.locator('#targetRow').selectOption('0');
    assert.equal(await page.locator('#measureMode').inputValue(), '0');
    assert.equal(await page.locator('#m_width').inputValue(), '20');
    assert.equal(await page.locator('#m_breadth').inputValue(), '15');
    assert.equal(await page.locator('#deduct').inputValue(), '53');
    await page.locator('.rate').first().fill('10');
    assert.match(await page.locator('.measurement-note').first().innerText(), /net: 647 SFT/);
    await page.locator('.qty').first().fill('650');
    assert.equal(await page.locator('.measurement-note').first().innerText(), '');
    await page.locator('.unit').nth(1).fill('LS');
    assert.equal(await page.locator('.measurement-note').nth(1).innerText(), '');
  } finally { await page.close(); }
});

test('multiple items round per line to paise, edit, remove and update Indian amount words', async () => {
  const page = await openQuotation();
  try {
    await setItem(page, 0, { description: 'TEST first item', quantity: 1, rate: 1.005 });
    await page.locator('#add').click();
    await setItem(page, 1, { description: 'TEST second item', quantity: 3, rate: 0.335 });
    assert.equal(await page.locator('#net').innerText(), '2.02');
    assert.equal(await page.locator('#words').innerText(), 'Rupees Two and Two Paise Only.');
    await page.locator('.rate').nth(1).fill('100000');
    assert.equal(await page.locator('#net').innerText(), '3,00,001.01');
    assert.equal(await page.locator('#words').innerText(), 'Rupees Three Lakh One and One Paise Only.');
    await page.locator('.line-item-remove').first().click();
    assert.equal(await page.locator('#net').innerText(), '3,00,000.00');
    assert.equal(await page.locator('.serial').first().innerText(), '1');
    assert.equal(await page.locator('#targetRow option').count(), 1);
    await page.locator('.line-item-remove').first().click();
    await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls += 1; }; });
    await page.locator('#print').click();
    assert.equal(await page.evaluate(() => window.__printCalls), 0);
    assert.match(await page.locator('#validationErrors').innerText(), /at least one quotation item/);
  } finally { await page.close(); }
});

test('printing validates required customer fields, descriptions, units and loaded logo', async () => {
  const page = await openQuotation();
  try {
    await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls += 1; }; });
    await page.locator('#print').click();
    assert.equal(await page.evaluate(() => window.__printCalls), 0);
    assert.match(await page.locator('#validationErrors').innerText(), /reference|client name and address/);
    await completeCustomer(page);
    await setItem(page, 0, { description: 'TEST verified item', quantity: 10, rate: 25 });
    for (const [field, message] of [['.unit', /enter a unit/], ['.desc', /enter a description/]]) {
      const previous = await page.locator(field).first().inputValue();
      await page.locator(field).first().fill('');
      await page.locator('#print').click();
      assert.match(await page.locator('#validationErrors').innerText(), message);
      await page.locator(field).first().fill(previous);
    }
    const logo = await page.locator('.logo').evaluate(image => ({ complete: image.complete, width: image.naturalWidth }));
    assert.ok(logo.complete && logo.width > 0);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'logo 1 2026.jpeg'))).digest('hex'), '26be735f886391f8ead97c368269a43804e6ed8814c7c66a2cb8b3c131b9c149');
    assert.match(await preparePrint(page), /TEST verified item/);
  } finally { await page.close(); }
});

test('calculator transfers the exact final customer total only; invalid estimates disable transfer', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(baseURL + '/index.html');
    const url = new URL(await page.locator('#quotationTransfer').getAttribute('href'), baseURL);
    assert.deepEqual([...url.searchParams.keys()].sort(), ['area', 'quote']);
    assert.equal(url.searchParams.get('quote'), '35875.00');
    await page.locator('#quotationTransfer').click();
    assert.equal(await page.locator('.unit').first().inputValue(), 'LS');
    assert.equal(await page.locator('.qty').first().inputValue(), '1');
    assert.equal(await page.locator('#net').innerText(), '35,875.00');
    assert.match(await page.locator('.desc').first().inputValue(), /1,200 sq ft/);
    await page.goto(baseURL + '/quotation.html?area=0.03&quote=100.01');
    assert.equal(await page.locator('#net').innerText(), '100.01');
    await page.goto(baseURL + '/quotation.html?area=-1&quote=200');
    assert.match(await page.locator('#transferNotice').innerText(), /invalid/);
    assert.equal(await page.locator('.qty').first().inputValue(), '');
    await page.goto(baseURL + '/quotation.html?area=10&quote=1e-30');
    assert.match(await page.locator('#transferNotice').innerText(), /invalid|precision/);
    assert.equal(await page.locator('.qty').first().inputValue(), '');
    await page.goto(baseURL + '/index.html');
    await page.locator('#coverage').fill('0');
    assert.equal(await page.locator('#quotationTransfer').getAttribute('href'), null);
    assert.equal(await page.locator('#quotationTransfer').getAttribute('aria-disabled'), 'true');
  } finally { await page.close(); }
});

test('mobile and desktop contain table scrolling without overflowing the page', async () => {
  const page = await openQuotation('', { width: 390, height: 844 });
  try {
    await completeCustomer(page);
    await setItem(page, 0, { description: 'TEST customer specification, preparation and complete surface application.', quantity: 647, rate: 25 });
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page fits ${viewport.width}px viewport`);
      await page.screenshot({ path: path.join(artifacts, viewport.width < 650 ? 'quotation-mobile.png' : 'quotation-desktop.png'), fullPage: true });
    }
  } finally { await page.close(); }
});

test('three services generate branded A4 customer PDFs with matching totals and no internal costing', async () => {
  for (const [service, dimensions, expected] of [
    ['Painting', { width: 20, breadth: 15, height: 10 }, '16,175.00'],
    ['Waterproofing', { width: 20, breadth: 30 }, '13,675.00'],
    ['Flooring', { width: 10, breadth: 20 }, '3,675.00'],
  ]) {
    const page = await openQuotation();
    try {
      await completeCustomer(page, service);
      await measure(page, service, 0, dimensions, 53);
      await page.locator('#applyMeasurement').click();
      await page.locator('.desc').first().fill(`TEST ${service} work - PDF_END_${service.toUpperCase()}`);
      await page.locator('.rate').first().fill('25');
      assert.equal(await page.locator('#net').innerText(), expected);
      const text = await preparePrint(page);
      assert.ok(text.includes(expected));
      assert.match(text, new RegExp('PDF_END_' + service.toUpperCase()));
      const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
      assert.ok(pdf.length > 10000);
      fs.writeFileSync(path.join(artifacts, 'quotation-' + service.toLowerCase() + '.pdf'), pdf);
    } finally { await page.close(); }
  }
});

test('long customer content and multiple items survive text mirrors and multipage PDF generation', async () => {
  const page = await openQuotation();
  try {
    await completeCustomer(page);
    await page.locator('#client').fill('TEST Long Customer\n' + Array(8).fill('TEST extended project address line, Coimbatore.').join('\n') + '\nCLIENT_END_MARKER');
    await page.locator('#scope').fill(Array(12).fill('TEST scope covers site preparation, approved treatment and finishing.').join('\n') + '\nSCOPE_END_MARKER');
    await page.locator('#terms').fill(Array(18).fill('TEST terms detail to verify complete wrapping and pagination.').join('\n') + '\nTERMS_END_MARKER');
    await page.locator('#office').fill('TEST extended company address\n' + Array(5).fill('TEST office address continuation.').join('\n') + '\nOFFICE_END_MARKER');
    await page.locator('#contact').fill('TEST customer-facing company contact CONTACT_END_MARKER');
    for (let index = 0; index < 24; index += 1) {
      if (index) await page.locator('#add').click();
      await setItem(page, index, { description: `TEST item ${index + 1}: detailed preparation and application.\nConfirm customer-approved scope and finish.\nITEM_END_${String(index + 1).padStart(2, '0')}`, quantity: index + 1, rate: '10.25' });
    }
    assert.equal(await page.locator('#net').innerText(), '3,075.00');
    const text = await preparePrint(page);
    for (const marker of ['CLIENT_END_MARKER', 'SCOPE_END_MARKER', 'TERMS_END_MARKER', 'OFFICE_END_MARKER', 'CONTACT_END_MARKER', 'ITEM_END_01', 'ITEM_END_24']) assert.ok(text.includes(marker), marker + ' present in printable content');
    const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
    fs.writeFileSync(path.join(artifacts, 'quotation-multipage.pdf'), pdf);
    fs.writeFileSync(path.join(artifacts, 'quotation-print-text.txt'), text);
    assert.ok(pdf.length > 20000);
  } finally { await page.close(); }
});
