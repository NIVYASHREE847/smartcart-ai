# SmartCart AI – Intelligent E-Commerce Platform Using Machine Learning

**Live demo:** https://smartcart-ai-woad.vercel.app · **API:** https://smartcart-ai-api-fjv8.onrender.com/api/health

A working e-commerce MVP. It has a React storefront, a FastAPI backend and three ML components: hybrid recommendations, semantic search and churn prediction.

## Features

- Product browsing with pagination, categories, trending and popular products
- Natural-language semantic search with category, price and rating filters, sorting, loading and empty states
- Product details with similar products
- Personalised Top-10 recommendations (hybrid content + collaborative filtering)
- Customer churn prediction with risk level, recommended action and personalised offer
- Register, login and logout (JWT + bcrypt), cart, wishlist, demo checkout and order history
- Customer dashboard (profile, recent orders, recommendations, churn risk, offer)
- Admin dashboard (users, products, orders, revenue, AOV, top products, revenue by category, churn distribution and model metrics, recommendation and search statistics, recent orders)

## Architecture

```
React + Vite + Tailwind (Vercel)
        │  REST / JSON (JWT bearer)
        ▼
FastAPI (Render) ── SQLAlchemy ── PostgreSQL (Render / Supabase) or SQLite locally
        │
        └── ML, loaded once at startup:
            ml/recommendation.py   TF-IDF + price/rating content vectors, item-item collaborative matrix
            ml/semantic_search.py  SentenceTransformer + FAISS (optional) / TF-IDF fallback
            ml/churn.py            XGBoost → RandomForest → NumPy logistic regression
```

On startup the API creates the tables, seeds them from the CSV files (idempotent: it skips seeding if products exist), and fits the ML models. Each ML component is isolated, so one failure does not stop the API.

## Tech stack

Frontend: React 18, Vite 6, Tailwind CSS 4, React Router, Recharts, lucide-react.
Backend: Python 3.12, FastAPI, SQLAlchemy 2, python-jose, bcrypt.
ML: NumPy, scikit-learn; optional sentence-transformers, FAISS, XGBoost.

## Project structure

```
smartcart-ai/
  backend/  main.py database.py models.py schemas.py auth.py seed.py
            routes/ (catalog.py shop.py analytics.py)
            ml/ (recommendation.py semantic_search.py churn.py tfidf.py)
            data/ (smartcart_products.csv smartcart_customers.csv smartcart_transactions.csv)
  frontend/ src/ (App.jsx main.jsx components/ pages/ services/)
  requirements.txt  requirements-embeddings.txt  render.yaml  docker-compose.yml  .env.example
```

## Dataset

| File | Rows | Columns |
|---|---|---|
| smartcart_products.csv | 1000 | product_id, product_name, category, brand, price, rating, review_count, description |
| smartcart_customers.csv | 1000 | customer_id, purchase_frequency, average_spend, last_purchase_days, view_count, wishlist_count, cart_count, session_count, review_count, churn |
| smartcart_transactions.csv | 5000 | transaction_id, customer_id, product_id, interaction_type (view/cart/wishlist/purchase), quantity, discount_percent, total_amount |

Seeding: products go to `products` and `categories`. Customers go to `users`, with their behaviour features. All transactions go to `user_interactions`. Each `purchase` transaction also becomes an `orders` row with one `order_items` row. If the CSV files are missing, a small built-in product set is used.

## ML methodology

**Recommendations** (`GET /api/recommendations/{customer_id}`)
- Content: TF-IDF (unigrams and bigrams) over name, category, brand and description, plus scaled log-price and rating. The customer profile is the interaction-weighted mean of item vectors (view 1, wishlist 2, cart 2.5, purchase 3). The content score is the cosine similarity to that profile.
- Interaction: an item-item cosine similarity matrix is built from the customer × product interaction matrix. The score is the sum of similarities to the items in the customer's history.
- `final_score = 0.6 * content_score + 0.4 * interaction_score` (both min-max normalised). Purchased items are excluded. The API returns the Top 10.
- Cold start: popularity score = 0.6 × rating + 0.2 × review volume + 0.2 × interaction volume.

**Semantic search** (`GET /api/search?q=...`)
- The query parser extracts price constraints ("under 3000", "above 500").
- With `USE_EMBEDDINGS=1`: `all-MiniLM-L6-v2` embeddings are precomputed and cached to `data/embeddings_*.npy`. They are indexed with FAISS `IndexFlatIP`. The index builds in a background thread, and search uses TF-IDF until it is ready.
- Default and fallback: TF-IDF cosine similarity with synonym expansion (for example, sneakers → running shoes, workout → yoga mat / resistance bands).

