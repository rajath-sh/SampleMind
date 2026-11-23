"""Coursework library with generated materials and recoverable uploads."""
import base64
from pathlib import Path
from typing import Literal
from io import BytesIO
from zipfile import ZipFile, BadZipFile
from xml.etree import ElementTree
from html import escape

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response

from app.common import AppUser, SampleMindException, get_current_user, require_roles
from .documents import document_store
from .materials import SECTIONS, generated, schema_info

router = APIRouter(prefix="/api/v1/coursework", tags=["DBMS coursework"],
                   dependencies=[Depends(get_current_user)])
Section = Literal["synopsis", "requirements", "er", "dfd", "normalization", "security", "report"]
MAX_UPLOAD = 100 * 1024 * 1024  # 100 MB upload limit


@router.get("")
def catalog(deleted: bool = False):
    with document_store() as store:
        hidden = [row["section"] for row in store.table("coursework_generated").all() if row.get("deleted")]
        files = [dict(row, id=row.doc_id) for row in store.table("coursework_files").all()
                 if bool(row.get("deleted")) == deleted]
    return {"sections": SECTIONS, "hidden_generated": hidden, "files": [{key: value for key, value in row.items() if key != "content"}
                                           for row in files]}


@router.post("/generated/{section}/restore")
def restore_generated(section: Section, user: AppUser = Depends(require_roles(("ADMIN", "RESEARCHER")))):
    with document_store() as store:
        table = store.table("coursework_generated")
        from tinydb.table import Document
        identifier = list(SECTIONS).index(section) + 1
        table.upsert(Document({"section": section, "deleted": False}, doc_id=identifier))
    return {"message": "Generated material restored."}


@router.delete("/generated/{section}")
def remove_generated(section: Section, user: AppUser = Depends(require_roles(("ADMIN", "RESEARCHER")))):
    with document_store() as store:
        table = store.table("coursework_generated")
        from tinydb.table import Document
        identifier = list(SECTIONS).index(section) + 1
        table.upsert(Document({"section": section, "deleted": True}, doc_id=identifier))
    return {"message": "Generated material removed; it can be restored."}


@router.get("/schema")
def current_schema():
    return schema_info()


@router.get("/generated/{section}")
def generated_material(section: Section, download: bool = False, variant: Literal["default", "notes", "pdf", "attributes", "full"] = "default"):
    if section in ("synopsis", "report"):
        raise SampleMindException(404, f"Upload your existing {section} in this section.", f"{section.upper()}_REQUIRED")
    with document_store() as store:
        hidden = store.table("coursework_generated").get(doc_id=list(SECTIONS).index(section) + 1)
    if hidden and hidden.get("deleted"):
        raise SampleMindException(404, "This generated material has been removed. Restore it from the library.", "MATERIAL_REMOVED")
    content, media, name = generated(section, variant)
    return Response(content, media_type=media, headers={
        "Content-Disposition": f'{"attachment" if download else "inline"}; filename="{name}"',
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    })


