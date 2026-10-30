from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload 
from sqlalchemy import delete, func
from pydantic import BaseModel
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple
import models
from database import engine, get_db, AsyncSessionLocal, IS_SQLITE
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
import requests
import io
import json
import logging
import os
import uuid
from pathlib import Path
import smtplib
import random
import string
import pandas as pd     
import requests 
import razorpay
import google.generativeai as genai 
import re  
import schemas
import random
import ssl
import sys
import backup_manager
import email_otp
from password_utils import verify_password, get_password_hash
from signup_routes import router as signup_auth_router
from student_google_auth import router as google_student_router
from super_admin import is_super_admin_email, super_admin_emails
from dotenv import load_dotenv
# --- 📄 PDF GENERATION IMPORTS ---
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request

from database import engine, get_db
# 🟢 GOOGLE DRIVE IMPORTS
from google.auth.transport.requests import Request as GoogleRequest  # 👈 Rename this
from fastapi import Request  # 👈 Add this explicitly for FastAPI
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from sqlalchemy import text
from token_manager import TokenManager
import code_runner
import certificate_service
import coupon_service
from pdf_certificate import close_shared_browser

# Load .env from this file's directory so GOOGLE_CLIENT_ID, DATABASE_URL, etc. work
# even when uvicorn's cwd is not `backend/`.
load_dotenv(Path(__file__).resolve().parent / ".env")

logger = logging.getLogger(__name__)

# 1. Initialize Database Tables (Async approach is slightly different, but for now we keep sync creation for simplicity or use Alembic in prod)
# For this setup, we will rely on the sync engine for table creation if needed, or assume tables exist.
# Ideally, use Alembic for migrations. For now, we will create tables using a temporary sync connection if not exists.
import asyncio

# Windows + async MySQL TLS can fail under Proactor loop (WinError 87).
# Force selector policy for stable TiDB SSL connectivity.
if sys.platform.startswith("win"):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

async def _ensure_certificate_columns(conn):
    statements = (
        "ALTER TABLE user_certificates ADD COLUMN recipient_name VARCHAR(255)",
        "ALTER TABLE user_certificates ADD COLUMN status VARCHAR(32)",
        "ALTER TABLE user_certificates ADD COLUMN email_status VARCHAR(32)",
        "ALTER TABLE user_certificates ADD COLUMN body_text TEXT",
    )
    mysql_statements = (
        "ALTER TABLE user_certificates ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255);",
        "ALTER TABLE user_certificates ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'PENDING';",
        "ALTER TABLE user_certificates ADD COLUMN IF NOT EXISTS email_status VARCHAR(32) DEFAULT 'PENDING';",
        "ALTER TABLE user_certificates ADD COLUMN IF NOT EXISTS body_text TEXT;",
    )
    for stmt in (statements if IS_SQLITE else mysql_statements):
        try:
            await conn.execute(text(stmt))
        except Exception:
            pass


async def _sqlite_rebuild_quiz_nullable(conn):
    """SQLite cannot ALTER NOT NULL → NULL; rebuild quiz_questions / quiz_attempts when needed."""
    try:
        info = await conn.execute(text("PRAGMA table_info(quiz_questions)"))
        cols = {row[1]: row for row in info.fetchall()}
    except Exception:
        return
    if "content_item_id" in cols and cols["content_item_id"][3] == 1:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS quiz_questions_new (
                id INTEGER NOT NULL PRIMARY KEY,
                content_item_id INTEGER,
                quiz_id INTEGER,
                prompt TEXT NOT NULL,
                question_type VARCHAR(32) NOT NULL DEFAULT 'single',
                "order" INTEGER DEFAULT 0,
                points INTEGER DEFAULT 1,
                FOREIGN KEY(content_item_id) REFERENCES content_items (id),
                FOREIGN KEY(quiz_id) REFERENCES quizzes (id)
            )
        """))
        has_quiz_id = "quiz_id" in cols
        if has_quiz_id:
            await conn.execute(text("""
                INSERT INTO quiz_questions_new (id, content_item_id, quiz_id, prompt, question_type, "order", points)
                SELECT id, content_item_id, quiz_id, prompt, question_type, "order", points FROM quiz_questions
            """))
        else:
            await conn.execute(text("""
                INSERT INTO quiz_questions_new (id, content_item_id, quiz_id, prompt, question_type, "order", points)
                SELECT id, content_item_id, NULL, prompt, question_type, "order", points FROM quiz_questions
            """))
        await conn.execute(text("DROP TABLE quiz_questions"))
        await conn.execute(text("ALTER TABLE quiz_questions_new RENAME TO quiz_questions"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_quiz_questions_content_item_id ON quiz_questions (content_item_id)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_quiz_questions_quiz_id ON quiz_questions (quiz_id)"))

    try:
        info2 = await conn.execute(text("PRAGMA table_info(quiz_attempts)"))
        cols2 = {row[1]: row for row in info2.fetchall()}
    except Exception:
        return
    if "content_item_id" in cols2 and cols2["content_item_id"][3] == 1:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS quiz_attempts_new (
                id INTEGER NOT NULL PRIMARY KEY,
                content_item_id INTEGER,
                quiz_id INTEGER,
                user_id INTEGER NOT NULL,
                score INTEGER DEFAULT 0,
                max_score INTEGER DEFAULT 0,
                percent INTEGER DEFAULT 0,
                started_at DATETIME,
                submitted_at DATETIME,
                FOREIGN KEY(content_item_id) REFERENCES content_items (id),
                FOREIGN KEY(quiz_id) REFERENCES quizzes (id),
                FOREIGN KEY(user_id) REFERENCES users (id)
            )
        """))
        has_quiz_id = "quiz_id" in cols2
        if has_quiz_id:
            await conn.execute(text("""
                INSERT INTO quiz_attempts_new
                (id, content_item_id, quiz_id, user_id, score, max_score, percent, started_at, submitted_at)
                SELECT id, content_item_id, quiz_id, user_id, score, max_score, percent, started_at, submitted_at
                FROM quiz_attempts
            """))
        else:
            await conn.execute(text("""
                INSERT INTO quiz_attempts_new
                (id, content_item_id, quiz_id, user_id, score, max_score, percent, started_at, submitted_at)
                SELECT id, content_item_id, NULL, user_id, score, max_score, percent, started_at, submitted_at
                FROM quiz_attempts
            """))
        await conn.execute(text("DROP TABLE quiz_attempts"))
        await conn.execute(text("ALTER TABLE quiz_attempts_new RENAME TO quiz_attempts"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_quiz_attempts_content_item_id ON quiz_attempts (content_item_id)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_quiz_attempts_quiz_id ON quiz_attempts (quiz_id)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_quiz_attempts_user_id ON quiz_attempts (user_id)"))


async def _ensure_quiz_columns(conn):
    """Add quiz bank / matching columns for existing DBs (create_all won't alter columns)."""
    if IS_SQLITE:
        stmts = (
            "ALTER TABLE content_items ADD COLUMN pass_percent INTEGER DEFAULT 70",
            "ALTER TABLE quiz_questions ADD COLUMN quiz_id INTEGER",
            "ALTER TABLE quiz_attempts ADD COLUMN quiz_id INTEGER",
            "ALTER TABLE quiz_options ADD COLUMN match_side VARCHAR(16)",
            "ALTER TABLE quiz_options ADD COLUMN match_key VARCHAR(64)",
            "ALTER TABLE quizzes ADD COLUMN image_url TEXT",
            "ALTER TABLE quizzes ADD COLUMN max_attempts INTEGER",
        )
        for stmt in stmts:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass
        try:
            await _sqlite_rebuild_quiz_nullable(conn)
        except Exception as e:
            logger.warning("SQLite quiz nullable rebuild skipped: %s", e)
        return

    stmts = (
        "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS pass_percent INTEGER DEFAULT 70;",
        "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS quiz_id INTEGER;",
        "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS quiz_id INTEGER;",
        "ALTER TABLE quiz_options ADD COLUMN IF NOT EXISTS match_side VARCHAR(16);",
        "ALTER TABLE quiz_options ADD COLUMN IF NOT EXISTS match_key VARCHAR(64);",
        "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS image_url TEXT;",
        "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS max_attempts INTEGER;",
        "ALTER TABLE quiz_questions MODIFY content_item_id INT NULL;",
        "ALTER TABLE quiz_attempts MODIFY content_item_id INT NULL;",
    )
    for stmt in stmts:
        try:
            await conn.execute(text(stmt))
        except Exception:
            pass


async def init_models():
    async with engine.begin() as conn:
        # 1. Create tables if they don't exist
        await conn.run_sync(models.Base.metadata.create_all)
        await _ensure_certificate_columns(conn)
        await _ensure_quiz_columns(conn)
        if IS_SQLITE:
            print("Local SQLite database ready.")
            return
        
        # 2. ✅ AUTO-MIGRATION: Update existing tables
        print("Checking for database migrations...")
        try:
            # Existing migrations
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();"))
            await conn.execute(text("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;"))
            
            # 🆕 FIX FOR YOUR ERROR: Add last_login column
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);"))
            await conn.execute(text("ALTER TABLE content_items ADD COLUMN IF NOT EXISTS resource_links TEXT;"))
            await conn.execute(text("ALTER TABLE content_items ADD COLUMN IF NOT EXISTS pass_percent INTEGER DEFAULT 70;"))
            await conn.execute(text("ALTER TABLE courses ADD COLUMN IF NOT EXISTS category VARCHAR(64);"))
            await _ensure_certificate_columns(conn)
            try:
                await conn.execute(text("ALTER TABLE courses ALTER COLUMN image_url TYPE TEXT;"))
            except Exception:
                await conn.execute(text("ALTER TABLE courses MODIFY image_url TEXT;"))
            
            print("Database migrations applied successfully.")
        except Exception as e:
            print(f"Migration note: {e}")


async def _promote_super_admins():
    try:
        async with AsyncSessionLocal() as db:
            for email in super_admin_emails():
                result = await db.execute(
                    select(models.User).where(func.lower(models.User.email) == email.lower())
                )
                user = result.scalars().first()
                if user and user.role != "admin":
                    user.role = "admin"
                    user.is_active = True
                    print(f"Promoted super admin: {email}")
            await db.commit()
    except Exception as e:
        print(f"Super-admin promotion note: {e}")
            
            
app = FastAPI(title="iQmath Pro - Military Grade API")
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

UPLOAD_ROOT = Path(__file__).resolve().parent / "uploads"
THUMBNAIL_DIR = UPLOAD_ROOT / "thumbnails"
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_ROOT)), name="uploads")

# Initialize Auto-Refresh Service
token_manager = TokenManager()

# Run DB Init on Startup
@app.on_event("startup")
async def on_startup():
    await init_models()
    await _promote_super_admins()
    try:
        async with AsyncSessionLocal() as seed_db:
            await coupon_service.ensure_default_coupons(seed_db)
    except Exception as e:
        print(f"Coupon seed note: {e}")
    token_manager.start()

@app.on_event("shutdown")
async def on_shutdown():
    token_manager.stop()
    await close_shared_browser()

# 2. CONFIG: CORS (explicit origins when using credentials; browsers reject credentials + "*")
# CORS_ORIGINS in Render/Netlify is merged with defaults — env alone must not drop production domains.
_DEFAULT_CORS_ORIGINS = (
    "https://lms.cloudvaathi.in,https://cloudvaathi-lms-20260508161650.netlify.app,"
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:5174,http://127.0.0.1:5174,"
    "http://localhost:5175,http://127.0.0.1:5175,"
    "http://localhost:5176,http://127.0.0.1:5176"
)
# Any https subdomain of cloudvaathi.in (lms, www, preview deploys on custom subdomain, etc.)
_CLOUDVAATHI_ORIGIN_REGEX = r"https://([a-zA-Z0-9-]+\.)*cloudvaathi\.in"


def _normalize_origin(origin: str) -> str:
    return origin.strip().rstrip("/")


def _cors_settings() -> tuple[list[str], bool, str | None]:
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    if raw == "*":
        return ["*"], False, None

    default_parts = [_normalize_origin(p) for p in _DEFAULT_CORS_ORIGINS.split(",") if p.strip()]
    extra_parts = [_normalize_origin(p) for p in raw.split(",") if p.strip()] if raw else []
    merged = list(dict.fromkeys(default_parts + extra_parts))
    if not merged:
        return ["*"], False, None
    return merged, True, _CLOUDVAATHI_ORIGIN_REGEX


_cors_allow, _cors_credentials, _cors_origin_regex = _cors_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow,
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=_cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(signup_auth_router, prefix="/api/v1")
app.include_router(google_student_router, prefix="/api/v1")

# --- 🔐 SECURITY & AUTH CONFIG ---
SECRET_KEY = os.getenv("SECRET_KEY", "fallback_secret_change_me_in_prod")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/login") 

# --- 💳 RAZORPAY ---
RAZORPAY_KEY_ID = (os.getenv("RAZORPAY_KEY_ID") or "").strip()
RAZORPAY_KEY_SECRET = (os.getenv("RAZORPAY_KEY_SECRET") or "").strip()
_razorpay_client = None


def _razorpay_configured() -> bool:
    return bool(
        RAZORPAY_KEY_ID
        and RAZORPAY_KEY_SECRET
        and "replace_me" not in RAZORPAY_KEY_ID
        and "replace_me" not in RAZORPAY_KEY_SECRET
        and "your_razorpay" not in RAZORPAY_KEY_ID
    )


def get_razorpay_client():
    """Lazy Razorpay client so missing/invalid env does not crash app startup."""
    global _razorpay_client
    if not _razorpay_configured():
        raise HTTPException(
            status_code=503,
            detail="Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.",
        )
    if _razorpay_client is None:
        _razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    return _razorpay_client


# Backwards-compatible alias used by older call sites / scripts.
client = None

# --- ✨ GEMINI AI ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

# --- 📋 DATA MODELS ---
# (Keeping your existing Pydantic models)
class UserCreate(BaseModel):
    email: str; password: str; name: str; role: str; phone_number: str

class ModuleCreate(BaseModel):
    title: str; order: int

class ReorderModulesRequest(BaseModel):
    module_ids: List[int]

class ResourceLinkInput(BaseModel):
    title: str
    link: str

class ContentCreate(BaseModel):
    title: str; type: str; data_url: Optional[str] = None; duration: Optional[int] = None; 
    is_mandatory: bool = False; instructions: Optional[str] = None; test_config: Optional[str] = None; module_id: int
    resource_links: Optional[List[ResourceLinkInput]] = None
    # ✅ NEW
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    pass_percent: Optional[int] = 70


class QuizOptionInput(BaseModel):
    label: str
    is_correct: bool = False
    order: Optional[int] = 0
    id: Optional[int] = None
    match_side: Optional[str] = None  # left | right (matching)
    match_key: Optional[str] = None


class QuizQuestionInput(BaseModel):
    prompt: str
    question_type: str = "single"  # single | true_false | multi | matching
    points: int = 1
    order: Optional[int] = 0
    options: List[QuizOptionInput] = []
    id: Optional[int] = None


class QuizPutRequest(BaseModel):
    questions: List[QuizQuestionInput]
    pass_percent: Optional[int] = None
    duration: Optional[int] = None
    title: Optional[str] = None


class QuizSubmitAnswer(BaseModel):
    question_id: int
    selected_option_ids: List[int] = []
    # matching: left_option_id (as str key) -> right_option_id
    match_map: Optional[Dict[str, int]] = None


class QuizSubmitRequest(BaseModel):
    answers: List[QuizSubmitAnswer] = []


def _normalize_max_attempts(value: Optional[int]) -> Optional[int]:
    """None/0/negative => unlimited (stored as NULL). Positive => capped attempts."""
    if value is None:
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


class BankQuizCreate(BaseModel):
    title: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    pass_percent: Optional[int] = 70
    duration: Optional[int] = None
    max_attempts: Optional[int] = None
    is_published: bool = False
    course_ids: Optional[List[int]] = None


class BankQuizUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    pass_percent: Optional[int] = None
    duration: Optional[int] = None
    max_attempts: Optional[int] = None
    is_published: Optional[bool] = None


class BankQuizAssignments(BaseModel):
    course_ids: List[int] = []

class ViolationReport(BaseModel):
    lesson_id: int
    
class StatusUpdate(BaseModel):
    status: str 

class Token(BaseModel):
    access_token: str; token_type: str; role: str
    
class AssignmentSubmission(BaseModel):
    link: str; lesson_id: int

class AdmitStudentRequest(BaseModel):
    full_name: str; email: str; course_ids: List[int]; password: Optional[str] = None 

class EnrollmentRequest(BaseModel):
    type: str 

class CreateOrderRequest(BaseModel):
    course_id: int
    coupon_code: Optional[str] = None

class PaymentVerifyRequest(BaseModel):
    course_id: int
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    coupon_code: Optional[str] = None

class CouponValidateRequest(BaseModel):
    course_id: int
    coupon_code: str

class CouponCreateRequest(BaseModel):
    code: str
    discount_type: str = "percent"  # percent | flat
    discount_value: int
    course_id: Optional[int] = None
    max_uses: Optional[int] = None
    min_amount: Optional[int] = None
    is_active: bool = True
    expires_at: Optional[datetime] = None

class CouponUpdateRequest(BaseModel):
    discount_type: Optional[str] = None
    discount_value: Optional[int] = None
    course_id: Optional[int] = None
    max_uses: Optional[int] = None
    min_amount: Optional[int] = None
    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None

class PasswordChange(BaseModel):
    new_password: str

# Code Test Models
class ProblemSchema(BaseModel):
    title: str; description: str; difficulty: str; test_cases: str 

class CodeTestCreate(BaseModel):
    title: str; pass_key: str; time_limit: int; problems: List[ProblemSchema]

class TestSubmission(BaseModel):
    test_id: int; score: int; problems_solved: int; time_taken: str

class ContentUpdate(BaseModel):
    title: Optional[str] = None; url: Optional[str] = None; resource_links: Optional[List[ResourceLinkInput]] = None

class LibraryBulkAddRequest(BaseModel):
    module_id: int
    item_ids: List[int]

class LibraryImportModulesRequest(BaseModel):
    target_course_id: int
    module_ids: List[int]

class CodeExecutionRequest(BaseModel):
    source_code: str; stdin: str; language_id: int = 71
    
class AIGenerateRequest(BaseModel):
    title: str

class LiveSessionRequest(BaseModel):
    youtube_url: str; topic: str

class CourseCreate(BaseModel):
    title: str; description: str; price: int; image_url: Optional[str] = None
    course_type: str = "standard"; language: Optional[str] = None
    category: Optional[str] = None

class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[int] = None
    image_url: Optional[str] = None
    language: Optional[str] = None
    category: Optional[str] = None
    # If your DB has a duration column, add it here. If not, remove this line.
    # duration: Optional[str] = None

class ChallengeCreate(BaseModel):
    title: str; description: str; difficulty: str; test_cases: str
 
class ConfirmationRequest(BaseModel):
    lesson_title: str; file_name: str

class CodePayload(BaseModel):
    source_code: str
    language_id: int
    # ✅ NEW: Accepts a list of test cases (Batch Execution)
    # Example: [{"input": "5", "output": "25"}, {"input": "10", "output": "100"}]
    test_cases: List[Dict[str, Any]]
    # When both set, server loads canonical cases from DB (Code Arena integrity)
    code_test_id: Optional[int] = None
    problem_id: Optional[int] = None
    # "dry_run" = only non-hidden cases (when loading from DB)
    execution_mode: Optional[str] = None

class OTPLoginRequest(BaseModel):
    phone_number: str
    
    
class ModuleUpdate(BaseModel):
    title: str

class NotificationRequest(BaseModel):
    target_type: str  # "all", "course", "student"
    target_id: Optional[int] = None # course_id or user_id
    message: str

class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    is_read: bool
    created_at: datetime
        
class ChallengeUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    difficulty: Optional[str] = None
    test_cases: Optional[str] = None

def normalize_resource_links(resource_links: Optional[List[ResourceLinkInput]]) -> List[Dict[str, str]]:
    cleaned: List[Dict[str, str]] = []
    for item in resource_links or []:
        title = (item.title or "").strip()
        link = (item.link or "").strip()
        if title and link:
            cleaned.append({"title": title, "link": link})
    return cleaned

def parse_resource_links(raw_links: Optional[str]) -> List[Dict[str, str]]:
    if not raw_links:
        return []
    try:
        parsed = json.loads(raw_links)
        if isinstance(parsed, list):
            parsed_links: List[Dict[str, str]] = []
            for entry in parsed:
                # Backward compatibility for old shape: ["https://..."]
                if isinstance(entry, str):
                    link = entry.strip()
                    if link:
                        parsed_links.append({"title": link, "link": link})
                    continue

                if isinstance(entry, dict):
                    title = str(entry.get("title", "")).strip()
                    link = str(entry.get("link", entry.get("url", ""))).strip()
                    if link:
                        parsed_links.append({"title": title or link, "link": link})
            return parsed_links
    except Exception:
        return []
    return []
        
# --- 🔑 AUTH LOGIC ---
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# 🔒 ASYNC AUTH DEPENDENCY
async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None: raise HTTPException(status_code=401, detail="Invalid session")
    except JWTError: raise HTTPException(status_code=401, detail="Session expired")
    
    result = await db.execute(select(models.User).where(models.User.email == email))
    user = result.scalars().first()
    
    if user is None: raise HTTPException(status_code=401, detail="User not found")
    if is_super_admin_email(user.email) and user.role != "admin":
        user.role = "admin"
        user.is_active = True
        await db.commit()
        await db.refresh(user)
    return user

