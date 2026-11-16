"""Inspect actual generated PDF bytes and render each page for visual review.

Run npm test first. These checks complement the browser assertions: text must
survive PDF generation, fit on A4 pages, and contain no system costing labels.
"""
from pathlib import Path
import json
import re

from pypdf import PdfReader
import pypdfium2 as pdfium


ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "test-artifacts"
EXPECTED = {
    "quotation-painting.pdf": (
        "16,175.00", "Rupees Sixteen Thousand One Hundred Seventy Five Only.",
        ["PDF_END_PAINTING"],
    ),
    "quotation-waterproofing.pdf": (
        "13,675.00", "Rupees Thirteen Thousand Six Hundred Seventy Five Only.",
        ["PDF_END_WATERPROOFING"],
    ),
    "quotation-flooring.pdf": (
        "3,675.00", "Rupees Three Thousand Six Hundred Seventy Five Only.",
        ["PDF_END_FLOORING"],
    ),
    "quotation-multipage.pdf": (
        "3,075.00", "Rupees Three Thousand Seventy Five Only.",
        ["CLIENT_END_MARKER", "SCOPE_END_MARKER", "TERMS_END_MARKER",
         "OFFICE_END_MARKER", "CONTACT_END_MARKER"]
        + [f"ITEM_END_{i:02}" for i in range(1, 25)],
    ),
}

# The extreme-content fixture is optional for local runs of the original suite.
# If it is generated, it receives the same actual-PDF checks as the main fixtures.
OVERFLOW = (
    "10.25", "Rupees Ten and Twenty Five Paise Only.",
    ["OVERFLOW_DESCRIPTION_END", "OVERFLOW_TERMS_END"],
)
REPEATED_FOOTER_MARKERS = {"OFFICE_END_MARKER", "CONTACT_END_MARKER"}


def find_text(text_page, needle):
    """Return PDFium character ranges, avoiding string/UTF-16 index assumptions."""
    search = text_page.search(needle, match_case=True)
    matches = []
    try:
        while (match := search.get_next()) is not None:
            matches.append(match)
    finally:
        search.close()
    return matches


def character_boxes(text_page, start, count):
    boxes = []
    for index in range(start, start + count):
        if text_page.get_text_range(index, 1).strip():
            boxes.append(text_page.get_charbox(index))
    return boxes


def text_bounds(text_page, needle, filename, required=True):
    matches = find_text(text_page, needle)
    if not matches:
        assert not required, f"{filename}: missing first-page header text {needle!r}"
        return None
    bounds = []
    for start, count in matches:
        boxes = character_boxes(text_page, start, count)
        if boxes:
            bounds.append((min(box[0] for box in boxes), min(box[1] for box in boxes),
                           max(box[2] for box in boxes), max(box[3] for box in boxes)))
    assert bounds, f"{filename}: missing glyph bounds for {needle!r}"
    # A service name can also occur in a fixture's item marker. Its title is
    # the uppermost occurrence on page one, independent of PDF paint order.
    return max(bounds, key=lambda box: box[3])


def verify_first_page_header(text_page, filename, service):
    date = text_bounds(text_page, "16 November 2026", filename)
    contractor = text_bounds(text_page, "Contractor", filename)
    client = text_bounds(text_page, "Client", filename)
    attention = text_bounds(text_page, "Kind Attn.", filename)
    title = text_bounds(text_page, service, filename)
    # PDF coordinates start at the bottom, so greater y means visually above.
    assert date[1] >= contractor[3] + 2, f"{filename}: date overlaps or follows the party header"
    assert contractor[1] >= client[3], f"{filename}: Contractor and Client labels overlap or are reversed"
    assert client[1] >= attention[3], f"{filename}: Client and Kind Attn. labels overlap or are reversed"
    assert max(box[0] for box in [contractor, client, attention]) - min(box[0] for box in [contractor, client, attention]) <= 1, f"{filename}: party labels are not aligned"
    assert attention[1] >= title[3] + 2, f"{filename}: service title overlaps or precedes Kind Attn."
    for heading in ["Description of specification", "No.", "Rate (₹)", "Amount (₹)"]:
        table_heading = text_bounds(text_page, heading, filename, required=False)
        if table_heading is not None:
            assert title[1] >= table_heading[3] + 2, f"{filename}: table heading {heading!r} overlaps or precedes the service title"


