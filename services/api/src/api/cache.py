import time
from collections.abc import Callable, Hashable
from typing import Any


class TTLCache:
    """A small in-memory cache whose entries expire after `ttl_seconds`.

    When full, the oldest entry is dropped. This is per-process memory only:
    it is lost on restart and not shared between server instances.
    """

    def __init__(
        self,
        ttl_seconds: float,
        max_entries: int = 128,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._clock = clock
        self._items: dict[Hashable, tuple[float, Any]] = {}

    def get(self, key: Hashable) -> Any | None:
        entry = self._items.get(key)
        if entry is None:
            return None

        expires_at, value = entry
        if self._clock() >= expires_at:
            del self._items[key]
            return None
        return value

    def set(self, key: Hashable, value: Any) -> None:
        # Re-inserting moves the key to the end, so order means "oldest first".
        self._items.pop(key, None)
        if len(self._items) >= self.max_entries:
            del self._items[next(iter(self._items))]
        self._items[key] = (self._clock() + self.ttl_seconds, value)

    def __len__(self) -> int:
        return len(self._items)
