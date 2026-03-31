from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Alert, Product
from app.schemas import AlertCreateRequest, AlertResponse

router = APIRouter()


@router.post("/alerts", response_model=AlertResponse)
def create_alert(body: AlertCreateRequest, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.bol_id == body.bol_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product niet gevonden — bezoek eerst de productpagina")

    # Check for duplicate alert
    existing = (
        db.query(Alert)
        .filter(
            Alert.product_id == product.id,
            Alert.observer_id == body.observer_id,
            Alert.is_active == True,
        )
        .first()
    )
    if existing:
        # Update existing alert
        existing.target_price = body.target_price
        if body.telegram_chat:
            existing.telegram_chat = body.telegram_chat
        db.commit()
        return AlertResponse(
            id=existing.id,
            bol_id=product.bol_id,
            title=product.title,
            target_price=existing.target_price,
            current_price=product.current_price,
            is_active=existing.is_active,
            created_at=existing.created_at,
            triggered_at=existing.triggered_at,
        )

    alert = Alert(
        product_id=product.id,
        observer_id=body.observer_id,
        target_price=body.target_price,
        telegram_chat=body.telegram_chat,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    return AlertResponse(
        id=alert.id,
        bol_id=product.bol_id,
        title=product.title,
        target_price=alert.target_price,
        current_price=product.current_price,
        is_active=alert.is_active,
        created_at=alert.created_at,
        triggered_at=alert.triggered_at,
    )


@router.get("/alerts", response_model=list[AlertResponse])
def list_alerts(observer_id: str = Query(...), db: Session = Depends(get_db)):
    alerts = (
        db.query(Alert, Product)
        .join(Product, Alert.product_id == Product.id)
        .filter(Alert.observer_id == observer_id, Alert.is_active == True)
        .all()
    )
    return [
        AlertResponse(
            id=alert.id,
            bol_id=product.bol_id,
            title=product.title,
            target_price=alert.target_price,
            current_price=product.current_price,
            is_active=alert.is_active,
            created_at=alert.created_at,
            triggered_at=alert.triggered_at,
        )
        for alert, product in alerts
    ]


@router.delete("/alerts/{alert_id}")
def delete_alert(
    alert_id: int,
    observer_id: str = Query(...),
    db: Session = Depends(get_db),
):
    alert = (
        db.query(Alert)
        .filter(Alert.id == alert_id, Alert.observer_id == observer_id)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert niet gevonden")
    alert.is_active = False
    db.commit()
    return {"status": "deleted"}