async def require_instructor(current_user: models.User = Depends(get_current_user)):
    if current_user.role not in ("instructor", "admin") and not is_super_admin_email(current_user.email):
        raise HTTPException(status_code=403, detail="⛔ Access Forbidden: Instructors Only")
    return current_user

async def require_instructor_or_admin(current_user: models.User = Depends(get_current_user)):
    if current_user.role not in ("instructor", "admin") and not is_super_admin_email(current_user.email):
        raise HTTPException(status_code=403, detail="⛔ Access Forbidden: Instructors and administrators only")
    return current_user


def _can_manage_code_test(user: models.User, code_test: models.CodeTest) -> bool:
    if user.role == "admin" or is_super_admin_email(user.email):
        return True
    return code_test.instructor_id == user.id


def _can_manage_course(user: models.User, course: models.Course) -> bool:
    # Staff may edit any course from the admin panel, including after publish.
    if user.role in ("instructor", "admin") or is_super_admin_email(user.email):
        return True
    return course.instructor_id == user.id


async def require_student(current_user: models.User = Depends(get_current_user)):
    if is_super_admin_email(current_user.email) or current_user.role in ("instructor", "admin"):
        raise HTTPException(status_code=403, detail="Use the admin portal for this account.")
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="⛔ Access Forbidden: Students Only")
    return current_user


def _is_student(user: models.User) -> bool:
    if is_super_admin_email(user.email):
        return False
    return user.role == "student"


def _is_staff(user: models.User) -> bool:
    return user.role in ("instructor", "admin") or is_super_admin_email(user.email)


def serialize_module(module: models.Module) -> dict:
    items = sorted(
        list(getattr(module, "items", None) or []),
        key=lambda item: (
            item.order is None,
            item.order if item.order is not None else 10**9,
            item.id,
        ),
    )
    return {
        "id": module.id,
        "title": module.title,
        "order": module.order,
        "course_id": module.course_id,
        "items": [
            {
                "id": item.id,
                "title": item.title,
                "type": item.type,
                "order": item.order,
            }
            for item in items
        ],
    }


def serialize_course(course: models.Course, *, include_price: bool) -> dict:
    """Course payload. Selling price is included only when explicitly allowed."""
    data = {
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "image_url": course.image_url,
        "instructor_id": course.instructor_id,
        "is_published": bool(course.is_published),
        "course_type": course.course_type,
        "language": course.language,
        "category": getattr(course, "category", None),
    }
    if include_price:
        data["price"] = int(course.price or 0)
    return data

def generate_random_password(length=8):
    characters = string.ascii_letters + string.digits + "!@#$"
    return ''.join(random.choice(characters) for i in range(length))


def normalize_student_email(raw: str) -> str:
    return str(raw or "").strip().lower()


def _pick_bulk_column(columns: list[str], candidates: list[str]) -> str | None:
    col_set = {c.lower().strip().replace(" ", "_") for c in columns}
    for cand in candidates:
        if cand in col_set:
            return cand
    return None


def _parse_bulk_students_table(contents: bytes, filename: str) -> pd.DataFrame:
    try:
        if filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid file format: {e}")
    df.columns = [str(c).lower().strip().replace(" ", "_") for c in df.columns]
    email_col = _pick_bulk_column(list(df.columns), ["email", "e_mail", "email_address", "student_email", "mail"])
    if not email_col:
        raise HTTPException(status_code=400, detail="Missing email column (expected: email, name).")
    name_col = _pick_bulk_column(list(df.columns), ["name", "full_name", "student_name", "fullname"])
    df["_bulk_email"] = df[email_col].astype(str).map(normalize_student_email)
    df["_bulk_name"] = (
        df[name_col].astype(str).str.strip()
        if name_col
        else pd.Series(["Student"] * len(df), index=df.index)
    )
    return df


async def ensure_student_account(
    db: AsyncSession,
    email: str,
    full_name: str,
) -> tuple[models.User, bool, str | None]:
    """Create a student account if missing. Returns (user, is_new, plaintext_password if new)."""
    normalized = normalize_student_email(email)
    if not normalized or normalized == "nan" or "@" not in normalized:
        raise ValueError("Invalid email address.")

    display_name = (full_name or "").strip() or normalized.split("@")[0]
    display_name = display_name[:255]

    result = await db.execute(select(models.User).where(models.User.email == normalized))
    user = result.scalars().first()
    if user:
        if user.role != "student":
            raise ValueError(f"{normalized} is registered as {user.role}, not a student.")
        return user, False, None

    password = generate_random_password()
    user = models.User(
        email=normalized,
        full_name=display_name,
        hashed_password=get_password_hash(password),
        role="student",
        phone_number=None,
        google_sub=None,
    )
    db.add(user)
    await db.flush()
    return user, True, password


async def enroll_student_in_courses(
    db: AsyncSession,
    student: models.User,
    course_ids: list[int],
    enrollment_type: str = "paid",
) -> list[int]:
    enrolled: list[int] = []
    for cid in course_ids:
        check = await db.execute(
            select(models.Enrollment).where(
                models.Enrollment.user_id == student.id,
                models.Enrollment.course_id == cid,
            )
        )
        if check.scalars().first():
            continue
        db.add(
            models.Enrollment(
                user_id=student.id,
                course_id=cid,
                enrollment_type=enrollment_type,
                expiry_date=None,
            )
        )
        enrolled.append(cid)
    return enrolled

# --- UTILITIES ---
# backend/main.py

# In backend/main.py

def send_credentials_email(to_email: str, name: str, password: str = None, subject: str = None, body: str = None):
    # 1. Get Config
    api_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("EMAIL_SENDER")
    
    print(f"[BREVO API] Preparing to send to: {to_email}")

    if not api_key or not sender_email:
        print("ERROR: BREVO_API_KEY or EMAIL_SENDER missing.")
        return

    # 2. Define the URL (Port 443 - Bypasses Render Firewall)
    url = "https://api.brevo.com/v3/smtp/email"

    # 3. Construct Content
    if not subject:
        subject = "Welcome to iQmath! Your Credentials"
    
    if not body:
        html_content = f"""
        <html>
        <body>
            <h1>Welcome {name}!</h1>
            <p>You have been admitted to iQmath Pro.</p>
            <p><strong>User ID:</strong> {to_email}</p>
            <p><strong>Password:</strong> {password}</p>
            <br/>
            <p>Happy Learning!</p>
        </body>
        </html>
        """
    else:
        # If body is passed from OTP logic
        html_content = f"<p>{body}</p>".replace("\n", "<br>")

    # 4. Create Payload
    payload = {
        "sender": {"name": "iQmath Admin", "email": sender_email},
        "to": [{"email": to_email, "name": name}],
        "subject": subject,
        "htmlContent": html_content
    }

    headers = {
        "accept": "application/json",
        "api-key": api_key,
        "content-type": "application/json"
    }

    # 5. Send Request
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        
        if response.status_code == 201:
            print(f"[BREVO API] SUCCESS: Email sent! ID: {response.json().get('messageId')}")
        else:
            print(f"[BREVO API] FAILED: {response.status_code} - {response.text}")
            # Raise exception so the calling function knows it failed
            raise Exception(f"API Error: {response.text}")
            
    except Exception as e:
        print(f"[BREVO API] NETWORK ERROR: {str(e)}")
        raise e  
def upload_file_to_drive(file_obj, filename, folder_link):
    # (Drive logic remains mostly same, executed in thread pool usually by FastAPI)
    try:
        folder_id = folder_link
        if "drive.google.com" in folder_link: folder_id = folder_link.split("/")[-1].split("?")[0]
        
        creds = None
        if os.path.exists('token.json'): creds = Credentials.from_authorized_user_file('token.json', ['https://www.googleapis.com/auth/drive.file'])
        
        if not creds or not creds.valid:
           if creds and creds.expired and creds.refresh_token:
               creds.refresh(GoogleRequest())
               # Save the refreshed token
               with open('token.json', 'w') as token:
                   token.write(creds.to_json())
           else:
               print("Creds invalid and no refresh token")
               return None

        service = build('drive', 'v3', credentials=creds)
        file_metadata = { 'name': filename, 'parents': [folder_id] }
        media = MediaIoBaseUpload(file_obj, mimetype='application/pdf', resumable=True)
        uploaded_file = service.files().create(body=file_metadata, media_body=media, fields='id').execute()
        return uploaded_file.get('id')
    except Exception as e:
        print(f"Drive Error: {e}")
        return None

# --- 🔄 ASYNC LOGIC HELPERS ---
# --- 🔄 UPDATED LOGIC: Strict 100% Completion Check ---
async def check_progress_status(user_id: int, course_id: int, db: AsyncSession):
    """
    Returns (completed_count, total_count, is_fully_completed)
    """
    # 1. Get ALL items in the course
    # We join Course -> Module -> ContentItem to get the total list
    result = await db.execute(
        select(models.ContentItem.id)
        .join(models.Module, models.ContentItem.module_id == models.Module.id)
        .where(models.Module.course_id == course_id)
    )
    all_item_ids = result.scalars().all()
    total_items = len(all_item_ids)
    
    if total_items == 0:
        return 0, 0, False

    # 2. Get User's Completed Items
    # We filter LessonProgress for this user and these specific items
    progress_res = await db.execute(
        select(models.LessonProgress.content_item_id)
        .where(
            models.LessonProgress.user_id == user_id, 
            models.LessonProgress.is_completed == True,
            models.LessonProgress.content_item_id.in_(all_item_ids)
        )
    )
    completed_ids = progress_res.scalars().all()
    completed_count = len(completed_ids)

    # 3. Check if 100% complete
    is_fully_completed = completed_count == total_items
    
    return completed_count, total_items, is_fully_completed

# --- 🚀 ASYNC API ENDPOINTS ---

