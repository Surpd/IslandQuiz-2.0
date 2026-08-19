import os
import unittest

os.environ["JWT_SECRET"] = "test-jwt-secret-for-unit-tests-only-123456"

from services.trusted_scoring import issue_snapshot_token, score_jeopardy, score_millionaire, score_quiz, verify_snapshot_token


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

    def test_millionaire_stops_at_first_wrong_answer(self):
        data = {"config": {"milestones": "none"}, "questions": [
            {"q": "One", "money": 100, "options": [{"correct": True}, {"correct": False}]},
            {"q": "Two", "money": 200, "options": [{"correct": True}, {"correct": False}]},
        ]}
        totals, answers = score_millionaire(data, [{"qIdx": 0, "selectedIndex": 1}, {"qIdx": 1, "selectedIndex": 0}])
        self.assertEqual(totals["reachedCount"], 0)
        self.assertEqual(totals["wonAmount"], 0)
        self.assertEqual(len(answers), 1)

    def test_jeopardy_uses_snapshot_points_and_rejects_duplicate_decisions(self):
        data = {"rounds": [[{"questions": [{"points": 500}]}]]}
        teams, audit = score_jeopardy(data, [{"id": "a", "name": "A", "score": 999999}], [
            {"kind": "question", "playerId": "a", "round": 0, "catIdx": 0, "qIdx": 0, "correct": True, "points": 1},
            {"kind": "final", "playerId": "a", "correct": False, "bet": 300},
        ])
        self.assertEqual(teams[0]["score"], 200)
        self.assertEqual(audit[0]["points"], 500)
        with self.assertRaises(ValueError):
            score_jeopardy(data, [{"id": "a", "name": "A"}], [
                {"kind": "question", "playerId": "a", "round": 0, "catIdx": 0, "qIdx": 0, "correct": True},
                {"kind": "question", "playerId": "a", "round": 0, "catIdx": 0, "qIdx": 0, "correct": False},
            ])


if __name__ == "__main__":
    unittest.main()
