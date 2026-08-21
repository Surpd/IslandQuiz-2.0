import os
import sys
import types
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from types import SimpleNamespace
from unittest.mock import patch


os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes import ai as ai_route


class AtomicQuotaQuery:
    def __init__(self, database, payload):
        self.database = database
        self.payload = payload

    def execute(self):
        with self.database.lock:
            bucket = (self.payload["p_user_id"], self.payload["p_request_type"])
            used = self.database.used.get(bucket, 0)
            allowed = used < self.payload["p_daily_limit"]
            if allowed:
                self.database.used[bucket] = used + 1
            return SimpleNamespace(data=allowed)


class AtomicQuotaSupabase:
    def __init__(self):
        self.lock = Lock()
        self.used = {}

    def rpc(self, name, payload):
        if name != "consume_ai_quota":
            raise AssertionError(name)
        return AtomicQuotaQuery(self, payload)


class AIQuotaConcurrencyTests(unittest.TestCase):
    def test_concurrent_rpc_reservations_cannot_both_pass_limit(self):
        database = AtomicQuotaSupabase()
        with patch.object(ai_route, "supabase", database):
            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(
                    lambda _: ai_route.consume_ai_quota("user-1", "ai_request", 1),
                    range(2),
                ))

        self.assertEqual(results.count(True), 1)
        self.assertEqual(results.count(False), 1)
        self.assertEqual(database.used[("user-1", "ai_request")], 1)


if __name__ == "__main__":
    unittest.main()
