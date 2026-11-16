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
    for marker in markers:
        assert text.count(marker) == 1, f"{filename}: clipped/duplicated {marker}"
    if "multipage" in filename:
        assert len(reader.pages) >= 3, "Long quotation should paginate"
        assert sum("Description" in page and "Amount" in page for page in pages_text) >= 2, "Table headings must repeat"
    else:
        assert len(reader.pages) == 1, f"{filename}: standard quotation should fit one A4 page"
    assert len(reader.pages[0].images) > 0, f"{filename}: logo image missing"

    rendered = []
    pdf = pdfium.PdfDocument(str(path))
    try:
        for index, page in enumerate(reader.pages):
            width, height = float(page.mediabox.width), float(page.mediabox.height)
            assert abs(width - 595.28) < 1 and abs(height - 841.89) < 1, f"{filename}: non-A4 page"
            assert len(pages_text[index].strip()) > 20, f"{filename}: blank trailing page"
            rendered_page = pdf[index]
            text_page = rendered_page.get_textpage()
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
    (ARTIFACTS / f"{path.stem}-extracted.txt").write_text(text, encoding="utf-8")
    return {"pdf": filename, "pages": len(reader.pages), "total": total, "rendered": rendered, "result": "PASS"}


if __name__ == "__main__":
    results = [verify(filename, *expected) for filename, expected in EXPECTED.items()]
    report = ARTIFACTS / "pdf-verification.json"
    report.write_text(json.dumps(results, indent=2), encoding="utf-8")
    for result in results:
        print(f"PASS {result['pdf']}: {result['pages']} A4 page(s); total, words, logo, complete text and privacy verified")
