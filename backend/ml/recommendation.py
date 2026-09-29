"""Hybrid recommender: 0.6 * content (TF-IDF + price/rating) + 0.4 * item-item collaborative score."""
import logging
import time
from collections import Counter, defaultdict

import numpy as np

from ml.tfidf import Tfidf, l2norm

log = logging.getLogger("smartcart.reco")

INTERACTION_WEIGHT = {"view": 1.0, "wishlist": 2.0, "cart": 2.5, "purchase": 3.0}
CONTENT_W, INTERACTION_W = 0.6, 0.4


def _minmax(x: np.ndarray) -> np.ndarray:
    lo, hi = float(x.min()), float(x.max())
    return np.zeros_like(x) if hi - lo < 1e-9 else (x - lo) / (hi - lo)


class Recommender:
    def __init__(self):
        self.ready = False
        self.stats = Counter()

    def fit(self, products, interactions):
        """products: list of dicts(id,name,category,brand,description,price,rating,review_count)
        interactions: list of (customer_id, product_id, interaction_type)"""
        t0 = time.time()
        self.ids = [p["id"] for p in products]
        self.idx = {pid: i for i, pid in enumerate(self.ids)}
        docs = [f"{p['name']} {p['name']} {p['category']} {p['category']} {p['brand']} {p['description']}" for p in products]
        text = Tfidf().fit_transform(docs)
        price = _minmax(np.log1p(np.array([p["price"] for p in products], dtype=np.float32)))
        rating = _minmax(np.array([p["rating"] for p in products], dtype=np.float32))
        self.features = l2norm(np.hstack([text, 0.35 * price[:, None], 0.35 * rating[:, None]]).astype(np.float32))

        # Customer x product matrix of weighted interactions
        users = sorted({c for c, _, _ in interactions if c})
        uidx = {u: i for i, u in enumerate(users)}
        R = np.zeros((max(len(users), 1), len(self.ids)), dtype=np.float32)
        for c, pid, kind in interactions:
            if c in uidx and pid in self.idx:
                R[uidx[c], self.idx[pid]] += INTERACTION_WEIGHT.get(kind, 1.0)
        cols = l2norm(R.T)
        self.item_sim = cols @ cols.T
        np.fill_diagonal(self.item_sim, 0)

        pop = np.log1p(R.sum(axis=0))
        reviews = np.log1p(np.array([p["review_count"] for p in products], dtype=np.float32))
        self.popularity = 0.6 * rating + 0.2 * _minmax(reviews) + 0.2 * _minmax(pop)
        self.ready = True
        log.info("Recommender fitted on %d products / %d customers in %.2fs", len(self.ids), len(users), time.time() - t0)

    def popular(self, k=10, exclude=()):
        order = np.argsort(-self.popularity)
        out = [(self.ids[i], float(self.popularity[i])) for i in order if self.ids[i] not in exclude]
        return out[:k]

    def recommend(self, history, k=10):
        """history: list of (product_id, interaction_type) for one customer."""
        self.stats["requests"] += 1
        weights = defaultdict(float)
        for pid, kind in history:
            if pid in self.idx:
                weights[self.idx[pid]] += INTERACTION_WEIGHT.get(kind, 1.0)
        if not weights:
            self.stats["cold_start"] += 1
            return [dict(product_id=p, score=s, content_score=0.0, interaction_score=0.0, strategy="popular") for p, s in self.popular(k)]

        items = np.array(list(weights.keys()))
        w = np.array(list(weights.values()), dtype=np.float32)
        profile = l2norm((self.features[items] * w[:, None]).sum(axis=0))
        content = _minmax(self.features @ profile)
        inter = self.item_sim[:, items] @ w
        inter = inter / inter.max() if inter.max() > 0 else inter
        final = CONTENT_W * content + INTERACTION_W * inter

        purchased = {self.idx[p] for p, kind in history if kind == "purchase" and p in self.idx}
        final[list(purchased)] = -1
        top = np.argsort(-final)[:k]
        self.stats["personalized"] += 1
        return [dict(product_id=self.ids[i], score=round(float(final[i]), 4), content_score=round(float(content[i]), 4),
                     interaction_score=round(float(inter[i]), 4), strategy="hybrid") for i in top]

    def similar(self, product_id, k=8):
        i = self.idx.get(product_id)
        if i is None:
            return []
        content = self.features @ self.features[i]
        inter = self.item_sim[i]
        inter = inter / inter.max() if inter.max() > 0 else inter
        final = CONTENT_W * content + INTERACTION_W * inter
        final[i] = -1
        return [(self.ids[j], round(float(final[j]), 4)) for j in np.argsort(-final)[:k]]


recommender = Recommender()
