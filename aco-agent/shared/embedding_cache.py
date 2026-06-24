"""
Embedding Cache — Pre-computes and caches embeddings for canonical
rule texts so the semantic matcher doesn't re-encode them on every audit.

On first run, encodes all canonical_text and allowed_variants from
rules.json and saves to data/cache/embeddings.npz. Subsequent loads
read from the cache file (~50KB) instead of re-encoding.

This cuts per-audit semantic matching from ~200ms to ~50ms since only
the JD paragraphs need encoding — the rule-side embeddings are cached.
"""

import json
import logging
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

CACHE_PATH = Path(__file__).parent.parent / "data" / "cache" / "embeddings.npz"
RULES_PATH = Path(__file__).parent.parent / "data" / "rules" / "rules.json"


def build_cache() -> dict[str, np.ndarray]:
    """Encode all canonical texts and variants, save to disk."""
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        logger.warning("sentence-transformers not installed, skipping cache build")
        return {}

    with open(RULES_PATH) as f:
        rules = json.load(f)

    texts = []
    for cat_data in rules.get("rule_categories", {}).values():
        for rule in cat_data.get("rules", []):
            if rule.get("match_type") != "semantic":
                continue
            canonical = rule.get("canonical_text", "")
            if canonical:
                texts.append(canonical)
            for variant in rule.get("allowed_variants", []):
                if variant and len(variant) > 4:
                    texts.append(variant)

    if not texts:
        return {}

    logger.info("Building embedding cache for %d texts...", len(texts))
    model = SentenceTransformer("all-MiniLM-L6-v2")
    embeddings = model.encode(texts, normalize_embeddings=True)

    cache = {text[:128]: emb for text, emb in zip(texts, embeddings)}

    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(CACHE_PATH, **{str(i): emb for i, emb in enumerate(embeddings)})

    keys_path = CACHE_PATH.with_suffix(".keys.json")
    with open(keys_path, "w") as f:
        json.dump([t[:128] for t in texts], f)

    logger.info("Embedding cache saved: %d entries → %s", len(cache), CACHE_PATH)
    return cache


def load_cache() -> dict[str, np.ndarray]:
    """Load pre-computed embeddings from disk."""
    keys_path = CACHE_PATH.with_suffix(".keys.json")
    if not CACHE_PATH.exists() or not keys_path.exists():
        return {}

    try:
        with open(keys_path) as f:
            keys = json.load(f)
        data = np.load(CACHE_PATH)
        cache = {key: data[str(i)] for i, key in enumerate(keys) if str(i) in data}
        logger.info("Loaded embedding cache: %d entries", len(cache))
        return cache
    except Exception as e:
        logger.warning("Failed to load embedding cache: %s", e)
        return {}
