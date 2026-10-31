from api.cache import TTLCache


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def make_cache(**kwargs):
    clock = FakeClock()
    return TTLCache(ttl_seconds=10, clock=clock, **kwargs), clock


def test_miss_returns_none():
    cache, _ = make_cache()

    assert cache.get("missing") is None


def test_hit_returns_the_stored_value():
    cache, _ = make_cache()
    cache.set("key", {"total_count": 1})

    assert cache.get("key") == {"total_count": 1}


def test_entry_expires_after_the_ttl():
    cache, clock = make_cache()
    cache.set("key", "value")

    clock.now = 9.9
    assert cache.get("key") == "value"

    clock.now = 10.0
    assert cache.get("key") is None
    assert len(cache) == 0  # the expired entry was removed


def test_setting_again_refreshes_the_expiry():
    cache, clock = make_cache()
    cache.set("key", "old")
    clock.now = 8
    cache.set("key", "new")

    clock.now = 15  # past the first expiry, before the second
    assert cache.get("key") == "new"


def test_keys_are_independent():
    cache, _ = make_cache()
    cache.set(("q", 20, 1), "page one")
    cache.set(("q", 20, 2), "page two")

    assert cache.get(("q", 20, 1)) == "page one"
    assert cache.get(("q", 20, 2)) == "page two"


def test_oldest_entry_is_dropped_when_full():
    cache, _ = make_cache(max_entries=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3)

    assert cache.get("a") is None
    assert cache.get("b") == 2
    assert cache.get("c") == 3
    assert len(cache) == 2


def test_refreshing_a_key_protects_it_from_eviction():
    cache, _ = make_cache(max_entries=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("a", 10)  # "a" is now the newest
    cache.set("c", 3)  # evicts "b", the oldest

    assert cache.get("a") == 10
    assert cache.get("b") is None


def test_changing_a_returned_value_does_not_change_the_cache():
    cache, _ = make_cache()
    cache.set("key", {"items": [1]})

    cache.get("key")["items"].append(2)

    assert cache.get("key") == {"items": [1]}


def test_changing_the_stored_value_later_does_not_change_the_cache():
    cache, _ = make_cache()
    value = {"items": [1]}
    cache.set("key", value)

    value["items"].append(2)

    assert cache.get("key") == {"items": [1]}
