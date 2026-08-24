from __future__ import annotations

import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional

import requests


def public_site_url() -> str:
    return (os.getenv("PUBLIC_SITE_URL") or "https://lms.cloudvaathi.in").rstrip("/")


def verify_url(credential_id: str) -> str:
    return f"{public_site_url()}/certificates/{credential_id}"


def send_certificate_email(
    *,
    to_email: str,
    name: str,
    course_title: str,
    credential_id: str,
    pdf_path: Path,
) -> None:
    if not to_email:
        raise RuntimeError("Student email is missing.")
    if not pdf_path.exists():
        raise FileNotFoundError(f"Certificate PDF not found: {pdf_path}")

    link = verify_url(credential_id)
    subject = f"Your Cloud Vaathi certificate — {course_title}"
    html_body = f"""
    <html><body style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;">
      <p>Hello {name},</p>
      <p>Congratulations on completing <strong>{course_title}</strong>.</p>
      <p>Your certificate of completion is attached. You can also verify it at:</p>
      <p><a href="{link}">{link}</a></p>
      <p>Certificate No: <strong>{credential_id}</strong></p>
      <p>Learn · Certify · Transform<br/>Cloud Vaathi</p>
    </body></html>
    """
    text_body = (
        f"Hello {name},\n\nCongratulations on completing {course_title}.\n"
        f"Certificate No: {credential_id}\nVerify: {link}\n\nCloud Vaathi\n"
    )

    api_key = (os.getenv("BREVO_API_KEY") or "").strip()
    sender = (os.getenv("EMAIL_SENDER") or os.getenv("GMAIL_USER") or "").strip()
    pdf_bytes = pdf_path.read_bytes()

    if api_key and sender:
        import base64
        payload = {
            "sender": {"name": "Cloud Vaathi", "email": sender},
            "to": [{"email": to_email, "name": name}],
            "subject": subject,
            "htmlContent": html_body,
            "attachment": [{
                "content": base64.b64encode(pdf_bytes).decode("ascii"),
                "name": f"{credential_id}.pdf",
            }],
        }
        response = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            json=payload,
            headers={"accept": "application/json", "api-key": api_key, "content-type": "application/json"},
            timeout=20,
        )
        if response.status_code not in (200, 201):
            raise RuntimeError(f"Brevo certificate email failed: {response.status_code} {response.text}")
        return

    gmail_user = (os.getenv("GMAIL_USER") or "").strip()
    app_password = (os.getenv("GMAIL_APP_PASSWORD") or "").strip()
    if not gmail_user or not app_password:
        raise RuntimeError("No email provider configured for certificates.")

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = gmail_user
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename=f"{credential_id}.pdf")
    msg.attach(attachment)
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as server:
        server.starttls()
        server.login(gmail_user, app_password)
        server.sendmail(gmail_user, [to_email], msg.as_string())
