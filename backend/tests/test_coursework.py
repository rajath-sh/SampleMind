from io import BytesIO
from zipfile import ZipFile
from xml.etree import ElementTree

from test_integrated_lab import lab
from app.common import Base


def test_generated_materials_schema_and_removal(lab):
    client, admin, viewer, _ = lab
    root = "/api/v1/coursework"
    assert client.get(root).status_code == 401
    for section in ("requirements", "tests", "normalization", "security", "er", "dfd"):
        response = client.get(f"{root}/generated/{section}", headers=viewer)
        assert response.status_code == 200, response.text
        if section in ("er", "dfd"):
            xml = ElementTree.fromstring(response.content)
            assert xml.tag.endswith("svg")
        if section == "er":
            for name in Base.metadata.tables:
                assert name in response.text
            assert "<ellipse" in response.text and "<polygon" in response.text
    assert client.get(f"{root}/generated/synopsis", headers=admin).status_code == 404
    assert client.delete(f"{root}/generated/er", headers=viewer).status_code == 403
    assert client.delete(f"{root}/generated/er", headers=admin).status_code == 200
    assert client.get(f"{root}/generated/er", headers=admin).status_code == 404
    assert client.post(f"{root}/generated/er/restore", headers=admin).status_code == 200
    assert client.get(f"{root}/generated/er", headers=admin).status_code == 200


def test_synopsis_upload_preview_remove_restore(lab):
    client, admin, viewer, _ = lab
    root = "/api/v1/coursework"
    stream = BytesIO()
    with ZipFile(stream, "w") as archive:
        archive.writestr("word/document.xml",
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            '<w:body><w:p><w:r><w:t>Existing synopsis &lt;script&gt;</w:t></w:r></w:p></w:body></w:document>')
    content = stream.getvalue()
    result = client.post(f"{root}/uploads", headers=admin, data={"section": "synopsis"},
                         files={"file": ("synopsis.docx", content)})
    assert result.status_code == 200, result.text
    identifier = result.json()["id"]
    preview = client.get(f"{root}/uploads/{identifier}", headers=viewer)
    assert preview.status_code == 200 and "Existing synopsis &lt;script&gt;" in preview.text
    downloaded = client.get(f"{root}/uploads/{identifier}?download=true", headers=viewer)
    assert downloaded.content == content
    assert client.delete(f"{root}/uploads/{identifier}", headers=viewer).status_code == 403
    assert client.delete(f"{root}/uploads/{identifier}", headers=admin).status_code == 200
    assert client.get(f"{root}/uploads/{identifier}", headers=admin).status_code == 404
    assert client.post(f"{root}/uploads/{identifier}/restore", headers=admin).status_code == 200
    assert client.get(f"{root}/uploads/{identifier}", headers=admin).status_code == 200
    assert client.post(f"{root}/uploads", headers=admin, data={"section": "synopsis"},
                       files={"file": ("bad.pdf", b"not a PDF")}).status_code == 400

def test_uploaded_diagrams_round_trip_and_active_content_rejected(lab):
    client, admin, _, _ = lab
    root = "/api/v1/coursework"
    diagram = client.get(f"{root}/generated/er", headers=admin).content
    result = client.post(f"{root}/uploads", headers=admin, data={"section": "er"},
                         files={"file": ("diagram.svg", diagram)})
    assert result.status_code == 200, result.text
    fetched = client.get(f"{root}/uploads/{result.json()['id']}", headers=admin)
    assert fetched.status_code == 200
    ElementTree.fromstring(fetched.content)
    result = client.post(f"{root}/uploads", headers=admin, data={"section": "er"},
                         files={"file": ("active.svg", b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')})
    assert result.status_code == 400


def test_incident_websocket_auth_and_live_message(lab, monkeypatch):
    from app.common import Incident
    from app.modules.incidents import desk
    client, admin, viewer, Session = lab
    with Session.begin() as db:
        db.add(Incident(incident_code="SOCKET-1", sample_id=1, incident_type="handling_issue",
            severity="low", description="Websocket transport check", reported_by=1,
            occurred_at=__import__('datetime').datetime.now(__import__('datetime').timezone.utc)))
    monkeypatch.setattr(desk, "SessionLocal", Session)
    with client.websocket_connect("/api/v1/incident-desk/1/live") as socket:
        socket.send_json({"token": admin["Authorization"].split(" ", 1)[1]})
        assert socket.receive_json()["event"] == "connected"
        response = client.post("/api/v1/incident-desk/1/messages", headers=admin, json={"text": "Live message verification"})
        assert response.status_code == 200
        assert socket.receive_json()["event"] == "incident_changed"
        socket.send_text("heartbeat")
        assert socket.receive_json()["event"] == "heartbeat"
