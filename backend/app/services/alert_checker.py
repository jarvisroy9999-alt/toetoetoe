from datetime import datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Alert, Product
from app.services.telegram import format_price_alert, send_telegram_message


async def check_and_fire_alerts(db: Session) -> dict:
    """
    Check all active alerts. Fire Telegram notification if current_price <= target_price.
    Returns a summary dict with counts.
    """
    active_alerts = (
        db.query(Alert, Product)
        .join(Product, Alert.product_id == Product.id)
        .filter(Alert.is_active == True, Product.current_price != None)
        .all()
    )

    fired = 0
    skipped = 0

    for alert, product in active_alerts:
        if product.current_price <= alert.target_price:
            # Fire the alert
            if alert.telegram_chat:
                msg = format_price_alert(
                    title=product.title,
                    target_price=alert.target_price,
                    current_price=product.current_price,
                    url=product.url,
                    partner_id=settings.bol_partner_id,
                )
                await send_telegram_message(alert.telegram_chat, msg)

            # Deactivate alert after firing
            alert.is_active = False
            alert.triggered_at = datetime.utcnow()
            fired += 1
        else:
            skipped += 1

    db.commit()
    return {"fired": fired, "skipped": skipped, "total": len(active_alerts)}
