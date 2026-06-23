"""
CosmosDB Audit Certificate Writer — Phase 3

Persists Audit Certificates to Azure CosmosDB for legal record-keeping.

Container design:
  Database:  aco-db
  Container: audit-certificates
  Partition key: /posting/region   (query pattern: "all audits for CO" is common)
  TTL: 7 years (legal hold requirement for employment records)
  Indexing: audit_id, audited_at_epoch, posting.submitted_by, audit_result.overall_status

Usage:
  from functions.shared.cosmos_writer import CosmosWriter
  writer = CosmosWriter()
  result = writer.save(certificate)

Environment variables required (set in Azure Function App Settings):
  COSMOS_ENDPOINT      — https://<account>.documents.azure.com:443/
  COSMOS_KEY           — Primary or secondary master key (use Managed Identity in prod)
  COSMOS_DATABASE      — aco-db
  COSMOS_CONTAINER     — audit-certificates
"""

import os
import logging
import json
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Seconds in 7 years — CosmosDB TTL field
LEGAL_HOLD_TTL_SECONDS = 7 * 365 * 24 * 3600  # 220,752,000


class CosmosWriter:
    def __init__(self):
        self._client = None
        self._container = None
        self._endpoint = os.environ.get("COSMOS_ENDPOINT")
        self._key = os.environ.get("COSMOS_KEY")
        self._database = os.environ.get("COSMOS_DATABASE", "aco-db")
        self._container_name = os.environ.get("COSMOS_CONTAINER", "audit-certificates")

    def _get_container(self):
        """Lazy init — only connect when actually writing (avoids cold start penalty)."""
        if self._container is not None:
            return self._container

        if not self._endpoint or not self._key:
            raise EnvironmentError(
                "COSMOS_ENDPOINT and COSMOS_KEY must be set in Azure Function App Settings. "
                "Never hardcode credentials."
            )

        try:
            from azure.cosmos import CosmosClient, PartitionKey, exceptions
            client = CosmosClient(self._endpoint, credential=self._key)
            db = client.get_database_client(self._database)
            self._container = db.get_container_client(self._container_name)
            logger.info("CosmosDB container client initialized: %s/%s", self._database, self._container_name)
            return self._container
        except ImportError:
            raise ImportError("azure-cosmos package not installed. Run: pip install azure-cosmos")

    def save(self, certificate: dict[str, Any], max_retries: int = 3) -> dict[str, Any]:
        """
        Upsert an Audit Certificate to CosmosDB.

        Uses upsert (not insert) so re-runs of the same audit_id are idempotent.
        The audit_id is the CosmosDB document 'id' — ensures no duplicate records
        for a given audit run.

        Returns the saved document on success, raises on terminal failure.
        """
        container = self._get_container()

        # Prepare document for CosmosDB
        doc = self._prepare_doc(certificate)

        last_exc = None
        for attempt in range(1, max_retries + 1):
            try:
                result = container.upsert_item(doc)
                logger.info(
                    "Audit certificate saved: %s | CosmosDB etag: %s",
                    doc["id"], result.get("_etag", "N/A")
                )
                return result
            except Exception as exc:
                last_exc = exc
                wait = 2 ** attempt  # Exponential backoff: 2s, 4s, 8s
                logger.warning(
                    "CosmosDB write attempt %d/%d failed: %s — retrying in %ds",
                    attempt, max_retries, exc, wait
                )
                if attempt < max_retries:
                    time.sleep(wait)

        logger.error(
            "CosmosDB write failed after %d attempts for audit %s: %s",
            max_retries, doc.get("id"), last_exc
        )
        raise last_exc

    def get_audit(self, audit_id: str, region: str) -> Optional[dict[str, Any]]:
        """
        Retrieve a specific audit certificate by ID.
        Region is the partition key — must be provided for single-document reads.
        """
        container = self._get_container()
        try:
            return container.read_item(item=audit_id, partition_key=region)
        except Exception as exc:
            logger.error("Failed to retrieve audit %s: %s", audit_id, exc)
            return None

    def query_by_recruiter(self, submitted_by: str, limit: int = 50) -> list[dict]:
        """
        Pull recent audits by recruiter. Used for dashboard / compliance reports.
        """
        container = self._get_container()
        query = (
            "SELECT c.audit_id, c.audited_at, c.posting, c.audit_result.overall_status "
            "FROM c WHERE c.posting.submitted_by = @submitted_by "
            "ORDER BY c.audited_at_epoch DESC OFFSET 0 LIMIT @limit"
        )
        params = [
            {"name": "@submitted_by", "value": submitted_by},
            {"name": "@limit", "value": limit}
        ]
        try:
            return list(container.query_items(
                query=query,
                parameters=params,
                enable_cross_partition_query=True
            ))
        except Exception as exc:
            logger.error("Query by recruiter failed: %s", exc)
            return []

    def query_blocked_postings(self, days: int = 30) -> list[dict]:
        """
        Compliance dashboard: all BLOCKED audits in the last N days.
        """
        from datetime import datetime, timezone, timedelta
        cutoff = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())
        container = self._get_container()
        query = (
            "SELECT c.audit_id, c.audited_at, c.posting.title, c.posting.submitted_by, "
            "c.executive_summary.critical_issues "
            "FROM c WHERE c.audit_result.overall_status = 'BLOCKED' "
            "AND c.audited_at_epoch >= @cutoff ORDER BY c.audited_at_epoch DESC"
        )
        params = [{"name": "@cutoff", "value": cutoff}]
        try:
            return list(container.query_items(
                query=query,
                parameters=params,
                enable_cross_partition_query=True
            ))
        except Exception as exc:
            logger.error("Blocked postings query failed: %s", exc)
            return []

    @staticmethod
    def _prepare_doc(certificate: dict[str, Any]) -> dict[str, Any]:
        """
        Map Audit Certificate to CosmosDB document format.
        - 'id' field is required by CosmosDB — mapped from audit_id.
        - 'ttl' set to 7-year legal hold.
        - Partition key /posting/region must exist in the document.
        """
        doc = dict(certificate)
        doc["id"] = certificate["audit_id"]                   # CosmosDB requires 'id'
        doc["ttl"] = LEGAL_HOLD_TTL_SECONDS                  # 7-year auto-expiry
        doc["_document_type"] = "audit_certificate"           # Useful for multi-type containers

        # Ensure partition key path /posting/region exists at document level too
        # (CosmosDB SDK can resolve nested paths, but this makes queries explicit)
        doc["_partition_key"] = certificate.get("posting", {}).get("region", "UNKNOWN")

        return doc


