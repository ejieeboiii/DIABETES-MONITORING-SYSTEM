"""Bounded per-process authentication throttling for the private prototype API.

No account identifiers/credentials are stored. Deployment needs a shared gateway
limit across workers; this limiter does not claim distributed attack protection.
"""
from collections import OrderedDict
from math import ceil
from threading import Lock
import time
from fastapi import HTTPException, Request


class AuthAttemptLimiter:
    def __init__(self, limit: int = 30, window: int = 300, capacity: int = 4096):
        self.limit, self.window, self.capacity = limit, window, capacity
        self.entries = OrderedDict()
        self.lock = Lock()

    def check(self, key: tuple[str, str], now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        with self.lock:
            started, count = self.entries.get(key, (now, 0))
            if now - started >= self.window:
                started, count = now, 0
            if count >= self.limit:
                raise HTTPException(429, detail='Too many authentication attempts. Please wait and retry.',
                                    headers={'Retry-After': str(max(1, ceil(self.window - (now - started))))})
            self.entries[key] = (started, count + 1)
            self.entries.move_to_end(key)
            while len(self.entries) > self.capacity:
                self.entries.popitem(last=False)


creation_lock = Lock()


def limit_auth_attempts(request: Request) -> None:
    with creation_lock:
        limiter = getattr(request.app.state, 'auth_limiter', None)
        if limiter is None:
            limiter = AuthAttemptLimiter()
            request.app.state.auth_limiter = limiter
    # Do not independently trust caller-provided X-Forwarded-For.
    host = request.client.host if request.client else 'unknown'
    limiter.check((host, request.url.path))
