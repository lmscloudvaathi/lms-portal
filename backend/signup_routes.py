"""Student email-OTP signup (Gmail SMTP). Mounted at /api/v1/auth/signup/*."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

import email_otp
import models
import schemas
from database import get_db
from password_utils import get_password_hash

router = APIRouter(prefix="/auth/signup", tags=["auth-signup"])


@router.get("/ping")
async def signup_router_ping():
    return {"ok": True, "router": "auth_signup"}


@router.post("/send-otp")
async def signup_send_otp(req: schemas.SignupSendOtpRequest, db: AsyncSession = Depends(get_db)):
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Please enter your name.")

    result = await db.execute(select(models.User).where(models.User.email == req.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")

    pw_hash = get_password_hash(req.password)
    try:
        await email_otp.begin_signup_otp(
            str(req.email),
            password_hash=pw_hash,
            full_name=req.name.strip(),
            phone_number=req.phone_number,
            role="student",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"signup_send_otp: {e}")
        raise HTTPException(
            status_code=502,
            detail="Could not send verification email. Check GMAIL_USER / GMAIL_APP_PASSWORD on the server.",
        )

    return {
        "message": "Verification code sent.",
        "hint": "Check your inbox and spam or junk folder if you do not see it within a minute.",
    }


@router.post("/resend-otp")
async def signup_resend_otp(req: schemas.SignupResendOtpRequest):
    try:
        await email_otp.resend_signup_otp(str(req.email))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"signup_resend_otp: {e}")
        raise HTTPException(status_code=502, detail="Could not resend verification email.")

    return {
        "message": "A new verification code was sent.",
        "hint": "Check spam or junk if it is not in your inbox.",
    }


@router.post("/verify-otp", status_code=201)
async def signup_verify_otp(req: schemas.SignupVerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    otp = req.otp.strip().replace(" ", "")
    if len(otp) < 6:
        raise HTTPException(status_code=400, detail="Enter the 6-digit code from your email.")

    try:
        data = await email_otp.verify_signup_otp_and_consume(str(req.email), otp)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = await db.execute(select(models.User).where(models.User.email == req.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = models.User(
        email=str(req.email).strip().lower(),
        hashed_password=data["password_hash"],
        full_name=data["full_name"],
        role=data["role"],
        phone_number=data["phone_number"],
    )
    db.add(new_user)
    await db.commit()

    return {"message": "Account created successfully. You can sign in now."}
