import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

import models  # noqa: F401  (register tables)
from database import Base, SessionLocal, engine
from ml.churn import churn_model
from ml.recommendation import recommender
from ml.semantic_search import search_engine
from routes import analytics, catalog, shop
from seed import seed_database

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("smartcart")


def load_ml():
    """Fit ML components once at startup. Each is isolated so one failure never takes the API down."""
    db = SessionLocal()
    try:
        products = [dict(id=p.id, name=p.name, category=p.category, brand=p.brand, description=p.description,
                         price=p.price, rating=p.rating, review_count=p.review_count)
                    for p in db.scalars(select(models.Product).order_by(models.Product.id))]
        interactions = db.execute(select(models.UserInteraction.customer_id, models.UserInteraction.product_id,
                                         models.UserInteraction.interaction_type)
                                  .where(models.UserInteraction.product_id.is_not(None))).all()
    finally:
        db.close()
    for name, fn in [("recommender", lambda: recommender.fit(products, [tuple(r) for r in interactions])),
                     ("search", lambda: search_engine.fit(products)),
                     ("churn", churn_model.train)]:
        try:
            fn()
        except Exception:
            log.exception("Failed to initialise %s - feature will degrade gracefully", name)


@asynccontextmanager
async def lifespan(app: FastAPI):
    t0 = time.time()
    Base.metadata.create_all(engine)
    seed_database()
    load_ml()
    log.info("SmartCart AI ready in %.1fs", time.time() - t0)
    yield


app = FastAPI(title="SmartCart AI API", version="1.0.0", lifespan=lifespan)

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or None,
                   allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def timing(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Response-Time-ms"] = f"{(time.perf_counter() - t0) * 1000:.1f}"
    return response


@app.exception_handler(SQLAlchemyError)
async def db_error(request: Request, exc: SQLAlchemyError):
    log.exception("Database error")
    return JSONResponse(status_code=503, content={"detail": "Database temporarily unavailable, please retry"})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error")
    return JSONResponse(status_code=500, content={"detail": "Something went wrong"})


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/ml/status")
def ml_status():
    return {"recommender": recommender.ready, "search_mode": search_engine.mode, "churn_model": churn_model.name,
            "churn_metrics": churn_model.metrics}


app.include_router(catalog.router)
app.include_router(shop.router)
app.include_router(analytics.router)

# Optional: serve the built frontend from the same service (single-service deploy)
DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")
if os.path.isdir(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = os.path.join(DIST, path)
        return FileResponse(f if path and os.path.isfile(f) else os.path.join(DIST, "index.html"))
