import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PlayerV1 } from "@/components/player-v1";
import { PlayerV2Full } from "@/components/player-v2";
import { PlayerV3 } from "@/components/player-v3";
import type { QuizData } from "@/lib/types";

export const Route = createFileRoute("/test-player")({
  component: TestPlayer,
});



const mockData: QuizData = {
  config: {
    title: "Тестовый квиз",
    theme: "amber",
    defaultTime: 30,
    shuffleQuestions: false,
    showResult: "end",
    orderMode: "sequential",
    totalTime: 10,
    description: "",
  },
  questions: [
    {
      id: "1", type: "choice", q: "Какая планета известна как Красная планета?",
      options: ["Венера", "Марс", "Юпитер", "Сатурн"], answer: "Марс", points: 100, time: 30, image: "",
    },
    {
      id: "2", type: "bool", q: "Земля плоская?",
      options: [], answer: "false", points: 100, time: 20, image: "",
    },
    {
      id: "3", type: "text", q: "Столица Франции?",
      options: [], answer: "Париж", points: 100, time: 30, image: "",
    },
  ],
};

function TestPlayer() {
  const [variant, setVariant] = useState<1 | 2 | 3>(1);

  return (
    <div>
      <div style={{ position: "fixed", top: 10, left: 10, zIndex: 100, display: "flex", gap: 8 }}>
        {([1, 2, 3] as const).map(v => (
          <button
            key={v}
            onClick={() => setVariant(v)}
            style={{
              padding: "8px 16px",
              background: variant === v ? "#0d9488" : "#ccc",
              color: "white", border: "none", borderRadius: 6, cursor: "pointer",
            }}
          >
            V{v}
          </button>
        ))}
      </div>
      {variant === 1 && <PlayerV1 data={mockData} />}
      {variant === 2 && <PlayerV2Full data={mockData} />}
      {variant === 3 && <PlayerV3 data={mockData} />}
    </div>
  );
}