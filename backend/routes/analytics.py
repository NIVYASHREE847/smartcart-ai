import time
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from auth import admin_user, current_user, ensure_self_or_admin
from database import get_db
from ml.churn import FEATURES, churn_model, recommended_action, risk_level
from ml.recommendation import recommender
from ml.semantic_search import search_engine
from models import Order, OrderItem, Product, User, UserInteraction
from routes.shop import order_out

router = APIRouter(prefix="/api", tags=["analytics"])

_churn_cache = {"at": 0.0, "data": None}


def _features(u: User) -> dict:
    return {f: getattr(u, f) for f in FEATURES}


@router.get("/churn/{customer_id}")
def churn(customer_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    ensure_self_or_admin(user, customer_id)
    target = db.scalar(select(User).where(User.customer_id == customer_id))
    if not target:
        raise HTTPException(404, "Customer not found")
    prob = round(churn_model.predict(_features(target)), 3)
    level = risk_level(prob)
    offer = None
    if level == "High":
        offer = {"code": "COMEBACK20", "discount_percent": 20, "message": "We miss you! Enjoy 20% off your next order."}
    elif level == "Medium":
        offer = {"code": "SMART10", "discount_percent": 10, "message": "Here's 10% off picks we think you'll love."}
    return {"customer_id": customer_id, "churn_probability": prob, "risk_level": level,
            "recommended_action": recommended_action(level), "model": churn_model.name,
            "features": _features(target), "offer": offer}


def _churn_distribution(db: Session):
    if _churn_cache["data"] is not None and time.time() - _churn_cache["at"] < 60:
        return _churn_cache["data"]
    users = db.scalars(select(User).where(User.is_admin.is_(False))).all()
    probs = churn_model.predict_many([_features(u) for u in users])
    dist = Counter(risk_level(p) for p in probs)
    data = {"Low": dist.get("Low", 0), "Medium": dist.get("Medium", 0), "High": dist.get("High", 0),
            "average_probability": round(sum(probs) / max(len(probs), 1), 3)}
    _churn_cache.update(at=time.time(), data=data)
    return data


@router.get("/admin/analytics")
def admin_analytics(db: Session = Depends(get_db), _: User = Depends(admin_user)):
    total_users = db.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(False)))
    total_products = db.scalar(select(func.count()).select_from(Product))
    total_orders = db.scalar(select(func.count()).select_from(Order))
    revenue = float(db.scalar(select(func.coalesce(func.sum(Order.total_amount), 0))))
    top = db.execute(select(Product.id, Product.name, Product.brand, func.sum(OrderItem.quantity).label("units"),
                            func.count(OrderItem.id).label("orders"))
                     .join(OrderItem, OrderItem.product_id == Product.id)
                     .group_by(Product.id, Product.name, Product.brand).order_by(func.sum(OrderItem.quantity).desc()).limit(8)).all()
    by_cat = db.execute(select(Product.category, func.sum(OrderItem.quantity * OrderItem.unit_price))
                        .join(OrderItem, OrderItem.product_id == Product.id).group_by(Product.category)).all()
    recent = db.scalars(select(Order).options(selectinload(Order.items).selectinload(OrderItem.product))
                        .order_by(Order.created_at.desc(), Order.id.desc()).limit(8)).all()
    inter = dict(db.execute(select(UserInteraction.interaction_type, func.count()).group_by(UserInteraction.interaction_type)).all())
    top_q = db.execute(select(UserInteraction.query, func.count()).where(UserInteraction.interaction_type == "search")
                       .group_by(UserInteraction.query).order_by(func.count().desc()).limit(8)).all()
    return {
        "totals": {"users": total_users, "products": total_products, "orders": total_orders, "revenue": round(revenue, 2),
                   "average_order_value": round(revenue / total_orders, 2) if total_orders else 0},
        "top_products": [{"id": r.id, "name": f"{r.brand} {r.name}", "units": int(r.units), "orders": r.orders} for r in top],
        "revenue_by_category": [{"category": c, "revenue": round(float(v or 0), 2)} for c, v in by_cat],
        "churn": {**_churn_distribution(db), "model": churn_model.metrics},
        "recommendations": {"engine": "Hybrid (0.6 content TF-IDF + 0.4 item-item collaborative)",
                            **dict(recommender.stats), "interactions": {k: v for k, v in inter.items() if k != "search"}},
        "search": {"mode": search_engine.mode, "total_searches": inter.get("search", 0),
                   "queries_since_start": search_engine.stats.get("queries", 0),
                   "top_queries": [{"query": q, "count": n} for q, n in top_q]},
        "recent_orders": [order_out(o) for o in recent],
    }
