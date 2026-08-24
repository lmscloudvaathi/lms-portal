"""
One-shot: copy production (TiDB) courses + curriculum into local SQLite.
Keeps local login users; maps foreign instructor_ids to local admin when needed.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import ssl
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from dotenv import dotenv_values
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

BACKEND = Path(__file__).resolve().parent
ENV = dotenv_values(BACKEND / ".env")

COURSE_TABLES = [
    "courses",
    "modules",
    "content_items",
    "course_challenges",
]


def _strip_quotes(v: str) -> str:
    s = (v or "").strip()
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        s = s[1:-1]
    return s.strip()


def _prod_url_from_env_file() -> str:
    """Prefer active DATABASE_URL if mysql; else parse commented TiDB line."""
    active = _strip_quotes(ENV.get("DATABASE_URL") or "")
    if active.startswith("mysql"):
        return active

    raw = (BACKEND / ".env").read_text(encoding="utf-8", errors="replace")
    for line in raw.splitlines():
        m = re.match(r"^\s*#\s*DATABASE_URL\s*=\s*[\"']?(mysql[^\"']+)[\"']?\s*$", line)
        if m:
            return m.group(1).strip()
    raise SystemExit("No production MySQL DATABASE_URL found in .env (active or commented).")


def _to_aiomysql(url: str) -> str:
    if url.startswith("mysql://"):
        url = "mysql+aiomysql://" + url[len("mysql://") :]
    parts = urlsplit(url)
    q = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k not in {"ssl_verify_cert", "ssl_verify_identity", "ssl_ca"}]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(q), parts.fragment))


def _ssl_context() -> ssl.SSLContext:
    ca = _strip_quotes(ENV.get("DB_SSL_CA_PATH") or "")
    candidates = [
        Path(ca) if ca else None,
        BACKEND / "isrgrootx1.pem",
        BACKEND / "isrgrootx2.pem",
        Path(r"E:/Cloudvaathi-LMS/iqmathlms_platform/backend/isrgrootx2.pem"),
    ]
    for p in candidates:
        if p and p.exists():
            print(f"Using CA: {p}")
            return ssl.create_default_context(cafile=str(p))
    print("WARNING: no CA file found; using default SSL context")
    return ssl.create_default_context()


def _row_to_dict(row) -> dict:
    return dict(row._mapping)


async def fetch_all(engine, sql: str, params: dict | None = None) -> list[dict]:
    async with engine.connect() as conn:
        result = await conn.execute(text(sql), params or {})
        return [_row_to_dict(r) for r in result]


async def table_exists(engine, name: str) -> bool:
    rows = await fetch_all(
        engine,
        "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :n",
        {"n": name},
    )
    return int(rows[0]["c"]) > 0


async def main() -> None:
    prod_url = _to_aiomysql(_prod_url_from_env_file())
    u = urlsplit(prod_url)
    print(f"Production: {u.scheme}://{u.hostname}:{u.port}{u.path} user={u.username}")

    ssl_ctx = _ssl_context()
    prod = create_async_engine(
        prod_url,
        echo=False,
        connect_args={"ssl": ssl_ctx},
        pool_pre_ping=True,
    )

    local_path = (BACKEND / "lms_local.db").resolve()
    local = create_async_engine(f"sqlite+aiosqlite:///{local_path.as_posix()}", echo=False)

    try:
        # connectivity + inventory
        prod_users = await fetch_all(prod, "SELECT id, email, full_name, role, is_active FROM users ORDER BY id")
        print(f"Prod users: {len(prod_users)}")
        for row in prod_users[:8]:
            print(" ", row["id"], row["email"], row["role"])

        if not await table_exists(prod, "courses"):
            raise SystemExit("Production has no courses table")

        courses = await fetch_all(prod, "SELECT * FROM courses ORDER BY id")
        print(f"Prod courses: {len(courses)}")
        for c in courses:
            print(f"  [{c.get('id')}] published={c.get('is_published')} title={c.get('title')!r}")

        modules = await fetch_all(prod, "SELECT * FROM modules ORDER BY id") if await table_exists(prod, "modules") else []
        items = await fetch_all(prod, "SELECT * FROM content_items ORDER BY id") if await table_exists(prod, "content_items") else []
        challenges = await fetch_all(prod, "SELECT * FROM course_challenges ORDER BY id") if await table_exists(prod, "course_challenges") else []
        print(f"Prod modules={len(modules)} content_items={len(items)} challenges={len(challenges)}")

        # Local admin for FK remapping
        local_admins = await fetch_all(local, "SELECT id, email, role FROM users WHERE role IN ('instructor','admin') ORDER BY id LIMIT 1")
        if not local_admins:
            raise SystemExit("Local DB has no instructor/admin user. Seed admin first.")
        local_admin_id = int(local_admins[0]["id"])
        print(f"Local instructor id={local_admin_id} email={local_admins[0]['email']}")

        local_students = await fetch_all(local, "SELECT id, email FROM users WHERE role='student' ORDER BY id")
        student_ids = [int(s["id"]) for s in local_students]
        print(f"Local students to enroll: {len(student_ids)}")

        # Import instructors referenced by courses (by email) so ownership stays sensible
        instructor_ids = {int(c["instructor_id"]) for c in courses if c.get("instructor_id") is not None}
        prod_instructors = [u for u in prod_users if int(u["id"]) in instructor_ids]
        email_to_local: dict[str, int] = {}
        async with local.begin() as conn:
            for urow in prod_instructors:
                email = (urow.get("email") or "").strip().lower()
                if not email:
                    continue
                existing = (
                    await conn.execute(text("SELECT id FROM users WHERE lower(email)=:e"), {"e": email})
                ).fetchone()
                if existing:
                    email_to_local[email] = int(existing[0])
                    continue
                # Fetch full user row for insert
                full = await fetch_all(prod, "SELECT * FROM users WHERE id=:id", {"id": urow["id"]})
                if not full:
                    continue
                fu = full[0]
                await conn.execute(
                    text(
                        """
                        INSERT INTO users (email, phone_number, full_name, hashed_password, role, is_active, created_at, last_login, google_sub)
                        VALUES (:email, :phone_number, :full_name, :hashed_password, :role, :is_active, :created_at, :last_login, :google_sub)
                        """
                    ),
                    {
                        "email": fu.get("email"),
                        "phone_number": fu.get("phone_number"),
                        "full_name": fu.get("full_name") or fu.get("email"),
                        "hashed_password": fu.get("hashed_password") or "",
                        "role": fu.get("role") or "instructor",
                        "is_active": 1 if fu.get("is_active", True) else 0,
                        "created_at": fu.get("created_at") or datetime.utcnow(),
                        "last_login": fu.get("last_login"),
                        "google_sub": fu.get("google_sub"),
                    },
                )
                new_id = (await conn.execute(text("SELECT id FROM users WHERE email=:e"), {"e": fu.get("email")})).scalar()
                email_to_local[email] = int(new_id)
                print(f"Imported instructor {email} -> local id {new_id}")

        # Map prod instructor_id -> local id
        id_map: dict[int, int] = {}
        for urow in prod_instructors:
            email = (urow.get("email") or "").strip().lower()
            id_map[int(urow["id"])] = email_to_local.get(email, local_admin_id)

        def map_instructor(pid) -> int:
            if pid is None:
                return local_admin_id
            return id_map.get(int(pid), local_admin_id)

        # Clear local course curriculum (keep users / code arena / etc.)
        async with local.begin() as conn:
            # child tables first
            for tbl in (
                "challenge_progress",
                "lesson_progress",
                "submissions",
                "user_certificates",
                "enrollments",
                "content_items",
                "modules",
                "course_challenges",
                "courses",
            ):
                try:
                    await conn.execute(text(f"DELETE FROM {tbl}"))
                except Exception as e:
                    print(f"skip delete {tbl}: {e}")

        def serialize_value(v):
            if isinstance(v, datetime):
                return v.isoformat(sep=" ")
            if isinstance(v, (dict, list)):
                return json.dumps(v)
            if isinstance(v, bool):
                return 1 if v else 0
            return v

        async with local.begin() as conn:
            # courses
            for c in courses:
                cols = {
                    "id": c["id"],
                    "title": c.get("title"),
                    "description": (c.get("description") or "")[:1000],
                    "price": c.get("price") or 0,
                    "image_url": c.get("image_url"),
                    "is_published": 1 if c.get("is_published") else 0,
                    "instructor_id": map_instructor(c.get("instructor_id")),
                    "course_type": c.get("course_type") or "standard",
                    "language": c.get("language"),
                    "category": c.get("category"),
                }
                await conn.execute(
                    text(
                        """
                        INSERT INTO courses (id, title, description, price, image_url, is_published, instructor_id, course_type, language, category)
                        VALUES (:id, :title, :description, :price, :image_url, :is_published, :instructor_id, :course_type, :language, :category)
                        """
                    ),
                    cols,
                )

            for m in modules:
                await conn.execute(
                    text(
                        """
                        INSERT INTO modules (id, title, "order", course_id)
                        VALUES (:id, :title, :order, :course_id)
                        """
                    ),
                    {
                        "id": m["id"],
                        "title": m.get("title"),
                        "order": m.get("order") or 0,
                        "course_id": m.get("course_id"),
                    },
                )

            for it in items:
                await conn.execute(
                    text(
                        """
                        INSERT INTO content_items (
                          id, title, type, content, duration, is_mandatory, "order", module_id,
                          instructions, test_config, resource_links, start_time, end_time
                        ) VALUES (
                          :id, :title, :type, :content, :duration, :is_mandatory, :order, :module_id,
                          :instructions, :test_config, :resource_links, :start_time, :end_time
                        )
                        """
                    ),
                    {
                        "id": it["id"],
                        "title": it.get("title"),
                        "type": it.get("type"),
                        "content": it.get("content"),
                        "duration": it.get("duration"),
                        "is_mandatory": 1 if it.get("is_mandatory") else 0,
                        "order": it.get("order") or 0,
                        "module_id": it.get("module_id"),
                        "instructions": it.get("instructions"),
                        "test_config": it.get("test_config"),
                        "resource_links": it.get("resource_links"),
                        "start_time": serialize_value(it.get("start_time")),
                        "end_time": serialize_value(it.get("end_time")),
                    },
                )

            for ch in challenges:
                await conn.execute(
                    text(
                        """
                        INSERT INTO course_challenges (id, course_id, title, description, difficulty, test_cases, function_name)
                        VALUES (:id, :course_id, :title, :description, :difficulty, :test_cases, :function_name)
                        """
                    ),
                    {
                        "id": ch["id"],
                        "course_id": ch.get("course_id"),
                        "title": ch.get("title"),
                        "description": ch.get("description"),
                        "difficulty": ch.get("difficulty"),
                        "test_cases": ch.get("test_cases"),
                        "function_name": ch.get("function_name") or "solution",
                    },
                )

            # Enroll every local student into every course so My Learning shows full prod catalog.
            # Keep is_published flags exactly as production (Explore shows only published).
            target_ids = [int(c["id"]) for c in courses]
            published_ids = [int(c["id"]) for c in courses if c.get("is_published")]
            print(f"Published in prod: {len(published_ids)}; total migrated: {len(target_ids)}")

            enroll_n = 0
            for sid in student_ids:
                for cid in target_ids:
                    await conn.execute(
                        text(
                            """
                            INSERT INTO enrollments (user_id, course_id, enrolled_at, enrollment_type, expiry_date)
                            VALUES (:uid, :cid, :at, 'paid', NULL)
                            """
                        ),
                        {"uid": sid, "cid": cid, "at": datetime.utcnow().isoformat(sep=" ")},
                    )
                    enroll_n += 1
            print(f"Created {enroll_n} local enrollments")

            # Keep sqlite AUTOINCREMENT counters in sync when the table exists
            try:
                await conn.execute(text("CREATE TABLE IF NOT EXISTS sqlite_sequence(name TEXT, seq INTEGER)"))
                for tbl in ("courses", "modules", "content_items", "course_challenges", "enrollments", "users"):
                    max_id = (await conn.execute(text(f"SELECT COALESCE(MAX(id),0) FROM {tbl}"))).scalar()
                    await conn.execute(text("DELETE FROM sqlite_sequence WHERE name=:n"), {"n": tbl})
                    if max_id:
                        await conn.execute(
                            text("INSERT INTO sqlite_sequence(name, seq) VALUES (:n, :s)"),
                            {"n": tbl, "s": max_id},
                        )
            except Exception as seq_err:
                print(f"sqlite_sequence sync skipped: {seq_err}")

        # verify
        local_courses = await fetch_all(local, "SELECT id, title, is_published FROM courses ORDER BY id")
        local_enroll = await fetch_all(local, "SELECT COUNT(*) AS c FROM enrollments")
        print("\nLocal courses after migrate:")
        for c in local_courses:
            print(f"  [{c['id']}] published={c['is_published']} {c['title']}")
        print(f"Local enrollments: {local_enroll[0]['c']}")
        print("DONE")
    finally:
        await prod.dispose()
        await local.dispose()


if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
