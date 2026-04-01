"""
Internal endpoints — only callable with X-Internal-Key header.
Used by cron jobs running on the VPS.
"""
from datetime import date, datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import DailyPrice, PriceObservation, Product
from app.services.alert_checker import check_and_fire_alerts

router = APIRouter()


def require_internal_key(x_internal_key: str = Header(...)):
    if not settings.api_key or x_internal_key != settings.api_key:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/internal/check-alerts")
async def run_alert_check(
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    """Fire Telegram alerts for products that hit their target price."""
    result = await check_and_fire_alerts(db)
    return result


@router.post("/internal/aggregate-daily")
def run_daily_aggregation(
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    """
    Aggregate yesterday's price_observations into daily_prices table.
    Safe to run multiple times (upsert via merge).
    """
    today = date.today()

    # Get all products with observations not yet aggregated for today
    rows = (
        db.query(
            PriceObservation.product_id,
            func.cast(PriceObservation.observed_at, type_=None).label("obs_date"),
            func.min(PriceObservation.price).label("min_price"),
            func.max(PriceObservation.price).label("max_price"),
            func.avg(PriceObservation.price).label("avg_price"),
            func.count(PriceObservation.id).label("cnt"),
        )
        .filter(func.date(PriceObservation.observed_at) == today)
        .group_by(PriceObservation.product_id, func.date(PriceObservation.observed_at))
        .all()
    )

    upserted = 0
    for row in rows:
        existing = (
            db.query(DailyPrice)
            .filter(DailyPrice.product_id == row.product_id, DailyPrice.date == today)
            .first()
        )
        if existing:
            existing.min_price = min(existing.min_price, row.min_price)
            existing.max_price = max(existing.max_price, row.max_price)
            existing.avg_price = row.avg_price
            existing.observation_count = row.cnt
        else:
            dp = DailyPrice(
                product_id=row.product_id,
                date=today,
                min_price=row.min_price,
                max_price=row.max_price,
                avg_price=row.avg_price,
                observation_count=row.cnt,
            )
            db.add(dp)
        upserted += 1

    db.commit()
    return {"aggregated": upserted, "date": str(today)}


@router.post("/internal/run-scraper")
async def trigger_scraper(_: None = Depends(require_internal_key)):
    """Trigger the seed scraper in the background. Returns immediately."""
    import asyncio
    from app.scraper.bol_scraper import run_seed_scraper
    asyncio.create_task(run_seed_scraper())
    return {"status": "scraper started"}
