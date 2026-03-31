from datetime import date, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PriceObservation, Product
from app.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    products_count = db.query(func.count(Product.id)).scalar() or 0
    today_start = datetime.combine(date.today(), datetime.min.time())
    observations_today = (
        db.query(func.count(PriceObservation.id))
        .filter(PriceObservation.observed_at >= today_start)
        .scalar()
        or 0
    )
    return HealthResponse(
        status="ok",
        products_count=products_count,
        observations_today=observations_today,
    )
