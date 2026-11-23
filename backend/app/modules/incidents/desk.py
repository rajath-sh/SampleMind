"""Incident assignment acceptance and authenticated conversation."""
import asyncio
from datetime import timezone

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.common import (
    AppUser, Incident, AuditLog, SessionLocal, SampleMindException,
    decode_access_token, get_db, get_current_user, require_roles,
)
from app.common.database import acquire_write_lock

router = APIRouter(prefix="/api/v1/incident-desk", tags=["Incident desk"])
MANAGERS = ("ADMIN", "RESEARCHER")
WORKERS = ("ADMIN", "RESEARCHER")
peers: dict[int, set[WebSocket]] = {}


def incident_access(db, user, incident_id):
    incident = db.get(Incident, incident_id)
    if not incident:
        raise SampleMindException(404, "Incident not found.", "NOT_FOUND")
    if user.role not in MANAGERS and user.user_id != incident.assigned_to:
        raise SampleMindException(403, "This incident is not assigned to you.", "FORBIDDEN")
    return incident


def latest_assignment(db, incident_id):
    return db.query(AuditLog).filter(
        AuditLog.entity_type == "Incident", AuditLog.entity_id == incident_id,
        AuditLog.action.in_(("INCIDENT_ASSIGNED", "INCIDENT_ACCEPTED", "INCIDENT_DECLINED")),
    ).order_by(AuditLog.audit_log_id.desc()).first()


async def notify(incident_id):
    for socket in list(peers.get(incident_id, set())):
        try:
            await socket.send_json({"event": "incident_changed"})
        except Exception:
            peers.get(incident_id, set()).discard(socket)


def _format_iso_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc).isoformat()
    return dt.astimezone(timezone.utc).isoformat()


@router.get("/notifications/recent")
def recent_notifications(db: Session = Depends(get_db), user: AppUser = Depends(get_current_user)):
    query = db.query(AuditLog, Incident.incident_code).join(Incident, Incident.incident_id == AuditLog.entity_id).filter(
        AuditLog.entity_type == "Incident",
        AuditLog.action.in_(("INCIDENT_ASSIGNED", "INCIDENT_ACCEPTED", "INCIDENT_DECLINED", "INCIDENT_MESSAGE")),
        AuditLog.actor_user_id != user.user_id,
    )
    if user.role not in MANAGERS:
        query = query.filter(Incident.assigned_to == user.user_id)
    return [{"id": log.audit_log_id, "code": code, "action": log.action, "at": _format_iso_utc(log.occurred_at)}
            for log, code in query.order_by(AuditLog.audit_log_id.desc()).limit(25)]


@router.get("")
def list_desk(db: Session = Depends(get_db), user: AppUser = Depends(get_current_user)):
    query = db.query(Incident)
    if user.role not in MANAGERS:
        query = query.filter(Incident.assigned_to == user.user_id)
    incidents = query.order_by(Incident.reported_at.desc()).limit(100).all()
    rows = []
    for incident in incidents:
        assignment = latest_assignment(db, incident.incident_id)
        worker = db.get(AppUser, incident.assigned_to) if incident.assigned_to else None
        acceptance_status = assignment.action.removeprefix("INCIDENT_").lower() if assignment else ("assigned" if incident.assigned_to else "unassigned")
        if incident.status in ("mitigated", "closed") and acceptance_status == "accepted":
            acceptance_status = "investigation_completed"
        rows.append({
            "id": incident.incident_id, "code": incident.incident_code, "status": incident.status,
            "description": incident.description, "assigned_to": incident.assigned_to,
            "worker": worker.display_name if worker else None,
            "acceptance": acceptance_status,
        })
    workers = [{"id": worker.user_id, "name": worker.display_name, "role": worker.role}
               for worker in db.query(AppUser).filter(AppUser.role.in_(WORKERS), AppUser.is_active.is_(True))] if user.role in MANAGERS else []
    return {"incidents": rows, "workers": workers}


class Assignment(BaseModel):
    worker_id: int = Field(gt=0)


@router.post("/{incident_id}/assign")
async def assign(
    incident_id: int, payload: Assignment, db: Session = Depends(get_db),
    user: AppUser = Depends(require_roles(MANAGERS)),
):
    incident = acquire_write_lock(db, Incident, incident_id)
    if not incident:
        raise SampleMindException(404, "Incident not found.", "NOT_FOUND")
    worker = db.get(AppUser, payload.worker_id)
    if not worker or not worker.is_active or worker.role not in WORKERS:
        raise SampleMindException(400, "Choose an active researcher or technician.", "INVALID_WORKER")
    if incident.status == "closed":
        raise SampleMindException(409, "Reopen the incident before assigning it.", "INCIDENT_CLOSED")
    incident.assigned_to = worker.user_id
    db.add(AuditLog(actor_user_id=user.user_id, action="INCIDENT_ASSIGNED", entity_type="Incident",
                    entity_id=incident_id, details={"worker_id": worker.user_id}))
    db.commit()
    await notify(incident_id)
    return {"message": "Assignment sent for staff acceptance."}