**Churn** (`GET /api/churn/{customer_id}`)
- Features: purchase_frequency, average_spend, last_purchase_days, view_count, wishlist_count, cart_count, session_count, review_count. Target: churn.
- The data is split 70/15/15 (train/validation/test) with a fixed seed. The API uses the first model that trains, in this order: XGBoost, then RandomForest, then NumPy logistic regression. Validation and test metrics are shown on the admin dashboard.
- Risk levels: < 0.40 Low, 0.40–0.69 Medium, ≥ 0.70 High. High risk gets a 20% offer (COMEBACK20). Medium risk gets 10% (SMART10).
- Features update live. A view, cart add, wishlist add, login or order changes the customer's features, so the prediction changes too.
- Note: the provided customer data has a weak signal (test ROC-AUC ≈ 0.54 with RandomForest). The pipeline works, but its accuracy is limited by the data.

## API

| Method | Path | Auth |
|---|---|---|
| GET | /api/health | – |
| GET | /api/products?page&limit&category&brand&min_price&max_price&min_rating&sort | – |
| GET | /api/products/{id} (includes similar products) | optional |
| GET | /api/categories, /api/home | – |
| GET | /api/search?q&category&min_price&max_price&min_rating&sort | optional |
| GET | /api/recommendations/{customer_id} (`guest` = popular) | self/admin |
| GET | /api/churn/{customer_id} | self/admin |
| POST | /api/auth/register, /api/auth/login; GET /api/auth/me | – / user |
| GET/POST/PATCH/DELETE | /api/cart/{customer_id}, /api/cart, /api/cart/{id} | user |
| GET/POST/DELETE | /api/wishlist/{customer_id}, /api/wishlist, /api/wishlist/{id} | user |
| POST/GET | /api/orders, /api/orders/{customer_id} | user |
| GET | /api/admin/analytics | admin |
| GET | /api/ml/status | – |

Every response has an `X-Response-Time-ms` header.

## Local development

```bash
# backend
pip install -r requirements.txt
cp .env.example backend/.env        # optional; SQLite is used when DATABASE_URL is empty
cd backend && uvicorn main:app --reload --port 8000

# frontend (new terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173 (proxies /api to :8000)
```

Single-process option: run `npm run build` in `frontend/`. FastAPI then serves `frontend/dist` at `/`.
Docker option: `docker compose up` (Postgres + API + Vite).

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| DATABASE_URL | backend | Postgres URL (empty = SQLite) |
| JWT_SECRET | backend | JWT signing key (if unset, a random key is used and it changes on every restart) |
| CORS_ORIGINS | backend | Comma-separated list of allowed frontend origins |
| CORS_ORIGIN_REGEX | backend | Optional regex, e.g. `https://.*\.vercel\.app` |
| USE_EMBEDDINGS | backend | `1` = SentenceTransformer + FAISS |
| DEMO_USER_PASSWORD / ADMIN_PASSWORD | backend | Override the demo account passwords |
| FRONTEND_API_URL | frontend build | Public backend URL |

## Deployment

**Backend and database on Render**
1. Push this folder to a GitHub repository.
2. In Render, choose **New → Blueprint** and select the repository. `render.yaml` creates the `smartcart-ai-api` web service and generates `JWT_SECRET`.
3. Set `CORS_ORIGINS` to your Vercel URL. Check `https://<service>.onrender.com/api/health`.

The blueprint does not create a database, because Render's free plan allows only one Postgres per account. Without `DATABASE_URL` the API uses SQLite and re-seeds from the CSVs on every restart. To keep data, set `DATABASE_URL` to a Supabase pooler URI or a Render Postgres connection string.

**Frontend on Vercel**
1. Import the repository and set **Root Directory** to `frontend`. The framework preset is Vite.
2. Add the environment variable `FRONTEND_API_URL=https://<service>.onrender.com`, then deploy. `vercel.json` handles SPA routing.

On the Render free plan, the service sleeps after it is idle. The first request after sleep can take about 30–60 s.

## Demo credentials (demo only)

| Role | Email | Password |
|---|---|---|
| Customer | demo@smartcart.ai | Demo@123 |
| Admin | admin@smartcart.ai | Admin@123 |

These accounts are for demonstration only. Override them with `DEMO_USER_PASSWORD` / `ADMIN_PASSWORD` for any shared deployment. The demo customer is linked to seeded customer C0021, which has real interaction history and a high churn risk. Payments are simulated ("Demo Payment Successful"); no real payment is processed.
