import os
import unittest

os.environ["JWT_SECRET"] = "test-jwt-secret-for-unit-tests-only-123456"

from services.trusted_scoring import issue_snapshot_token, score_quiz, verify_snapshot_token


QUIZ = {
    "config": {"defaultTime": 30},
    "questions": [
        {"id": "one", "type": "choice", "q": "One", "answer": "A", "points": 100, "time": 30},
        {"id": "two", "type": "text", "q": "Two", "answer": "Москва, Moscow", "points": 200, "time": 30},
    ],
}


class TrustedScoringTests(unittest.TestCase):
    def test_signed_snapshot_rejects_tampering(self):
        _, token = issue_snapshot_token("game-1", "quiz", QUIZ)
        snapshot = verify_snapshot_token(token, "game-1", "quiz")
        self.assertEqual(snapshot["data"], QUIZ)
        with self.assertRaises(ValueError):
            verify_snapshot_token(f"{token}x", "game-1", "quiz")

    def test_quiz_score_uses_snapshot_answers_not_client_score_fields(self):
        totals, answers = score_quiz(QUIZ, [
            {"qId": "one", "given": "A", "isCorrect": False, "earned": 999999},
            {"qId": "two", "given": "wrong", "isCorrect": True, "earned": 999999},
        ])
        self.assertEqual(totals, {"score": 100, "maxScore": 300, "correctCount": 1, "totalQuestions": 2})
        self.assertEqual([answer["earned"] for answer in answers], [100, 0])


if __name__ == "__main__":
    unittest.main()