def verify(filename, total, words, markers):
    path = ARTIFACTS / filename
    reader = PdfReader(path)
    pages_text = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(pages_text)
    normalized = re.sub(r"\s+", " ", text)
    assert total in normalized, f"{filename}: final total missing"
    assert words in normalized, f"{filename}: amount words mismatch"
    assert "Tektact Consultants & Contractors" in normalized
    assert "Registered Office" in normalized
    assert not re.search(
        r"profit|margin|project cost|cost breakdown|paint cost per litre|"
        r"other expenses|internal costs|DRAFT - Incomplete", normalized, re.I
    ), f"{filename}: editor/internal or draft content leaked"
    assert not re.search(r"Quotation\s+reference|TEST-V1-|Customer\s+phone|TEST phone", normalized, re.I), f"{filename}: private editor metadata leaked"
    assert not re.search(r"^\s*(Service|Scope)\s*$", text, re.M | re.I), f"{filename}: generic Service/Scope heading printed"
    service = "WATERPROOFING" if "waterproofing" in filename else "FLOORING" if "flooring" in filename else "PAINTING"
    assert re.search(rf"^\s*{service}\s*$", text, re.M), f"{filename}: uppercase {service} heading missing"
    for marker in markers:
        expected_count = len(reader.pages) if marker in REPEATED_FOOTER_MARKERS else 1
        assert text.count(marker) == expected_count, f"{filename}: clipped/duplicated {marker} (expected {expected_count})"
        if marker in REPEATED_FOOTER_MARKERS:
            assert all(page.count(marker) == 1 for page in pages_text), f"{filename}: {marker} must repeat once on every page"
    if "multipage" in filename:
        assert len(reader.pages) >= 3, "Long quotation should paginate"
        assert sum("Description" in page and "Amount" in page for page in pages_text) >= 2, "Table headings must repeat"
    elif "overflow" in filename:
        assert len(reader.pages) > 1, "Extreme description/terms content should paginate"
    else:
        assert len(reader.pages) == 1, f"{filename}: standard quotation should fit one A4 page"
    assert len(reader.pages[0].images) > 0, f"{filename}: logo image missing"

    rendered = []
    footer_tops = []
    footer_bottoms = []
    pdf = pdfium.PdfDocument(str(path))
    try:
        for index, page in enumerate(reader.pages):
            width, height = float(page.mediabox.width), float(page.mediabox.height)
            assert abs(width - 595.28) < 1 and abs(height - 841.89) < 1, f"{filename}: non-A4 page"
            assert len(pages_text[index].strip()) > 20, f"{filename}: blank trailing page"
            rendered_page = pdf[index]
            text_page = rendered_page.get_textpage()
            if index == 0:
                verify_first_page_header(text_page, filename, service)
            footer_matches = find_text(text_page, "Registered Office")
            assert len(footer_matches) == 1, f"{filename}: page {index + 1} must contain one repeated office footer"
            footer_start, footer_length = footer_matches[0]
            footer_boxes = character_boxes(text_page, footer_start, text_page.count_chars() - footer_start)
            anchor_boxes = character_boxes(text_page, footer_start, footer_length)
            assert anchor_boxes and footer_boxes, f"{filename}: missing footer text geometry on page {index + 1}"
            footer_top = max(box[3] for box in footer_boxes)
            footer_bottom = min(box[1] for box in footer_boxes)
            footer_tops.append(max(box[3] for box in anchor_boxes))
            footer_bottoms.append(footer_bottom)
            assert 0 < footer_top < height * 0.35, f"{filename}: footer is not near the A4 page bottom on page {index + 1}"

            # The page DOM paints its bounded print body before its footer. Check
            # their actual PDF glyph rectangles, not only a browser CSS position.
            body_boxes = character_boxes(text_page, 0, footer_start)
            assert body_boxes, f"{filename}: footer-only/blank trailing page {index + 1}"
            assert min(box[1] for box in body_boxes) >= footer_top + 2, f"{filename}: body overlaps the footer on page {index + 1}"
            # Content outside the physical page would be clipped by PDF viewers.
            for char in range(text_page.count_chars()):
                left, bottom, right, top = text_page.get_charbox(char)
                assert min(left, bottom) >= -1 and right <= width + 1 and top <= height + 1, f"{filename}: text outside A4 page {index + 1}"
            target = ARTIFACTS / f"{path.stem}-page-{index + 1}.png"
            bitmap = rendered_page.render(scale=1.25)
            bitmap.to_pil().save(target)
            rendered.append(target.name)
            bitmap.close()
            text_page.close()
            rendered_page.close()
    finally:
        pdf.close()
    assert max(footer_tops) - min(footer_tops) <= 1, f"{filename}: registered office footer shifts vertically between pages"
    assert max(footer_bottoms) - min(footer_bottoms) <= 1, f"{filename}: footer bottom position shifts between pages"
    (ARTIFACTS / f"{path.stem}-extracted.txt").write_text(text, encoding="utf-8")
    return {"pdf": filename, "pages": len(reader.pages), "total": total, "footer_top_pt": round(footer_tops[0], 2), "footer_bottom_pt": round(footer_bottoms[0], 2), "rendered": rendered, "result": "PASS"}


if __name__ == "__main__":
    results = [verify(filename, *expected) for filename, expected in EXPECTED.items()]
    if (ARTIFACTS / "quotation-overflow.pdf").exists():
        results.append(verify("quotation-overflow.pdf", *OVERFLOW))
    report = ARTIFACTS / "pdf-verification.json"
    report.write_text(json.dumps(results, indent=2), encoding="utf-8")
    for result in results:
        print(f"PASS {result['pdf']}: {result['pages']} A4 page(s); total, words, logo, complete text, privacy and repeated footer geometry verified")
