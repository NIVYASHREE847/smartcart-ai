"""Idempotent database seeding from the SmartCart CSV files (falls back to a tiny built-in dataset)."""
import csv
import logging
import os
import random
from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, insert, select

from auth import hash_password
from database import DATA_DIR, SessionLocal
from models import Category, Order, OrderItem, Product, User, UserInteraction

log = logging.getLogger("smartcart.seed")

FALLBACK_PRODUCTS = [
    ("P0001", "Running Shoes", "Fashion", "UrbanX", 2499, 4.5, 820, "Lightweight comfortable running shoes with cushioned sole."),
    ("P0002", "Wireless Headphones", "Electronics", "TechPro", 3999, 4.3, 1500, "Noise cancelling wireless headphones with long battery life."),
    ("P0003", "Yoga Mat", "Sports", "FitMax", 899, 4.6, 640, "Non-slip yoga mat for home workouts."),
    ("P0004", "Air Fryer", "Home & Kitchen", "HomeEase", 5499, 4.4, 980, "Oil-free air fryer for healthy cooking."),
    ("P0005", "Face Wash", "Beauty", "GlowCare", 299, 4.1, 2100, "Gentle daily face wash for all skin types."),
    ("P0006", "Novel", "Books", "ReadMore", 399, 4.7, 300, "Bestselling fiction novel."),
]


def _read_csv(name):
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def seed_database():
    db = SessionLocal()
    try:
        if db.scalar(select(func.count()).select_from(Product)):
            log.info("Database already seeded")
            _ensure_demo_accounts(db)
            return
        products = _read_csv("smartcart_products.csv")
        customers = _read_csv("smartcart_customers.csv")
        transactions = _read_csv("smartcart_transactions.csv")
        if not products:
            log.warning("CSV files missing - using fallback seed dataset")
            products = [dict(zip(["product_id", "product_name", "category", "brand", "price", "rating", "review_count", "description"], p))
                        for p in FALLBACK_PRODUCTS]
            customers = customers or []
            transactions = transactions or []

        db.execute(insert(Category), [{"name": c} for c in sorted({p["category"] for p in products})])
        db.execute(insert(Product), [{
            "id": p["product_id"], "name": p["product_name"], "category": p["category"], "brand": p["brand"],
            "price": float(p["price"]), "rating": float(p["rating"]), "review_count": int(p["review_count"]),
            "description": p["description"],
        } for p in products])

        product_ids = {p["product_id"] for p in products}
        feature_cols = ["purchase_frequency", "average_spend", "last_purchase_days", "view_count",
                        "wishlist_count", "cart_count", "session_count", "review_count"]
        if customers:
            db.execute(insert(User), [{
                "customer_id": c["customer_id"], "name": f"Customer {c['customer_id']}",
                **{k: (float(c[k]) if k == "average_spend" else int(float(c[k]))) for k in feature_cols},
                "churn_label": int(c["churn"]),
            } for c in customers])

        rng = random.Random(42)
        base = datetime.now(timezone.utc)
        valid_tx = [t for t in (transactions or []) if t["product_id"] in product_ids]
        if valid_tx:
            db.execute(insert(UserInteraction), [{
                "transaction_id": t["transaction_id"], "customer_id": t["customer_id"], "product_id": t["product_id"],
                "interaction_type": t["interaction_type"], "quantity": int(t["quantity"]),
                "discount_percent": float(t["discount_percent"]), "total_amount": float(t["total_amount"]),
                "created_at": base - timedelta(days=rng.randint(1, 180)),
            } for t in valid_tx])
            price = {p["product_id"]: float(p["price"]) for p in products}
            for t in valid_tx:
                if t["interaction_type"] != "purchase":
                    continue
                qty = int(t["quantity"])
                order = Order(customer_id=t["customer_id"], total_amount=float(t["total_amount"]),
                              source="seed", created_at=base - timedelta(days=rng.randint(1, 180)))
                order.items.append(OrderItem(product_id=t["product_id"], quantity=qty, unit_price=price[t["product_id"]]))
                db.add(order)
        db.commit()
        log.info("Seeded %d products, %d customers, %d interactions", len(products), len(customers or []), len(valid_tx))
        _ensure_demo_accounts(db)
    finally:
        db.close()


def _ensure_demo_accounts(db):
    # Demo credentials are documented in README; override via env vars in production.
    demo_pw = os.getenv("DEMO_USER_PASSWORD", "Demo@123")
    admin_pw = os.getenv("ADMIN_PASSWORD", "Admin@123")

    if not db.scalar(select(User).where(User.email == "demo@smartcart.ai")):
        # Attach demo login to a real seeded customer with churn=1 and the richest history
        counts = Counter(db.scalars(select(UserInteraction.customer_id).where(UserInteraction.customer_id.is_not(None))))
        candidates = db.scalars(select(User).where(User.churn_label == 1, User.email.is_(None))).all()
        demo = max(candidates, key=lambda u: counts.get(u.customer_id, 0)) if candidates else None
        if demo is None:
            demo = User(customer_id="C9001", name="Demo Customer")
            db.add(demo)
        demo.name, demo.email, demo.password_hash = "Demo Customer", "demo@smartcart.ai", hash_password(demo_pw)
    if not db.scalar(select(User).where(User.email == "admin@smartcart.ai")):
        db.add(User(customer_id="A0001", name="Store Admin", email="admin@smartcart.ai",
                    password_hash=hash_password(admin_pw), is_admin=True))
    db.commit()