@router.post("/uploads")
async def upload_material(
    section: Section = Form(...), file: UploadFile = File(...),
    user: AppUser = Depends(require_roles(("ADMIN", "RESEARCHER", "TECHNICIAN", "VIEWER"))),
):
    content = await file.read(MAX_UPLOAD + 1)
    await file.close()
    if len(content) > MAX_UPLOAD:
        raise SampleMindException(413, "Upload files up to 100 MB.", "UPLOAD_TOO_LARGE")
    name = Path((file.filename or "material").replace("\\", "/")).name[:150]
    extension = Path(name).suffix.lower()
    types = {
        ".pdf": ("application/pdf", None),
        ".png": ("image/png", b"\x89PNG\r\n\x1a\n"),
        ".jpg": ("image/jpeg", b"\xff\xd8"),
        ".jpeg": ("image/jpeg", b"\xff\xd8"),
        ".txt": ("text/plain; charset=utf-8", None),
        ".md": ("text/markdown; charset=utf-8", None),
        ".markdown": ("text/markdown; charset=utf-8", None),
        ".csv": ("text/csv; charset=utf-8", None),
        ".svg": ("image/svg+xml", None),
        ".html": ("text/html; charset=utf-8", None),
        ".htm": ("text/html; charset=utf-8", None),
        ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", b"PK"),
    }
    if extension not in types:
        raise SampleMindException(400, "Use PDF, DOCX, SVG, HTML, PNG, JPG, MD, or UTF-8 text.", "UPLOAD_TYPE")
    media, signature = types[extension]
    if not content:
        raise SampleMindException(400, "The uploaded file is empty.", "UPLOAD_EMPTY")
    if extension == ".pdf":
        if b"%PDF-" not in content[:1024]:
            raise SampleMindException(400, "The file contents do not match a valid PDF.", "UPLOAD_CONTENT")
    elif signature and not content.startswith(signature):
        raise SampleMindException(400, "The file contents do not match its type.", "UPLOAD_CONTENT")
    if extension == ".svg":
        content = validate_svg(content)
    if extension in (".html", ".htm"):
        content = safe_html(content, name)
    if extension == ".docx":
        docx_preview(content, name)
    if extension in (".txt", ".md", ".markdown", ".csv"):
        try:
            content.decode("utf-8")
        except UnicodeDecodeError as error:
            raise SampleMindException(400, "Text uploads must use UTF-8.", "UPLOAD_ENCODING") from error
    with document_store() as store:
        identifier = store.table("coursework_files").insert({
            "section": section, "name": name, "media": media, "owner": user.user_id,
            "content": base64.b64encode(content).decode(), "deleted": False,
        })
    return {"id": identifier, "name": name}


def validate_svg(content: bytes) -> bytes:
    try:
        if b"<!DOCTYPE" in content.upper() or b"<!ENTITY" in content.upper():
            raise ValueError("Document declarations are unsupported")
        root = ElementTree.fromstring(content)
        allowed = {"svg", "g", "rect", "circle", "ellipse", "line", "path", "polygon",
                   "polyline", "text", "tspan", "title", "desc", "defs", "marker"}
        if not root.tag.endswith("svg"):
            raise ValueError("Not an SVG")
        for node in root.iter():
            if node.tag.split("}")[-1] not in allowed:
                raise ValueError("Unsupported SVG element")
            for key, value in node.attrib.items():
                key = key.split("}")[-1].lower()
                if key.startswith("on") or key in ("href", "src", "style"):
                    raise ValueError("Unsupported SVG attribute")
                if "url(" in value.lower() and not value.startswith("url(#"):
                    raise ValueError("External SVG resource")
        return ElementTree.tostring(root, encoding="utf-8")
    except (ValueError, ElementTree.ParseError) as error:
        raise SampleMindException(400, "Use a static SVG diagram without scripts or external resources.", "SVG_CONTENT") from error


DOCUMENT_STYLE = """
body {
    font: 16px/1.55 Arial, sans-serif;
    max-width: 1050px;
    margin: 30px auto;
    padding: 20px;
    color: #193b43;
    background-color: #ffffff;
}
h1, h2, h3, h4 {
    color: #286c61;
    font-family: Arial, sans-serif;
    font-weight: bold;
}
h1 {
    font-size: 26px;
    margin-top: 10px;
    margin-bottom: 8px;
    border-bottom: 2px solid #ccdcd6;
    padding-bottom: 8px;
}
.kicker {
    color: #5e9084;
    font-size: 13px;
    font-weight: 600;
    margin-top: -4px;
    margin-bottom: 24px;
    letter-spacing: 0.5px;
}
h2 {
    font-size: 20px;
    margin-top: 28px;
    margin-bottom: 10px;
    border-bottom: 1px solid #e1efe9;
    padding-bottom: 4px;
}
h3 {
    font-size: 16px;
    margin-top: 20px;
    margin-bottom: 8px;
}
p {
    font-size: 15px;
    line-height: 1.6;
    margin: 0 0 14px;
    color: #193b43;
}
ul, ol {
    margin: 0 0 16px;
    padding-left: 24px;
}
li {
    font-size: 15px;
    line-height: 1.6;
    margin-bottom: 6px;
    color: #193b43;
}
table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
    margin: 18px 0 24px;
}
th, td {
    border: 1px solid #ccdcd6;
    padding: 8px 10px;
    text-align: left;
    vertical-align: top;
    color: #193b43;
}
th {
    background: #e9f3ee;
    font-weight: bold;
    color: #193b43;
}
tr:nth-child(even) td {
    background: #fafdfc;
}
strong {
    font-weight: 700;
    color: #193b43;
}
pre, code {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 13px;
    background: #f4f8f6;
    border: 1px solid #ccdcd6;
    border-radius: 4px;
}
pre {
    padding: 12px;
    white-space: pre-wrap;
    margin-bottom: 16px;
}
@media print {
    h2, h3 { break-after: avoid; }
    tr { break-inside: avoid; }
}
"""


