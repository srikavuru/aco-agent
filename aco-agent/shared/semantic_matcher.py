"""
SemanticMatcher — Wraps sentence-transformers for deterministic similarity scoring.

Model: all-MiniLM-L6-v2 (22MB, CPU-friendly, fast inference)
- Loads once at module import and stays in memory for the Function instance lifetime.
- Pre-computed embeddings for canonical rule texts are loaded from cache on startup.
- Scores are 0.0–1.0 cosine similarity. Thresholds are set per-rule in rules.json.
"""

import logging
import numpy as np

logger = logging.getLogger(__name__)

_model = None
_model_name = "all-MiniLM-L6-v2"
_precomputed_cache: dict[str, np.ndarray] = {}


def _get_model():
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading semantic model '%s' — cold start.", _model_name)
            _model = SentenceTransformer(_model_name)
            logger.info("Semantic model loaded.")
        except ImportError:
            logger.error(
                "sentence-transformers not installed. "
                "Falling back to substring matching."
            )
            _model = None
    return _model


def _get_precomputed():
    global _precomputed_cache
    if not _precomputed_cache:
        from shared.embedding_cache import load_cache
        _precomputed_cache = load_cache()
    return _precomputed_cache


class SemanticMatcher:
    def __init__(self):
        self._cache: dict[str, np.ndarray] = {}
        self._precomputed = _get_precomputed()

    def similarity(self, text_a: str, text_b: str) -> float:
        """
        Returns cosine similarity in [0.0, 1.0].
        Chunks text_a into paragraphs for per-section matching.
        Uses pre-computed embeddings for text_b when available (canonical texts).
        """
        model = _get_model()

        if model is None:
            return self._fallback_token_overlap(text_a, text_b)

        try:
            emb_b = self._encode(model, text_b)
            chunks = self._chunk(text_a)
            best = 0.0
            for chunk in chunks:
                emb_a = self._encode(model, chunk)
                score = float(np.dot(emb_a, emb_b) / (np.linalg.norm(emb_a) * np.linalg.norm(emb_b)))
                score = max(0.0, min(1.0, score))
                if score > best:
                    best = score
            return best
        except Exception as exc:
            logger.warning("Semantic similarity error: %s — falling back to token overlap.", exc)
            return self._fallback_token_overlap(text_a, text_b)

    @staticmethod
    def _chunk(text: str) -> list[str]:
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        return paragraphs if paragraphs else [text]

    def _encode(self, model, text: str) -> np.ndarray:
        cache_key = text[:128]
        if cache_key in self._precomputed:
            return self._precomputed[cache_key]
        if cache_key not in self._cache:
            if len(self._cache) >= 64:
                oldest = next(iter(self._cache))
                del self._cache[oldest]
            self._cache[cache_key] = model.encode(text, normalize_embeddings=True)
        return self._cache[cache_key]

    @staticmethod
    def _fallback_token_overlap(text_a: str, text_b: str) -> float:
        tokens_a = set(text_a.lower().split())
        tokens_b = set(text_b.lower().split())
        if not tokens_b:
            return 0.0
        return len(tokens_a & tokens_b) / len(tokens_b)
