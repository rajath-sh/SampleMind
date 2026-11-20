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
Section = Literal["synopsis", "requirements", "er", "tests", "dfd", "normalization", "security"]
MAX_UPLOAD = 5 * 1024 * 1024


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
    if section == "synopsis":
        raise SampleMindException(404, "Upload your existing synopsis in this section.", "SYNOPSIS_REQUIRED")
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
    user: AppUser = Depends(require_roles(("ADMIN", "RESEARCHER"))),
):
    content = await file.read(MAX_UPLOAD + 1)
    await file.close()
    if len(content) > MAX_UPLOAD:
        raise SampleMindException(413, "Upload files up to 5 MB.", "UPLOAD_TOO_LARGE")
    name = Path((file.filename or "material").replace("\\", "/")).name[:150]
    extension = Path(name).suffix.lower()
    types = {".pdf": ("application/pdf", b"%PDF-"), ".png": ("image/png", b"\x89PNG\r\n\x1a\n"),
             ".jpg": ("image/jpeg", b"\xff\xd8"), ".jpeg": ("image/jpeg", b"\xff\xd8"),
             ".txt": ("text/plain; charset=utf-8", None),
             ".svg": ("image/svg+xml", None),
             ".html": ("text/html; charset=utf-8", None),
             ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", b"PK")}
    if extension not in types:
        raise SampleMindException(400, "Use PDF, DOCX, SVG, HTML, PNG, JPG or UTF-8 text.", "UPLOAD_TYPE")
    media, signature = types[extension]
    if not content or (signature and not content.startswith(signature)):
        raise SampleMindException(400, "The file contents do not match its type.", "UPLOAD_CONTENT")
    if extension == ".svg":
        content = validate_svg(content)
    if extension == ".html":
        content = safe_html(content)
    if extension == ".docx":
        docx_preview(content)
    if extension == ".txt":
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


def safe_html(content: bytes) -> bytes:
    from html.parser import HTMLParser
    class DocumentParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.output = []
            self.suppressed = 0
        def handle_starttag(self, tag, attrs):
            if tag in ("script", "style", "iframe", "object", "embed"):
                self.suppressed += 1
            elif not self.suppressed and tag in ("h1", "h2", "h3", "h4", "p", "div", "span",
                    "table", "thead", "tbody", "tr", "th", "td", "ol", "ul", "li", "pre",
                    "code", "strong", "em", "small", "br"):
                self.output.append("<" + tag + ">")
        def handle_endtag(self, tag):
            if tag in ("script", "style", "iframe", "object", "embed"):
                self.suppressed = max(0, self.suppressed - 1)
            elif not self.suppressed and tag in ("h1", "h2", "h3", "h4", "p", "div", "span",
                    "table", "thead", "tbody", "tr", "th", "td", "ol", "ul", "li", "pre",
                    "code", "strong", "em", "small"):
                self.output.append("</" + tag + ">")
        def handle_data(self, data):
            if not self.suppressed:
                self.output.append(escape(data))
    try:
        parser = DocumentParser()
        parser.feed(content.decode("utf-8"))
        return ("<!doctype html><html><meta charset='utf-8'><style>"
                "body{font:16px/1.6 Arial;padding:25px}table{border-collapse:collapse}"
                "td,th{border:1px solid #ccc;padding:6px}</style>"
                + "".join(parser.output) + "</html>").encode()
    except UnicodeDecodeError as error:
        raise SampleMindException(400, "HTML files must use UTF-8.", "HTML_ENCODING") from error


def docx_preview(content: bytes) -> bytes:
    try:
        with ZipFile(BytesIO(content)) as archive:
            info = archive.getinfo("word/document.xml")
            if info.file_size > 4 * 1024 * 1024:
                raise ValueError("Document XML is too large")
            xml = archive.read(info)
        root = ElementTree.fromstring(xml)
        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        paragraphs = [
            "".join(text.text or "" for text in paragraph.findall(".//w:t", ns))
            for paragraph in root.findall(".//w:p", ns)]
        return ("<!doctype html><html><meta charset='utf-8'><title>Document text preview</title>"
                "<style>body{font:16px/1.6 Arial;padding:25px;max-width:1000px;margin:auto}</style>"
                "<p><small>DOCX text preview. Download the original to view its full formatting.</small></p>"
                + "".join("<p>" + escape(text) + "</p>" for text in paragraphs) + "</html>").encode()
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
    if media.endswith("wordprocessingml.document") and not download:
        content = docx_preview(content)
        media = "text/html; charset=utf-8"
    return Response(content, media_type=media, headers={
        "Content-Disposition": f'{"attachment" if download else "inline"}; filename*=UTF-8\'\'{quote(item["name"])}',
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
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
