"""TF-IDF helper: uses scikit-learn when available, otherwise a small NumPy implementation."""
import math
import re
from collections import Counter

import numpy as np

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    SKLEARN = True
except Exception:  # sklearn/scipy unavailable (e.g. blocked DLLs) -> numpy fallback
    SKLEARN = False

TOKEN = re.compile(r"[a-z0-9]+")
STOP = {"a", "an", "the", "and", "or", "for", "with", "of", "to", "in", "on", "is", "it", "use", "i", "me", "my", "want", "need", "some"}


def tokenize(text: str):
    toks = [t for t in TOKEN.findall(text.lower()) if t not in STOP]
    return toks + [f"{a}_{b}" for a, b in zip(toks, toks[1:])]


def l2norm(m: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(m, axis=-1, keepdims=True)
    n[n == 0] = 1
    return m / n


class Tfidf:
    def fit_transform(self, docs):
        if SKLEARN:
            self.vec = TfidfVectorizer(tokenizer=tokenize, lowercase=False, token_pattern=None, sublinear_tf=True)
            return self.vec.fit_transform(docs).toarray().astype(np.float32)
        tokenized = [tokenize(d) for d in docs]
        df = Counter(t for toks in tokenized for t in set(toks))
        self.vocab = {t: i for i, t in enumerate(sorted(df))}
        n = len(docs)
        self.idf = np.array([math.log((1 + n) / (1 + df[t])) + 1 for t in sorted(df)], dtype=np.float32)
        return np.vstack([self._vec(toks) for toks in tokenized]) if docs else np.zeros((0, len(self.vocab)), np.float32)

    def _vec(self, toks):
        v = np.zeros(len(self.vocab), dtype=np.float32)
        for t, c in Counter(toks).items():
            i = self.vocab.get(t)
            if i is not None:
                v[i] = (1 + math.log(c)) * self.idf[i]
        return l2norm(v)

    def transform(self, docs):
        if SKLEARN:
            return self.vec.transform(docs).toarray().astype(np.float32)
        return np.vstack([self._vec(tokenize(d)) for d in docs])
