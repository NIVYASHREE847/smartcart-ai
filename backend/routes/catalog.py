import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth import ensure_self_or_admin, optional_user
from database import get_db
from ml.recommendation import recommender
from ml.semantic_search import search_engine
from models import Category, Product, User, UserInteraction
from schemas import product_out

router = APIRouter(prefix="/api", tags=["catalog"])

SORTS = {"price_asc": Product.price.asc(), "price_desc": Product.price.desc(),
         "rating": Product.rating.desc(), "popular": Product.review_count.desc()}


def products_by_ids(db: Session, ids):
    rows = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_(list(ids))))} if ids else {}
    return [rows[i] for i in ids if i in rows]


@router.get("/categories")
def categories(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Product.category, func.count()).group_by(Product.category)).all())
    return [{"name": c.name, "count": counts.get(c.name, 0)} for c in db.scalars(select(Category).order_by(Category.name))]


@router.get("/products")
def list_products(page: int = Query(1, ge=1), limit: int = Query(24, ge=1, le=100), category: str | None = None,
                  brand: str | None = None, min_price: float | None = None, max_price: float | None = None,
                  min_rating: float | None = None, sort: str = "popular", db: Session = Depends(get_db)):
    q = select(Product)
    if category:
        q = q.where(Product.category == category)
    if brand:
        q = q.where(Product.brand == brand)
    if min_price is not None:
        q = q.where(Product.price >= min_price)
    if max_price is not None:
        q = q.where(Product.price <= max_price)
    if min_rating is not None:
        q = q.where(Product.rating >= min_rating)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    items = db.scalars(q.order_by(SORTS.get(sort, SORTS["popular"]), Product.id).offset((page - 1) * limit).limit(limit)).all()
    return {"items": [product_out(p) for p in items], "total": total, "page": page, "pages": max(1, math.ceil(total / limit))}


@router.get("/home")
def home(db: Session = Depends(get_db)):
    popular = products_by_ids(db, [pid for pid, _ in recommender.popular(12)]) if recommender.ready else []
    since = datetime.now(timezone.utc) - timedelta(days=30)
    trending_ids = [r[0] for r in db.execute(
        select(UserInteraction.product_id, func.count().label("n"))
        .where(UserInteraction.product_id.is_not(None), UserInteraction.created_at >= since)
        .group_by(UserInteraction.product_id).order_by(func.count().desc()).limit(12)).all()]
    return {"popular": [product_out(p) for p in popular], "trending": [product_out(p) for p in products_by_ids(db, trending_ids)]}


@router.get("/products/{product_id}")
def get_product(product_id: str, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    if user and not user.is_admin:
        db.add(UserInteraction(customer_id=user.customer_id, product_id=p.id, interaction_type="view"))
        user.view_count += 1
        db.commit()
    similar = []
    if recommender.ready:
        sims = recommender.similar(product_id, 8)
        score = dict(sims)
        similar = [{**product_out(s), "similarity": score[s.id]} for s in products_by_ids(db, [i for i, _ in sims])]
    return {**product_out(p, full=True), "similar": similar}


@router.get("/search")
def search(q: str = Query("", max_length=200), category: str | None = None, min_price: float | None = None,
           max_price: float | None = None, min_rating: float | None = None, sort: str = "relevance",
           limit: int = Query(48, ge=1, le=100), db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    q = q.strip()
    if not q:
        return {"query": q, "results": [], "total": 0, "mode": search_engine.mode, "parsed": {}}
    try:
        hits, qmin, qmax = search_engine.search(q)
    except Exception:
        raise HTTPException(503, "Search is temporarily unavailable")
    min_price = min_price if min_price is not None else qmin
    max_price = max_price if max_price is not None else qmax
    score = dict(hits)
    results = []
    for p in products_by_ids(db, [h for h, _ in hits]):
        if (category and p.category != category) or (min_price is not None and p.price < min_price) \
                or (max_price is not None and p.price > max_price) or (min_rating is not None and p.rating < min_rating):
            continue
        results.append({"product": product_out(p), "similarity_score": round(score[p.id], 4),
                        "price": p.price, "category": p.category, "rating": p.rating})
    if sort == "price_asc":
        results.sort(key=lambda r: r["price"])
    elif sort == "price_desc":
        results.sort(key=lambda r: -r["price"])
    elif sort == "rating":
        results.sort(key=lambda r: -r["rating"])
    else:
        results.sort(key=lambda r: (-round(r["similarity_score"], 3), -r["rating"]))
    db.add(UserInteraction(customer_id=user.customer_id if user else None, interaction_type="search", query=q[:300],
                           quantity=len(results)))
    db.commit()
    return {"query": q, "results": results[:limit], "total": len(results), "mode": search_engine.mode,
            "parsed": {"min_price": min_price, "max_price": max_price}}


@router.get("/recommendations/{customer_id}")
def recommendations(customer_id: str, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    if not recommender.ready:
        raise HTTPException(503, "Recommendation engine is warming up")
    if customer_id == "guest":
        history = []
    else:
        if user is None:
            raise HTTPException(401, "Please log in to continue")
        ensure_self_or_admin(user, customer_id)
        history = db.execute(select(UserInteraction.product_id, UserInteraction.interaction_type).where(
            UserInteraction.customer_id == customer_id, UserInteraction.product_id.is_not(None))).all()
    recs = recommender.recommend([(p, t) for p, t in history], 10)
    prods = {p.id: p for p in products_by_ids(db, [r["product_id"] for r in recs])}
    return {"customer_id": customer_id, "strategy": recs[0]["strategy"] if recs else "none",
            "recommendations": [{**product_out(prods[r["product_id"]]), "score": r["score"], "content_score": r["content_score"],
                                 "interaction_score": r["interaction_score"]} for r in recs if r["product_id"] in prods]}