# ── Standalone test helper ────────────────────────────────────────────────────
# Run: python -m functions.shared.cosmos_writer
if __name__ == "__main__":
    import sys
    from datetime import datetime, timezone

    print("CosmosDB Writer — connection test")
    print(f"  COSMOS_ENDPOINT: {os.environ.get('COSMOS_ENDPOINT', 'NOT SET')}")
    print(f"  COSMOS_DATABASE: {os.environ.get('COSMOS_DATABASE', 'NOT SET')}")
    print(f"  COSMOS_CONTAINER: {os.environ.get('COSMOS_CONTAINER', 'NOT SET')}")

    # Minimal test certificate
    test_cert = {
        "audit_id": "ACO-TEST-00000001",
        "certificate_version": "1.0.0",
        "rules_schema_version": "1.0.0",
        "audited_at": datetime.now(timezone.utc).isoformat(),
        "audited_at_epoch": int(datetime.now(timezone.utc).timestamp()),
        "posting": {
            "title": "TEST POSTING — DO NOT USE",
            "region": "OH",
            "role_type": "test",
            "job_description_fingerprint": "test1234",
            "submitted_by": "cosmos_test_script"
        },
        "audit_result": {
            "overall_status": "APPROVED",
            "action_required": False,
            "counts": {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0},
            "total_findings": 0,
            "publish_recommendation": "Test write — approved.",
            "escalation_note": ""
        },
        "executive_summary": {"critical_issues": [], "high_priority_issues": []},
        "findings": [],
        "legal_record": {
            "decision_authority": "HUMAN_RECRUITER",
            "tool_type": "DECISION_SUPPORT",
            "audit_engine": "ACO v1.0 test",
            "model_used_for_semantic": "all-MiniLM-L6-v2",
            "disclaimer": "Test write."
        }
    }

    try:
        writer = CosmosWriter()
        result = writer.save(test_cert)
        print(f"SUCCESS — Document saved with id: {result.get('id')}")
    except Exception as e:
        print(f"FAILED: {e}")
        sys.exit(1)
