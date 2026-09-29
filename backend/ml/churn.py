"""Customer churn model trained once at startup on smartcart_customers.csv (70/15/15 split).

Model preference: XGBoost -> scikit-learn RandomForest -> NumPy logistic regression (last-resort fallback).
"""
import csv
import logging
import os
import time

import numpy as np

from database import DATA_DIR

log = logging.getLogger("smartcart.churn")

FEATURES = ["purchase_frequency", "average_spend", "last_purchase_days", "view_count",
            "wishlist_count", "cart_count", "session_count", "review_count"]


def _auc(y, p):
    order = np.argsort(p)
    ranks = np.empty(len(p))
    ranks[order] = np.arange(1, len(p) + 1)
    pos = y == 1
    n_pos, n_neg = pos.sum(), (~pos).sum()
    return float((ranks[pos].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)) if n_pos and n_neg else 0.5


def _metrics(y, p):
    pred = (p >= 0.5).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum())
    prec = tp / max(int(pred.sum()), 1)
    rec = tp / max(int(y.sum()), 1)
    return {"accuracy": round(float((pred == y).mean()), 3), "precision": round(prec, 3),
            "recall": round(rec, 3), "roc_auc": round(_auc(y, p), 3), "n": int(len(y))}


class _NumpyLogReg:
    def fit(self, X, y, epochs=600, lr=0.1):
        self.mu, self.sd = X.mean(0), X.std(0) + 1e-9
        Z = (X - self.mu) / self.sd
        self.w, self.b = np.zeros(Z.shape[1]), 0.0
        for _ in range(epochs):
            p = 1 / (1 + np.exp(-(Z @ self.w + self.b)))
            self.w -= lr * (Z.T @ (p - y) / len(y) + 1e-3 * self.w)
            self.b -= lr * float((p - y).mean())
        self.feature_importances_ = np.abs(self.w) / (np.abs(self.w).sum() + 1e-9)
        return self

    def predict_proba(self, X):
        p = 1 / (1 + np.exp(-(((X - self.mu) / self.sd) @ self.w + self.b)))
        return np.column_stack([1 - p, p])


def risk_level(p: float) -> str:
    return "High" if p >= 0.70 else "Medium" if p >= 0.40 else "Low"


def recommended_action(level: str) -> str:
    return {"High": "Offer personalized discount",
            "Medium": "Send re-engagement email with recommended products",
            "Low": "Maintain engagement with loyalty rewards"}[level]


class ChurnModel:
    def __init__(self):
        self.model = None
        self.name = "unavailable"
        self.metrics = {}

    def train(self):
        path = os.path.join(DATA_DIR, "smartcart_customers.csv")
        if not os.path.exists(path):
            log.warning("smartcart_customers.csv missing - churn model uses heuristic scoring")
            return
        t0 = time.time()
        with open(path, encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        X = np.array([[float(r[c]) for c in FEATURES] for r in rows])
        y = np.array([int(r["churn"]) for r in rows])
        perm = np.random.default_rng(42).permutation(len(y))
        n_tr, n_va = int(0.70 * len(y)), int(0.15 * len(y))
        tr, va, te = perm[:n_tr], perm[n_tr:n_tr + n_va], perm[n_tr + n_va:]

        candidates = []
        try:
            from xgboost import XGBClassifier
            candidates.append(("XGBoost", lambda: XGBClassifier(n_estimators=200, max_depth=4, learning_rate=0.05,
                                                                 subsample=0.9, eval_metric="logloss")))
        except Exception:
            pass
        try:
            from sklearn.ensemble import RandomForestClassifier
            candidates.append(("RandomForest", lambda: RandomForestClassifier(n_estimators=300, max_depth=8, min_samples_leaf=3,
                                                                               random_state=42, n_jobs=1)))
        except Exception:
            pass
        candidates.append(("LogisticRegression (NumPy fallback)", _NumpyLogReg))

        best = None
        for name, make in candidates:  # first model that trains successfully, in order of preference
            try:
                m = make().fit(X[tr], y[tr])
                val = _metrics(y[va], m.predict_proba(X[va])[:, 1])
                log.info("Churn model %s validation=%s", name, val)
                best = (name, m, val)
                break
            except Exception as e:
                log.warning("Churn candidate %s failed: %s", name, e)
        self.name, self.model, val = best
        test = _metrics(y[te], self.model.predict_proba(X[te])[:, 1])
        imp = getattr(self.model, "feature_importances_", np.zeros(len(FEATURES)))
        self.metrics = {"model": self.name, "split": {"train": len(tr), "validation": len(va), "test": len(te)},
                        "validation": val, "test": test,
                        "feature_importance": {f: round(float(v), 3) for f, v in sorted(zip(FEATURES, imp), key=lambda x: -x[1])}}
        log.info("Churn model %s trained in %.2fs, test=%s", self.name, time.time() - t0, test)

    def predict(self, features: dict) -> float:
        x = np.array([[float(features.get(c, 0) or 0) for c in FEATURES]])
        if self.model is not None:
            try:
                return float(self.model.predict_proba(x)[0, 1])
            except Exception as e:
                log.warning("Churn predict failed, using heuristic: %s", e)
        # Heuristic fallback: recency dominates
        return float(min(1.0, max(0.0, features.get("last_purchase_days", 0) / 120 - features.get("purchase_frequency", 0) / 40)))

    def predict_many(self, rows):
        if self.model is None or not rows:
            return [self.predict(r) for r in rows]
        X = np.array([[float(r.get(c, 0) or 0) for c in FEATURES] for r in rows])
        return self.model.predict_proba(X)[:, 1].tolist()


churn_model = ChurnModel()
