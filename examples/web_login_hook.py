"""Call this after YOUR web application has decided whether login succeeded.

This is not a login endpoint or password checker. It must run on the server.
"""

import logging

from collectors.web_auth import QueueError, WebAuthCollector

logger = logging.getLogger(__name__)


def observe_web_login(collector: WebAuthCollector, *, username: str,
                      client_ip: str, authenticated: bool) -> bool:
    """True means queued locally, not delivered. Never change the login outcome."""
    if not isinstance(authenticated, bool):
        raise TypeError("authenticated must be the application's boolean authentication result")
    try:
        collector.record_login(username=username, ip_address=client_ip,
                               outcome="success" if authenticated else "failed")
    except (QueueError, ValueError, OSError):
        # Do not log passwords, supplied usernames, IPs, tokens or raw exceptions.
        logger.warning("SentinelAI event not queued; check collector health/capacity")
        return False
    return True