def wrap_document_html(title: str, body_html: str) -> str:
    clean_title = escape(title)
    return (
        f'<!doctype html><html lang="en"><head><meta charset="utf-8">'
        f'<title>{clean_title}</title>'
        f'<style>{DOCUMENT_STYLE}</style></head><body>'
        f'<h1>SampleMind — {clean_title}</h1>'
        f'<p class="kicker">RVCE · Database Management Systems · CD252IA</p>'
        f'{body_html}</body></html>'
    )


def safe_html(content: bytes, file_name: str = "Uploaded Document") -> bytes:
    from html.parser import HTMLParser

    class DocumentParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.output = []
            self.suppressed = 0

        def handle_starttag(self, tag, attrs):
            if tag in ("script", "style", "iframe", "object", "embed"):
                self.suppressed += 1
            elif not self.suppressed and tag in (
                "h1", "h2", "h3", "h4", "p", "div", "span", "table", "thead",
                "tbody", "tr", "th", "td", "ol", "ul", "li", "pre", "code",
                "strong", "em", "small", "br"
            ):
                self.output.append("<" + tag + ">")

        def handle_endtag(self, tag):
            if tag in ("script", "style", "iframe", "object", "embed"):
                self.suppressed = max(0, self.suppressed - 1)
            elif not self.suppressed and tag in (
                "h1", "h2", "h3", "h4", "p", "div", "span", "table", "thead",
                "tbody", "tr", "th", "td", "ol", "ul", "li", "pre", "code",
                "strong", "em", "small"
            ):
                self.output.append("</" + tag + ">")

        def handle_data(self, data):
            if not self.suppressed:
                self.output.append(escape(data))

    try:
        parser = DocumentParser()
        parser.feed(content.decode("utf-8"))
        display_title = Path(file_name).stem.replace("_", " ").title()
        rendered = wrap_document_html(display_title, "".join(parser.output))
        return rendered.encode("utf-8")
    except UnicodeDecodeError as error:
        raise SampleMindException(400, "HTML files must use UTF-8.", "HTML_ENCODING") from error


def text_preview(content: bytes, file_name: str = "Uploaded Document") -> bytes:
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin1", errors="replace")

    lines = text.splitlines()
    body_parts = []
    in_list = False

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if in_list:
                body_parts.append("</ul>")
                in_list = False
            continue

        if line.startswith("### "):
            if in_list:
                body_parts.append("</ul>")
                in_list = False
            body_parts.append(f"<h3>{escape(line[4:].strip())}</h3>")
        elif line.startswith("## "):
            if in_list:
                body_parts.append("</ul>")
                in_list = False
            body_parts.append(f"<h2>{escape(line[3:].strip())}</h2>")
        elif line.startswith("# "):
            if in_list:
                body_parts.append("</ul>")
                in_list = False
            body_parts.append(f"<h2>{escape(line[2:].strip())}</h2>")
        elif line.startswith("- ") or line.startswith("* ") or line.startswith("• "):
            if not in_list:
                body_parts.append("<ul>")
                in_list = True
            body_parts.append(f"<li>{escape(line[2:].strip())}</li>")
        else:
            if in_list:
                body_parts.append("</ul>")
                in_list = False
            body_parts.append(f"<p>{escape(line)}</p>")

    if in_list:
        body_parts.append("</ul>")

    display_title = Path(file_name).stem.replace("_", " ").title()
    return wrap_document_html(display_title, "".join(body_parts)).encode("utf-8")


