"""
Persistence layer — saves audit certificates to CosmosDB.

Non-blocking: logs errors but never fails the audit response.
Skips silently if COSMOS_ENDPOINT is not configured.
"""

import logging
import os
import threading

logger = logging.getLogger(__name__)


def save_certificate(certificate: dict) -> None:
    """Fire-and-forget save to CosmosDB. Runs in a background thread."""
    if not os.environ.get("COSMOS_ENDPOINT"):
        return

    thread = threading.Thread(
        target=_save_sync,
        args=(certificate,),
        daemon=True,
    )
    thread.start()


def _save_sync(certificate: dict) -> None:
    try:
        from shared.cosmos_writer import CosmosWriter
        writer = CosmosWriter()
        result = writer.save(certificate)
        logger.info("Certificate persisted: %s", result.get("id"))
    except Exception as e:
        logger.error("Failed to persist certificate: %s", e)
