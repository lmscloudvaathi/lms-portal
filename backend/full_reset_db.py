"""
Drop all LMS tables, recreate schema, seed a single instructor account.

DANGER: Irreversible data loss on the database pointed to by DATABASE_URL.

Usage (from this directory):
  python full_reset_db.py              # prompts for confirmation
  python full_reset_db.py --yes        # non-interactive (use only if you are sure)

Requires backend/.env with DATABASE_URL (and DB_SSL_CA_PATH for TiDB TLS).

On Windows, the script forces the selector event loop so TLS to TiDB/MySQL works
(default asyncio loop can fail with WinError 87 under aiomysql).
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

load_dotenv(Path(__file__).resolve().parent / ".env")

# Import engine after dotenv
from database import engine, AsyncSessionLocal, Base  # noqa: E402
import models  # noqa: F401, E402 — register all tables on Base.metadata
from password_utils import get_password_hash  # noqa: E402

INSTRUCTOR_EMAIL = "lmscloudvaathi@gmail.com"
INSTRUCTOR_PASSWORD = "Cloud@123"
INSTRUCTOR_NAME = "Cloud Vaathi Instructor"


def _mask_database_url(raw: str) -> str:
    if not raw:
        return "(empty)"
    return re.sub(r"(://[^:]+:)([^@]+)(@)", r"\1***\3", raw)


async def _reset_schema() -> None:
    is_mysql = str(engine.url).startswith("mysql")
    async with engine.begin() as conn:
        if is_mysql:
            await conn.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        if is_mysql:
            await conn.execute(text("SET FOREIGN_KEY_CHECKS=1"))


async def _seed_instructor(session: AsyncSession) -> None:
    user = models.User(
        email=INSTRUCTOR_EMAIL.lower(),
        full_name=INSTRUCTOR_NAME,
        hashed_password=get_password_hash(INSTRUCTOR_PASSWORD),
        role="instructor",
        phone_number=None,
        is_active=True,
        google_sub=None,
    )
    session.add(user)
    await session.commit()


async def main_async(skip_confirm: bool) -> None:
    raw_url = os.getenv("DATABASE_URL", "")
    print("Target database (credentials masked):", _mask_database_url(raw_url))
    if not skip_confirm:
        line = input('Type exactly "WIPE ALL DATA" and press Enter to continue, or anything else to abort: ')
        if line.strip() != "WIPE ALL DATA":
            print("Aborted.")
            sys.exit(1)

    print("Dropping and recreating all tables…")
    await _reset_schema()
    print("Seeding instructor…")
    async with AsyncSessionLocal() as session:
        await _seed_instructor(session)
    print(f"Done. Instructor email: {INSTRUCTOR_EMAIL} (password is INSTRUCTOR_PASSWORD in this file).")
    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Full DB reset + instructor seed")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip interactive confirmation (dangerous).",
    )
    args = parser.parse_args()
    # Windows: default ProactorEventLoop + TLS + aiomysql raises WinError 87 during
    # handshake (CreateIoCompletionPort). Selector loop is stable for MySQL SSL.
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main_async(skip_confirm=args.yes))


if __name__ == "__main__":
    main()