def docx_preview(content: bytes, file_name: str = "Uploaded Document") -> bytes:
    try:
        import re
        with ZipFile(BytesIO(content)) as archive:
            info = archive.getinfo("word/document.xml")
            if info.file_size > 100 * 1024 * 1024:
                raise ValueError("Document XML is too large")
            xml = archive.read(info)
        root = ElementTree.fromstring(xml)
        ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

        body_elem = root.find(f"{{{ns}}}body")
        if body_elem is None:
            body_elem = root[0]

        html_parts = []
        in_list = False

        def close_list():
            nonlocal in_list
            if in_list:
                html_parts.append("</ul>")
                in_list = False

        def extract_runs(p_elem) -> str:
            runs = []
            for child in p_elem:
                tag = child.tag.split("}")[-1]
                if tag == "r":
                    rPr = child.find(f"{{{ns}}}rPr")
                    is_bold = False
                    is_italic = False
                    is_underline = False
                    if rPr is not None:
                        b_elem = rPr.find(f"{{{ns}}}b")
                        if b_elem is not None and b_elem.attrib.get(f"{{{ns}}}val") not in ("false", "0"):
                            is_bold = True
                        i_elem = rPr.find(f"{{{ns}}}i")
                        if i_elem is not None and i_elem.attrib.get(f"{{{ns}}}val") not in ("false", "0"):
                            is_italic = True
                        u_elem = rPr.find(f"{{{ns}}}u")
                        if u_elem is not None and u_elem.attrib.get(f"{{{ns}}}val") not in ("none", "false", "0"):
                            is_underline = True

                    text_bits = []
                    for t in child.findall(f"{{{ns}}}t"):
                        if t.text:
                            text_bits.append(escape(t.text))
                    for br in child.findall(f"{{{ns}}}br"):
                        text_bits.append("<br/>")

                    txt = "".join(text_bits)
                    if txt:
                        if is_bold:
                            txt = f"<strong>{txt}</strong>"
                        if is_italic:
                            txt = f"<em>{txt}</em>"
                        if is_underline:
                            txt = f"<u>{txt}</u>"
                        runs.append(txt)
                elif tag == "hyperlink":
                    inner_text = extract_runs(child)
                    runs.append(inner_text)
            return "".join(runs).strip()

        title_candidate = ""

        for elem in body_elem:
            tag = elem.tag.split("}")[-1]

            if tag == "tbl":
                close_list()
                rows = elem.findall(f"{{{ns}}}tr")
                if not rows:
                    continue
                table_html = ["<table>"]
                is_first_row = True
                for tr in rows:
                    row_cells = []
                    tcs = tr.findall(f"{{{ns}}}tc")
                    cell_tag = "th" if is_first_row else "td"
                    for tc in tcs:
                        cell_paragraphs = []
                        for p in tc.findall(f"{{{ns}}}p"):
                            c_text = extract_runs(p)
                            if c_text:
                                cell_paragraphs.append(c_text)
                        cell_content = "<br/>".join(cell_paragraphs) if cell_paragraphs else "&nbsp;"
                        row_cells.append(f"<{cell_tag}>{cell_content}</{cell_tag}>")

                    if is_first_row:
                        table_html.append("<thead><tr>" + "".join(row_cells) + "</tr></thead><tbody>")
                        is_first_row = False
                    else:
                        table_html.append("<tr>" + "".join(row_cells) + "</tr>")

                table_html.append("</tbody></table>")
                html_parts.append("\n".join(table_html))

            elif tag == "p":
                pPr = elem.find(f"{{{ns}}}pPr")
                style_val = ""
                jc_val = ""
                numPr = None
                if pPr is not None:
                    pStyle = pPr.find(f"{{{ns}}}pStyle")
                    if pStyle is not None:
                        style_val = pStyle.attrib.get(f"{{{ns}}}val", "")
                    jc_elem = pPr.find(f"{{{ns}}}jc")
                    if jc_elem is not None:
                        jc_val = jc_elem.attrib.get(f"{{{ns}}}val", "")
                    numPr = pPr.find(f"{{{ns}}}numPr")

                raw_text = "".join(t.text or "" for t in elem.iter(f"{{{ns}}}t")).strip()
                if not raw_text:
                    continue

                content = extract_runs(elem)
                if not content:
                    continue

                style_lower = style_val.lower()
                is_title = "title" in style_lower
                is_h1 = "heading1" in style_lower or "heading 1" in style_lower
                is_h2 = "heading2" in style_lower or "heading 2" in style_lower or "synopsisheading" in style_lower
                is_h3 = "heading3" in style_lower or "heading 3" in style_lower

                if not (is_title or is_h1 or is_h2 or is_h3):
                    if re.match(r"^\d+\.\s+[A-Z]", raw_text) and len(raw_text) < 90:
                        is_h2 = True
                    elif re.match(r"^\d+\s+\d+\s+[A-Z]", raw_text) and len(raw_text) < 90:
                        is_h2 = True
                    elif re.match(r"^(Core Database Design|Proposed Technology Stack|Expected Outcome)", raw_text, re.I):
                        is_h2 = True
                    elif re.match(r"^(FR\d+|NFR\d+)\s+", raw_text):
                        is_h3 = True

                is_bullet = raw_text.startswith("•") or raw_text.startswith("- ") or numPr is not None

                if is_title:
                    close_list()
                    title_candidate = raw_text
                    html_parts.append(f"<h2>{content}</h2>")
                elif is_h1:
                    close_list()
                    html_parts.append(f"<h2>{content}</h2>")
                elif is_h2:
                    close_list()
                    html_parts.append(f"<h2>{content}</h2>")
                elif is_h3:
                    close_list()
                    html_parts.append(f"<h3>{content}</h3>")
                elif is_bullet:
                    if not in_list:
                        html_parts.append("<ul>")
                        in_list = True
                    bullet_clean = re.sub(r"^[•\-]\s*", "", content)
                    html_parts.append(f"<li>{bullet_clean}</li>")
                else:
                    close_list()
                    align_style = f' style="text-align: {jc_val};"' if jc_val in ("center", "right") else ""
                    html_parts.append(f"<p{align_style}>{content}</p>")

        close_list()

        display_title = title_candidate or Path(file_name).stem.replace(".docx", "").replace("_", " ").title()
        return wrap_document_html(display_title, "".join(html_parts)).encode("utf-8")
    except (BadZipFile, KeyError, ValueError, ElementTree.ParseError) as error:
        raise SampleMindException(400, "The DOCX file could not be read.", "DOCX_CONTENT") from error


