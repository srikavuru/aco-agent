"""
Notifier — Sends email alerts for BLOCKED/REVIEW_REQUIRED audit results.

Requires SENDGRID_API_KEY env var. Skips silently if not configured.
Also requires NOTIFY_FROM_EMAIL and NOTIFY_TO_EMAILS (comma-separated).

Sends a structured HTML email with:
- Status badge, compliance score, posting details
- Critical and high findings summary
- Link to the recruiter UI

Non-blocking: runs in a background thread.
"""

import json
import logging
import os
import threading

import requests

logger = logging.getLogger(__name__)

SENDGRID_API = "https://api.sendgrid.com/v3/mail/send"


def notify_if_needed(certificate: dict) -> None:
    """Send notification for BLOCKED or REVIEW_REQUIRED audits."""
    status = certificate.get("audit_result", {}).get("overall_status", "")
    if status not in ("BLOCKED", "REVIEW_REQUIRED"):
        return
    if not os.environ.get("SENDGRID_API_KEY"):
        return

    thread = threading.Thread(
        target=_send_email,
        args=(certificate,),
        daemon=True,
    )
    thread.start()


def _send_email(certificate: dict) -> None:
    api_key = os.environ.get("SENDGRID_API_KEY")
    from_email = os.environ.get("NOTIFY_FROM_EMAIL", "aco-agent@vertiv.com")
    to_emails = os.environ.get("NOTIFY_TO_EMAILS", "").split(",")
    to_emails = [e.strip() for e in to_emails if e.strip()]

    if not to_emails:
        logger.warning("NOTIFY_TO_EMAILS not set, skipping notification")
        return

    posting = certificate.get("posting", {})
    audit_result = certificate.get("audit_result", {})
    audit_id = certificate.get("audit_id", "")
    status = audit_result.get("overall_status", "")
    counts = audit_result.get("counts", {})
    title = posting.get("title", "Untitled")
    req_number = posting.get("req_number", "")
    region = posting.get("region", "")

    subject = f"[ACO {status}] {title}"
    if req_number:
        subject += f" ({req_number})"

    critical_items = certificate.get("executive_summary", {}).get("critical_issues", [])
    high_items = certificate.get("executive_summary", {}).get("high_priority_issues", [])

    findings_html = ""
    for f in critical_items:
        findings_html += f'<tr><td style="color:#E31837;font-weight:bold">CRITICAL</td><td>{f["rule_id"]}</td><td>{f["rule_name"]}</td><td>{f["failure_message"]}</td></tr>\n'
    for f in high_items:
        findings_html += f'<tr><td style="color:#F97316;font-weight:bold">HIGH</td><td>{f["rule_id"]}</td><td>{f["rule_name"]}</td><td>{f["failure_message"]}</td></tr>\n'

    status_color = "#E31837" if status == "BLOCKED" else "#F97316"

    html = f"""
    <div style="font-family:Segoe UI,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#E31837;padding:16px 24px;color:white">
            <strong>ACO Agent</strong> — Compliance Alert
        </div>
        <div style="padding:24px;border:1px solid #eee">
            <div style="font-size:24px;font-weight:bold;color:{status_color};margin-bottom:8px">{status}</div>
            <table style="font-size:14px;color:#374151;margin-bottom:16px">
                <tr><td style="color:#9CA3AF;padding-right:12px">Posting</td><td><strong>{title}</strong></td></tr>
                <tr><td style="color:#9CA3AF;padding-right:12px">Req</td><td>{req_number or '—'}</td></tr>
                <tr><td style="color:#9CA3AF;padding-right:12px">Region</td><td>{region}</td></tr>
                <tr><td style="color:#9CA3AF;padding-right:12px">Audit ID</td><td style="font-family:monospace">{audit_id}</td></tr>
            </table>
            <div style="background:#F8F9FA;padding:12px;border-radius:6px;font-size:13px;margin-bottom:16px">
                <strong>Findings:</strong> {counts.get('CRITICAL',0)} Critical, {counts.get('HIGH',0)} High, {counts.get('MEDIUM',0)} Medium, {counts.get('LOW',0)} Low
            </div>
            {f'<table style="width:100%;font-size:12px;border-collapse:collapse"><tr style="background:#374151;color:white"><th style="padding:6px;text-align:left">Severity</th><th style="padding:6px;text-align:left">Rule</th><th style="padding:6px;text-align:left">Name</th><th style="padding:6px;text-align:left">Issue</th></tr>{findings_html}</table>' if findings_html else ''}
            <div style="margin-top:16px;font-size:13px;color:#9CA3AF">
                <strong>Recommendation:</strong> {audit_result.get('publish_recommendation', '')}
            </div>
        </div>
        <div style="padding:12px 24px;font-size:11px;color:#9CA3AF;border-top:1px solid #eee">
            Decision support only — all publish decisions are human-owned.
        </div>
    </div>
    """

    payload = {
        "personalizations": [{"to": [{"email": e} for e in to_emails]}],
        "from": {"email": from_email, "name": "ACO Agent"},
        "subject": subject,
        "content": [{"type": "text/html", "value": html}],
    }

    try:
        resp = requests.post(
            SENDGRID_API,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        if resp.status_code in (200, 202):
            logger.info("Notification sent for %s to %s", audit_id, to_emails)
        else:
            logger.error("SendGrid error %d: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        logger.error("Notification failed for %s: %s", audit_id, e)
