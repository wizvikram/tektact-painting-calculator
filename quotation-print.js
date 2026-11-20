/* A4 customer layout only. Calculation and editor state remain in their existing files. */
(function () {
  "use strict";

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function party(label, value) {
    const row = element("div", "print-party");
    row.append(element("b", "print-party-label", label), element("span", "print-party-colon", ":"), element("div", "print-party-value", value));
    return row;
  }

  function footer(data) {
    const result = element("footer", "print-footer");
    const details = element("div", "print-footer-details");
    details.append(element("div", "print-office", "Regd. Office : " + data.office), element("div", "print-contact", data.contact));
    result.append(details, element("span", "print-page-number"));
    return result;
  }

  function build(data) {
    const output = document.getElementById("printDocument");
    output.replaceChildren();
    output.classList.add("is-measuring");
    let page, body, footerHeight;
    const pages = [];

    function newPage() {
      if (pages.length >= 200) throw new Error("This quotation exceeds 200 A4 pages. Shorten the text or split the quotation.");
      page = element("article", "print-page");
      body = element("div", "print-body");
      const bottom = footer(data);
      page.append(body, bottom);
      output.append(page);
      pages.push(page);
      footerHeight = bottom.getBoundingClientRect().height;
      // Reserve the actual footer height plus a clear gap on every A4 page.
      if (footerHeight > page.clientHeight * 0.28) throw new Error("The office/contact footer is too long for A4. Shorten it before printing.");
      body.style.bottom = `${page.clientHeight - bottom.offsetTop + 24}px`;
      return body;
    }

    function fits() {
      return body.scrollHeight <= body.clientHeight + 1;
    }

    function append(block) {
      body.append(block);
      if (fits()) return true;
      block.remove();
      if (body.children.length) {
        newPage();
        body.append(block);
        if (fits()) return true;
        block.remove();
      }
      return false;
    }

    // A long paragraph, address or specification may itself exceed one page.
    // Split only its text, preserving every character and keeping the footer clear.
    function appendText(block, selector) {
      if (append(block)) return;
      const target = selector ? block.querySelector(selector) : block;
      const tokens = target.textContent.match(/\S+\s*|\s+/g) || [""];
      let offset = 0;
      while (offset < tokens.length) {
        const fragment = block.cloneNode(true);
        const text = selector ? fragment.querySelector(selector) : fragment;
        body.append(fragment);
        let low = 1, high = tokens.length - offset, count = 0;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          text.textContent = tokens.slice(offset, offset + middle).join("");
          if (fits()) { count = middle; low = middle + 1; }
          else high = middle - 1;
        }
        if (!count) {
          fragment.remove();
          if (tokens[offset].length > 1) {
            tokens.splice(offset, 1, ...Array.from(tokens[offset]));
            continue;
          }
          throw new Error("A text segment cannot fit inside the A4 print area. Add spaces or line breaks to shorten it.");
        }
        text.textContent = tokens.slice(offset, offset + count).join("");
        offset += count;
        if (offset < tokens.length) newPage();
      }
    }

    function header() {
      const result = element("header", "print-header");
      result.append(element("div", "print-date", data.date));
      const parties = element("div", "print-parties");
      parties.append(party("Contractor", data.contractor), party("Client", data.client), party("Kind Attn.", data.attention));
      const logo = element("img", "print-logo");
      logo.src = document.querySelector(".logo").src;
      logo.alt = "TEKTACT logo";
      result.append(parties, logo);
      if (append(result)) return;
      // Extremely long client addresses still flow, with aligned labels.
      parties.remove();
      append(result);
      [...parties.children].forEach((row) => appendText(row, ".print-party-value"));
    }

    function application() {
      const section = element("section", "print-application");
      section.append(element("div", "print-highlights", data.highlights));
      if (data.scope) section.append(element("div", "print-scope", data.scope));
      if (append(section)) return;
      const scope = section.querySelector(".print-scope");
      if (scope) scope.remove();
      appendText(section, ".print-highlights");
      if (scope) appendText(scope);
    }

    function createTable() {
      const section = element("section", "print-specifications");
      section.append(element("h2", "", "Description of specification"));
      const table = element("table", "print-items");
      const head = table.createTHead().insertRow();
      ["No.", "Description", "Unit", "Qty", "Rate (₹)", "Amount (₹)"].forEach((text) => head.append(element("th", "", text)));
      table.createTBody();
      section.append(table);
      body.append(section);
      return section;
    }

    function itemRow(item, index, continuation = false) {
      const row = document.createElement("tr");
      const fields = [continuation ? "cont." : String(index + 1), item.description, continuation ? "" : item.unit, continuation ? "" : item.quantity, continuation ? "" : item.rate, continuation ? "" : item.amount];
      fields.forEach((value, cell) => row.append(element("td", cell === 1 ? "print-description" : cell === 5 ? "print-amount" : "", value)));
      if (item.measurement && !continuation) row.cells[1].append(element("div", "print-measurement", item.measurement));
      return row;
    }

    function specifications() {
      let section = createTable();
      for (let index = 0; index < data.items.length; index += 1) {
        const item = data.items[index];
        let row = itemRow(item, index);
        section.querySelector("tbody").append(row);
        if (fits()) continue;
        row.remove();
        if (!section.querySelector("tbody").children.length) section.remove();
        if (body.children.length) newPage();
        section = createTable();
        section.querySelector("tbody").append(row);
        if (fits()) continue;
        row.remove();
        const text = [item.description, item.measurement].filter(Boolean).join("\n");
        const tokens = text.match(/\S+\s*|\s+/g) || [""];
        let offset = 0;
        while (offset < tokens.length) {
          const continuation = offset > 0;
          row = itemRow({ ...item, description: "", measurement: "" }, index, continuation);
          section.querySelector("tbody").append(row);
          let low = 1, high = tokens.length - offset, count = 0;
          while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            row.cells[1].textContent = tokens.slice(offset, offset + middle).join("");
            if (fits()) { count = middle; low = middle + 1; }
            else high = middle - 1;
          }
          if (!count) {
            row.remove();
            if (tokens[offset].length > 1) {
              tokens.splice(offset, 1, ...Array.from(tokens[offset]));
              continue;
            }
            throw new Error("A specification cannot fit inside the A4 print area. Shorten a quantity or rate, or add spaces to the description.");
          }
          row.cells[1].textContent = tokens.slice(offset, offset + count).join("");
          offset += count;
          if (offset < tokens.length) { newPage(); section = createTable(); }
        }
      }
    }

    try {
      newPage();
      if (data.draft) append(element("div", "draft-warning", "DRAFT - Incomplete quotation. Complete the required fields and valid items before issuing."));
      header();
      application();
      specifications();
      const summary = element("section", "print-summary");
      summary.append(element("div", "print-total", `Total Rs. ${data.total}`));
      const words = element("div", "print-words");
      words.append(element("b", "", "Amount in words"), element("div", "", data.words));
      summary.append(words);
      append(summary);
      if (data.terms) {
        const terms = element("section", "print-terms");
        terms.append(element("h2", "", "Terms & Conditions"), element("div", "print-terms-text", data.terms));
        appendText(terms, ".print-terms-text");
      }
      pages.forEach((printedPage, index) => {
        printedPage.querySelector(".print-page-number").textContent = `${index + 1} / ${pages.length}`;
        printedPage.classList.add("is-balanced");
      });
      return pages.length;
    } finally {
      output.classList.remove("is-measuring");
    }
  }

  window.TektactPrint = { build };
})();