@router.get("/uploads/{identifier}")
def read_upload(identifier: int, download: bool = False):
    with document_store() as store:
        item = store.table("coursework_files").get(doc_id=identifier)
    if not item or item.get("deleted"):
        raise SampleMindException(404, "Material not found.", "NOT_FOUND")
    from urllib.parse import quote
    content = base64.b64decode(item["content"])
    media = item["media"]
    name = item.get("name", "material")
    if not download:
        if media.endswith("wordprocessingml.document"):
            content = docx_preview(content, name)
            media = "text/html; charset=utf-8"
        elif media.startswith("text/html"):
            content = safe_html(content, name)
            media = "text/html; charset=utf-8"
        elif media.startswith("text/plain"):
            content = text_preview(content, name)
            media = "text/html; charset=utf-8"
    return Response(content, media_type=media, headers={
        "Content-Disposition": f'{"attachment" if download else "inline"}; filename*=UTF-8\'\'{quote(name)}',
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox allow-same-origin",
    })


@router.delete("/uploads/{identifier}")
def delete_upload(identifier: int, user: AppUser = Depends(require_roles(("ADMIN", "RESEARCHER")))):
    with document_store() as store:
        files = store.table("coursework_files")
        item = files.get(doc_id=identifier)
        if not item:
            raise SampleMindException(404, "Material not found.", "NOT_FOUND")
        if user.role != "ADMIN" and item["owner"] != user.user_id:
            raise SampleMindException(403, "Only the uploader or administrator can remove this material.", "FORBIDDEN")
        files.update({"deleted": True}, doc_ids=[identifier])
    return {"message": "Material moved to removed files."}


@router.post("/uploads/{identifier}/restore")
def restore_upload(identifier: int, user: AppUser = Depends(require_roles(("ADMIN", "RESEARCHER")))):
    with document_store() as store:
        files = store.table("coursework_files")
        item = files.get(doc_id=identifier)
        if not item:
            raise SampleMindException(404, "Material not found.", "NOT_FOUND")
        if user.role != "ADMIN" and item["owner"] != user.user_id:
            raise SampleMindException(403, "Only the uploader or administrator can restore this material.", "FORBIDDEN")
        files.update({"deleted": False}, doc_ids=[identifier])
    return {"message": "Material restored."}
