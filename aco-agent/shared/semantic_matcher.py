"""
SemanticMatcher — Wraps sentence-transformers for deterministic similarity scoring.

Model: all-MiniLM-L6-v2 (22MB, CPU-friendly, fast inference)
- Loads once at module import and stays in memory for the Function instance lifetime.
- On Azure Consumption Plan: expect ~1-2s cold start. Premium Plan eliminates this.
- Scores are 0.0–1.0 cosine similarity. Thresholds are set per-rule in rules.json.

Why not GPT/Claude for semantic matching?
- Determinism: same input → same score every time. Required for audit trail integrity.
- Cost: sentence-transformers are free; API calls per audit would add up at scale.
- Latency: local inference is ~5ms. API round-trip is 300-800ms.
- Legal defensibility: "we used a threshold of 0.82 on a published model" is auditable.
"""

import logging
from typing import Optional
import numpy as np

logger = logging.getLogger(__name__)

# Lazy import — only load the heavy model on first use
_model = None
_model_name = "all-MiniLM-L6-v2"


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
                "Run: pip install sentence-transformers. "
                "Falling back to substring matching."
            )
            _model = None
    return _model


class SemanticMatcher:
    """
    Stateless similarity scorer. Instantiate once per RuleEngine run.
    Caches the last 32 embeddings to avoid re-encoding repeated canonical texts.
    """

    def __init__(self):
        self._cache: dict[str, np.ndarray] = {}

    def similarity(self, text_a: str, text_b: str) -> float:
        """
        Returns cosine similarity in [0.0, 1.0].
        When text_a is long, chunks it into paragraphs and returns the
        best per-paragraph score so that a matching section buried in a
        long document isn't diluted by unrelated content.
        Falls back to a rough token overlap score if model is unavailable.
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
        """Split text into paragraph-level chunks for per-section matching."""
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        if not paragraphs:
            return [text]
        return paragraphs

    def _encode(self, model, text: str) -> np.ndarray:
        """Encode with simple LRU-style cache keyed on first 128 chars."""
        cache_key = text[:128]
        if cache_key not in self._cache:
            if len(self._cache) >= 32:
                # Evict oldest entry
                oldest = next(iter(self._cache))
                del self._cache[oldest]
            self._cache[cache_key] = model.encode(text, normalize_embeddings=True)
        return self._cache[cache_key]

    @staticmethod
    def _fallback_token_overlap(text_a: str, text_b: str) -> float:
        """
        Naive token overlap ratio. Used only when sentence-transformers is
        unavailable (e.g., dev environment without the package).
        
        NOT suitable for production semantic matching — thresholds calibrated
        against sentence-transformers cosine similarity scores.
        """
        tokens_a = set(text_a.lower().split())
        tokens_b = set(text_b.lower().split())
        if not tokens_b:
            return 0.0
        overlap = len(tokens_a & tokens_b)
        return overlap / len(tokens_b)
