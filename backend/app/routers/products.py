from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DailyPrice, PriceObservation, Product
from app.schemas import DailyPricePoint, PriceHistoryResponse, ProductResponse

router = APIRouter()


@router.get("/products/{bol_id}", response_model=ProductResponse)
def get_product(bol_id: str, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.bol_id == bol_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product niet gevonden")
    return product


@router.get("/products/{bol_id}/history", response_model=PriceHistoryResponse)
def get_price_history(
    bol_id: str,
    days: int = Query(default=90, ge=1, le=365),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.bol_id == bol_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product niet gevonden")

    since = date.today() - timedelta(days=days)

    # Try daily_prices first (aggregated, fast)
    daily = (
        db.query(DailyPrice)
        .filter(DailyPrice.product_id == product.id, DailyPrice.date >= since)
        .order_by(DailyPrice.date)
        .all()
    )

    if daily:
        prices = [
            DailyPricePoint(
                date=d.date,
                min_price=d.min_price,
                max_price=d.max_price,
                avg_price=d.avg_price,
            )
            for d in daily
        ]
    else:
        # Fallback: aggregate from raw observations on the fly
        rows = (
            db.query(
                func.date(PriceObservation.observed_at).label("day"),
                func.min(PriceObservation.price).label("min_p"),
                func.max(PriceObservation.price).label("max_p"),
                func.avg(PriceObservation.price).label("avg_p"),
            )
            .filter(
                PriceObservation.product_id == product.id,
                PriceObservation.observed_at >= since,
            )
            .group_by(func.date(PriceObservation.observed_at))
            .order_by(func.date(PriceObservation.observed_at))
            .all()
        )
        prices = [
            DailyPricePoint(
                date=row.day if isinstance(row.day, date) else date.fromisoformat(row.day),
                min_price=row.min_p,
                max_price=row.max_p,
                avg_price=round(row.avg_p, 2),
            )
            for row in rows
        ]

    return PriceHistoryResponse(
        bol_id=product.bol_id,
        title=product.title,
        current_price=product.current_price,
        lowest_price=product.lowest_price,
        highest_price=product.highest_price,
        prices=prices,
    )
