const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A small DOM double exercises the existing browser calculator without dependencies.
function calculator() {
  const values = { wallArea: '1200', paintCost: '450', coverage: '100', coats: '2', labourRate: '12', otherExpenses: '3500', margin: '20' };
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: values[id] ?? '', textContent: '', innerHTML: '', attributes: {}, listeners: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name] ?? null; },
      removeAttribute(name) { delete this.attributes[name]; if (name === 'href') delete this.href; },
      addEventListener(name, listener) { this.listeners[name] = listener; },
    });
    return elements.get(id);
  }
  const context = vm.createContext({ document: { getElementById: element }, Intl, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), context);
  return {
    element,
    set(id, value) { element(id).value = String(value); element(id).listeners.input(); },
    reset() { element('resetButton').listeners.click(); },
  };
}

test('existing example arithmetic and customer-only transfer are preserved', () => {
  const app = calculator();
  assert.match(app.element('quantityOutput').innerHTML, /^24 /);
  assert.equal(app.element('materialsOutput').textContent, '₹10,800');
  assert.equal(app.element('labourOutput').textContent, '₹14,400');
  assert.equal(app.element('projectCostOutput').textContent, '₹28,700');
  assert.equal(app.element('quoteOutput').textContent, '₹35,875');
  const url = new URL(app.element('quotationTransfer').href, 'https://example.test/');
  assert.deepEqual([...url.searchParams.keys()], ['area', 'quote']);
  assert.equal(url.searchParams.get('area'), '1200');
  assert.equal(url.searchParams.get('quote'), '35875.00');
  assert.equal(app.element('quotationTransfer').getAttribute('aria-disabled'), 'false');
});

test('invalid inputs remove stale transfer links and recovery restores them', () => {
  for (const [field, invalid] of [['wallArea', ''], ['wallArea', '-1'], ['coverage', '0'], ['margin', '100'], ['margin', '-1'], ['coats', '1.5'], ['paintCost', '-1'], ['otherExpenses', 'Infinity']]) {
    const app = calculator();
    app.set(field, invalid);
    assert.equal(app.element('quotationTransfer').href, undefined, field);
    assert.equal(app.element('quotationTransfer').getAttribute('aria-disabled'), 'true', field);
    assert.equal(app.element('quoteOutput').textContent, '—', field);
    assert.equal(app.element(`${field}-error`).textContent.length > 0, true, field);
    app.reset();
    assert.match(app.element('quotationTransfer').href, /quote=35875\.00$/);
  }
});

test('overflow and unsupported totals never transfer Infinity or stale prices', () => {
  const app = calculator();
  app.set('wallArea', '1e308');
  assert.equal(app.element('quoteOutput').textContent, '—');
  assert.match(app.element('quantityNote').textContent, /supported limit/);
  assert.equal(app.element('quotationTransfer').href, undefined);
  app.reset();
  app.set('otherExpenses', '1000000000');
  assert.equal(app.element('quoteOutput').textContent, '—');
  assert.equal(app.element('quotationTransfer').getAttribute('aria-disabled'), 'true');
});

test('zero costs are valid and exact rounded customer total is transferred', () => {
  const app = calculator();
  app.set('paintCost', '0'); app.set('labourRate', '0'); app.set('otherExpenses', '0');
  assert.equal(app.element('quoteOutput').textContent, '₹0');
  assert.match(app.element('quotationTransfer').href, /quote=0\.00$/);
  app.set('otherExpenses', '1.234');
  assert.match(app.element('quotationTransfer').href, /quote=1\.54$/);
  app.set('margin', '0'); app.set('otherExpenses', '1.005');
  assert.equal(app.element('quoteOutput').textContent, '₹1.01');
  assert.match(app.element('quotationTransfer').href, /quote=1\.01$/);
});
