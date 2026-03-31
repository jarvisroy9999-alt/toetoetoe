from datetime import datetime

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PriceObservation, Product
from app.schemas import PriceReportRequest, PriceReportResponse

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _classify_price(price: float, lowest: float | None, highest: float | None) -> str:
    if lowest is None or highest is None:
        return "average"
    if price <= lowest:
        return "lowest"
    if highest == lowest:
        return "average"
    ratio = (price - lowest) / (highest - lowest)
    if ratio <= 0.25:
        return "below_avg"
    if ratio <= 0.75:
        return "average"
    return "above_avg"


@router.post("/prices/report", response_model=PriceReportResponse)
@limiter.limit("60/minute")
def report_price(
    request: Request,
    body: PriceReportRequest,
    db: Session = Depends(get_db),
):
    # Find or create product
    product = db.query(Product).filter(Product.bol_id == body.bol_id).first()

    if product is None:
        product = Product(
            bol_id=body.bol_id,
            title=body.title,
            ean=body.ean,
            image_url=body.image_url,
            category=body.category,
            url=body.url,
            current_price=body.price,
            lowest_price=body.price,
            highest_price=body.price,
            price_count=0,
        )
        db.add(product)
        db.flush()

    # Validate price: reject if >50% deviation from current known price
    if product.current_price and product.current_price > 0:
        deviation = abs(body.price - product.current_price) / product.current_price
        if deviation > 0.5:
            # Still return a response but don't store the suspicious price
            return PriceReportResponse(
                product_id=product.id,
                is_new_low=False,
                price_rank=_classify_price(
                    product.current_price, product.lowest_price, product.highest_price
                ),
            )

    # Record observation
    observation = PriceObservation(
        product_id=product.id,
        price=body.price,
        seller=body.seller,
        source="extension",
        observer_id=body.observer_id,
    )
    db.add(observation)

    # Update product stats
    is_new_low = product.lowest_price is None or body.price < product.lowest_price
    product.current_price = body.price
    product.last_seen = datetime.utcnow()
    product.price_count += 1
    if product.lowest_price is None or body.price < product.lowest_price:
        product.lowest_price = body.price
    if product.highest_price is None or body.price > product.highest_price:
        product.highest_price = body.price
    # Update title/image if provided (they may change)
    product.title = body.title
    if body.image_url:
        product.image_url = body.image_url
    if body.ean:
        product.ean = body.ean

    db.commit()

    price_rank = _classify_price(body.price, product.lowest_price, product.highest_price)

    return PriceReportResponse(
        product_id=product.id,
        is_new_low=is_new_low,
        price_rank=price_rank,
    )
