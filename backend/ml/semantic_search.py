"""Semantic product search.

Primary: SentenceTransformer(all-MiniLM-L6-v2) embeddings + FAISS inner-product index (enable with USE_EMBEDDINGS=1).
Fallback: TF-IDF (word + bigram) with query expansion and cosine similarity - always available, used until
embeddings are ready or if the embedding stack cannot load.
"""
import logging
import os
import re
import threading
import time
from collections import Counter

import numpy as np

from database import DATA_DIR
from ml.tfidf import Tfidf, l2norm

log = logging.getLogger("smartcart.search")

SYNONYMS = {
    "sneakers": "running shoes", "shoe": "shoes", "jogging": "running shoes", "trainers": "running shoes",
    "footwear": "shoes", "run": "running", "earphones": "wireless headphones", "earbuds": "wireless headphones",
    "headset": "headphones", "music": "headphones speaker", "speaker": "bluetooth speaker", "watch": "smart watch",
    "fitness": "gym yoga resistance sports", "workout": "gym gloves yoga mat resistance bands", "exercise": "yoga mat resistance bands",
    "skincare": "face wash moisturizer sunscreen", "skin": "moisturizer face wash", "hair": "hair serum",
    "cooking": "air fryer non-stick pan", "kitchen": "home kitchen", "coffee": "coffee maker", "charger": "power bank",
    "battery": "power bank", "bag": "backpack travel pouch", "travel": "travel pouch backpack", "reading": "book novel",
    "coding": "programming book", "python": "programming book data science", "jacket": "denim jacket",
    "tshirt": "cotton t-shirt", "shirt": "casual shirt t-shirt", "pants": "track pants", "lamp": "table lamp light",
    "light": "table lamp", "glasses": "sunglasses", "phone": "phone case power bank", "laptop": "laptop stand",
    "cricket": "cricket bat", "soccer": "football", "cheap": "", "affordable": "", "best": "", "good": "",
}
PRICE_MAX = re.compile(r"(?:under|below|less than|within|upto|up to|<|max)\s*(?:rs\.?|inr|₹|\$)?\s*(\d[\d,]*)", re.I)
PRICE_MIN = re.compile(r"(?:over|above|more than|greater than|>|min)\s*(?:rs\.?|inr|₹|\$)?\s*(\d[\d,]*)", re.I)
MODEL_NAME = "all-MiniLM-L6-v2"


def parse_query(q: str):
    """Extract price constraints from natural language, return (clean_text, min_price, max_price)."""
    max_p = min_p = None
    if m := PRICE_MAX.search(q):
        max_p = float(m.group(1).replace(",", ""))
        q = q.replace(m.group(0), " ")
    if m := PRICE_MIN.search(q):
        min_p = float(m.group(1).replace(",", ""))
        q = q.replace(m.group(0), " ")
    return q.strip(), min_p, max_p


def expand(q: str) -> str:
    words = q.lower().split()
    return " ".join(words + [SYNONYMS[w] for w in words if SYNONYMS.get(w)])


class SemanticSearch:
    def __init__(self):
        self.mode = "tfidf"
        self.stats = Counter()
        self.index = None
        self.model = None

    def fit(self, products):
        t0 = time.time()
        self.ids = [p["id"] for p in products]
        self.docs = [f"{p['name']}. {p['name']} by {p['brand']}. Category: {p['category']}. {p['description']}" for p in products]
        self.tfidf = Tfidf()
        self.matrix = self.tfidf.fit_transform([f"{p['name']} {p['name']} {p['name']} {p['category']} {p['brand']} {p['description']}" for p in products])
        log.info("TF-IDF search index built in %.2fs", time.time() - t0)
        if os.getenv("USE_EMBEDDINGS", "0") == "1":
            threading.Thread(target=self._build_embeddings, daemon=True).start()

    def _build_embeddings(self):
        try:
            t0 = time.time()
            import faiss
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(MODEL_NAME)
            cache = os.path.join(DATA_DIR, f"embeddings_{len(self.ids)}.npy")
            if os.path.exists(cache):
                emb = np.load(cache)
            else:
                emb = self.model.encode(self.docs, batch_size=64, normalize_embeddings=True, show_progress_bar=False).astype(np.float32)
                np.save(cache, emb)
            index = faiss.IndexFlatIP(emb.shape[1])
            index.add(emb)
            self.index, self.mode = index, "sentence-transformers+faiss"
            log.info("Embedding index ready (%d vectors) in %.1fs", len(emb), time.time() - t0)
        except Exception as e:  # never let the embedding stack take the site down
            log.warning("Embedding search unavailable, staying on TF-IDF fallback: %s", e)

    def search(self, query: str, k: int = 100):
        """Return (list of (product_id, score), min_price, max_price)."""
        self.stats["queries"] += 1
        text, min_p, max_p = parse_query(query)
        if not text:
            return [], min_p, max_p
        if self.index is not None:
            try:
                q = self.model.encode([text], normalize_embeddings=True).astype(np.float32)
                scores, idx = self.index.search(q, min(k, len(self.ids)))
                return [(self.ids[i], float(s)) for s, i in zip(scores[0], idx[0]) if i >= 0 and s > 0.2], min_p, max_p
            except Exception as e:
                log.warning("Embedding query failed, using TF-IDF: %s", e)
        qv = l2norm(self.tfidf.transform([expand(text)])[0])
        scores = self.matrix @ qv
        order = np.argsort(-scores)[:k]
        return [(self.ids[i], float(scores[i])) for i in order if scores[i] > 0.05], min_p, max_p


search_engine = SemanticSearch()
