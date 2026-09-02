from __future__ import annotations

import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests

BRAND_NAME = "Cloudvaathi"


def public_site_url() -> str:
    return (os.getenv("PUBLIC_SITE_URL") or "https://lms.cloudvaathi.in").rstrip("/")


def verify_url(credential_id: str) -> str:
    return f"{public_site_url()}/certificates/{credential_id}"


def _email_provider_config() -> tuple[str, str, str, str]:
    """Return (provider, api_key_or_empty, sender, gmail_app_password)."""
    brevo_key = (os.getenv("BREVO_API_KEY") or "").strip()
    sender = (os.getenv("EMAIL_SENDER") or os.getenv("GMAIL_USER") or "").strip()
    gmail_user = (os.getenv("GMAIL_USER") or "").strip()
    app_password = (os.getenv("GMAIL_APP_PASSWORD") or "").strip()
    if brevo_key and sender:
        return "brevo", brevo_key, sender, ""
    if gmail_user and app_password:
        return "gmail", "", gmail_user, app_password
    return "", "", "", ""


def certificate_email_configured() -> bool:
    provider, _, _, _ = _email_provider_config()
    return bool(provider)


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

    provider, api_key, sender, app_password = _email_provider_config()
    if not provider:
        raise RuntimeError(
            "No email provider configured for certificates. Set BREVO_API_KEY + EMAIL_SENDER "
            "or GMAIL_USER + GMAIL_APP_PASSWORD on the server."
        )

    link = verify_url(credential_id)
    subject = f"Your {BRAND_NAME} certificate — {course_title}"
    html_body = f"""
    <html><body style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;">
      <p>Hello {name},</p>
      <p>Congratulations on completing <strong>{course_title}</strong>.</p>
      <p>Your {BRAND_NAME} certificate of completion is attached. You can also verify it at:</p>
      <p><a href="{link}">{link}</a></p>
      <p>Certificate No: <strong>{credential_id}</strong></p>
      <p>Learn · Certify · Transform<br/>{BRAND_NAME}</p>
    </body></html>
    """
    text_body = (
        f"Hello {name},\n\nCongratulations on completing {course_title}.\n"
        f"Your {BRAND_NAME} certificate is attached.\n"
        f"Certificate No: {credential_id}\nVerify: {link}\n\n{BRAND_NAME}\n"
    )
    pdf_bytes = pdf_path.read_bytes()

    if provider == "brevo":
        import base64

        payload = {
            "sender": {"name": BRAND_NAME, "email": sender},
            "to": [{"email": to_email, "name": name}],
            "subject": subject,
            "htmlContent": html_body,
            "textContent": text_body,
            "attachment": [{
                "content": base64.b64encode(pdf_bytes).decode("ascii"),
                "name": f"{credential_id}.pdf",
            }],
        }
        response = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            json=payload,
            headers={"accept": "application/json", "api-key": api_key, "content-type": "application/json"},
            timeout=30,
        )
        if response.status_code not in (200, 201):
            raise RuntimeError(f"Brevo certificate email failed: {response.status_code} {response.text}")
        return

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = f"{BRAND_NAME} <{sender}>"
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename=f"{credential_id}.pdf")
    msg.attach(attachment)
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as server:
        server.starttls()
        server.login(sender, app_password)
        server.sendmail(sender, [to_email], msg.as_string())
