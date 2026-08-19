import os
import sys
import unittest
from types import ModuleType
from unittest.mock import MagicMock

os.environ["JWT_SECRET"] = "test-jwt-secret-for-unit-tests-only-123456"

database_stub = ModuleType("database")
database_stub.init_db = lambda: None
database_stub.get_db = lambda: database_stub.supabase
database_stub.supabase = MagicMock()
sys.modules["database"] = database_stub

bot_stub = ModuleType("bot")


async def noop_bot_main():
    return None


bot_stub.main = noop_bot_main
sys.modules["bot"] = bot_stub

from fastapi.testclient import TestClient

from main import app


class ObservabilityTests(unittest.TestCase):
    def test_health_response_and_request_id_are_safe(self):
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "name": "IslandQuiz API", "version": "1.0.0"})
        self.assertRegex(response.headers["X-Request-ID"], r"^[0-9a-f]{32}$")

    def test_server_failure_log_uses_route_template_not_request_path(self):
        @app.get("/_observability-test/{raw_value}")
        def observability_failure(raw_value: str):
            raise RuntimeError("failed")

        with TestClient(app, raise_server_exceptions=False) as client:
            with self.assertLogs(
                "islandquiz.observability", level="ERROR"
            ) as logs:
                response = client.get("/_observability-test/private-answer")

        self.assertEqual(response.status_code, 500)
        self.assertRegex(response.headers["X-Request-ID"], r"^[0-9a-f]{32}$")
        self.assertIn("route=/_observability-test/{raw_value}", "\n".join(logs.output))
        self.assertNotIn("private-answer", "\n".join(logs.output))
