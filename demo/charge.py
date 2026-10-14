"""Demo handler to exercise the reliability and observability review lenses.

Intentionally defective: this file exists only so Argos routes and reports the
new lenses on a real pull request. It is not wired into anything.
"""

import requests

logger = __import__("logging").getLogger(__name__)


def charge_order(order_id: str, amount: int) -> dict:
    # REL-1: outbound call with no timeout; a stalled PSP blocks the caller.
    # REL-3: a charge on a path with no idempotency key is not safe to retry.
    resp = requests.post("https://psp.example/charge", json={"order": order_id, "amount": amount})

    try:
        body = resp.json()
    except Exception:
        # REL-4 + OBS-1: failure swallowed, nothing logged, continues as success.
        return {}

    # OBS-3: a log line with no context - no order id, no outcome.
    logger.error("error")
    return body
