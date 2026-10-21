from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models


def normalize_coupon_code(code: Optional[str]) -> str:
    return " ".join(str(code or "").strip().upper().split())


def serialize_coupon(coupon: models.Coupon) -> Dict[str, Any]:
    return {
        "id": coupon.id,
        "code": coupon.code,
        "discount_type": coupon.discount_type,
        "discount_value": coupon.discount_value,
        "course_id": coupon.course_id,
        "max_uses": coupon.max_uses,
        "used_count": int(coupon.used_count or 0),
        "min_amount": coupon.min_amount,
        "is_active": bool(coupon.is_active),
        "expires_at": coupon.expires_at.isoformat() if coupon.expires_at else None,
        "created_at": coupon.created_at.isoformat() if coupon.created_at else None,
    }


def compute_discount(original_amount: int, coupon: models.Coupon) -> Tuple[int, int]:
    """Return (discount_amount, final_amount) in INR whole rupees."""
    original = max(0, int(original_amount or 0))
    value = max(0, int(coupon.discount_value or 0))
    dtype = (coupon.discount_type or "percent").lower().strip()

    if dtype == "flat":
        discount = min(original, value)
    else:
        # percent
        percent = min(100, value)
        discount = int(round(original * percent / 100.0))
        discount = min(original, discount)

    final_amount = max(0, original - discount)
    return discount, final_amount


async def get_coupon_by_code(db: AsyncSession, code: str) -> Optional[models.Coupon]:
    clean = normalize_coupon_code(code)
    if not clean:
        return None
    result = await db.execute(select(models.Coupon).where(models.Coupon.code == clean))
    return result.scalars().first()


async def validate_coupon_for_course(
    db: AsyncSession,
    *,
    code: str,
    course: models.Course,
    user_id: Optional[int] = None,
    skip_redemption_check: bool = False,
    skip_expiry_and_limits: bool = False,
) -> Dict[str, Any]:
    clean = normalize_coupon_code(code)
    if not clean:
        raise ValueError("Enter a coupon code.")

    coupon = await get_coupon_by_code(db, clean)
    if not coupon or not coupon.is_active:
        raise ValueError("Invalid or inactive coupon code.")

    if not skip_expiry_and_limits:
        if coupon.expires_at and coupon.expires_at < datetime.utcnow():
            raise ValueError("This coupon has expired.")

        if coupon.max_uses is not None and int(coupon.used_count or 0) >= int(coupon.max_uses):
            raise ValueError("This coupon has reached its usage limit.")

    if coupon.course_id is not None and int(coupon.course_id) != int(course.id):
        raise ValueError("This coupon is not valid for this course.")

    original = int(course.price or 0)
    if original <= 0:
        raise ValueError("Coupons cannot be applied to free courses.")

    if coupon.min_amount is not None and original < int(coupon.min_amount):
        raise ValueError(f"This coupon requires a minimum course price of ₹{coupon.min_amount}.")

    # One redemption per user+course+coupon (optional soft check)
    if user_id is not None and not skip_redemption_check:
        existing = await db.execute(
            select(models.CouponRedemption).where(
                models.CouponRedemption.coupon_id == coupon.id,
                models.CouponRedemption.user_id == user_id,
                models.CouponRedemption.course_id == course.id,
            )
        )
        if existing.scalars().first():
            raise ValueError("You have already used this coupon for this course.")

    discount_amount, final_amount = compute_discount(original, coupon)
    if discount_amount <= 0:
        raise ValueError("This coupon does not reduce the price.")

    return {
        "valid": True,
        "code": coupon.code,
        "discount_type": coupon.discount_type,
        "discount_value": coupon.discount_value,
        "original_amount": original,
        "discount_amount": discount_amount,
        "final_amount": final_amount,
        "is_free": final_amount <= 0,
        "message": (
            f"Coupon applied! You save ₹{discount_amount}."
            if final_amount > 0
            else "Coupon applied! This course is free for you."
        ),
    }


async def resolve_payable_amount(
    db: AsyncSession,
    *,
    course: models.Course,
    coupon_code: Optional[str],
    user_id: Optional[int] = None,
    for_payment_verify: bool = False,
) -> Dict[str, Any]:
    original = int(course.price or 0)
    if not coupon_code or not str(coupon_code).strip():
        return {
            "original_amount": original,
            "discount_amount": 0,
            "final_amount": original,
            "coupon_code": None,
            "is_free": original <= 0,
        }

    applied = await validate_coupon_for_course(
        db,
        code=coupon_code,
        course=course,
        user_id=user_id,
        skip_redemption_check=for_payment_verify,
        skip_expiry_and_limits=for_payment_verify,
    )
    return {
        "original_amount": applied["original_amount"],
        "discount_amount": applied["discount_amount"],
        "final_amount": applied["final_amount"],
        "coupon_code": applied["code"],
        "is_free": applied["is_free"],
        "message": applied["message"],
    }


async def record_coupon_redemption(
    db: AsyncSession,
    *,
    coupon_code: str,
    user_id: int,
    course_id: int,
    original_amount: int,
    discount_amount: int,
    final_amount: int,
    order_id: Optional[str] = None,
) -> None:
    coupon = await get_coupon_by_code(db, coupon_code)
    if not coupon:
        return

    existing = await db.execute(
        select(models.CouponRedemption).where(
            models.CouponRedemption.coupon_id == coupon.id,
            models.CouponRedemption.user_id == user_id,
            models.CouponRedemption.course_id == course_id,
        )
    )
    if existing.scalars().first():
        return

    db.add(
        models.CouponRedemption(
            coupon_id=coupon.id,
            user_id=user_id,
            course_id=course_id,
            order_id=order_id,
            original_amount=original_amount,
            discount_amount=discount_amount,
            final_amount=final_amount,
        )
    )
    coupon.used_count = int(coupon.used_count or 0) + 1
    await db.commit()


async def ensure_default_coupons(db: AsyncSession) -> None:
    """Seed a couple of starter coupons if the table is empty."""
    count_res = await db.execute(select(models.Coupon.id).limit(1))
    if count_res.scalars().first():
        return
    db.add_all(
        [
            models.Coupon(
                code="CLOUD10",
                discount_type="percent",
                discount_value=10,
                max_uses=1000,
                is_active=True,
            ),
            models.Coupon(
                code="WELCOME500",
                discount_type="flat",
                discount_value=500,
                min_amount=1000,
                max_uses=500,
                is_active=True,
            ),
        ]
    )
    await db.commit()