@app.post("/api/v1/users", status_code=201)
async def create_user(user: UserCreate, db: AsyncSession = Depends(get_db)):
    # 1. Check if user exists
    result = await db.execute(select(models.User).where(models.User.email == user.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # 2. Create User
    assigned_role = "admin" if is_super_admin_email(user.email) else user.role
    new_user = models.User(
        email=user.email, 
        hashed_password=get_password_hash(user.password), 
        full_name=user.name, 
        role=assigned_role,
        phone_number=user.phone_number
    )
    db.add(new_user)
    await db.commit()

    # 3. Optional Brevo welcome (instructors/admins/seeding — not student email OTP; learners verify via Gmail OTP before /users)
    email_status = "skipped"
    email_warning = None
    if os.getenv("BREVO_API_KEY") and os.getenv("EMAIL_SENDER"):
        try:
            welcome_lines = (
                f"Hello {user.name},\n\n"
                f"Your {user.role} account is active.\n"
                f"Sign-in email: {user.email}\n"
            )
            if user.role in ("instructor", "admin"):
                welcome_lines += f"Password: {user.password}\n"
            else:
                welcome_lines += "Use the password you set when you registered.\n"
            welcome_lines += "\nHappy Learning!"
            await asyncio.to_thread(
                send_credentials_email,
                to_email=user.email,
                name=user.name,
                password=user.password if user.role in ("instructor", "admin") else None,
                subject="Welcome to iQmath!",
                body=welcome_lines,
            )
            email_status = "sent"
        except Exception as e:
            print(f"Welcome email failed: {e}")
            email_status = "failed"
            email_warning = str(e)

    return {
        "message": "User created successfully",
        "email_status": email_status,
        "email_warning": email_warning,
    }


@app.post("/api/v1/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.User).where(func.lower(models.User.email) == form_data.username.strip().lower())
    )
    user = result.scalars().first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    # ✅ CHECK 2: Is the User Active? (Soft Delete Check)
    if user.is_active is False:  # explicitly check for False
        raise HTTPException(status_code=403, detail="Account deactivated. Contact support.")

    if is_super_admin_email(user.email) and user.role != "admin":
        user.role = "admin"
        user.is_active = True
        await db.commit()
        await db.refresh(user)

    token = create_access_token(data={"sub": user.email, "role": user.role})
    return {"access_token": token, "token_type": "bearer", "role": user.role}
@app.post("/api/v1/admin/admit-student")
async def admit_single_student(req: AdmitStudentRequest, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    try:
        student, is_new, generated_password = await ensure_student_account(db, req.email, req.full_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    enrolled = await enroll_student_in_courses(db, student, req.course_ids, enrollment_type="paid")
    await db.commit()

    email_status = "skipped"
    if is_new and generated_password:
        password_to_send = req.password or generated_password
        try:
            await asyncio.to_thread(send_credentials_email, student.email, student.full_name, password_to_send)
            email_status = "sent"
        except Exception as e:
            print(f"Admit welcome email failed for {student.email}: {e}")
            email_status = "failed"

    if is_new:
        return {
            "message": f"Account created and enrolled in {len(enrolled)} course(s). Student can sign in with Google or email/password.",
            "email_status": email_status,
            "created": True,
            "enrolled_courses": len(enrolled),
        }
    return {
        "message": f"Existing student enrolled in {len(enrolled)} course(s).",
        "email_status": email_status,
        "created": False,
        "enrolled_courses": len(enrolled),
    }


@app.post("/api/v1/admin/bulk-admit")
async def bulk_admit_students(file: UploadFile = File(...), course_id: int = Form(...), db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    contents = await file.read()
    df = _parse_bulk_students_table(contents, file.filename or "upload.csv")

    created_users = 0
    enrolled_count = 0
    skipped = 0
    errors: list[dict[str, str]] = []
    email_tasks: list[tuple[str, str, str]] = []

    for _, row in df.iterrows():
        email = str(row.get("_bulk_email", "")).strip()
        name = str(row.get("_bulk_name", "Student")).strip()
        if not email or email == "nan" or "@" not in email:
            skipped += 1
            continue

        try:
            student, is_new, password = await ensure_student_account(db, email, name)
            if is_new:
                created_users += 1
                if password:
                    email_tasks.append((student.email, student.full_name, password))

            enrol_check = await db.execute(
                select(models.Enrollment).where(
                    models.Enrollment.user_id == student.id,
                    models.Enrollment.course_id == course_id,
                )
            )
            if enrol_check.scalars().first():
                skipped += 1
            else:
                db.add(
                    models.Enrollment(
                        user_id=student.id,
                        course_id=course_id,
                        enrollment_type="paid",
                        expiry_date=None,
                    )
                )
                enrolled_count += 1
        except Exception as e:
            errors.append({"email": email, "error": str(e)})

    await db.commit()

    for email, name, password in email_tasks:
        try:
            await asyncio.to_thread(send_credentials_email, email, name, password)
        except Exception as e:
            print(f"Bulk admit email failed for {email}: {e}")

    return {
        "message": f"Created {created_users} account(s), enrolled {enrolled_count} student(s).",
        "created_users": created_users,
        "enrolled": enrolled_count,
        "skipped": skipped,
        "errors": errors[:20],
    }

@app.post("/api/v1/ai/generate-challenge") # 👈 Changed from "/generate" to match Frontend
async def generate_problem_content(req: AIGenerateRequest):
    if not GEMINI_API_KEY: raise HTTPException(status_code=500, detail="API Key missing")
    try:
        prompt = f"""Create a programming challenge on "{req.title}". OUTPUT JSON ONLY: {{ "description": "...", "test_cases": [ {{"input": "...", "output": "...", "hidden": false}} ] }}"""
        response = await asyncio.to_thread(model.generate_content, prompt)
        text = response.text.strip()
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if not match: raise ValueError("Invalid JSON")
        ai_data = json.loads(match.group())
        return { "description": ai_data.get("description"), "test_cases": json.dumps(ai_data.get("test_cases", [])) }
    except Exception as e: raise HTTPException(status_code=500, detail=f"AI Error: {str(e)}")

@app.post("/api/v1/code-tests")
async def create_code_test(test: CodeTestCreate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    new_test = models.CodeTest(title=test.title, pass_key=test.pass_key, time_limit=test.time_limit, instructor_id=current_user.id)
    db.add(new_test)
    await db.commit()
    await db.refresh(new_test)
    
    for prob in test.problems:
        new_prob = models.Problem(test_id=new_test.id, title=prob.title, description=prob.description, difficulty=prob.difficulty, test_cases=prob.test_cases)
        db.add(new_prob)
    await db.commit()
    students = await db.execute(select(models.User.id).where(models.User.role == "student"))
    for uid in students.scalars().all():
        db.add(models.Notification(user_id=uid, title="New Code Arena!", message=f"Challenge '{test.title}' is live. Test your skills now!", created_at=datetime.utcnow()))
    await db.commit()
    return {"message": "Test Created Successfully!"}

@app.get("/api/v1/courses/{course_id}")
async def get_course_details(course_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    result = await db.execute(select(models.Course).where(models.Course.id == course_id))
    course = result.scalars().first()
    if not course: raise HTTPException(status_code=404, detail="Course not found")
    # Students see the fee after login; staff see it for course editing.
    return serialize_course(course, include_price=_is_student(current_user) or _is_staff(current_user))

@app.get("/api/v1/code-tests")
async def get_code_tests(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1. Instructor: own tests. Admin: all tests (manage / edit).
    if current_user.role == "instructor":
        res = await db.execute(select(models.CodeTest).where(models.CodeTest.instructor_id == current_user.id))
        return res.scalars().all()
    if current_user.role == "admin":
        res = await db.execute(select(models.CodeTest).order_by(models.CodeTest.id.desc()))
        return res.scalars().all()
    
    # 2. Student View: Show ONLY Pending/Active tests
    res = await db.execute(select(models.CodeTest))
    tests = res.scalars().all()
    
    response_data = []
    
    for t in tests:
        # Check if a result already exists for this student + test
        sub_res = await db.execute(select(models.TestResult).where(
            models.TestResult.test_id == t.id, 
            models.TestResult.user_id == current_user.id
        ))
        submission = sub_res.scalars().first()
        
        # ✅ LOGIC CHANGE: If submission exists (Completed/Terminated), SKIP IT.
        if submission:
            continue
            
        # If no submission, add to list (Available to take)
        response_data.append({ 
            "id": t.id, 
            "title": t.title, 
            "time_limit": t.time_limit, 
            "completed": False 
        })
        
    return response_data
@app.post("/api/v1/code-tests/{test_id}/start")
async def start_code_test(test_id: int, pass_key: str = Form(...), db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Verify not submitted
    res = await db.execute(select(models.TestResult).where(models.TestResult.test_id == test_id, models.TestResult.user_id == current_user.id))
    if res.scalars().first(): raise HTTPException(status_code=403, detail="Test already submitted.")
    
    # Eager load problems
    res_test = await db.execute(select(models.CodeTest).options(selectinload(models.CodeTest.problems)).where(models.CodeTest.id == test_id))
    test = res_test.scalars().first()
    
    if not test: raise HTTPException(status_code=404)
    if test.pass_key != pass_key: raise HTTPException(status_code=403, detail="Invalid Key")
    
    return { "id": test.id, "title": test.title, "time_limit": test.time_limit, "problems": [{"id": p.id, "title": p.title, "description": p.description, "test_cases": p.test_cases} for p in test.problems] }

@app.post("/api/v1/code-tests/submit")
async def submit_test_result(sub: TestSubmission, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    result = models.TestResult(test_id=sub.test_id, user_id=current_user.id, score=sub.score, problems_solved=sub.problems_solved, time_taken=sub.time_taken)
    db.add(result)
    await db.commit()
    return {"message": "Submitted"}

@app.get("/api/v1/code-tests/{test_id}/results")
async def get_test_results(test_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    res_ct = await db.execute(select(models.CodeTest).where(models.CodeTest.id == test_id))
    code_test = res_ct.scalars().first()
    if not code_test or not _can_manage_code_test(current_user, code_test):
        raise HTTPException(status_code=403, detail="Not authorized")

    cnt_q = await db.execute(select(func.count(models.Problem.id)).where(models.Problem.test_id == test_id))
    total_problems = int(cnt_q.scalar() or 0)

    res = await db.execute(
        select(models.TestResult).options(selectinload(models.TestResult.student)).where(models.TestResult.test_id == test_id)
    )
    results = res.scalars().all()
    out = []
    for r in results:
        solved = int(r.problems_solved or 0)
        pct = round((solved / total_problems) * 100) if total_problems > 0 else 0
        out.append(
            {
                "student_name": r.student.full_name,
                "email": r.student.email,
                "score": r.score,
                "problems_solved": solved,
                "total_problems": total_problems,
                "completion_label": f"{solved}/{total_problems}",
                "completion_percent": pct,
                "time_taken": r.time_taken,
                "submitted_at": r.submitted_at.strftime("%Y-%m-%d %H:%M") if r.submitted_at else "",
            }
        )
    return out

@app.delete("/api/v1/code-tests/{test_id}")
async def delete_code_test(test_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    res = await db.execute(select(models.CodeTest).where(models.CodeTest.id == test_id))
    test = res.scalars().first()
    if not test:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if not _can_manage_code_test(current_user, test):
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.execute(delete(models.TestResult).where(models.TestResult.test_id == test_id))
    await db.execute(delete(models.Problem).where(models.Problem.test_id == test_id))
    await db.execute(delete(models.CodeTest).where(models.CodeTest.id == test_id))
    await db.commit()
    return {"message": "Challenge deleted"}


@app.get("/api/v1/code-tests/{test_id}/manage")
async def get_code_test_manage(test_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    res = await db.execute(
        select(models.CodeTest).options(selectinload(models.CodeTest.problems)).where(models.CodeTest.id == test_id)
    )
    t = res.scalars().first()
    if not t:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if not _can_manage_code_test(current_user, t):
        raise HTTPException(status_code=403, detail="Not authorized")
    problems_sorted = sorted(t.problems, key=lambda p: p.id)
    return {
        "id": t.id,
        "title": t.title,
        "pass_key": t.pass_key,
        "time_limit": t.time_limit,
        "problems": [
            {"title": p.title, "description": p.description, "difficulty": p.difficulty, "test_cases": p.test_cases}
            for p in problems_sorted
        ],
    }


@app.patch("/api/v1/code-tests/{test_id}")
async def update_code_test(test_id: int, test: CodeTestCreate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    res = await db.execute(select(models.CodeTest).where(models.CodeTest.id == test_id))
    existing = res.scalars().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if not _can_manage_code_test(current_user, existing):
        raise HTTPException(status_code=403, detail="Not authorized")

    existing.title = test.title
    existing.pass_key = test.pass_key
    existing.time_limit = test.time_limit
    await db.execute(delete(models.Problem).where(models.Problem.test_id == test_id))
    for prob in test.problems:
        db.add(
            models.Problem(
                test_id=test_id,
                title=prob.title,
                description=prob.description,
                difficulty=prob.difficulty,
                test_cases=prob.test_cases,
            )
        )
    await db.commit()
    return {"message": "Challenge updated successfully"}


def _normalize_judge_text(s: Any) -> str:
    if s is None:
        return ""
    t = str(s).replace("\r\n", "\n").replace("\r", "\n").strip()
    return t


def _pick_output_for_single_line_expected(actual: str, expected: str) -> str:
    """If expected is one logical line but actual has many (prints + answer), compare the last non-empty line."""
    a = _normalize_judge_text(actual)
    e = _normalize_judge_text(expected)
    if not e or "\n" in e:
        return a
    if "\n" in a:
        lines = [ln.strip() for ln in a.split("\n") if ln.strip() != ""]
        if lines:
            return lines[-1]
    return a


def _try_parse_judge_number(s: str) -> Optional[float]:
    s = s.strip()
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _judge_outputs_equal(raw_actual: str, raw_expected: str) -> Tuple[bool, str, str]:
    """
    Returns (passed, display_actual, display_expected).
    Aligns with Code Arena / Pyodide: tolerate extra prints, whitespace, and numeric formatting.
    """
    e = _normalize_judge_text(raw_expected)
    if e == "":
        return False, _normalize_judge_text(raw_actual), e
    a = _normalize_judge_text(_pick_output_for_single_line_expected(raw_actual, e))
    e = _normalize_judge_text(e)
    if a == e:
        return True, a, e
    if " ".join(a.split()) == " ".join(e.split()):
        return True, a, e
    na, ne = _try_parse_judge_number(a), _try_parse_judge_number(e)
    if na is not None and ne is not None:
        if na == ne or abs(na - ne) < 1e-9:
            return True, a, e
    return False, a, e


async def _resolve_execute_test_cases(
    payload: CodePayload, db: AsyncSession, current_user: models.User
) -> List[Dict[str, Any]]:
    """Use DB-backed cases for Code Arena when IDs are provided; otherwise trust the client list."""
    if payload.code_test_id is None or payload.problem_id is None:
        return payload.test_cases

    prob_res = await db.execute(select(models.Problem).where(models.Problem.id == payload.problem_id))
    prob = prob_res.scalars().first()
    if not prob or prob.test_id != payload.code_test_id:
        raise HTTPException(status_code=400, detail="Invalid problem or code test")

    ct_res = await db.execute(select(models.CodeTest).where(models.CodeTest.id == payload.code_test_id))
    code_test = ct_res.scalars().first()
    if not code_test:
        raise HTTPException(status_code=404, detail="Code test not found")

    if current_user.role == "instructor":
        if code_test.instructor_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
    elif current_user.role == "admin":
        pass
    elif current_user.role == "student":
        done = await db.execute(
            select(models.TestResult).where(
                models.TestResult.test_id == payload.code_test_id,
                models.TestResult.user_id == current_user.id,
            )
        )
        if done.scalars().first():
            raise HTTPException(status_code=403, detail="Test already submitted")
    else:
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        cases: List[Dict[str, Any]] = json.loads(prob.test_cases)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Invalid stored test cases")

    if payload.execution_mode == "dry_run":
        cases = [c for c in cases if not c.get("hidden")]
    return cases


# Code execution: local Python subprocess + host compilers or Judge0 CE (see code_runner.py)
@app.post("/api/v1/execute")
async def execute_code(
    payload: CodePayload,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    test_cases = await _resolve_execute_test_cases(payload, db, current_user)
    tc_count = len(test_cases)

    if tc_count == 0:
        return {"error": "No test cases to run for this request.", "stats": {"passed": 0, "total": 0}, "results": []}

    try:
        data = await asyncio.to_thread(
            code_runner.run_execution_local,
            payload.source_code,
            payload.language_id,
            test_cases,
            "",
        )
    except Exception as e:
        print(f"Code runner error: {e}")
        return {"error": "Compiler Service Unavailable", "stats": {"passed": 0, "total": tc_count}, "results": []}

    if not isinstance(data, dict):
        return {
            "error": "Compiler returned an unexpected response type.",
            "stats": {"passed": 0, "total": tc_count},
            "results": [],
        }

    # --- 🛡️ BACKEND VERIFICATION LAYER ---
    results_list = data.get("results")
    if not isinstance(results_list, list):
        results_list = []

    if len(results_list) == 0:
        return {
            "error": data.get("error")
            or "Compiler did not return a `results` array (expected one entry per test case with `input`, `expected`, `actual`, and optional `status`).",
            "stats": data.get("stats") or {"passed": 0, "total": tc_count},
            "results": [],
        }

    passed_count = 0

    for i, res in enumerate(results_list):
        if not isinstance(res, dict):
            continue
        rid = res.get("id")
        idx = rid if isinstance(rid, int) and 0 <= rid < len(test_cases) else i
        if idx < 0 or idx >= len(test_cases):
            idx = i if i < len(test_cases) else len(test_cases) - 1
        tc = test_cases[idx] if isinstance(test_cases[idx], dict) else {}

        canon_expected = tc.get("expected", tc.get("output", ""))
        canon_input = tc.get("input", tc.get("stdin", ""))

        raw_actual = str(res.get("actual", ""))
        raw_expected = str(res.get("expected", res.get("output", "")))
        if not raw_expected.strip() and canon_expected is not None and str(canon_expected).strip():
            raw_expected = str(canon_expected)
        if not str(res.get("input", res.get("stdin", ""))).strip() and str(canon_input).strip():
            res["input"] = canon_input

        ok, disp_a, disp_e = _judge_outputs_equal(raw_actual, raw_expected)
        res["actual"] = disp_a
        res["expected"] = disp_e
        if ok:
            res["status"] = "Passed"
            passed_count += 1
        else:
            res["status"] = "Failed"

    data["results"] = results_list
    data.setdefault("stats", {})
    data["stats"]["passed"] = passed_count
    data["stats"]["total"] = tc_count

    return data


@app.get("/api/v1/courses")
async def get_courses(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if _is_staff(current_user):
        # Admin panel lists every course so staff can edit drafts and published ones.
        res = await db.execute(select(models.Course).order_by(models.Course.id.desc()))
        courses = res.scalars().all()
    else:
        res = await db.execute(select(models.Course).where(models.Course.is_published == True))
        courses = res.scalars().all()
    # Price for students (catalog) and staff (editing).
    include_price = _is_student(current_user) or _is_staff(current_user)
    return [serialize_course(course, include_price=include_price) for course in courses]

@app.post("/api/v1/uploads/thumbnail")
async def upload_course_thumbnail(
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_instructor),
):
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file.")
    data = await file.read()
    if len(data) > 6 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be 6MB or smaller.")
    filename = f"{uuid.uuid4().hex}.jpg"
    dest = THUMBNAIL_DIR / filename
    dest.write_bytes(data)
    return {"url": f"/uploads/thumbnails/{filename}"}

@app.post("/api/v1/courses")
# 👇 CHANGE: Remove "schemas." prefix to use the local class
async def create_course(course: CourseCreate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    new_course = models.Course(
        title=course.title, 
        description=course.description, 
        price=course.price, 
        image_url=course.image_url, 
        instructor_id=current_user.id, 
        course_type=course.course_type, 
        language=course.language,
        category=course.category,
    )
    db.add(new_course)
    await db.commit()
    await db.refresh(new_course)
    students = await db.execute(select(models.User.id).where(models.User.role == "student"))
    for uid in students.scalars().all():
        db.add(models.Notification(user_id=uid, title="New Course Alert!", message=f"New course '{new_course.title}' is now available.", created_at=datetime.utcnow()))
    await db.commit()
    return new_course

@app.post("/api/v1/courses/{course_id}/modules")
async def create_module(course_id: int, module: ModuleCreate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    course_res = await db.execute(select(models.Course).where(models.Course.id == course_id))
    course = course_res.scalars().first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if not _can_manage_course(current_user, course):
        raise HTTPException(status_code=403, detail="Not authorized to add modules to this course")

    payload = module.model_dump() if hasattr(module, "model_dump") else module.dict()
    title = str(payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Module title is required")

    new_module = models.Module(
        title=title,
        order=int(payload.get("order") or 0),
        course_id=course_id,
    )
    db.add(new_module)
    await db.commit()
    await db.refresh(new_module)
    return serialize_module(new_module)

@app.put("/api/v1/courses/{course_id}/modules/reorder")
async def reorder_modules(course_id: int, req: ReorderModulesRequest, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    # 1. Verify Course Ownership
    res = await db.execute(select(models.Course).where(models.Course.id == course_id))
    course = res.scalars().first()
    if not course: raise HTTPException(status_code=404, detail="Course not found")
    if course.instructor_id != current_user.id and not _can_manage_course(current_user, course): raise HTTPException(status_code=403, detail="Not authorized")

    # 2. Fetch all modules for this course
    result = await db.execute(select(models.Module).where(models.Module.course_id == course_id))
    modules_db = result.scalars().all()
    module_map = {m.id: m for m in modules_db}

    # 3. Update Order
    for idx, mid in enumerate(req.module_ids):
        if mid in module_map:
            module_map[mid].order = idx
            
    await db.commit()
    return {"message": "Modules reordered"}

@app.get("/api/v1/courses/{course_id}/modules")
async def get_modules(course_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(models.Module)
        .options(selectinload(models.Module.items))
        .where(models.Module.course_id == course_id)
        .order_by(models.Module.order, models.Module.id)
    )
    return [serialize_module(m) for m in res.scalars().unique().all()]

@app.post("/api/v1/content")
async def add_content(content: ContentCreate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    cleaned_resource_links = normalize_resource_links(content.resource_links)
    pass_pct = content.pass_percent if content.pass_percent is not None else 70
    pass_pct = max(0, min(100, int(pass_pct)))
    new_content = models.ContentItem(
        title=content.title, 
        type=content.type, 
        content=content.data_url, 
        order=0, 
        module_id=content.module_id, 
        duration=content.duration, 
        is_mandatory=content.is_mandatory, 
        instructions=content.instructions, 
        test_config=content.test_config,
        resource_links=json.dumps(cleaned_resource_links) if cleaned_resource_links else None,
        # ✅ Save Times
        start_time=content.start_time,
        end_time=content.end_time,
        pass_percent=pass_pct if content.type == "quiz" else None,
    )
    db.add(new_content)
    await db.commit()
    await db.refresh(new_content)
    return {"message": "Content added", "id": new_content.id}

@app.patch("/api/v1/courses/{course_id}/publish")
async def publish_course(course_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    res = await db.execute(select(models.Course).where(models.Course.id == course_id))
    course = res.scalars().first()
    if course:
        course.is_published = True
        await db.commit()
    return {"message": "Published"}

@app.get("/api/v1/library/items")
async def list_library_items(
    q: Optional[str] = None,
    content_type: Optional[str] = None,
    course_id: Optional[int] = None,
    course_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor)
):
    query = (
        select(models.ContentItem, models.Module, models.Course, models.User)
        .join(models.Module, models.ContentItem.module_id == models.Module.id)
        .join(models.Course, models.Module.course_id == models.Course.id)
        .join(models.User, models.Course.instructor_id == models.User.id)
    )

    if q:
        search_text = f"%{q.strip()}%"
        query = query.where(
            (models.ContentItem.title.ilike(search_text))
            | (models.Module.title.ilike(search_text))
            | (models.Course.title.ilike(search_text))
            | (models.User.full_name.ilike(search_text))
            | (models.User.email.ilike(search_text))
        )

    if content_type and content_type != "all":
        query = query.where(models.ContentItem.type == content_type)

    if course_id is not None:
        query = query.where(models.Course.id == course_id)

    if course_name:
        course_text = f"%{course_name.strip()}%"
        query = query.where(models.Course.title.ilike(course_text))

    query = query.order_by(models.ContentItem.id.desc()).limit(500)
    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "id": item.id,
            "title": item.title,
            "type": item.type,
            "url": item.content,
            "duration": item.duration,
            "is_mandatory": item.is_mandatory,
            "instructions": item.instructions,
            "test_config": item.test_config,
            "start_time": item.start_time,
            "end_time": item.end_time,
            "resource_links": parse_resource_links(item.resource_links),
            "module_id": module.id,
            "module_title": module.title,
            "course_id": course.id,
            "course_title": course.title,
            "instructor_id": instructor.id,
            "instructor_name": instructor.full_name or instructor.email,
        }
        for item, module, course, instructor in rows
    ]

@app.get("/api/v1/library/courses")
async def list_library_courses(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor)
):
    result = await db.execute(
        select(models.Course.id, models.Course.title)
        .join(models.Module, models.Module.course_id == models.Course.id)
        .join(models.ContentItem, models.ContentItem.module_id == models.Module.id)
        .group_by(models.Course.id, models.Course.title)
        .order_by(models.Course.title.asc())
    )
    rows = result.all()
    return [{"id": row[0], "title": row[1]} for row in rows]

@app.get("/api/v1/library/course-modules")
async def list_course_modules_for_library(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor)
):
    res = await db.execute(
        select(models.Module)
        .options(selectinload(models.Module.items))
        .where(models.Module.course_id == course_id)
        .order_by(models.Module.order, models.Module.id)
    )
    modules = res.scalars().all()
    return [
        {
            "id": module.id,
            "title": module.title,
            "order": module.order,
            "lesson_count": len(module.items or []),
        }
        for module in modules
    ]

@app.post("/api/v1/library/add-to-module")
async def add_items_from_library(
    payload: LibraryBulkAddRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor)
):
    target_mod_res = await db.execute(
        select(models.Module, models.Course)
        .join(models.Course, models.Module.course_id == models.Course.id)
        .where(models.Module.id == payload.module_id)
    )
    target_pair = target_mod_res.first()
    if not target_pair:
        raise HTTPException(status_code=404, detail="Target module not found")

    target_module, target_course = target_pair
    if not _can_manage_course(current_user, target_course):
        raise HTTPException(status_code=403, detail="You can add library items only to your own course module")

    item_ids = [item_id for item_id in payload.item_ids if isinstance(item_id, int)]
    if not item_ids:
        raise HTTPException(status_code=400, detail="No library items selected")

    src_items_res = await db.execute(select(models.ContentItem).where(models.ContentItem.id.in_(item_ids)))
    src_items = src_items_res.scalars().all()
    src_items_map = {item.id: item for item in src_items}

    ordered_source_items = [src_items_map[item_id] for item_id in item_ids if item_id in src_items_map]
    if not ordered_source_items:
        raise HTTPException(status_code=404, detail="Selected library items were not found")

    max_order_res = await db.execute(
        select(func.max(models.ContentItem.order)).where(models.ContentItem.module_id == payload.module_id)
    )
    max_order = max_order_res.scalar()
    next_order = (max_order + 1) if max_order is not None else 0

    created_items = []
    for src in ordered_source_items:
        cloned = models.ContentItem(
            title=src.title,
            type=src.type,
            content=src.content,
            duration=src.duration,
            is_mandatory=src.is_mandatory,
            instructions=src.instructions,
            test_config=src.test_config,
            resource_links=src.resource_links,
            start_time=src.start_time,
            end_time=src.end_time,
            pass_percent=src.pass_percent,
            order=next_order,
            module_id=payload.module_id,
        )
        next_order += 1
        db.add(cloned)
        await db.flush()
        if src.type == "quiz":
            await _clone_quiz_questions(db, src.id, cloned.id)
        created_items.append(cloned)

    await db.commit()
    return {"message": "Library items added", "count": len(created_items)}

@app.post("/api/v1/library/import-modules")
async def import_modules_from_library(
    payload: LibraryImportModulesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor)
):
    target_course_res = await db.execute(select(models.Course).where(models.Course.id == payload.target_course_id))
    target_course = target_course_res.scalars().first()
    if not target_course:
        raise HTTPException(status_code=404, detail="Target course not found")
    if not _can_manage_course(current_user, target_course):
        raise HTTPException(status_code=403, detail="You can import modules only into your own course")

    module_ids = [module_id for module_id in payload.module_ids if isinstance(module_id, int)]
    if not module_ids:
        raise HTTPException(status_code=400, detail="No modules selected")

    src_res = await db.execute(
        select(models.Module)
        .options(selectinload(models.Module.items))
        .where(models.Module.id.in_(module_ids))
    )
    src_modules = src_res.scalars().all()
    src_map = {module.id: module for module in src_modules}
    ordered_src_modules = [src_map[module_id] for module_id in module_ids if module_id in src_map]
    if not ordered_src_modules:
        raise HTTPException(status_code=404, detail="Selected source modules were not found")

    max_order_res = await db.execute(select(func.max(models.Module.order)).where(models.Module.course_id == payload.target_course_id))
    max_order = max_order_res.scalar()
    next_module_order = (max_order + 1) if max_order is not None else 0

    imported_modules = 0
    for src_module in ordered_src_modules:
        new_module = models.Module(
            title=src_module.title,
            order=next_module_order,
            course_id=payload.target_course_id
        )
        next_module_order += 1
        db.add(new_module)
        await db.flush()

        sorted_items = sorted(
            src_module.items or [],
            key=lambda item: (
                item.order is None,
                item.order if item.order is not None else 10**9,
                item.id
            )
        )
        for idx, src_item in enumerate(sorted_items):
            new_item = models.ContentItem(
                title=src_item.title,
                type=src_item.type,
                content=src_item.content,
                duration=src_item.duration,
                is_mandatory=src_item.is_mandatory,
                instructions=src_item.instructions,
                test_config=src_item.test_config,
                resource_links=src_item.resource_links,
                start_time=src_item.start_time,
                end_time=src_item.end_time,
                pass_percent=src_item.pass_percent,
                order=idx,
                module_id=new_module.id,
            )
            db.add(new_item)
            await db.flush()
            if src_item.type == "quiz":
                await _clone_quiz_questions(db, src_item.id, new_item.id)
        imported_modules += 1

    await db.commit()
    return {"message": "Modules imported from library", "count": imported_modules}

@app.patch("/api/v1/courses/{course_id}/details")
async def update_course_details(
    course_id: int, 
    update: CourseUpdate, 
    db: AsyncSession = Depends(get_db), 
    current_user: models.User = Depends(require_instructor)
):
    # 1. Fetch Course
    result = await db.execute(select(models.Course).where(models.Course.id == course_id))
    course = result.scalars().first()
    
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # 2. Verify Ownership (published courses remain editable in admin panel)
    if not _can_manage_course(current_user, course):
        raise HTTPException(status_code=403, detail="Not authorized to edit this course")

    # 3. Update fields if provided (works for draft and published courses)
    if update.title is not None:
        title = update.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Course title is required")
        course.title = title
    if update.description is not None:
        course.description = update.description
    if update.price is not None:
        course.price = update.price
    if update.image_url is not None:
        course.image_url = update.image_url or None
    if update.language is not None:
        course.language = update.language or None
    if update.category is not None:
        course.category = update.category or None
    
    # 4. Save
    await db.commit()
    await db.refresh(course)
    
    return {
        "message": "Course updated successfully",
        "course": serialize_course(course, include_price=True),
    }

@app.get("/api/v1/courses/{course_id}/player")
async def get_course_player(course_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # ⚡ OPTIMIZED EAGER LOADING: Fetch Course + Modules + Items in 1 Go
    result = await db.execute(
        select(models.Course)
        .options(selectinload(models.Course.modules).selectinload(models.Module.items))
        .where(models.Course.id == course_id)
    )
    course = result.scalars().first()
    if not course: raise HTTPException(status_code=404)

    # Check Enrollment
    enrol_res = await db.execute(select(models.Enrollment).where(models.Enrollment.user_id == current_user.id, models.Enrollment.course_id == course_id))
    enrollment = enrol_res.scalars().first()
    
    if not enrollment and not _is_staff(current_user): raise HTTPException(status_code=403)
    if enrollment and enrollment.enrollment_type == "trial" and enrollment.expiry_date and datetime.utcnow() > enrollment.expiry_date:
        raise HTTPException(status_code=402, detail="Trial Expired")

    # Fetch Progress
    prog_res = await db.execute(select(models.LessonProgress).where(models.LessonProgress.user_id == current_user.id))
    progress_records = prog_res.scalars().all()
    progress_map = {p.content_item_id: p for p in progress_records}
    completed_ids = {p.content_item_id for p in progress_records if p.is_completed}

    payload = {
        "id": course.id, 
        "title": course.title, 
        "course_type": course.course_type,
        "language": course.language,
        "modules": [
            {
                "id": m.id, 
                "title": m.title, 
                "order": m.order,
                "is_completed": any(item.type == 'assignment' and item.id in completed_ids for item in m.items),
                "lessons": [
                    {
                        "id": c.id, 
                        "title": c.title, 
                        "order": c.order,
                        "type": c.type, 
                        "url": c.content, 
                        "test_config": c.test_config, 
                        "instructions": c.instructions, 
                        "resource_links": parse_resource_links(c.resource_links),
                        "duration": c.duration, 
                        "is_mandatory": c.is_mandatory,
                        "pass_percent": c.pass_percent if c.pass_percent is not None else 70,
                        "is_completed": c.id in completed_ids,
                        "start_time": c.start_time,
                        "end_time": c.end_time,
                        "is_terminated": progress_map.get(c.id).is_terminated if c.id in progress_map else False,
                        "violation_count": progress_map.get(c.id).violation_count if c.id in progress_map else 0
                        
                    } for c in sorted(
                        m.items,
                        key=lambda item: (
                            item.order is None,
                            item.order if item.order is not None else 10**9,
                            item.id
                        )
                    )
                ]
            } for m in sorted(
                course.modules,
                key=lambda module: (
                    module.order is None,
                    module.order if module.order is not None else 10**9,
                    module.id
                )
            )
        ]
    }
    cert = await certificate_service.get_user_certificate(db, current_user.id, course_id)
    payload["has_certificate"] = bool(cert)
    payload["certificate_id"] = cert.certificate_id if cert else None
    if cert:
        payload["certificate"] = certificate_service.serialize_certificate(cert, course.title)
    if _is_student(current_user):
        payload["price"] = int(course.price or 0)
    return payload


def _progress_type_bucket(item_type: Optional[str]) -> str:
    kind = (item_type or "lesson").lower()
    if kind in ("video", "live_class"):
        return "videos"
    if kind == "note":
        return "notes"
    if kind == "quiz":
        return "quizzes"
    if kind == "assignment":
        return "assignments"
    if kind in ("code_test", "code"):
        return "code_tests"
    if kind == "live_test":
        return "live_tests"
    return "lessons"


@app.get("/api/v1/courses/{course_id}/progress-dashboard")
async def get_course_progress_dashboard(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Per-course progress dashboard for the signed-in student (or staff preview)."""
    result = await db.execute(
        select(models.Course)
        .options(selectinload(models.Course.modules).selectinload(models.Module.items))
        .where(models.Course.id == course_id)
    )
    course = result.scalars().first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    enrol_res = await db.execute(
        select(models.Enrollment).where(
            models.Enrollment.user_id == current_user.id,
            models.Enrollment.course_id == course_id,
        )
    )
    enrollment = enrol_res.scalars().first()
    if not enrollment and not _is_staff(current_user):
        raise HTTPException(status_code=403, detail="Enroll in this course to view progress")

    days_left = 0
    is_trial_expired = False
    enrollment_type = enrollment.enrollment_type if enrollment else "staff"
    enrolled_at = enrollment.enrolled_at.isoformat() if enrollment and enrollment.enrolled_at else None
    if enrollment and enrollment.enrollment_type == "trial" and enrollment.expiry_date:
        delta = enrollment.expiry_date - datetime.utcnow()
        days_left = max(0, delta.days)
        is_trial_expired = delta.total_seconds() <= 0

    instructor_name = None
    if course.instructor_id:
        instr_res = await db.execute(select(models.User).where(models.User.id == course.instructor_id))
        instructor = instr_res.scalars().first()
        instructor_name = instructor.full_name if instructor else None

    modules_sorted = sorted(
        course.modules or [],
        key=lambda module: (
            module.order is None,
            module.order if module.order is not None else 10**9,
            module.id,
        ),
    )
    all_items = []
    for module in modules_sorted:
        items = sorted(
            module.items or [],
            key=lambda item: (
                item.order is None,
                item.order if item.order is not None else 10**9,
                item.id,
            ),
        )
        all_items.extend(items)

    item_ids = [item.id for item in all_items]
    progress_map = {}
    if item_ids:
        prog_res = await db.execute(
            select(models.LessonProgress).where(
                models.LessonProgress.user_id == current_user.id,
                models.LessonProgress.content_item_id.in_(item_ids),
            )
        )
        progress_map = {p.content_item_id: p for p in prog_res.scalars().all()}

    submission_map = {}
    assignment_ids = [item.id for item in all_items if (item.type or "").lower() == "assignment"]
    if assignment_ids:
        sub_res = await db.execute(
            select(models.Submission).where(
                models.Submission.user_id == current_user.id,
                models.Submission.content_item_id.in_(assignment_ids),
            )
        )
        for sub in sub_res.scalars().all():
            existing = submission_map.get(sub.content_item_id)
            if not existing or (sub.submitted_at and existing.get("submitted_at") and sub.submitted_at > existing["submitted_at"]):
                submission_map[sub.content_item_id] = {
                    "status": sub.status,
                    "submitted_at": sub.submitted_at,
                }

    completed_ids = {cid for cid, rec in progress_map.items() if rec.is_completed}
    total_items = len(all_items)
    completed_count = len([item for item in all_items if item.id in completed_ids])
    percent = 0 if total_items == 0 else round((completed_count / total_items) * 100)

    type_stats: Dict[str, Dict[str, int]] = {}
    remaining_minutes = 0
    next_lesson = None
    recent_activity = []

    for item in all_items:
        bucket = _progress_type_bucket(item.type)
        stats = type_stats.setdefault(bucket, {"completed": 0, "total": 0})
        stats["total"] += 1
        done = item.id in completed_ids
        if done:
            stats["completed"] += 1
            rec = progress_map.get(item.id)
            if rec and rec.completed_at:
                recent_activity.append({
                    "id": item.id,
                    "title": item.title,
                    "type": item.type,
                    "completed_at": rec.completed_at.isoformat(),
                })
        else:
            remaining_minutes += int(item.duration or 0)
            if next_lesson is None:
                next_lesson = {
                    "id": item.id,
                    "title": item.title,
                    "type": item.type,
                    "duration": item.duration,
                }

    modules_payload = []
    for module in modules_sorted:
        lessons_sorted = sorted(
            module.items or [],
            key=lambda item: (
                item.order is None,
                item.order if item.order is not None else 10**9,
                item.id,
            ),
        )
        lesson_rows = []
        for item in lessons_sorted:
            rec = progress_map.get(item.id)
            sub = submission_map.get(item.id)
            is_done = item.id in completed_ids
            lesson_rows.append({
                "id": item.id,
                "title": item.title,
                "type": item.type,
                "duration": item.duration,
                "is_mandatory": bool(item.is_mandatory),
                "is_completed": is_done,
                "completed_at": rec.completed_at.isoformat() if rec and rec.completed_at and is_done else None,
                "assignment_status": sub["status"] if sub else None,
            })
            if next_lesson and next_lesson.get("id") == item.id:
                next_lesson["module_id"] = module.id
                next_lesson["module_title"] = module.title
        module_total = len(lesson_rows)
        module_done = sum(1 for row in lesson_rows if row["is_completed"])
        modules_payload.append({
            "id": module.id,
            "title": module.title,
            "order": module.order,
            "completed": module_done,
            "total": module_total,
            "percent": 0 if module_total == 0 else round((module_done / module_total) * 100),
            "lessons": lesson_rows,
        })

    challenges_payload = None
    next_challenge = None
    chal_res = await db.execute(select(models.CourseChallenge).where(models.CourseChallenge.course_id == course_id))
    challenges = chal_res.scalars().all()
    if challenges:
        chal_ids = [c.id for c in challenges]
        solved_res = await db.execute(
            select(models.ChallengeProgress).where(
                models.ChallengeProgress.user_id == current_user.id,
                models.ChallengeProgress.challenge_id.in_(chal_ids),
            )
        )
        solved_map = {p.challenge_id: p for p in solved_res.scalars().all() if p.is_solved}
        difficulty_order = ["Easy", "Medium", "Hard"]
        by_difficulty: Dict[str, Dict[str, Any]] = {}
        challenge_rows = []
        for challenge in challenges:
            solved = challenge.id in solved_map
            rec = solved_map.get(challenge.id)
            row = {
                "id": challenge.id,
                "title": challenge.title,
                "difficulty": challenge.difficulty or "Easy",
                "is_solved": solved,
                "solved_at": rec.solved_at.isoformat() if rec and rec.solved_at else None,
            }
            challenge_rows.append(row)
            bucket = by_difficulty.setdefault(row["difficulty"], {"solved": 0, "total": 0, "items": []})
            bucket["total"] += 1
            if solved:
                bucket["solved"] += 1
            bucket["items"].append(row)
        for level in difficulty_order:
            by_difficulty.setdefault(level, {"solved": 0, "total": 0, "items": []})
        for row in sorted(
            challenge_rows,
            key=lambda r: (difficulty_order.index(r["difficulty"]) if r["difficulty"] in difficulty_order else 99, r["id"]),
        ):
            if not row["is_solved"] and next_challenge is None:
                next_challenge = row
                break
        challenges_payload = {
            "solved": len(solved_map),
            "total": len(challenges),
            "percent": 0 if not challenges else round((len(solved_map) / len(challenges)) * 100),
            "by_difficulty": by_difficulty,
        }

    cert_res = await db.execute(
        select(models.UserCertificate).where(
            models.UserCertificate.user_id == current_user.id,
            models.UserCertificate.course_id == course_id,
        )
    )
    certificate = cert_res.scalars().first()

    if course.course_type == "coding" and challenges_payload:
        is_complete = challenges_payload["total"] > 0 and challenges_payload["solved"] == challenges_payload["total"]
        overall_completed = challenges_payload["solved"]
        overall_total = challenges_payload["total"]
        overall_percent = challenges_payload["percent"]
    else:
        is_complete = total_items > 0 and completed_count == total_items
        overall_completed = completed_count
        overall_total = total_items
        overall_percent = percent

    recent_activity.sort(key=lambda row: row.get("completed_at") or "", reverse=True)

    payload = {
        "course": {
            "id": course.id,
            "title": course.title,
            "description": course.description,
            "image_url": course.image_url,
            "course_type": course.course_type,
            "language": course.language,
            "category": getattr(course, "category", None),
            "instructor_name": instructor_name,
        },
        "enrollment": {
            "enrollment_type": enrollment_type,
            "enrolled_at": enrolled_at,
            "days_left": days_left,
            "is_trial_expired": is_trial_expired,
        },
        "progress": {
            "completed": overall_completed,
            "total": overall_total,
            "percent": overall_percent,
            "is_complete": is_complete,
            "remaining_minutes": remaining_minutes,
            "modules_completed": sum(1 for m in modules_payload if m["total"] > 0 and m["completed"] == m["total"]),
            "modules_total": len(modules_payload),
        },
        "by_type": type_stats,
        "modules": modules_payload,
        "challenges": challenges_payload,
        "next_lesson": next_lesson,
        "next_challenge": next_challenge,
        "recent_activity": recent_activity[:6],
        "certificate": {
            "eligible": is_complete,
            "claimed": bool(certificate),
            "issued_at": certificate.issued_at.isoformat() if certificate and certificate.issued_at else None,
            "credential_id": certificate.certificate_id if certificate else None,
            "verify_url": certificate_service.verify_url(certificate.certificate_id) if certificate and certificate.certificate_id else None,
            "recipient_name": certificate.recipient_name if certificate else None,
            "status": certificate.status if certificate else None,
        },
    }
    if _is_student(current_user):
        payload["course"]["price"] = int(course.price or 0)
    return payload


@app.post("/api/v1/enroll/{course_id}")
async def enroll_student(course_id: int, req: EnrollmentRequest, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    res = await db.execute(select(models.Enrollment).where(models.Enrollment.user_id == current_user.id, models.Enrollment.course_id == course_id))
    existing = res.scalars().first()
    if existing:
        if existing.enrollment_type == "trial" and req.type == "paid":
            existing.enrollment_type = "paid"; existing.expiry_date = None; await db.commit(); return {"message": "Upgraded"}
        return {"message": "Already enrolled"}
    
    new_enrollment = models.Enrollment(user_id=current_user.id, course_id=course_id, enrollment_type=req.type, expiry_date=(datetime.utcnow() + timedelta(days=7)) if req.type == "trial" else None)
    db.add(new_enrollment)
    await db.commit()
    return {"message": "Enrolled"}

@app.get("/api/v1/generate-pdf/{course_id}")
async def generate_pdf_endpoint(course_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    course_res = await db.execute(select(models.Course).where(models.Course.id == course_id))
    course = course_res.scalars().first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    await _ensure_enrolled_or_staff(current_user, course_id, db)

    # Issue on demand when the learner has finished the course (any course type).
    certificate = await certificate_service.get_user_certificate(db, current_user.id, course_id)
    if not certificate:
        certificate = await certificate_service.issue_certificate_if_eligible(
            db,
            current_user,
            course_id,
            generate_pdf=True,
            send_email=False,
            require_complete=True,
        )
    if not certificate:
        completed, total, _is_done = await check_progress_status(current_user.id, course_id, db)
        raise HTTPException(
            status_code=403,
            detail=(
                f"Complete the course first to unlock your certificate ({completed}/{total} lessons done)."
                if total
                else "Complete the course first to unlock your certificate."
            ),
        )

    try:
        pdf_path = await certificate_service.ensure_certificate_pdf(db, certificate, current_user, course)
    except Exception as exc:
        logger.exception("Certificate PDF error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Could not generate the certificate PDF. Please try again shortly.",
        )

    if not pdf_path.exists() or pdf_path.stat().st_size <= 0:
        raise HTTPException(status_code=500, detail="Certificate PDF is missing. Please try again.")

    safe_title = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in (course.title or "certificate"))
    filename = f"{safe_title}_{certificate.certificate_id}.pdf"
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=filename,
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/v1/certificates/verify/{credential_id}")
async def verify_certificate_public(credential_id: str, db: AsyncSession = Depends(get_db)):
    payload = await certificate_service.public_certificate_payload(db, credential_id.strip())
    if not payload:
        raise HTTPException(status_code=404, detail="This certificate ID was not found.")
    return payload

@app.get("/api/v1/my-courses")
async def get_my_courses(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1. Fetch enrollments with course details AND certificates
    res = await db.execute(
        select(models.Enrollment)
        .options(selectinload(models.Enrollment.course))
        .where(models.Enrollment.user_id == current_user.id)
    )
    enrollments = res.scalars().all()
    
    # 2. Fetch earned certificates for ribbon logic
    cert_res = await db.execute(
        select(models.UserCertificate)
        .where(models.UserCertificate.user_id == current_user.id)
    )
    earned_certs = {c.course_id: c for c in cert_res.scalars().all()}

    # 3. Build response with enrollment status
    valid_courses = []
    for e in enrollments:
        if e.course:
            # Calculate Trial Status
            days_left = 0
            is_trial_expired = False
            
            if e.enrollment_type == "trial" and e.expiry_date:
                delta = e.expiry_date - datetime.utcnow()
                days_left = max(0, delta.days)
                if delta.total_seconds() <= 0:
                    is_trial_expired = True

            lessons_completed, lessons_total, is_complete = await check_progress_status(
                current_user.id, e.course.id, db
            )
            has_cert = e.course.id in earned_certs
            course_data = {
                "id": e.course.id,
                "title": e.course.title,
                "description": e.course.description,
                "image_url": e.course.image_url,
                "instructor_id": e.course.instructor_id,
                "course_type": e.course.course_type,
                "language": e.course.language,
                "category": getattr(e.course, "category", None),

                # UI Status Fields
                "enrollment_type": e.enrollment_type, # "paid" or "trial"
                "days_left": days_left,
                "is_trial_expired": is_trial_expired,
                "has_certificate": has_cert,
                "certificate_id": earned_certs[e.course.id].certificate_id if has_cert else None,
                "lessons_completed": lessons_completed,
                "lessons_total": lessons_total,
                "is_course_complete": bool(is_complete),
                "certificate_eligible": bool(is_complete or has_cert),
            }
            if _is_student(current_user):
                course_data["price"] = int(e.course.price or 0)
            valid_courses.append(course_data)

    return valid_courses

@app.post("/api/v1/user/change-password")
async def change_password(req: PasswordChange, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    current_user.hashed_password = get_password_hash(req.new_password)
    await db.commit()
    return {"message": "Password updated"}

# In backend/main.py

@app.delete("/api/v1/content/{content_id}")
async def delete_content(content_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    # 1. Fetch the item
    res = await db.execute(select(models.ContentItem).where(models.ContentItem.id == content_id))
    item = res.scalars().first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    try:
        # 2. ✅ CRITICAL FIX: Delete related dependencies first!
        
        # Delete related Progress records (Proctoring/Completion data)
        await db.execute(
            delete(models.LessonProgress).where(models.LessonProgress.content_item_id == content_id)
        )

        # Delete related Submissions (if it was an assignment)
        await db.execute(
            delete(models.Submission).where(models.Submission.content_item_id == content_id)
        )

        # Delete native quiz attempts / answers / questions / options
        attempt_ids_res = await db.execute(
            select(models.QuizAttempt.id).where(models.QuizAttempt.content_item_id == content_id)
        )
        attempt_ids = list(attempt_ids_res.scalars().all())
        if attempt_ids:
            await db.execute(
                delete(models.QuizAnswer).where(models.QuizAnswer.attempt_id.in_(attempt_ids))
            )
        await db.execute(
            delete(models.QuizAttempt).where(models.QuizAttempt.content_item_id == content_id)
        )
        q_ids_res = await db.execute(
            select(models.QuizQuestion.id).where(models.QuizQuestion.content_item_id == content_id)
        )
        q_ids = list(q_ids_res.scalars().all())
        if q_ids:
            await db.execute(
                delete(models.QuizOption).where(models.QuizOption.question_id.in_(q_ids))
            )
        await db.execute(
            delete(models.QuizQuestion).where(models.QuizQuestion.content_item_id == content_id)
        )

        # 3. Now delete the actual item
        await db.delete(item)
        await db.commit()
        return {"message": "Deleted successfully"}

    except Exception as e:
        await db.rollback()
        print(f"Delete Error: {str(e)}") # This prints to your backend terminal for debugging
        raise HTTPException(status_code=500, detail=f"Server Error: {str(e)}")

@app.patch("/api/v1/content/{content_id}")
async def update_content(content_id: int, update: ContentUpdate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    res = await db.execute(select(models.ContentItem).where(models.ContentItem.id == content_id))
    item = res.scalars().first()
    if item: 
        if update.title: item.title = update.title
        if update.url: item.content = update.url
        if update.resource_links is not None:
            cleaned_resource_links = normalize_resource_links(update.resource_links)
            item.resource_links = json.dumps(cleaned_resource_links) if cleaned_resource_links else None
        await db.commit()
        return {"message": "Updated"}
    raise HTTPException(status_code=404)

def _cors_json(status_code: int, content: dict, request: Optional[Request] = None) -> JSONResponse:
    """Always attach CORS for LMS origins. Cloudflare strips headers on origin 502/504 pages."""
    origin = ""
    if request is not None:
        origin = (request.headers.get("origin") or "").strip()
    allowed = origin if (
        origin in _cors_allow
        or (origin.startswith("https://") and origin.endswith("cloudvaathi.in"))
        or origin.startswith("http://localhost:")
        or origin.startswith("http://127.0.0.1:")
    ) else "https://lms.cloudvaathi.in"
    return JSONResponse(
        status_code=status_code,
        content=content,
        headers={
            "Access-Control-Allow-Origin": allowed,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Vary": "Origin",
        },
    )


@app.get("/api/v1/payment/health")
async def payment_health():
    """Deploy/check marker — does not create a charge."""
    return {
        "payment_api": "v2-no-502",
        "razorpay_configured": _razorpay_configured(),
        "key_prefix": (RAZORPAY_KEY_ID[:12] + "…") if RAZORPAY_KEY_ID else None,
    }


@app.get("/api/v1/certificate/health")
async def certificate_health():
    """Shows which PDF backends are available (no auth, no file written)."""
    playwright_ok = False
    reportlab_ok = False
    detail = None
    try:
        import reportlab  # noqa: F401
        from template_assets import resolve_template_png

        resolve_template_png()
        reportlab_ok = True
    except Exception as exc:
        detail = f"reportlab:{exc}"
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            exe = p.chromium.executable_path
            playwright_ok = bool(exe) and Path(exe).exists()
            if not playwright_ok:
                detail = (detail + "; " if detail else "") + "playwright:chromium binary missing"
    except Exception as exc:
        detail = (detail + "; " if detail else "") + f"playwright:{exc}"
    return {
        "reportlab": reportlab_ok,
        "playwright": playwright_ok,
        "ready": reportlab_ok or playwright_ok,
        "detail": detail,
    }


@app.post("/api/v1/coupons/validate")
async def validate_coupon(
    req: CouponValidateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    course_res = await db.execute(select(models.Course).where(models.Course.id == req.course_id))
    course = course_res.scalars().first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    try:
        return await coupon_service.validate_coupon_for_course(
            db, code=req.coupon_code, course=course, user_id=current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/v1/coupons")
async def list_coupons(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    result = await db.execute(select(models.Coupon).order_by(models.Coupon.created_at.desc()))
    return [coupon_service.serialize_coupon(c) for c in result.scalars().all()]


@app.post("/api/v1/coupons")
async def create_coupon(
    req: CouponCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    code = coupon_service.normalize_coupon_code(req.code)
    if not code:
        raise HTTPException(status_code=400, detail="Coupon code is required.")
    dtype = (req.discount_type or "percent").lower().strip()
    if dtype not in {"percent", "flat"}:
        raise HTTPException(status_code=400, detail="discount_type must be percent or flat.")
    if int(req.discount_value) <= 0:
        raise HTTPException(status_code=400, detail="discount_value must be greater than zero.")
    if dtype == "percent" and int(req.discount_value) > 100:
        raise HTTPException(status_code=400, detail="Percent discount cannot exceed 100.")

    existing = await coupon_service.get_coupon_by_code(db, code)
    if existing:
        raise HTTPException(status_code=400, detail="Coupon code already exists.")

    coupon = models.Coupon(
        code=code,
        discount_type=dtype,
        discount_value=int(req.discount_value),
        course_id=req.course_id,
        max_uses=req.max_uses,
        min_amount=req.min_amount,
        is_active=bool(req.is_active),
        expires_at=req.expires_at,
    )
    db.add(coupon)
    await db.commit()
    await db.refresh(coupon)
    return coupon_service.serialize_coupon(coupon)


@app.patch("/api/v1/coupons/{coupon_id}")
async def update_coupon(
    coupon_id: int,
    req: CouponUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    result = await db.execute(select(models.Coupon).where(models.Coupon.id == coupon_id))
    coupon = result.scalars().first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")

    if req.discount_type is not None:
        dtype = req.discount_type.lower().strip()
        if dtype not in {"percent", "flat"}:
            raise HTTPException(status_code=400, detail="discount_type must be percent or flat.")
        coupon.discount_type = dtype
    if req.discount_value is not None:
        if int(req.discount_value) <= 0:
            raise HTTPException(status_code=400, detail="discount_value must be greater than zero.")
        coupon.discount_value = int(req.discount_value)
    if req.course_id is not None:
        coupon.course_id = req.course_id
    if req.max_uses is not None:
        coupon.max_uses = req.max_uses
    if req.min_amount is not None:
        coupon.min_amount = req.min_amount
    if req.is_active is not None:
        coupon.is_active = bool(req.is_active)
    if req.expires_at is not None:
        coupon.expires_at = req.expires_at

    await db.commit()
    await db.refresh(coupon)
    return coupon_service.serialize_coupon(coupon)


async def _unlock_paid_enrollment(db: AsyncSession, user_id: int, course_id: int) -> None:
    enroll_res = await db.execute(
        select(models.Enrollment).where(
            models.Enrollment.user_id == user_id,
            models.Enrollment.course_id == course_id,
        )
    )
    existing = enroll_res.scalars().first()
    if existing:
        existing.enrollment_type = "paid"
        existing.expiry_date = None
        await db.commit()
        return
    db.add(
        models.Enrollment(
            user_id=user_id,
            course_id=course_id,
            enrollment_type="paid",
            expiry_date=None,
        )
    )
    await db.commit()


@app.post("/api/v1/create-order")
async def create_payment_order(
    data: CreateOrderRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Never return 502/504 — Cloudflare replaces those with a plain page (no CORS),
    # which browsers mis-report as a CORS failure on https://lms.cloudvaathi.in.
    try:
        res = await db.execute(select(models.Course).where(models.Course.id == data.course_id))
        course = res.scalars().first()
        if not course:
            return _cors_json(404, {"detail": "Course not found"}, request)

        try:
            pricing = await coupon_service.resolve_payable_amount(
                db,
                course=course,
                coupon_code=data.coupon_code,
                user_id=current_user.id,
            )
        except ValueError as e:
            return _cors_json(400, {"detail": str(e)}, request)

        amount_value = int(pricing["final_amount"])
        if amount_value < 0:
            return _cors_json(400, {"detail": "Course price is invalid"}, request)

        # 100% coupon / free after discount — unlock without Razorpay.
        if amount_value <= 0:
            await _unlock_paid_enrollment(db, current_user.id, course.id)
            if pricing.get("coupon_code"):
                await coupon_service.record_coupon_redemption(
                    db,
                    coupon_code=pricing["coupon_code"],
                    user_id=current_user.id,
                    course_id=course.id,
                    original_amount=int(pricing["original_amount"]),
                    discount_amount=int(pricing["discount_amount"]),
                    final_amount=0,
                    order_id=None,
                )
            return _cors_json(200, {
                "free": True,
                "amount": 0,
                "currency": "INR",
                "original_amount": pricing["original_amount"],
                "discount_amount": pricing["discount_amount"],
                "final_amount": 0,
                "coupon_code": pricing.get("coupon_code"),
                "message": "Coupon applied. Course unlocked for free.",
                "key_id": RAZORPAY_KEY_ID,
            }, request)

        if not _razorpay_configured():
            return _cors_json(400, {
                "detail": "Razorpay is not configured on the server (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).",
            }, request)

        rzp = get_razorpay_client()
        order_data = {
            "amount": amount_value * 100,
            "currency": "INR",
            "payment_capture": 1,
            "notes": {
                "course_id": str(data.course_id),
                "user_id": str(current_user.id),
                "coupon_code": str(pricing.get("coupon_code") or ""),
                "original_amount": str(pricing["original_amount"]),
                "discount_amount": str(pricing["discount_amount"]),
            },
        }
        try:
            order = await asyncio.wait_for(
                asyncio.to_thread(rzp.order.create, data=order_data),
                timeout=15,
            )
        except asyncio.TimeoutError:
            logger.exception("Razorpay order creation timed out for course %s", data.course_id)
            return _cors_json(400, {"detail": "Payment gateway timed out. Please try again."}, request)
        except Exception as e:
            logger.exception("Razorpay order creation failed for course %s: %s", data.course_id, e)
            return _cors_json(400, {
                "detail": f"Could not start payment with Razorpay: {e}",
            }, request)

        order_payload = dict(order) if not isinstance(order, dict) else dict(order)
        order_payload["key_id"] = RAZORPAY_KEY_ID
        order_payload["original_amount"] = pricing["original_amount"]
        order_payload["discount_amount"] = pricing["discount_amount"]
        order_payload["final_amount"] = amount_value
        order_payload["coupon_code"] = pricing.get("coupon_code")
        order_payload["free"] = False
        return _cors_json(200, order_payload, request)
    except HTTPException as he:
        code = he.status_code if 400 <= int(he.status_code) < 500 else 400
        detail = he.detail if isinstance(he.detail, str) else "Payment could not be started."
        return _cors_json(code, {"detail": detail}, request)
    except Exception as e:
        logger.exception("create-order crashed: %s", e)
        return _cors_json(400, {"detail": f"Payment could not be started: {e}"}, request)

@app.post("/api/v1/payment/verify")
async def verify_payment_and_unlock_course(
    payload: PaymentVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    rzp = get_razorpay_client()

    res = await db.execute(select(models.Course).where(models.Course.id == payload.course_id))
    course = res.scalars().first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    try:
        pricing = await coupon_service.resolve_payable_amount(
            db,
            course=course,
            coupon_code=payload.coupon_code,
            user_id=current_user.id,
            for_payment_verify=True,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        await asyncio.to_thread(
            rzp.utility.verify_payment_signature,
            {
                "razorpay_order_id": payload.razorpay_order_id,
                "razorpay_payment_id": payload.razorpay_payment_id,
                "razorpay_signature": payload.razorpay_signature
            }
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    try:
        payment = await asyncio.wait_for(
            asyncio.to_thread(rzp.payment.fetch, payload.razorpay_payment_id),
            timeout=15,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=400, detail="Could not verify payment (gateway timeout). Contact support with your payment ID.")
    except Exception as e:
        logger.exception("Razorpay payment fetch failed: %s", e)
        raise HTTPException(status_code=400, detail=f"Unable to fetch payment details: {str(e)}")

    expected_amount = int(pricing["final_amount"]) * 100
    paid_amount = int(payment.get("amount") or 0)
    payment_status = str(payment.get("status") or "").lower()
    if paid_amount != expected_amount:
        raise HTTPException(status_code=400, detail="Payment amount mismatch")
    if payment_status not in {"captured", "authorized"}:
        raise HTTPException(status_code=400, detail=f"Payment not successful (status: {payment_status or 'unknown'})")

    await _unlock_paid_enrollment(db, current_user.id, payload.course_id)
    if pricing.get("coupon_code"):
        await coupon_service.record_coupon_redemption(
            db,
            coupon_code=pricing["coupon_code"],
            user_id=current_user.id,
            course_id=payload.course_id,
            original_amount=int(pricing["original_amount"]),
            discount_amount=int(pricing["discount_amount"]),
            final_amount=int(pricing["final_amount"]),
            order_id=payload.razorpay_order_id,
        )
    return {"message": "Payment verified. Course unlocked.", "status": "success"}

@app.post("/api/v1/submit-assignment")
async def submit_assignment(file: UploadFile = File(...), lesson_title: str = Form(...), lesson_id: int = Form(None), db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if lesson_id:
        res = await db.execute(select(models.ContentItem).where(models.ContentItem.id == lesson_id))
    else:
        # Fallback to legacy title matching (deprecated but kept for safety)
        res = await db.execute(select(models.ContentItem).where(models.ContentItem.title == lesson_title, models.ContentItem.type == "assignment"))
    
    assignment_data = res.scalars().first()
    
    content = await file.read()
    safe_filename = f"{current_user.full_name}_{file.filename}"
    drive_status = "Not Uploaded"

    if assignment_data and assignment_data.content:
        file_stream = io.BytesIO(content)
        # Run sync drive upload in thread
        file_id = await asyncio.to_thread(upload_file_to_drive, file_stream, safe_filename, assignment_data.content)
        if file_id: drive_status = "Uploaded"
    
    # Local Backup
    os.makedirs("assignments_backup", exist_ok=True)
    with open(f"assignments_backup/{safe_filename}", "wb") as f: f.write(content)
    
    # ✅ FIX: Record Submission in Database
    if assignment_data:
        # Check if already submitted to avoid duplicates? Maybe just add new one.
        # For now, simplistic approach: append new submission.
        new_sub = models.Submission(
            user_id=current_user.id, 
            content_item_id=assignment_data.id, 
            drive_link=f"Uploaded: {safe_filename}", 
            status="Submitted"
        )
        db.add(new_sub)

        # Mark Progress
        prog_res = await db.execute(select(models.LessonProgress).where(models.LessonProgress.user_id == current_user.id, models.LessonProgress.content_item_id == assignment_data.id))
        if not prog_res.scalars().first():
            db.add(models.LessonProgress(user_id=current_user.id, content_item_id=assignment_data.id, is_completed=True))
        
        await db.commit()

        cert = await certificate_service.issue_after_content_complete(
            db, current_user, assignment_data.id
        )
        payload = {
            "message": "Submitted",
            "drive_status": drive_status,
            **certificate_service.certificate_response_payload(cert),
        }
        return payload

    return {"message": "Submitted", "drive_status": drive_status, "certificate_issued": False}

@app.post("/api/v1/confirm-submission")
async def confirm_submission(req: ConfirmationRequest, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    res = await db.execute(select(models.ContentItem).options(selectinload(models.ContentItem.module)).where(models.ContentItem.title == req.lesson_title, models.ContentItem.type == "assignment"))
    assignment = res.scalars().first()
    if not assignment: raise HTTPException(status_code=404)

    # 1. Create Submission Record
    new_sub = models.Submission(user_id=current_user.id, content_item_id=assignment.id, drive_link=f"Uploaded: {req.file_name}", status="Submitted")
    db.add(new_sub)

    # 2. Mark Lesson as Complete (Green Tick)
    prog_res = await db.execute(select(models.LessonProgress).where(models.LessonProgress.user_id == current_user.id, models.LessonProgress.content_item_id == assignment.id))
    if not prog_res.scalars().first():
        db.add(models.LessonProgress(user_id=current_user.id, content_item_id=assignment.id, is_completed=True))
    
    await db.commit()

    cert = await certificate_service.issue_after_content_complete(
        db, current_user, assignment.id
    )
    return {
        "message": "Submitted",
        **certificate_service.certificate_response_payload(cert),
    }
# In main.py

@app.get("/api/v1/instructor/dashboard-stats")
async def instructor_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    """Revenue from paid enrollments only (not per registered user)."""
    course_scope = []
    if current_user.role == "instructor" and not is_super_admin_email(current_user.email):
        course_scope.append(models.Course.instructor_id == current_user.id)

    revenue_query = (
        select(func.coalesce(func.sum(models.Course.price), 0))
        .select_from(models.Enrollment)
        .join(models.Course, models.Enrollment.course_id == models.Course.id)
        .where(models.Enrollment.enrollment_type == "paid")
    )
    if course_scope:
        revenue_query = revenue_query.where(*course_scope)
    revenue_row = await db.execute(revenue_query)
    revenue = int(revenue_row.scalar() or 0)

    students_query = select(func.count(models.User.id)).where(models.User.role == "student")
    students_row = await db.execute(students_query)
    student_count = int(students_row.scalar() or 0)

    courses_query = select(func.count(models.Course.id))
    if course_scope:
        courses_query = courses_query.where(*course_scope)
    courses_row = await db.execute(courses_query)
    course_count = int(courses_row.scalar() or 0)

    since = datetime.utcnow() - timedelta(days=30)
    enroll_query = select(func.count(models.Enrollment.id)).where(models.Enrollment.enrolled_at >= since)
    if course_scope:
        enroll_query = enroll_query.join(models.Course, models.Enrollment.course_id == models.Course.id).where(
            *course_scope
        )
    enroll_row = await db.execute(enroll_query)
    new_enrollments = int(enroll_row.scalar() or 0)

    return {
        "revenue": revenue,
        "students": student_count,
        "courses": course_count,
        "new_enrollments": new_enrollments,
    }


@app.get("/api/v1/admin/students")
async def get_all_students(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    # 1. REMOVED THE BROAD TRY/EXCEPT BLOCK so real errors raise 500 instead of returning []
    
    # Optimized: Fetch students + enrollments + course names
    res = await db.execute(
        select(models.User)
        .options(selectinload(models.User.enrollments).selectinload(models.Enrollment.course))
        .where(models.User.role == "student")
    )
    students = res.scalars().all()
    
    real_data = []
    for s in students:
        # 2. Safely get course names (Handle missing relationships)
        course_names = []
        # Check if 'enrollments' exists safely
        user_enrollments = getattr(s, "enrollments", [])
        if user_enrollments:
            course_names = [e.course.title for e in user_enrollments if e.course]

        # 3. Safely format Date (Fixes the crash if created_at is missing/None)
        join_date = "N/A"
        # Check if 'created_at' exists on the model and is not None
        created_at_val = getattr(s, "created_at", None)
        
        if created_at_val:
            try:
                # If it's already a string, use it; otherwise format datetime
                if isinstance(created_at_val, str):
                    join_date = created_at_val
                else:
                    join_date = created_at_val.strftime("%Y-%m-%d")
            except Exception:
                join_date = str(created_at_val)

        real_data.append({ 
            "id": s.id, 
            "full_name": s.full_name, 
            "email": s.email, 
            "joined_at": join_date, 
            "enrolled_courses": course_names 
        })
        
    return real_data

@app.delete("/api/v1/admin/students/{user_id}")
async def delete_student(user_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    # 1. Find the student
    res = await db.execute(select(models.User).where(models.User.id == user_id))
    student = res.scalars().first()
    
    if not student: 
        raise HTTPException(status_code=404, detail="Student not found")
    
    # 2. ✅ HARD DELETE LOGIC (Permanent Removal)
    try:
        # Delete related Enrollments
        await db.execute(delete(models.Enrollment).where(models.Enrollment.user_id == user_id))
        
        # Delete related Submissions
        await db.execute(delete(models.Submission).where(models.Submission.user_id == user_id))
        
        # Delete related Test Results
        await db.execute(delete(models.TestResult).where(models.TestResult.user_id == user_id))
        
        # Delete related Lesson Progress
        await db.execute(delete(models.LessonProgress).where(models.LessonProgress.user_id == user_id))
        
        # Delete related Certificates
        await db.execute(delete(models.UserCertificate).where(models.UserCertificate.user_id == user_id))
        
        # Delete related Notifications
        await db.execute(delete(models.Notification).where(models.Notification.user_id == user_id))
        
        # Delete related Challenge Progress
        await db.execute(delete(models.ChallengeProgress).where(models.ChallengeProgress.user_id == user_id))

        # Finally, delete the User
        await db.delete(student)
        await db.commit()
        
        return {"message": "Student permanently removed from the database."}

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete student: {str(e)}")


@app.patch("/api/v1/admin/students/{user_id}/reset-password")
async def reset_student_password(user_id: int, req: PasswordChange, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    # 1. Find Student
    result = await db.execute(select(models.User).where(models.User.id == user_id))
    student = result.scalars().first()
    
    if not student: 
        raise HTTPException(status_code=404, detail="Student not found")
    
    # 2. Reset Password
    student.hashed_password = get_password_hash(req.new_password)
    await db.commit()
    
    return {"message": f"Password for {student.full_name} has been reset."}

@app.delete("/api/v1/courses/{course_id}")
async def delete_course(course_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    res = await db.execute(select(models.Course).where(models.Course.id == course_id))
    course = res.scalars().first()
    if course:
        await db.delete(course)
        await db.commit()
    return {"message": "Deleted"}

# Live Sessions
@app.post("/api/v1/live/start")
async def start_live_session(req: LiveSessionRequest, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    # Deactivate old
    old_res = await db.execute(select(models.LiveSession).where(models.LiveSession.instructor_id == current_user.id, models.LiveSession.is_active == True))
    for s in old_res.scalars().all(): s.is_active = False
    
    new_session = models.LiveSession(instructor_id=current_user.id, youtube_url=req.youtube_url, topic=req.topic, is_active=True)
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    return {"message": "Started", "session_id": new_session.id}

@app.get("/api/v1/live/active")
async def get_active_live_sessions(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(models.LiveSession).where(models.LiveSession.is_active == True))
    return res.scalars().all()

@app.post("/api/v1/live/end/{session_id}")
async def end_live_session(session_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    res = await db.execute(select(models.LiveSession).where(models.LiveSession.id == session_id))
    session = res.scalars().first()
    if session:
        session.is_active = False
        await db.commit()
    return {"message": "Ended"}

# Dashboard optimized
@app.get("/api/v1/instructor/assignments")
async def get_assignment_dashboard(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    # ⚡ OPTIMIZED DASHBOARD QUERY
    # Fetch Courses + Modules + Items(Assignment) + Submissions + Student
    # This prevents the 10,000 query crash loop.
    query = (
        select(models.Course)
        .options(
            selectinload(models.Course.modules)
            .selectinload(models.Module.items)
        )
    )
    if current_user.role == "instructor" and not is_super_admin_email(current_user.email):
        query = query.where(models.Course.instructor_id == current_user.id)
    result = await db.execute(query)
    courses = result.scalars().all()
    
    # Batch fetch all students
    all_students_res = await db.execute(select(models.User).where(models.User.role == "student"))
    all_students = all_students_res.scalars().all()
    student_map = {s.id: s for s in all_students}

    # Batch fetch enrollments
    enroll_res = await db.execute(select(models.Enrollment))
    all_enrollments = enroll_res.scalars().all()
    
    # Process in memory (Fast Python is better than N+1 DB calls)
    dashboard_data = []
    
    for course in courses:
        course_data = { "course_id": course.id, "course_title": course.title, "assignment_tasks": [] }
        
        # Get students for this course
        enrolled_ids = [e.user_id for e in all_enrollments if e.course_id == course.id]
        
        for module in course.modules:
            for item in module.items:
                if item.type == "assignment":
                    # Get submissions for this item (Need a relationship or separate query. For strictness, separate query is safer here if relationship missing)
                    # To keep it async safe:
                    sub_res = await db.execute(select(models.Submission).where(models.Submission.content_item_id == item.id))
                    submissions = sub_res.scalars().all()
                    
                    submitted_list = []
                    submitted_ids = set()
                    
                    for sub in submissions:
                        student = student_map.get(sub.user_id)
                        if not student: continue
                        submitted_ids.add(sub.user_id)
                        clean_name = sub.drive_link.replace("Uploaded: ", "").strip()
                        smart_link = f"https://drive.google.com/drive/search?q=name contains '{clean_name}'"
                        submitted_list.append({
                            "submission_id": sub.id, "student_name": student.full_name, 
                            "file_name": clean_name, "drive_search_link": smart_link, 
                            "status": sub.status, "submitted_at": sub.submitted_at.strftime("%Y-%m-%d")
                        })
                    
                    pending_list = []
                    for sid in enrolled_ids:
                        if sid not in submitted_ids and sid in student_map:
                            s = student_map[sid]
                            pending_list.append({"student_id": s.id, "student_name": s.full_name, "email": s.email})
                    
                    course_data["assignment_tasks"].append({
                        "task_id": item.id, "task_title": item.title, 
                        "submitted": submitted_list, "pending": pending_list
                    })
        
        dashboard_data.append(course_data)
        
    return dashboard_data

@app.post("/api/v1/instructor/verify-assignment/{submission_id}")
async def verify_assignment(submission_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    res = await db.execute(select(models.Submission).where(models.Submission.id == submission_id))
    sub = res.scalars().first()
    if not sub: raise HTTPException(status_code=404)
    
    # 1. Update Status
    sub.status = "Verified"
    
    # 2. Ensure Progress is Marked Complete
    prog_res = await db.execute(select(models.LessonProgress).where(models.LessonProgress.user_id == sub.user_id, models.LessonProgress.content_item_id == sub.content_item_id))
    progress = prog_res.scalars().first()
    if not progress:
        db.add(models.LessonProgress(user_id=sub.user_id, content_item_id=sub.content_item_id, is_completed=True))
    else:
        progress.is_completed = True
        
    await db.commit()

    student_res = await db.execute(select(models.User).where(models.User.id == sub.user_id))
    student = student_res.scalars().first()
    if student:
        await certificate_service.issue_after_content_complete(db, student, sub.content_item_id)
    
    return {"message": "Verified"}

# 1. Toggle Item Completion (The Green Tick)
@app.post("/api/v1/content/{item_id}/complete")
async def mark_item_complete(item_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Check if progress record exists
    res = await db.execute(select(models.LessonProgress).where(
        models.LessonProgress.user_id == current_user.id, 
        models.LessonProgress.content_item_id == item_id
    ))
    progress = res.scalars().first()

    if not progress:
        # Create new record as completed
        progress = models.LessonProgress(user_id=current_user.id, content_item_id=item_id, is_completed=True)
        db.add(progress)
    else:
        # If it exists, ensure it is true (or toggle if you prefer, but usually 'mark as read' is one-way or explicit)
        progress.is_completed = True
        
    await db.commit()
    cert = await certificate_service.issue_after_content_complete(db, current_user, item_id)
    payload = {"message": "Marked as complete", "status": "success", "certificate_issued": bool(cert)}
    if cert:
        payload["certificate"] = certificate_service.serialize_certificate(cert)
    return payload


# --- Native Quiz helpers & APIs ---

VALID_QUIZ_TYPES = {"single", "true_false", "multi", "matching"}


async def _clone_quiz_questions(db: AsyncSession, source_item_id: int, target_item_id: int):
    """Copy quiz questions/options from one content item to another (library clone)."""
    questions = await _load_quiz_questions(source_item_id, db)
    for q in questions:
        nq = models.QuizQuestion(
            content_item_id=target_item_id,
            prompt=q.prompt,
            question_type=q.question_type,
            order=q.order,
            points=q.points or 1,
        )
        db.add(nq)
        await db.flush()
        for o in sorted(q.options or [], key=lambda x: (x.order is None, x.order if x.order is not None else 10**9, x.id)):
            db.add(
                models.QuizOption(
                    question_id=nq.id,
                    label=o.label,
                    is_correct=bool(o.is_correct),
                    order=o.order,
                    match_side=getattr(o, "match_side", None),
                    match_key=getattr(o, "match_key", None),
                )
            )


async def _get_quiz_item_with_course(item_id: int, db: AsyncSession):
    res = await db.execute(
        select(models.ContentItem, models.Module, models.Course)
        .join(models.Module, models.ContentItem.module_id == models.Module.id)
        .join(models.Course, models.Module.course_id == models.Course.id)
        .where(models.ContentItem.id == item_id)
    )
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Content item not found")
    item, module, course = row
    return item, module, course


async def _ensure_enrolled_or_staff(user: models.User, course_id: int, db: AsyncSession):
    if _is_staff(user):
        return
    enrol = await db.execute(
        select(models.Enrollment).where(
            models.Enrollment.user_id == user.id,
            models.Enrollment.course_id == course_id,
        )
    )
    if not enrol.scalars().first():
        raise HTTPException(status_code=403, detail="Not enrolled in this course")


def _serialize_quiz_question(q: models.QuizQuestion, include_correct: bool = True) -> dict:
    opts = sorted(q.options or [], key=lambda o: (o.order is None, o.order if o.order is not None else 10**9, o.id))
    serialized_opts = []
    for o in opts:
        row = {
            "id": o.id,
            "label": o.label,
            "order": o.order,
            "match_side": getattr(o, "match_side", None),
        }
        if include_correct:
            row["is_correct"] = bool(o.is_correct)
            row["match_key"] = getattr(o, "match_key", None)
        serialized_opts.append(row)
    return {
        "id": q.id,
        "prompt": q.prompt,
        "question_type": q.question_type,
        "order": q.order,
        "points": q.points or 1,
        "options": serialized_opts,
    }


def _grade_matching(question: models.QuizQuestion, match_map: Optional[Dict[str, int]]) -> Tuple[bool, int]:
    points = question.points or 1
    lefts = [o for o in (question.options or []) if (getattr(o, "match_side", None) or "").lower() == "left"]
    rights_by_key = {
        (getattr(o, "match_key", None) or ""): o.id
        for o in (question.options or [])
        if (getattr(o, "match_side", None) or "").lower() == "right"
    }
    if not lefts or not rights_by_key:
        return False, 0
    mmap = match_map or {}
    for left in lefts:
        key = getattr(left, "match_key", None) or ""
        expected_right = rights_by_key.get(key)
        if expected_right is None:
            return False, 0
        got = mmap.get(str(left.id))
        if got is None:
            got = mmap.get(left.id) if isinstance(mmap, dict) else None  # type: ignore
        try:
            got_int = int(got) if got is not None else None
        except (TypeError, ValueError):
            got_int = None
        if got_int != expected_right:
            return False, 0
    return True, points


def _grade_selection(
    question: models.QuizQuestion,
    selected_ids: List[int],
    match_map: Optional[Dict[str, int]] = None,
) -> Tuple[bool, int]:
    points = question.points or 1
    if question.question_type == "matching":
        return _grade_matching(question, match_map)
    correct_ids = {o.id for o in (question.options or []) if o.is_correct}
    selected_set = set(selected_ids or [])
    if question.question_type == "multi":
        ok = selected_set == correct_ids and len(correct_ids) > 0
    else:
        # single / true_false: exactly one correct option
        ok = len(selected_set) == 1 and selected_set == correct_ids
    return ok, (points if ok else 0)


async def _load_quiz_questions(item_id: int, db: AsyncSession) -> List[models.QuizQuestion]:
    res = await db.execute(
        select(models.QuizQuestion)
        .options(selectinload(models.QuizQuestion.options))
        .where(models.QuizQuestion.content_item_id == item_id)
        .order_by(models.QuizQuestion.order, models.QuizQuestion.id)
    )
    return list(res.scalars().all())


async def _load_bank_quiz_questions(quiz_id: int, db: AsyncSession) -> List[models.QuizQuestion]:
    res = await db.execute(
        select(models.QuizQuestion)
        .options(selectinload(models.QuizQuestion.options))
        .where(models.QuizQuestion.quiz_id == quiz_id)
        .order_by(models.QuizQuestion.order, models.QuizQuestion.id)
    )
    return list(res.scalars().all())


async def _get_bank_quiz_or_404(quiz_id: int, db: AsyncSession) -> models.Quiz:
    res = await db.execute(select(models.Quiz).where(models.Quiz.id == quiz_id))
    quiz = res.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz


def _can_manage_bank_quiz(user: models.User, quiz: models.Quiz) -> bool:
    if not _is_staff(user):
        return False
    if user.role == "admin" or is_super_admin_email(user.email):
        return True
    return quiz.creator_id is None or quiz.creator_id == user.id


async def _serialize_bank_quiz(
    quiz: models.Quiz,
    db: AsyncSession,
    *,
    include_questions: bool = False,
    include_correct: bool = True,
) -> dict:
    assign_res = await db.execute(
        select(models.QuizCourseAssignment.course_id).where(models.QuizCourseAssignment.quiz_id == quiz.id)
    )
    course_ids = list(assign_res.scalars().all())
    q_count = 0
    questions_payload = None
    if include_questions:
        questions = await _load_bank_quiz_questions(quiz.id, db)
        q_count = len(questions)
        questions_payload = [_serialize_quiz_question(q, include_correct=include_correct) for q in questions]
    else:
        count_res = await db.execute(
            select(func.count()).select_from(models.QuizQuestion).where(models.QuizQuestion.quiz_id == quiz.id)
        )
        q_count = int(count_res.scalar() or 0)
    max_attempts = getattr(quiz, "max_attempts", None)
    payload = {
        "id": quiz.id,
        "title": quiz.title,
        "description": quiz.description,
        "image_url": getattr(quiz, "image_url", None),
        "pass_percent": quiz.pass_percent if quiz.pass_percent is not None else 70,
        "duration": quiz.duration,
        "max_attempts": max_attempts if max_attempts and int(max_attempts) > 0 else None,
        "is_published": bool(quiz.is_published),
        "creator_id": quiz.creator_id,
        "created_at": quiz.created_at.isoformat() if quiz.created_at else None,
        "course_ids": course_ids,
        "question_count": q_count,
    }
    if questions_payload is not None:
        payload["questions"] = questions_payload
    return payload


async def _set_quiz_assignments(db: AsyncSession, quiz_id: int, course_ids: List[int]):
    await db.execute(
        delete(models.QuizCourseAssignment).where(models.QuizCourseAssignment.quiz_id == quiz_id)
    )
    unique_ids = sorted({int(cid) for cid in (course_ids or []) if cid})
    if unique_ids:
        courses = await db.execute(select(models.Course.id).where(models.Course.id.in_(unique_ids)))
        found = set(courses.scalars().all())
        missing = [cid for cid in unique_ids if cid not in found]
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown course ids: {missing}")
        for cid in unique_ids:
            db.add(models.QuizCourseAssignment(quiz_id=quiz_id, course_id=cid))


def _normalize_question_options(qtype: str, q_in: QuizQuestionInput, qi: int) -> List[dict]:
    if qtype == "matching":
        options_in = []
        for i, o in enumerate(q_in.options or []):
            side = (o.match_side or "").strip().lower()
            key = (o.match_key or "").strip()
            label = (o.label or "").strip()
            if not label or side not in ("left", "right") or not key:
                continue
            options_in.append({
                "label": label,
                "is_correct": False,
                "order": o.order if o.order is not None else i,
                "match_side": side,
                "match_key": key,
            })
        lefts = [o for o in options_in if o["match_side"] == "left"]
        rights = [o for o in options_in if o["match_side"] == "right"]
        if len(lefts) < 1 or len(rights) < 1:
            raise HTTPException(status_code=400, detail=f"Question {qi + 1}: matching needs left and right items")
        left_keys = {o["match_key"] for o in lefts}
        right_keys = {o["match_key"] for o in rights}
        if left_keys != right_keys:
            raise HTTPException(status_code=400, detail=f"Question {qi + 1}: matching left/right keys must pair")
        return options_in

    options_in = [
        {
            "label": (o.label or "").strip(),
            "is_correct": bool(o.is_correct),
            "order": o.order if o.order is not None else i,
            "match_side": None,
            "match_key": None,
        }
        for i, o in enumerate(q_in.options or [])
    ]
    if qtype == "true_false":
        if len(options_in) < 2:
            options_in = [
                {"label": "True", "is_correct": False, "order": 0, "match_side": None, "match_key": None},
                {"label": "False", "is_correct": False, "order": 1, "match_side": None, "match_key": None},
            ]
        if not any(o["is_correct"] for o in options_in):
            options_in[0]["is_correct"] = True

    if len(options_in) < 2:
        raise HTTPException(status_code=400, detail=f"Question {qi + 1} needs at least 2 options")

    correct_count = sum(1 for o in options_in if o["is_correct"])
    if qtype == "multi":
        if correct_count < 1:
            raise HTTPException(status_code=400, detail=f"Question {qi + 1}: mark at least one correct option")
    else:
        if correct_count != 1:
            raise HTTPException(status_code=400, detail=f"Question {qi + 1}: mark exactly one correct option")
    return options_in


async def _replace_questions_for_owner(
    db: AsyncSession,
    questions_in: List[QuizQuestionInput],
    *,
    content_item_id: Optional[int] = None,
    quiz_id: Optional[int] = None,
):
    if content_item_id is not None:
        existing_qs = await _load_quiz_questions(content_item_id, db)
    elif quiz_id is not None:
        existing_qs = await _load_bank_quiz_questions(quiz_id, db)
    else:
        raise ValueError("content_item_id or quiz_id required")

    existing_q_ids = [q.id for q in existing_qs]
    if existing_q_ids:
        await db.execute(delete(models.QuizOption).where(models.QuizOption.question_id.in_(existing_q_ids)))
        await db.execute(delete(models.QuizQuestion).where(models.QuizQuestion.id.in_(existing_q_ids)))
        await db.flush()

    for qi, q_in in enumerate(questions_in or []):
        qtype = (q_in.question_type or "single").strip().lower()
        if qtype not in VALID_QUIZ_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid question_type: {qtype}")
        prompt = (q_in.prompt or "").strip()
        if not prompt:
            raise HTTPException(status_code=400, detail=f"Question {qi + 1} is missing a prompt")
        options_in = _normalize_question_options(qtype, q_in, qi)
        q = models.QuizQuestion(
            content_item_id=content_item_id,
            quiz_id=quiz_id,
            prompt=prompt,
            question_type=qtype,
            order=q_in.order if q_in.order is not None else qi,
            points=max(1, int(q_in.points or 1)),
        )
        db.add(q)
        await db.flush()
        for oi, o_in in enumerate(options_in):
            label = o_in["label"]
            if not label:
                raise HTTPException(status_code=400, detail=f"Question {qi + 1} has an empty option")
            db.add(
                models.QuizOption(
                    question_id=q.id,
                    label=label,
                    is_correct=bool(o_in["is_correct"]),
                    order=int(o_in["order"]) if o_in["order"] is not None else oi,
                    match_side=o_in.get("match_side"),
                    match_key=o_in.get("match_key"),
                )
            )


@app.get("/api/v1/content/{item_id}/quiz")
async def get_quiz_admin(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    item, _module, course = await _get_quiz_item_with_course(item_id, db)
    if not _can_manage_course(current_user, course):
        raise HTTPException(status_code=403, detail="Not authorized")
    if item.type != "quiz":
        raise HTTPException(status_code=400, detail="Item is not a quiz")
    questions = await _load_quiz_questions(item_id, db)
    return {
        "content_item_id": item.id,
        "title": item.title,
        "duration": item.duration,
        "pass_percent": item.pass_percent if item.pass_percent is not None else 70,
        "questions": [_serialize_quiz_question(q, include_correct=True) for q in questions],
    }


@app.put("/api/v1/content/{item_id}/quiz")
async def put_quiz_admin(
    item_id: int,
    body: QuizPutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    item, _module, course = await _get_quiz_item_with_course(item_id, db)
    if not _can_manage_course(current_user, course):
        raise HTTPException(status_code=403, detail="Not authorized")
    if item.type != "quiz":
        raise HTTPException(status_code=400, detail="Item is not a quiz")

    if body.title is not None and body.title.strip():
        item.title = body.title.strip()
    if body.duration is not None:
        item.duration = body.duration
    if body.pass_percent is not None:
        item.pass_percent = max(0, min(100, int(body.pass_percent)))
    elif item.pass_percent is None:
        item.pass_percent = 70

    await _replace_questions_for_owner(db, body.questions or [], content_item_id=item.id)

    await db.commit()
    questions = await _load_quiz_questions(item_id, db)
    return {
        "message": "Quiz saved",
        "content_item_id": item.id,
        "pass_percent": item.pass_percent if item.pass_percent is not None else 70,
        "questions": [_serialize_quiz_question(q, include_correct=True) for q in questions],
    }


@app.get("/api/v1/content/{item_id}/quiz/take")
async def get_quiz_take(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item, _module, course = await _get_quiz_item_with_course(item_id, db)
    if item.type != "quiz":
        raise HTTPException(status_code=400, detail="Item is not a quiz")
    await _ensure_enrolled_or_staff(current_user, course.id, db)
    questions = await _load_quiz_questions(item_id, db)
    return {
        "content_item_id": item.id,
        "title": item.title,
        "duration": item.duration,
        "pass_percent": item.pass_percent if item.pass_percent is not None else 70,
        "question_count": len(questions),
        "questions": [_serialize_quiz_question(q, include_correct=False) for q in questions],
    }


@app.get("/api/v1/content/{item_id}/quiz/my-attempts")
async def get_my_quiz_attempts(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item, _module, course = await _get_quiz_item_with_course(item_id, db)
    if item.type != "quiz":
        raise HTTPException(status_code=400, detail="Item is not a quiz")
    await _ensure_enrolled_or_staff(current_user, course.id, db)

    res = await db.execute(
        select(models.QuizAttempt)
        .where(
            models.QuizAttempt.content_item_id == item_id,
            models.QuizAttempt.user_id == current_user.id,
        )
        .order_by(models.QuizAttempt.submitted_at.desc(), models.QuizAttempt.id.desc())
    )
    attempts = list(res.scalars().all())
    best = max((a.percent or 0 for a in attempts), default=None)
    pass_pct = item.pass_percent if item.pass_percent is not None else 70
    return {
        "content_item_id": item.id,
        "pass_percent": pass_pct,
        "attempt_count": len(attempts),
        "best_percent": best,
        "passed": best is not None and best >= pass_pct,
        "attempts": [
            {
                "id": a.id,
                "score": a.score,
                "max_score": a.max_score,
                "percent": a.percent,
                "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
            }
            for a in attempts
        ],
    }


@app.post("/api/v1/content/{item_id}/quiz/submit")
async def submit_quiz(
    item_id: int,
    body: QuizSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item, _module, course = await _get_quiz_item_with_course(item_id, db)
    if item.type != "quiz":
        raise HTTPException(status_code=400, detail="Item is not a quiz")
    await _ensure_enrolled_or_staff(current_user, course.id, db)

    questions = await _load_quiz_questions(item_id, db)
    if not questions:
        raise HTTPException(status_code=400, detail="This quiz has no questions yet")

    answer_by_q = {a.question_id: a for a in (body.answers or [])}
    total_points = 0
    earned = 0
    review = []

    attempt = models.QuizAttempt(
        content_item_id=item.id,
        user_id=current_user.id,
        score=0,
        max_score=0,
        percent=0,
        started_at=datetime.utcnow(),
        submitted_at=datetime.utcnow(),
    )
    db.add(attempt)
    await db.flush()

    for q in questions:
        ans = answer_by_q.get(q.id)
        selected = list(ans.selected_option_ids or []) if ans else []
        match_map = dict(ans.match_map or {}) if ans and ans.match_map else None
        valid_ids = {o.id for o in (q.options or [])}
        selected = [sid for sid in selected if sid in valid_ids]
        if match_map:
            match_map = {str(k): int(v) for k, v in match_map.items() if int(v) in valid_ids}
        ok, pts = _grade_selection(q, selected, match_map)
        q_points = q.points or 1
        total_points += q_points
        earned += pts
        stored = json.dumps(match_map) if q.question_type == "matching" else json.dumps(selected)
        db.add(
            models.QuizAnswer(
                attempt_id=attempt.id,
                question_id=q.id,
                selected_option_ids=stored,
                is_correct=ok,
                points_awarded=pts,
            )
        )
        if q.question_type == "matching":
            lefts = [o for o in (q.options or []) if (getattr(o, "match_side", None) or "").lower() == "left"]
            rights = {o.id: o for o in (q.options or []) if (getattr(o, "match_side", None) or "").lower() == "right"}
            rights_by_key = {
                (getattr(o, "match_key", None) or ""): o
                for o in (q.options or [])
                if (getattr(o, "match_side", None) or "").lower() == "right"
            }
            selected_opts = []
            correct_opts = []
            for left in lefts:
                rid = (match_map or {}).get(str(left.id))
                if rid and rid in rights:
                    selected_opts.append({"id": left.id, "label": f"{left.label} → {rights[rid].label}"})
                expected = rights_by_key.get(getattr(left, "match_key", None) or "")
                if expected:
                    correct_opts.append({"id": left.id, "label": f"{left.label} → {expected.label}"})
        else:
            correct_opts = [{"id": o.id, "label": o.label} for o in (q.options or []) if o.is_correct]
            selected_opts = [{"id": o.id, "label": o.label} for o in (q.options or []) if o.id in set(selected)]
        review.append({
            "question_id": q.id,
            "prompt": q.prompt,
            "question_type": q.question_type,
            "points": q_points,
            "points_awarded": pts,
            "is_correct": ok,
            "selected_options": selected_opts,
            "correct_options": correct_opts,
        })

    percent = 0 if total_points == 0 else round((earned / total_points) * 100)
    attempt.score = earned
    attempt.max_score = total_points
    attempt.percent = percent

    pass_pct = item.pass_percent if item.pass_percent is not None else 70

    # Best score across attempts (including this one)
    prior = await db.execute(
        select(models.QuizAttempt.percent).where(
            models.QuizAttempt.content_item_id == item.id,
            models.QuizAttempt.user_id == current_user.id,
            models.QuizAttempt.id != attempt.id,
        )
    )
    prior_percents = list(prior.scalars().all())
    best_percent = max([percent] + [p or 0 for p in prior_percents])

    certificate_issued = False
    cert_payload = None
    if best_percent >= pass_pct:
        prog_res = await db.execute(
            select(models.LessonProgress).where(
                models.LessonProgress.user_id == current_user.id,
                models.LessonProgress.content_item_id == item.id,
            )
        )
        progress = prog_res.scalars().first()
        if not progress:
            db.add(
                models.LessonProgress(
                    user_id=current_user.id,
                    content_item_id=item.id,
                    is_completed=True,
                )
            )
        else:
            progress.is_completed = True
        await db.flush()
        cert = await certificate_service.issue_after_content_complete(db, current_user, item.id)
        certificate_issued = bool(cert)
        if cert:
            cert_payload = certificate_service.serialize_certificate(cert)

    await db.commit()

    return {
        "attempt_id": attempt.id,
        "score": earned,
        "max_score": total_points,
        "percent": percent,
        "best_percent": best_percent,
        "pass_percent": pass_pct,
        "passed": percent >= pass_pct,
        "lesson_completed": best_percent >= pass_pct,
        "certificate_issued": certificate_issued,
        "certificate": cert_payload,
        "review": review,
    }


def _build_attempt_answer_rows(questions: List[models.QuizQuestion], attempt: models.QuizAttempt) -> list:
    q_map = {q.id: q for q in questions}
    answer_rows = []
    for ans in attempt.answers or []:
        try:
            raw = json.loads(ans.selected_option_ids or "[]")
        except Exception:
            raw = []
        q = q_map.get(ans.question_id)
        if not q:
            continue
        if q.question_type == "matching" and isinstance(raw, dict):
            lefts = [o for o in (q.options or []) if (getattr(o, "match_side", None) or "").lower() == "left"]
            rights = {o.id: o for o in (q.options or []) if (getattr(o, "match_side", None) or "").lower() == "right"}
            rights_by_key = {
                (getattr(o, "match_key", None) or ""): o
                for o in (q.options or [])
                if (getattr(o, "match_side", None) or "").lower() == "right"
            }
            selected_opts = []
            correct_opts = []
            for left in lefts:
                rid = raw.get(str(left.id))
                try:
                    rid_int = int(rid) if rid is not None else None
                except (TypeError, ValueError):
                    rid_int = None
                if rid_int and rid_int in rights:
                    selected_opts.append({"id": left.id, "label": f"{left.label} → {rights[rid_int].label}"})
                expected = rights_by_key.get(getattr(left, "match_key", None) or "")
                if expected:
                    correct_opts.append({"id": left.id, "label": f"{left.label} → {expected.label}"})
        else:
            selected_ids = raw if isinstance(raw, list) else []
            selected_opts = [{"id": o.id, "label": o.label} for o in (q.options or []) if o.id in set(selected_ids)]
            correct_opts = [{"id": o.id, "label": o.label} for o in (q.options or []) if o.is_correct]
        answer_rows.append({
            "question_id": q.id,
            "prompt": q.prompt,
            "question_type": q.question_type,
            "is_correct": ans.is_correct,
            "points_awarded": ans.points_awarded,
            "points": q.points or 1,
            "selected_options": selected_opts,
            "correct_options": correct_opts,
        })
    return answer_rows


@app.get("/api/v1/quiz-attempts/{attempt_id}")
async def get_quiz_attempt_detail(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    res = await db.execute(
        select(models.QuizAttempt)
        .options(selectinload(models.QuizAttempt.answers))
        .where(models.QuizAttempt.id == attempt_id)
    )
    attempt = res.scalars().first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    is_owner = attempt.user_id == current_user.id
    quiz_title = "Quiz"
    content_item_id = attempt.content_item_id
    bank_quiz_id = attempt.quiz_id

    if attempt.quiz_id:
        quiz = await _get_bank_quiz_or_404(attempt.quiz_id, db)
        quiz_title = quiz.title
        if not is_owner and not _is_staff(current_user):
            raise HTTPException(status_code=403, detail="Not authorized")
        questions = await _load_bank_quiz_questions(quiz.id, db)
    elif attempt.content_item_id:
        item, _module, course = await _get_quiz_item_with_course(attempt.content_item_id, db)
        quiz_title = item.title
        is_staff = _can_manage_course(current_user, course)
        if not is_owner and not is_staff:
            raise HTTPException(status_code=403, detail="Not authorized")
        questions = await _load_quiz_questions(item.id, db)
    else:
        raise HTTPException(status_code=400, detail="Attempt is not linked to a quiz")

    answer_rows = _build_attempt_answer_rows(questions, attempt)

    student_res = await db.execute(select(models.User).where(models.User.id == attempt.user_id))
    student = student_res.scalars().first()

    return {
        "id": attempt.id,
        "content_item_id": content_item_id,
        "quiz_id": bank_quiz_id,
        "quiz_title": quiz_title,
        "score": attempt.score,
        "max_score": attempt.max_score,
        "percent": attempt.percent,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "student": {
            "id": student.id if student else None,
            "name": student.full_name if student else None,
            "email": student.email if student else None,
        },
        "answers": answer_rows,
    }


@app.get("/api/v1/courses/{course_id}/quiz-responses")
async def get_course_quiz_responses(
    course_id: int,
    content_item_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    course_res = await db.execute(select(models.Course).where(models.Course.id == course_id))
    course = course_res.scalars().first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if not _can_manage_course(current_user, course):
        raise HTTPException(status_code=403, detail="Not authorized")

    mods = await db.execute(
        select(models.Module)
        .options(selectinload(models.Module.items))
        .where(models.Module.course_id == course_id)
    )
    modules = list(mods.scalars().all())
    quizzes = []
    for m in modules:
        for item in (m.items or []):
            if item.type == "quiz":
                if content_item_id is not None and item.id != content_item_id:
                    continue
                quizzes.append(item)

    quiz_ids = [q.id for q in quizzes]
    attempts_by_quiz: Dict[int, list] = {qid: [] for qid in quiz_ids}
    if quiz_ids:
        att_res = await db.execute(
            select(models.QuizAttempt, models.User)
            .join(models.User, models.QuizAttempt.user_id == models.User.id)
            .where(models.QuizAttempt.content_item_id.in_(quiz_ids))
            .order_by(models.QuizAttempt.submitted_at.desc())
        )
        for attempt, user in att_res.all():
            attempts_by_quiz.setdefault(attempt.content_item_id, []).append({
                "id": attempt.id,
                "score": attempt.score,
                "max_score": attempt.max_score,
                "percent": attempt.percent,
                "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
                "student_id": user.id,
                "student_name": user.full_name,
                "student_email": user.email,
            })

    # Attempt numbers per student (chronological)
    payload_quizzes = []
    for q in quizzes:
        attempts = attempts_by_quiz.get(q.id, [])
        # Compute attempt # from oldest to newest per student
        chron = sorted(
            attempts,
            key=lambda a: (a.get("submitted_at") or "", a["id"]),
        )
        counters: Dict[int, int] = {}
        numbered = {}
        for a in chron:
            sid = a["student_id"]
            counters[sid] = counters.get(sid, 0) + 1
            numbered[a["id"]] = counters[sid]
        for a in attempts:
            a["attempt_number"] = numbered.get(a["id"], 1)
        payload_quizzes.append({
            "content_item_id": q.id,
            "title": q.title,
            "pass_percent": q.pass_percent if q.pass_percent is not None else 70,
            "attempt_count": len(attempts),
            "attempts": attempts,
        })

    return {
        "course_id": course.id,
        "course_title": course.title,
        "quizzes": payload_quizzes,
    }


@app.get("/api/v1/instructor/quiz-courses")
async def list_instructor_quiz_courses(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    """All draft + published courses for Quiz Responses (excludes coding courses)."""
    from sqlalchemy import or_

    res = await db.execute(
        select(models.Course.id, models.Course.title, models.Course.is_published)
        .where(or_(models.Course.course_type.is_(None), models.Course.course_type != "coding"))
        .order_by(models.Course.title.asc())
    )
    return [
        {"id": row[0], "title": row[1], "is_published": bool(row[2])}
        for row in res.all()
    ]


# --- Standalone quiz bank ---

@app.get("/api/v1/quizzes")
async def list_bank_quizzes(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    q = select(models.Quiz).order_by(models.Quiz.created_at.desc(), models.Quiz.id.desc())
    if current_user.role != "admin" and not is_super_admin_email(current_user.email):
        q = q.where(models.Quiz.creator_id == current_user.id)
    res = await db.execute(q)
    quizzes = list(res.scalars().all())
    return [await _serialize_bank_quiz(quiz, db) for quiz in quizzes]


@app.post("/api/v1/quizzes")
async def create_bank_quiz(
    body: BankQuizCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    quiz = models.Quiz(
        title=title,
        description=(body.description or "").strip() or None,
        image_url=(body.image_url or "").strip() or None,
        pass_percent=max(0, min(100, int(body.pass_percent if body.pass_percent is not None else 70))),
        duration=body.duration,
        max_attempts=_normalize_max_attempts(body.max_attempts),
        is_published=bool(body.is_published),
        creator_id=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(quiz)
    await db.flush()
    if body.course_ids:
        await _set_quiz_assignments(db, quiz.id, body.course_ids)
    await db.commit()
    quiz = await _get_bank_quiz_or_404(quiz.id, db)
    return await _serialize_bank_quiz(quiz, db, include_questions=True)


@app.get("/api/v1/quizzes/available")
async def list_available_bank_quizzes(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Published standalone quizzes for logged-in students (and staff preview)."""
    res = await db.execute(
        select(models.Quiz)
        .where(models.Quiz.is_published == True)  # noqa: E712
        .order_by(models.Quiz.title.asc())
    )
    quizzes = list(res.scalars().all())
    out = []
    for quiz in quizzes:
        payload = await _serialize_bank_quiz(quiz, db)
        stats = await _bank_quiz_attempt_stats(quiz, current_user.id, db)
        payload["attempt_count"] = stats["attempt_count"]
        payload["best_percent"] = stats["best_percent"]
        payload["passed"] = stats["passed"]
        payload["max_attempts"] = stats["max_attempts"]
        payload["attempts_remaining"] = stats["attempts_remaining"]
        payload["can_attempt"] = stats["can_attempt"]
        out.append(payload)
    return out


@app.get("/api/v1/quizzes/template.xlsx")
async def download_quiz_excel_template(
    current_user: models.User = Depends(require_instructor_or_admin),
):
    rows = [
        {
            "question_type": "single",
            "prompt": "What is 2+2?",
            "points": 1,
            "option_a": "3",
            "option_b": "4",
            "option_c": "5",
            "option_d": "",
            "correct": "B",
            "match_left": "",
            "match_right": "",
        },
        {
            "question_type": "multi",
            "prompt": "Select prime numbers",
            "points": 1,
            "option_a": "2",
            "option_b": "4",
            "option_c": "3",
            "option_d": "9",
            "correct": "A,C",
            "match_left": "",
            "match_right": "",
        },
        {
            "question_type": "true_false",
            "prompt": "The sky is blue.",
            "points": 1,
            "option_a": "",
            "option_b": "",
            "option_c": "",
            "option_d": "",
            "correct": "True",
            "match_left": "",
            "match_right": "",
        },
        {
            "question_type": "matching",
            "prompt": "Match countries to capitals",
            "points": 2,
            "option_a": "",
            "option_b": "",
            "option_c": "",
            "option_d": "",
            "correct": "",
            "match_left": "France",
            "match_right": "Paris",
        },
        {
            "question_type": "matching",
            "prompt": "Match countries to capitals",
            "points": 2,
            "option_a": "",
            "option_b": "",
            "option_c": "",
            "option_d": "",
            "correct": "",
            "match_left": "Japan",
            "match_right": "Tokyo",
        },
    ]
    df = pd.DataFrame(rows)
    instructions = pd.DataFrame(
        [
            {"field": "question_type", "how_to_fill": "single | multi | true_false | matching"},
            {"field": "prompt", "how_to_fill": "Question text (required)"},
            {"field": "points", "how_to_fill": "Points for this question (default 1)"},
            {"field": "option_a..option_d", "how_to_fill": "Answer choices for single/multi"},
            {"field": "correct", "how_to_fill": "For single: A or B. For multi: A,C. For true_false: True or False"},
            {"field": "match_left / match_right", "how_to_fill": "For matching only. Same prompt on each pair row."},
            {"field": "workflow", "how_to_fill": "1) Create quiz title  2) Upload this file  3) Publish quiz"},
        ]
    )
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Questions")
        instructions.to_excel(writer, index=False, sheet_name="Instructions")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="quiz_template.xlsx"'},
    )


@app.get("/api/v1/quizzes/{quiz_id}")
async def get_bank_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    if not _can_manage_bank_quiz(current_user, quiz) and current_user.role != "admin":
        if not _is_staff(current_user):
            raise HTTPException(status_code=403, detail="Not authorized")
    return await _serialize_bank_quiz(quiz, db, include_questions=True, include_correct=True)


@app.put("/api/v1/quizzes/{quiz_id}")
async def update_bank_quiz(
    quiz_id: int,
    body: BankQuizUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    if not _can_manage_bank_quiz(current_user, quiz):
        raise HTTPException(status_code=403, detail="Not authorized")
    if body.title is not None:
        title = body.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title is required")
        quiz.title = title
    if body.description is not None:
        quiz.description = body.description.strip() or None
    if body.image_url is not None:
        quiz.image_url = body.image_url.strip() or None
    if body.pass_percent is not None:
        quiz.pass_percent = max(0, min(100, int(body.pass_percent)))
    if body.duration is not None:
        quiz.duration = body.duration
    update_data = body.model_dump(exclude_unset=True)
    if "max_attempts" in update_data:
        quiz.max_attempts = _normalize_max_attempts(update_data.get("max_attempts"))
    if body.is_published is not None:
        quiz.is_published = bool(body.is_published)
    await db.commit()
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    return await _serialize_bank_quiz(quiz, db, include_questions=True)


@app.delete("/api/v1/quizzes/{quiz_id}")
async def delete_bank_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    if not _can_manage_bank_quiz(current_user, quiz):
        raise HTTPException(status_code=403, detail="Not authorized")
    questions = await _load_bank_quiz_questions(quiz_id, db)
    q_ids = [q.id for q in questions]
    attempt_res = await db.execute(select(models.QuizAttempt.id).where(models.QuizAttempt.quiz_id == quiz_id))
    attempt_ids = list(attempt_res.scalars().all())
    if attempt_ids:
        await db.execute(delete(models.QuizAnswer).where(models.QuizAnswer.attempt_id.in_(attempt_ids)))
        await db.execute(delete(models.QuizAttempt).where(models.QuizAttempt.id.in_(attempt_ids)))
    if q_ids:
        await db.execute(delete(models.QuizOption).where(models.QuizOption.question_id.in_(q_ids)))
        await db.execute(delete(models.QuizQuestion).where(models.QuizQuestion.id.in_(q_ids)))
    await db.execute(delete(models.QuizCourseAssignment).where(models.QuizCourseAssignment.quiz_id == quiz_id))
    await db.execute(delete(models.Quiz).where(models.Quiz.id == quiz_id))
    await db.commit()
    return {"message": "Quiz deleted"}


@app.put("/api/v1/quizzes/{quiz_id}/questions")
async def put_bank_quiz_questions(
    quiz_id: int,
    body: QuizPutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    if not _can_manage_bank_quiz(current_user, quiz):
        raise HTTPException(status_code=403, detail="Not authorized")
    if body.title is not None and body.title.strip():
        quiz.title = body.title.strip()
    if body.duration is not None:
        quiz.duration = body.duration
    if body.pass_percent is not None:
        quiz.pass_percent = max(0, min(100, int(body.pass_percent)))
    await _replace_questions_for_owner(db, body.questions or [], quiz_id=quiz.id)
    await db.commit()
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    return await _serialize_bank_quiz(quiz, db, include_questions=True)


@app.put("/api/v1/quizzes/{quiz_id}/assignments")
async def put_bank_quiz_assignments(
    quiz_id: int,
    body: BankQuizAssignments,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    if not _can_manage_bank_quiz(current_user, quiz):
        raise HTTPException(status_code=403, detail="Not authorized")
    await _set_quiz_assignments(db, quiz.id, body.course_ids or [])
    await db.commit()
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    return await _serialize_bank_quiz(quiz, db)


def _parse_quiz_excel_to_questions(contents: bytes, filename: str) -> List[QuizQuestionInput]:
    try:
        if filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid file format: {e}")
    df.columns = [str(c).lower().strip().replace(" ", "_") for c in df.columns]
    required = {"question_type", "prompt"}
    if not required.issubset(set(df.columns)):
        raise HTTPException(status_code=400, detail="Template must include question_type and prompt columns")

    def cell(row, key, default=""):
        if key not in row or pd.isna(row[key]):
            return default
        return str(row[key]).strip()

    matching_groups: Dict[str, dict] = {}
    questions: List[QuizQuestionInput] = []
    letter_map = {"a": 0, "b": 1, "c": 2, "d": 3, "e": 4, "f": 5}

    for _, row in df.iterrows():
        qtype = cell(row, "question_type", "single").lower().replace("-", "_").replace(" ", "_")
        if qtype in ("truefalse", "true_or_false"):
            qtype = "true_false"
        if qtype in ("mcq", "multiple_choice"):
            qtype = "single"
        if qtype in ("multiple", "multi_select"):
            qtype = "multi"
        prompt = cell(row, "prompt")
        if not prompt:
            continue
        try:
            points = int(float(cell(row, "points", "1") or "1"))
        except ValueError:
            points = 1
        points = max(1, points)

        if qtype == "matching":
            left = cell(row, "match_left")
            right = cell(row, "match_right")
            if not left or not right:
                continue
            group = matching_groups.setdefault(prompt, {"points": points, "pairs": []})
            group["points"] = points
            group["pairs"].append((left, right))
            continue

        options = []
        for letter in ("a", "b", "c", "d", "e", "f"):
            label = cell(row, f"option_{letter}")
            if label:
                options.append({"label": label, "is_correct": False, "order": len(options)})

        correct_raw = cell(row, "correct")
        if qtype == "true_false":
            if len(options) < 2:
                options = [
                    {"label": "True", "is_correct": False, "order": 0},
                    {"label": "False", "is_correct": False, "order": 1},
                ]
            truth = correct_raw.lower() in ("true", "t", "yes", "1", "a")
            for o in options:
                o["is_correct"] = (o["label"].lower() == "true") if truth else (o["label"].lower() == "false")
            if not any(o["is_correct"] for o in options):
                options[0]["is_correct"] = truth
                options[1]["is_correct"] = not truth
        else:
            correct_letters = [p.strip().lower() for p in re.split(r"[,/;|\s]+", correct_raw) if p.strip()]
            for letter in correct_letters:
                idx = letter_map.get(letter)
                if idx is not None and idx < len(options):
                    options[idx]["is_correct"] = True
                else:
                    # allow matching by option text
                    for o in options:
                        if o["label"].lower() == letter:
                            o["is_correct"] = True

        questions.append(
            QuizQuestionInput(
                prompt=prompt,
                question_type=qtype if qtype in VALID_QUIZ_TYPES else "single",
                points=points,
                options=[
                    QuizOptionInput(label=o["label"], is_correct=o["is_correct"], order=o["order"])
                    for o in options
                ],
            )
        )

    for prompt, group in matching_groups.items():
        opts = []
        for i, (left, right) in enumerate(group["pairs"]):
            key = f"p{i+1}"
            opts.append(QuizOptionInput(label=left, match_side="left", match_key=key, order=i * 2))
            opts.append(QuizOptionInput(label=right, match_side="right", match_key=key, order=i * 2 + 1))
        questions.append(
            QuizQuestionInput(
                prompt=prompt,
                question_type="matching",
                points=group["points"],
                options=opts,
            )
        )

    if not questions:
        raise HTTPException(status_code=400, detail="No valid questions found in file")
    return questions


@app.post("/api/v1/quizzes/{quiz_id}/import-excel")
async def import_bank_quiz_excel(
    quiz_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    if not _can_manage_bank_quiz(current_user, quiz):
        raise HTTPException(status_code=403, detail="Not authorized")
    contents = await file.read()
    questions = _parse_quiz_excel_to_questions(contents, file.filename or "quiz.xlsx")
    await _replace_questions_for_owner(db, questions, quiz_id=quiz.id)
    await db.commit()
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    return await _serialize_bank_quiz(quiz, db, include_questions=True)


@app.get("/api/v1/courses/{course_id}/assigned-quizzes")
async def list_course_assigned_quizzes(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    course_res = await db.execute(select(models.Course).where(models.Course.id == course_id))
    course = course_res.scalars().first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    await _ensure_enrolled_or_staff(current_user, course_id, db)
    res = await db.execute(
        select(models.Quiz)
        .join(models.QuizCourseAssignment, models.QuizCourseAssignment.quiz_id == models.Quiz.id)
        .where(
            models.QuizCourseAssignment.course_id == course_id,
            models.Quiz.is_published == True,  # noqa: E712
        )
        .order_by(models.Quiz.title.asc())
    )
    quizzes = list(res.scalars().all())
    # Staff can also see unpublished assigned quizzes
    if _is_staff(current_user):
        res2 = await db.execute(
            select(models.Quiz)
            .join(models.QuizCourseAssignment, models.QuizCourseAssignment.quiz_id == models.Quiz.id)
            .where(models.QuizCourseAssignment.course_id == course_id)
            .order_by(models.Quiz.title.asc())
        )
        quizzes = list(res2.scalars().all())
    out = []
    for quiz in quizzes:
        payload = await _serialize_bank_quiz(quiz, db)
        stats = await _bank_quiz_attempt_stats(quiz, current_user.id, db)
        payload["attempt_count"] = stats["attempt_count"]
        payload["best_percent"] = stats["best_percent"]
        payload["passed"] = stats["passed"]
        payload["max_attempts"] = stats["max_attempts"]
        payload["attempts_remaining"] = stats["attempts_remaining"]
        payload["can_attempt"] = stats["can_attempt"]
        out.append(payload)
    return out


async def _bank_quiz_attempt_stats(quiz: models.Quiz, user_id: int, db: AsyncSession) -> dict:
    res = await db.execute(
        select(models.QuizAttempt)
        .where(models.QuizAttempt.quiz_id == quiz.id, models.QuizAttempt.user_id == user_id)
        .order_by(models.QuizAttempt.submitted_at.desc(), models.QuizAttempt.id.desc())
    )
    attempts = list(res.scalars().all())
    best = max((a.percent or 0 for a in attempts), default=None)
    pass_pct = quiz.pass_percent if quiz.pass_percent is not None else 70
    max_attempts = getattr(quiz, "max_attempts", None)
    max_attempts = int(max_attempts) if max_attempts and int(max_attempts) > 0 else None
    attempt_count = len(attempts)
    remaining = None if max_attempts is None else max(0, max_attempts - attempt_count)
    return {
        "pass_percent": pass_pct,
        "attempt_count": attempt_count,
        "best_percent": best,
        "passed": best is not None and best >= pass_pct,
        "max_attempts": max_attempts,
        "attempts_remaining": remaining,
        "can_attempt": remaining is None or remaining > 0,
        "attempts": attempts,
    }


@app.get("/api/v1/quizzes/{quiz_id}/take")
async def take_bank_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    if not quiz.is_published and not _is_staff(current_user):
        raise HTTPException(status_code=403, detail="Quiz is not published")
    questions = await _load_bank_quiz_questions(quiz_id, db)
    stats = await _bank_quiz_attempt_stats(quiz, current_user.id, db)
    max_attempts = stats["max_attempts"]
    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "description": quiz.description,
        "duration": quiz.duration,
        "pass_percent": quiz.pass_percent if quiz.pass_percent is not None else 70,
        "max_attempts": max_attempts,
        "attempt_count": stats["attempt_count"],
        "attempts_remaining": stats["attempts_remaining"],
        "can_attempt": stats["can_attempt"],
        "question_count": len(questions),
        "questions": [_serialize_quiz_question(q, include_correct=False) for q in questions],
    }


@app.get("/api/v1/quizzes/{quiz_id}/my-attempts")
async def my_bank_quiz_attempts(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    if not quiz.is_published and not _is_staff(current_user):
        raise HTTPException(status_code=403, detail="Quiz is not published")
    stats = await _bank_quiz_attempt_stats(quiz, current_user.id, db)
    attempts = stats.pop("attempts")
    return {
        "quiz_id": quiz.id,
        **stats,
        "attempts": [
            {
                "id": a.id,
                "score": a.score,
                "max_score": a.max_score,
                "percent": a.percent,
                "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
            }
            for a in attempts
        ],
    }


@app.post("/api/v1/quizzes/{quiz_id}/submit")
async def submit_bank_quiz(
    quiz_id: int,
    body: QuizSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    if not quiz.is_published and not _is_staff(current_user):
        raise HTTPException(status_code=403, detail="Quiz is not published")
    stats = await _bank_quiz_attempt_stats(quiz, current_user.id, db)
    if not stats["can_attempt"] and not _is_staff(current_user):
        raise HTTPException(
            status_code=403,
            detail=f"Maximum attempts reached ({stats['max_attempts']}).",
        )
    questions = await _load_bank_quiz_questions(quiz_id, db)
    if not questions:
        raise HTTPException(status_code=400, detail="This quiz has no questions yet")

    answer_by_q = {a.question_id: a for a in (body.answers or [])}
    total_points = 0
    earned = 0
    review = []

    attempt = models.QuizAttempt(
        quiz_id=quiz.id,
        content_item_id=None,
        user_id=current_user.id,
        score=0,
        max_score=0,
        percent=0,
        started_at=datetime.utcnow(),
        submitted_at=datetime.utcnow(),
    )
    db.add(attempt)
    await db.flush()

    for q in questions:
        ans = answer_by_q.get(q.id)
        selected = list(ans.selected_option_ids or []) if ans else []
        match_map = dict(ans.match_map or {}) if ans and ans.match_map else None
        valid_ids = {o.id for o in (q.options or [])}
        selected = [sid for sid in selected if sid in valid_ids]
        if match_map:
            match_map = {str(k): int(v) for k, v in match_map.items() if int(v) in valid_ids}
        ok, pts = _grade_selection(q, selected, match_map)
        q_points = q.points or 1
        total_points += q_points
        earned += pts
        stored = json.dumps(match_map) if q.question_type == "matching" else json.dumps(selected)
        db.add(
            models.QuizAnswer(
                attempt_id=attempt.id,
                question_id=q.id,
                selected_option_ids=stored,
                is_correct=ok,
                points_awarded=pts,
            )
        )
        if q.question_type == "matching":
            lefts = [o for o in (q.options or []) if (getattr(o, "match_side", None) or "").lower() == "left"]
            rights = {o.id: o for o in (q.options or []) if (getattr(o, "match_side", None) or "").lower() == "right"}
            rights_by_key = {
                (getattr(o, "match_key", None) or ""): o
                for o in (q.options or [])
                if (getattr(o, "match_side", None) or "").lower() == "right"
            }
            selected_opts = []
            correct_opts = []
            for left in lefts:
                rid = (match_map or {}).get(str(left.id))
                if rid and rid in rights:
                    selected_opts.append({"id": left.id, "label": f"{left.label} → {rights[rid].label}"})
                expected = rights_by_key.get(getattr(left, "match_key", None) or "")
                if expected:
                    correct_opts.append({"id": left.id, "label": f"{left.label} → {expected.label}"})
        else:
            correct_opts = [{"id": o.id, "label": o.label} for o in (q.options or []) if o.is_correct]
            selected_opts = [{"id": o.id, "label": o.label} for o in (q.options or []) if o.id in set(selected)]
        review.append({
            "question_id": q.id,
            "prompt": q.prompt,
            "question_type": q.question_type,
            "points": q_points,
            "points_awarded": pts,
            "is_correct": ok,
            "selected_options": selected_opts,
            "correct_options": correct_opts,
        })

    percent = 0 if total_points == 0 else round((earned / total_points) * 100)
    attempt.score = earned
    attempt.max_score = total_points
    attempt.percent = percent
    pass_pct = quiz.pass_percent if quiz.pass_percent is not None else 70

    prior = await db.execute(
        select(models.QuizAttempt.percent).where(
            models.QuizAttempt.quiz_id == quiz.id,
            models.QuizAttempt.user_id == current_user.id,
            models.QuizAttempt.id != attempt.id,
        )
    )
    prior_percents = list(prior.scalars().all())
    best_percent = max([percent] + [p or 0 for p in prior_percents])
    await db.commit()

    return {
        "attempt_id": attempt.id,
        "quiz_id": quiz.id,
        "score": earned,
        "max_score": total_points,
        "percent": percent,
        "best_percent": best_percent,
        "pass_percent": pass_pct,
        "passed": percent >= pass_pct,
        "lesson_completed": False,
        "review": review,
    }


@app.get("/api/v1/quizzes/{quiz_id}/responses")
async def bank_quiz_responses(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(require_instructor_or_admin),
):
    quiz = await _get_bank_quiz_or_404(quiz_id, db)
    if not _can_manage_bank_quiz(current_user, quiz) and not _is_staff(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    att_res = await db.execute(
        select(models.QuizAttempt, models.User)
        .join(models.User, models.QuizAttempt.user_id == models.User.id)
        .where(models.QuizAttempt.quiz_id == quiz_id)
        .order_by(models.QuizAttempt.submitted_at.desc())
    )
    attempts = []
    for attempt, user in att_res.all():
        attempts.append({
            "id": attempt.id,
            "score": attempt.score,
            "max_score": attempt.max_score,
            "percent": attempt.percent,
            "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
            "student_id": user.id,
            "student_name": user.full_name,
            "student_email": user.email,
        })
    chron = sorted(attempts, key=lambda a: (a.get("submitted_at") or "", a["id"]))
    counters: Dict[int, int] = {}
    numbered = {}
    for a in chron:
        sid = a["student_id"]
        counters[sid] = counters.get(sid, 0) + 1
        numbered[a["id"]] = counters[sid]
    for a in attempts:
        a["attempt_number"] = numbered.get(a["id"], 1)
    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "pass_percent": quiz.pass_percent if quiz.pass_percent is not None else 70,
        "attempt_count": len(attempts),
        "attempts": attempts,
    }


# 2. Final Course Completion (The "Complete Course" Button)
@app.post("/api/v1/courses/{course_id}/claim-certificate")
async def claim_course_certificate(course_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Fetch Course Type
    course_res = await db.execute(select(models.Course).where(models.Course.id == course_id))
    course = course_res.scalars().first()
    
    if not course: raise HTTPException(status_code=404)

    is_eligible = False

    # --- LOGIC FOR CODING COURSE ---
    if course.course_type == "coding":
        # 1. Get Total Challenges Count
        total_res = await db.execute(select(models.CourseChallenge).where(models.CourseChallenge.course_id == course_id))
        total_challenges = len(total_res.scalars().all())

        # 2. Get User Solved Count (Live Check from challenge_progress)
        solved_res = await db.execute(
            text("SELECT COUNT(*) FROM challenge_progress WHERE user_id = :uid AND challenge_id IN (SELECT id FROM course_challenges WHERE course_id = :cid)"), 
            {"uid": current_user.id, "cid": course_id}
        )
        solved_count = solved_res.scalar()

        if total_challenges > 0 and solved_count == total_challenges:
            is_eligible = True
        else:
            return {"status": "error", "message": f"Incomplete: Solved {solved_count}/{total_challenges} problems. Complete all stages first."}

    # --- LOGIC FOR STANDARD COURSE ---
    else:
        completed, total, is_done = await check_progress_status(current_user.id, course_id, db)
        if is_done: is_eligible = True
        else: return {"status": "error", "message": f"Incomplete: Finished {completed}/{total} lessons."}

    # --- GENERATE CERTIFICATE ---
    if is_eligible:
        cert = await certificate_service.issue_certificate_if_eligible(
            db, current_user, course_id, generate_pdf=True, send_email=True, require_complete=True
        )
        if not cert:
            return {"status": "error", "message": "Could not issue certificate."}
        cert_payload = certificate_service.serialize_certificate(cert, course.title)
        message = "Certificate Generated!"
        if cert_payload.get("status") == "FAILED":
            message = "Certificate was recorded but PDF generation failed. Try downloading again shortly."
        elif cert_payload.get("email_status") == "FAILED":
            message = "Certificate issued. Email delivery failed — you can still download it here."
        elif cert_payload.get("email_status") == "SENT":
            message = "Your Cloudvaathi certificate was issued and emailed."
        return {
            "status": "success",
            "message": message,
            "certificate_ready": cert_payload.get("status") != "FAILED",
            "certificate": cert_payload,
        }
    
    return {"status": "error", "message": "Requirements not met."}

 
@app.get("/api/v1/courses/{course_id}/challenges")
async def get_course_challenges(course_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1. Fetch Challenges Directly from DB
    result = await db.execute(select(models.CourseChallenge).where(models.CourseChallenge.course_id == course_id))
    challenges = result.scalars().all()
    
    challenges_data = []
    for c in challenges:
        challenges_data.append({
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "difficulty": c.difficulty,
            "test_cases": c.test_cases,
            "course_id": c.course_id
        })

    # 2. Fetch User Progress
    try:
        solved_res = await db.execute(text("SELECT challenge_id FROM challenge_progress WHERE user_id = :uid"), {"uid": current_user.id})
        solved_ids = {row[0] for row in solved_res.fetchall()}
    except Exception as e:
        solved_ids = set()

    # 3. Merge
    final_response = []
    for challenge in challenges_data:
        challenge["is_solved"] = challenge["id"] in solved_ids
        final_response.append(challenge)

    return final_response
# 3️⃣ ADD CREATE CHALLENGE
@app.post("/api/v1/courses/{course_id}/challenges")
async def create_course_challenge(course_id: int, challenge: ChallengeCreate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    new_challenge = models.CourseChallenge(
        title=challenge.title,
        description=challenge.description,
        difficulty=challenge.difficulty,
        test_cases=challenge.test_cases,
        course_id=course_id
    )
    db.add(new_challenge)
    await db.commit()
    
    return {"message": "Challenge added"}

@app.post("/api/v1/login-otp")
async def login_otp(req: OTPLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.User).where(models.User.phone_number == req.phone_number))
    # ... logic continues
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found with this phone number")
    
    # 2. Since Firebase already verified the OTP on frontend, 
    # we trust the request and issue a JWT
    token = create_access_token(data={"sub": user.email, "role": user.role})
    return {"access_token": token, "token_type": "bearer", "role": user.role}

@app.post("/api/v1/proctoring/violation")
async def record_violation(report: ViolationReport, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_student)):
    res = await db.execute(select(models.LessonProgress).where(models.LessonProgress.user_id == current_user.id, models.LessonProgress.content_item_id == report.lesson_id))
    progress = res.scalars().first()
    
    if not progress:
        progress = models.LessonProgress(user_id=current_user.id, content_item_id=report.lesson_id, is_completed=False, violation_count=1)
        db.add(progress)
    else:
        if progress.is_terminated:
            return {"status": "terminated", "message": "Already terminated", "violation_count": progress.violation_count}
            
        progress.violation_count += 1
        
        # ✅ FIX 1: Strict Logic. If count is 2 or more, Terminate.
        if progress.violation_count > 2: 
            progress.is_terminated = True
            progress.is_completed = False
            
    await db.commit()
    
    return {
        "status": "terminated" if progress.is_terminated else "warning", 
        "violation_count": progress.violation_count,
        # ✅ FIX 2: Correct math for frontend display (Max 2)
        "remaining_attempts": max(0, 2 - progress.violation_count) 
    }
    
# ✅ NEW: Helper to refresh status instantly on frontend mount
@app.get("/api/v1/proctoring/status/{lesson_id}")
async def get_lesson_status(lesson_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    res = await db.execute(select(models.LessonProgress).where(
        models.LessonProgress.user_id == current_user.id, 
        models.LessonProgress.content_item_id == lesson_id
    ))
    progress = res.scalars().first()
    
    if not progress:
        return {"is_terminated": False, "violation_count": 0}
        
    return {
        "is_terminated": progress.is_terminated,
        "violation_count": progress.violation_count
    }    
    
@app.patch("/api/v1/modules/{module_id}")
async def update_module(module_id: int, update: ModuleUpdate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    res = await db.execute(select(models.Module).where(models.Module.id == module_id))
    module = res.scalars().first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    
    module.title = update.title
    await db.commit()
    return {"message": "Module renamed"}

# 2. Delete Module (Cascade)
@app.delete("/api/v1/modules/{module_id}")
async def delete_module(module_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    # Fetch module with items to delete dependencies
    res = await db.execute(select(models.Module).options(selectinload(models.Module.items)).where(models.Module.id == module_id))
    module = res.scalars().first()
    
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    
    try:
        # Delete dependencies for ALL items in this module
        for item in module.items:
            await db.execute(delete(models.LessonProgress).where(models.LessonProgress.content_item_id == item.id))
            await db.execute(delete(models.Submission).where(models.Submission.content_item_id == item.id))
        
        # Now delete items
        await db.execute(delete(models.ContentItem).where(models.ContentItem.module_id == module_id))
        
        # Finally delete module
        await db.delete(module)
        await db.commit()
        return {"message": "Module deleted"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# 3. Reorder Items
class ReorderRequest(BaseModel):
    item_ids: List[int] # List of IDs in the new order

@app.put("/api/v1/modules/{module_id}/reorder")
async def reorder_module_items(module_id: int, req: ReorderRequest, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    # Update the 'order' field for each item based on its index in the list
    for index, item_id in enumerate(req.item_ids):
        await db.execute(
            models.ContentItem.__table__.update()
            .where(models.ContentItem.id == item_id)
            .values(order=index)
        )
    await db.commit()
    return {"message": "Order updated"}    

@app.post("/api/v1/notifications/send")
async def send_notification(req: NotificationRequest, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor)):
    recipients = []
    
    # Logic 1: Send to All Students
    if req.target_type == "all":
        res = await db.execute(select(models.User.id).where(models.User.role == "student"))
        recipients = res.scalars().all()
    
    # Logic 2: Send to Students in Specific Course
    elif req.target_type == "course":
        res = await db.execute(select(models.Enrollment.user_id).where(models.Enrollment.course_id == req.target_id))
        recipients = res.scalars().all()
        
    # Logic 3: Send to Single Student
    elif req.target_type == "student":
        recipients = [req.target_id]

    # Bulk Insert
    for uid in recipients:
        new_notif = models.Notification(
            user_id=uid,
            title="Message from Instructor",
            message=req.message,
            is_read=False,
            created_at=datetime.utcnow()
        )
        db.add(new_notif)
    
    await db.commit()
    return {"message": f"Sent to {len(recipients)} students."}

# 2. Student Gets Notifications
@app.get("/api/v1/notifications")
async def get_notifications(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_student)):
    res = await db.execute(
        select(models.Notification)
        .where(models.Notification.user_id == current_user.id)
        .order_by(models.Notification.created_at.desc())
    )
    return res.scalars().all()

# 3. Mark as Read (Optional, happens when they open the page)
@app.patch("/api/v1/notifications/read")
async def mark_notifications_read(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_student)):
    await db.execute(
        models.Notification.__table__.update()
        .where(models.Notification.user_id == current_user.id)
        .values(is_read=True)
    )
    await db.commit()
    return {"message": "Marked read"}

# 4. Delete Notification
@app.delete("/api/v1/notifications/{notif_id}")
async def delete_notification(notif_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_student)):
    await db.execute(delete(models.Notification).where(models.Notification.id == notif_id, models.Notification.user_id == current_user.id))
    await db.commit()
    return {"message": "Deleted"}

@app.get("/api/v1/users/me")
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "role": current_user.role,
        "phone_number": current_user.phone_number
    }

@app.post("/api/v1/admin/trigger-backup")
async def manual_backup(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    # Run the backup synchronously
    backup_path = backup_manager.create_local_backup()
    if backup_path:
        backup_manager.upload_to_drive(backup_path)
        backup_manager.cleanup_old_backups()
        return {"message": "Backup triggered successfully!"}
    return {"message": "Backup failed."}

@app.post("/api/v1/challenges/{challenge_id}/solve")
async def mark_challenge_solved(challenge_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_student)):
    # 1. Check if challenge exists
    res = await db.execute(select(models.CourseChallenge).where(models.CourseChallenge.id == challenge_id))
    challenge = res.scalars().first()
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    # 2. Insert into Progress Table (Idempotent)
    try:
        # We use ON CONFLICT DO NOTHING to avoid errors if they solve it twice
        # Note: Ensure your DB has a UNIQUE constraint on (user_id, challenge_id)
        # If not, use a SELECT check first.
        
        # Safe check logic just in case unique constraint isn't set:
        check_res = await db.execute(text("SELECT 1 FROM challenge_progress WHERE user_id=:uid AND challenge_id=:cid"), {"uid": current_user.id, "cid": challenge_id})
        if not check_res.first():
            await db.execute(
                text("INSERT INTO challenge_progress (user_id, challenge_id, is_solved, solved_at) VALUES (:uid, :cid, :solved, :time)"),
                {"uid": current_user.id, "cid": challenge_id, "solved": True, "time": datetime.utcnow()}
            )
            await db.commit()
    except Exception as e:
        print(f"Error saving progress: {e}")
        pass

    cert = await certificate_service.issue_after_challenge_solved(db, current_user, challenge_id)
    payload = {"status": "success", "message": "Challenge marked as solved", "certificate_issued": bool(cert)}
    if cert:
        payload["certificate"] = certificate_service.serialize_certificate(cert)
    return payload

@app.patch("/api/v1/challenges/{challenge_id}")
async def update_challenge(challenge_id: int, update: ChallengeUpdate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    res = await db.execute(select(models.CourseChallenge).where(models.CourseChallenge.id == challenge_id))
    challenge = res.scalars().first()
    
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    if update.title: challenge.title = update.title
    if update.description: challenge.description = update.description
    if update.difficulty: challenge.difficulty = update.difficulty
    if update.test_cases: challenge.test_cases = update.test_cases
    
    await db.commit()
    
    return {"message": "Challenge updated successfully"}

@app.delete("/api/v1/challenges/{challenge_id}")
async def delete_challenge(challenge_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(require_instructor_or_admin)):
    res = await db.execute(select(models.CourseChallenge).where(models.CourseChallenge.id == challenge_id))
    challenge = res.scalars().first()
    
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
        
    # Delete related progress first to avoid foreign key constraints
    await db.execute(text("DELETE FROM challenge_progress WHERE challenge_id = :cid"), {"cid": challenge_id})
    
    await db.delete(challenge)
    await db.commit()
    
    return {"message": "Challenge deleted"}

@app.get("/api/v1/course-description-pdf/{course_id}")
async def generate_course_description_pdf(course_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1. Fetch Course
    res = await db.execute(select(models.Course).where(models.Course.id == course_id))
    course = res.scalars().first()
    
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # 2. Generate PDF using ReportLab
    # We run this in a thread to avoid blocking the async loop
    def make_pdf():
        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        
        # -- Styling --
        # Header Blue Bar
        p.setFillColor(colors.Color(0/255, 94/255, 184/255)) # iQmath Blue
        p.rect(0, height - 100, width, 100, fill=True, stroke=False)
        
        # Title (White text on Blue)
        p.setFillColor(colors.white)
        p.setFont("Helvetica-Bold", 24)
        p.drawCentredString(width / 2, height - 60, "Course Syllabus & Overview")
        
        # Course Name
        p.setFillColor(colors.black)
        p.setFont("Helvetica-Bold", 20)
        p.drawCentredString(width / 2, height - 140, course.title)
        
        # Divider Line
        p.setStrokeColor(colors.lightgrey)
        p.line(50, height - 160, width - 50, height - 160)
        
        # Description Body
        p.setFont("Helvetica", 12)
        text_object = p.beginText(50, height - 200)
        
        # Simple text wrapping logic
        description = course.description or "No description provided."
        max_width = 80  # Characters per line approx
        
        for paragraph in description.split('\n'):
            words = paragraph.split()
            line = ""
            for word in words:
                if len(line + word) < max_width:
                    line += word + " "
                else:
                    text_object.textLine(line)
                    line = word + " "
            text_object.textLine(line)
            text_object.textLine("") # Empty line between paragraphs
            
        p.drawText(text_object)
        
        # Footer
        p.setFont("Helvetica-Oblique", 10)
        p.setFillColor(colors.grey)
        p.drawCentredString(width / 2, 30, f"Generated by iQmath Pro • {datetime.utcnow().strftime('%Y-%m-%d')}")
        
        p.showPage()
        p.save()
        buffer.seek(0)
        return buffer

    pdf_buffer = await asyncio.to_thread(make_pdf)
    
    # 3. Return as Streaming Response
    filename = f"{course.title.replace(' ', '_')}_Syllabus.pdf"
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
    
@app.get("/")
def read_root(): return {"status": "online", "message": "iQmath Military Grade API Active 🟢"}
