"""
Warmup endpoint — forces the semantic model to load so the next
real audit request doesn't pay the cold-start penalty.

GET /api/warmup → 200 {"status": "warm", "model_loaded": true, "ms": 42}
"""

import json
import logging
import time

import azure.functions as func

logger = logging.getLogger(__name__)


def main(req: func.HttpRequest) -> func.HttpResponse:
    start = time.time()

    model_loaded = False
    try:
        from shared.semantic_matcher import SemanticMatcher
        sm = SemanticMatcher()
        sm.similarity("warmup probe", "warmup probe")
        model_loaded = True
    except Exception as e:
        logger.warning("Warmup model load failed: %s", e)

    elapsed_ms = round((time.time() - start) * 1000)
    logger.info("Warmup complete: model_loaded=%s, %dms", model_loaded, elapsed_ms)

    return func.HttpResponse(
        json.dumps({"status": "warm", "model_loaded": model_loaded, "ms": elapsed_ms}),
        status_code=200,
        mimetype="application/json",
    )
