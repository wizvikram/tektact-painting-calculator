# Tektact Painting Cost Calculator

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