class Decision(BaseModel):
    accept: bool


@router.post("/{incident_id}/respond")
async def respond(
    incident_id: int, payload: Decision, db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    incident = acquire_write_lock(db, Incident, incident_id)
    if not incident or incident.assigned_to != user.user_id:
        raise SampleMindException(403, "Only the assigned worker can respond.", "FORBIDDEN")
    assignment = latest_assignment(db, incident_id)
    if assignment and assignment.action != "INCIDENT_ASSIGNED":
        raise SampleMindException(409, "There is no pending assignment.", "NO_PENDING_ASSIGNMENT")
    if incident.status == "closed":
        raise SampleMindException(409, "This incident is closed.", "INCIDENT_CLOSED")
    if payload.accept:
        incident.status = "investigating"
    db.add(AuditLog(actor_user_id=user.user_id,
                    action="INCIDENT_ACCEPTED" if payload.accept else "INCIDENT_DECLINED",
                    entity_type="Incident", entity_id=incident_id, details={"worker_id": user.user_id}))
    db.commit()
    await notify(incident_id)
    return {"message": "Assignment accepted." if payload.accept else "Assignment declined."}


@router.post("/{incident_id}/complete-investigation")
async def complete_investigation(
    incident_id: int,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    incident = acquire_write_lock(db, Incident, incident_id)
    if not incident:
        raise SampleMindException(404, "Incident not found.", "NOT_FOUND")
    # Strictly the assigned investigator can mark their investigation as done
    if incident.assigned_to != user.user_id:
        raise SampleMindException(403, "Only the assigned investigator can complete the investigation.", "FORBIDDEN")
    if incident.status == "closed":
        raise SampleMindException(409, "This incident is already closed.", "ALREADY_CLOSED")

    incident.status = "mitigated"
    db.add(AuditLog(
        actor_user_id=user.user_id,
        action="INCIDENT_INVESTIGATION_COMPLETED",
        entity_type="Incident",
        entity_id=incident_id,
        details={"status": "mitigated", "investigator": user.display_name},
    ))
    db.commit()
    await notify(incident_id)
    return {"message": "Investigation completed. Incident status marked as Mitigated."}


@router.get("/{incident_id}/messages")
def messages(incident_id: int, db: Session = Depends(get_db), user: AppUser = Depends(get_current_user)):
    incident_access(db, user, incident_id)
    rows = db.query(AuditLog).filter(AuditLog.entity_type == "Incident",
        AuditLog.entity_id == incident_id, AuditLog.action == "INCIDENT_MESSAGE").order_by(
            AuditLog.audit_log_id.desc()).limit(100).all()
    return [{"id": row.audit_log_id, "text": (row.details or {}).get("text", ""),
             "sender": (row.details or {}).get("sender", "Staff"), "at": _format_iso_utc(row.occurred_at)}
            for row in reversed(rows)]


class ChatMessage(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.post("/{incident_id}/messages")
async def send_message(
    incident_id: int, payload: ChatMessage,
    db: Session = Depends(get_db), user: AppUser = Depends(get_current_user),
):
    incident_access(db, user, incident_id)
    content = payload.text.strip()
    if not content:
        raise SampleMindException(400, "Enter a message.", "EMPTY_MESSAGE")
    db.add(AuditLog(actor_user_id=user.user_id, action="INCIDENT_MESSAGE", entity_type="Incident",
        entity_id=incident_id, details={"text": content, "sender": user.display_name}))
    db.commit()
    await notify(incident_id)
    return {"message": "Message sent."}


@router.websocket("/{incident_id}/live")
async def live(socket: WebSocket, incident_id: int):
    await socket.accept()
    try:
        first = await asyncio.wait_for(socket.receive_json(), timeout=10)
        token = first.get("token", "")
        payload = decode_access_token(token)
        identity = int(payload.get("sub", 0)) if payload else 0
        with SessionLocal() as db:
            user = db.get(AppUser, identity)
            if not user or not user.is_active:
                await socket.close(code=4401)
                return
            incident_access(db, user, incident_id)
        peers.setdefault(incident_id, set()).add(socket)
        await socket.send_json({"event": "connected"})
        while True:
            await asyncio.wait_for(socket.receive_text(), timeout=90)
            # Role and assignment changes take effect on every heartbeat.
            with SessionLocal() as db:
                user = db.get(AppUser, identity)
                if not decode_access_token(token) or not user or not user.is_active:
                    await socket.close(code=4401)
                    return
                incident_access(db, user, incident_id)
            await socket.send_json({"event": "heartbeat"})
    except (WebSocketDisconnect, asyncio.TimeoutError, ValueError, SampleMindException):
        try:
            await socket.close(code=4403)
        except RuntimeError:
            pass
    finally:
        peers.get(incident_id, set()).discard(socket)
