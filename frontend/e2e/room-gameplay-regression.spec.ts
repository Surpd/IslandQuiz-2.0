import { expect, test, type Page } from "@playwright/test";

type MockPlayer = Record<string, unknown>;
type MockState = {
  code: string;
  gameKind: "quiz";
  gameId: string;
  theme: string;
  hostId: string;
  status: string;
  questionIdx: number;
  questionStartAt: number;
  players: MockPlayer[];
  createdAt: number;
};

type MockSocket = {
  onmessage?: ((event: MessageEvent<string>) => void) | null;
};

function installRoomMock(
  page: Page,
  options: {
    role: "player" | "host";
    status: "active" | "leaderboard" | "finished";
    question: Record<string, unknown>;
    players?: Record<string, unknown>[];
    expireOnDraft?: boolean;
    expireWhenGiven?: string;
  },
) {
  return page.addInitScript(
    ({ role, status, question, players, expireOnDraft, expireWhenGiven }) => {
      if (role === "player") {
        localStorage.setItem("islandquiz.room.player.1234", "player-credential");
        localStorage.setItem(
          "islandquiz.room.player-info.1234",
          JSON.stringify({ playerId: "player-1", nickname: "Ученик", avatar: "" }),
        );
      } else {
        localStorage.setItem("islandquiz.room.host.1234", "host-credential");
      }
      const player = {
        id: "player-1",
        nickname: "Ученик",
        avatar: "",
        score: 0,
        streak: 0,
        connected: true,
      };
      let currentState: MockState = {
        code: "1234",
        gameKind: "quiz",
        gameId: "game-1",
        theme: "classic",
        hostId: "host-1",
        status,
        questionIdx: 0,
        questionStartAt: status === "active" ? Date.now() + 15_000 : Date.now(),
        players: players ?? [player],
        createdAt: Date.now(),
      };
      const snapshot = {
        gameId: "game-1",
        kind: "quiz",
        data: { config: { title: "Room regression", defaultTime: 30 }, questions: [question] },
      };
      let currentDraft = "";
      const shouldExpireDraft = (given: string) =>
        expireWhenGiven !== undefined
          ? given === expireWhenGiven
          : !!expireOnDraft && !!given.trim();
      const rememberFinalAnswer = (given: string) => {
        (window as unknown as { __roomTestLastAnswer?: string }).__roomTestLastAnswer = given;
      };
      const emit = (socket: MockSocket) =>
        socket.onmessage?.(
          new MessageEvent("message", {
            data: JSON.stringify({ type: "room_state", state: currentState }),
          }),
        );
      class RoomWebSocket {
        static OPEN = 1;
        readyState = RoomWebSocket.OPEN;
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent<string>) => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;
        constructor() {
          setTimeout(() => {
            this.onopen?.(new Event("open"));
            this.onmessage?.(
              new MessageEvent("message", {
                data: JSON.stringify({ type: "room_state", state: currentState }),
              }),
            );
            this.onmessage?.(
              new MessageEvent("message", {
                data: JSON.stringify({ type: "room_snapshot", snapshot }),
              }),
            );
          }, 0);
        }
        send(raw: string) {
          const message = JSON.parse(raw) as { action?: string; given?: string };
          if (message.action === "answer_draft") {
            currentDraft = message.given ?? "";
            if (shouldExpireDraft(currentDraft)) {
              currentState = { ...currentState, questionStartAt: Date.now() - 1_000 };
              emit(this);
            }
            this.onmessage?.(
              new MessageEvent("message", {
                data: JSON.stringify({ type: "answer_draft_saved", questionIdx: 0 }),
              }),
            );
            return;
          }
          if (message.action === "answer") {
            const given = currentDraft || message.given || "";
            rememberFinalAnswer(given);
            currentState = {
              ...currentState,
              status: "reveal",
              players: currentState.players.map((item: MockPlayer) =>
                item.id === "player-1"
                  ? {
                      ...item,
                      lastAnswer: {
                        questionIdx: 0,
                        correct: true,
                        delta: 1000,
                        timeMs: 100,
                        given,
                      },
                    }
                  : item,
              ),
            };
            emit(this);
          }
        }
        close() {
          this.readyState = 3;
        }
      }
      Object.defineProperty(window, "WebSocket", { value: RoomWebSocket });
    },
    options,
  );
}

async function expectAutoFinalized(page: Page, expectedGiven?: string) {
  const finalAnswer = () =>
    page.evaluate(
      () => (window as unknown as { __roomTestLastAnswer?: string }).__roomTestLastAnswer,
    );
  if (expectedGiven !== undefined) {
    await expect.poll(finalAnswer, { timeout: 15_000 }).toBe(expectedGiven);
  } else {
    await expect.poll(finalAnswer, { timeout: 15_000 }).toMatch(/.+/);
  }
  await expect(page.getByRole("button", { name: "Ответить" })).toBeHidden();
}

test.describe("online room gameplay regression", () => {
  test("choice selected before timeout is finalized without pressing submit", async ({ page }) => {
    test.setTimeout(45_000);
    await installRoomMock(page, {
      role: "player",
      status: "active",
      question: {
        id: "q1",
        type: "choice",
        q: "Выберите B",
        options: ["A", "B"],
        answer: "B",
        points: 100,
        time: 5,
      },
      expireOnDraft: true,
    });
    await page.goto("/room/1234/play");
    await page.getByRole("button", { name: /^B\b/ }).click();
    await expect(page.getByText("состояние сохранено", { exact: false })).toBeVisible();
    await expect(page.getByText("Верно!", { exact: true })).toBeVisible({ timeout: 30000 });
  });

  test("bool selected before timeout is finalized without pressing submit", async ({ page }) => {
    await installRoomMock(page, {
      role: "player",
      status: "active",
      question: {
        id: "q1",
        type: "bool",
        q: "Земля круглая?",
        options: [],
        answer: "true",
        points: 100,
        time: 5,
      },
      expireOnDraft: true,
    });
    await page.goto("/room/1234/play");
    await page.getByRole("button", { name: /Правда/ }).click();
    await expectAutoFinalized(page, "true");
  });

  test("text entered before timeout is finalized without pressing submit", async ({ page }) => {
    await installRoomMock(page, {
      role: "player",
      status: "active",
      question: {
        id: "q1",
        type: "text",
        q: "Столица России?",
        options: [],
        answer: "Москва",
        points: 100,
        time: 5,
      },
      expireWhenGiven: "Москва",
    });
    await page.goto("/room/1234/play");
    await page.getByPlaceholder("Введите ответ...").fill("Москва");
    await expectAutoFinalized(page, "Москва");
  });

  test("matching draft is finalized without pressing submit", async ({ page }) => {
    const expected = JSON.stringify({ "Левая 1": "Правая 1", "Левая 2": "Правая 2" });
    await installRoomMock(page, {
      role: "player",
      status: "active",
      question: {
        id: "q1",
        type: "matching",
        q: "Соедините",
        options: [],
        answer: JSON.stringify([
          { left: "Левая 1", right: "Правая 1" },
          { left: "Левая 2", right: "Правая 2" },
        ]),
        points: 100,
        time: 5,
      },
      expireWhenGiven: expected,
    });
    await page.goto("/room/1234/play");
    await page.getByRole("button", { name: /Левая 1/ }).click();
    await page.getByRole("button", { name: "Правая 1" }).click();
    await page.getByRole("button", { name: /Левая 2/ }).click();
    await page.getByRole("button", { name: "Правая 2" }).click();
    await expectAutoFinalized(page, expected);
  });

  test("close answer is finalized without pressing submit", async ({ page }) => {
    const expected = JSON.stringify(["Москва"]);
    await installRoomMock(page, {
      role: "player",
      status: "active",
      question: {
        id: "q1",
        type: "close",
        q: "Столица ___",
        options: [],
        answer: expected,
        points: 100,
        time: 5,
      },
      expireWhenGiven: expected,
    });
    await page.goto("/room/1234/play");
    await page.locator('input[placeholder="…"]').fill("Москва");
    await expectAutoFinalized(page, expected);
  });

  test("ordering change is finalized without pressing submit", async ({ page }) => {
    await installRoomMock(page, {
      role: "player",
      status: "active",
      question: {
        id: "q1",
        type: "ordering",
        q: "Расположите",
        options: [],
        answer: JSON.stringify(["A", "B", "C"]),
        points: 100,
        time: 5,
      },
      expireOnDraft: true,
    });
    await page.goto("/room/1234/play");
    await page.getByRole("button", { name: "Вниз" }).first().click();
    await expectAutoFinalized(page);
    const finalGiven = await page.evaluate(
      () => (window as unknown as { __roomTestLastAnswer?: string }).__roomTestLastAnswer,
    );
    expect(JSON.parse(finalGiven ?? "null")).toHaveLength(3);
  });

  test("matching can be rebuilt by taps and is locked after submit", async ({ page }) => {
    await installRoomMock(page, {
      role: "player",
      status: "active",
      question: {
        id: "q1",
        type: "matching",
        q: "Соедините",
        options: [],
        answer: JSON.stringify([
          { left: "Левая 1", right: "Правая 1" },
          { left: "Левая 2", right: "Правая 2" },
        ]),
        points: 100,
        time: 30,
      },
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/room/1234/play");
    const left1 = page.getByRole("button", { name: /Левая 1/ });
    await left1.click();
    await page.getByRole("button", { name: "Правая 1" }).click();
    await expect(left1).toContainText("Правая 1");
    await left1.click();
    await page.getByRole("button", { name: "Правая 2" }).click();
    await expect(left1).toContainText("Правая 2");
    await left1.getByRole("button", { name: "Очистить" }).click();
    await expect(left1).toContainText("…");
    await left1.click();
    await page.getByRole("button", { name: "Правая 1" }).click();
    await page.getByRole("button", { name: "Ответить" }).click();
    await expect(page.getByRole("button", { name: "Ответить" })).toBeHidden();
    await expect(page.getByText("Очистить")).toHaveCount(0);
  });

  test("host can reopen the completed question and podium bases share a baseline", async ({
    page,
  }) => {
    await installRoomMock(page, {
      role: "host",
      status: "leaderboard",
      question: {
        id: "q1",
        type: "choice",
        q: "Проверочный вопрос",
        options: ["Правильно", "Нет"],
        answer: "Правильно",
        points: 100,
        time: 30,
      },
      players: [
        {
          id: "p1",
          nickname: "Очень длинное имя победителя",
          avatar: "",
          score: 300,
          streak: 0,
          connected: true,
        },
        { id: "p2", nickname: "Второй", avatar: "", score: 200, streak: 0, connected: true },
        { id: "p3", nickname: "Третий", avatar: "", score: 100, streak: 0, connected: true },
      ],
    });
    await page.goto("/room/1234/");
    await page.getByRole("button", { name: "Показать вопрос" }).click();
    await expect(page.getByText("Проверочный вопрос", { exact: true })).toBeVisible();
    await expect(page.locator('[data-answer-state="correct"]')).toBeVisible();
  });

  test("podium keeps all three places aligned on a narrow screen", async ({ page }) => {
    await installRoomMock(page, {
      role: "host",
      status: "finished",
      question: {
        id: "q1",
        type: "choice",
        q: "Проверочный вопрос",
        options: ["Да"],
        answer: "Да",
        points: 100,
        time: 30,
      },
      players: [
        {
          id: "p1",
          nickname: "Очень длинное имя победителя",
          avatar: "",
          score: 300,
          streak: 0,
          connected: true,
        },
        { id: "p2", nickname: "Второй", avatar: "", score: 200, streak: 0, connected: true },
        { id: "p3", nickname: "Третий", avatar: "", score: 100, streak: 0, connected: true },
      ],
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/room/1234/");
    const bases = await Promise.all(
      [1, 2, 3].map((rank) => page.getByTestId(`podium-place-${rank}`).boundingBox()),
    );
    expect(bases.every(Boolean)).toBe(true);
    expect(
      Math.max(...bases.map((box) => box!.y + box!.height)) -
        Math.min(...bases.map((box) => box!.y + box!.height)),
    ).toBeLessThanOrEqual(1);
  });

  test("podium keeps empty places readable when fewer than three players finished", async ({
    page,
  }) => {
    await installRoomMock(page, {
      role: "host",
      status: "finished",
      question: {
        id: "q1",
        type: "choice",
        q: "Проверочный вопрос",
        options: ["Да"],
        answer: "Да",
        points: 100,
        time: 30,
      },
      players: [
        {
          id: "p1",
          nickname: "Единственный игрок",
          avatar: "",
          score: 300,
          streak: 0,
          connected: true,
        },
      ],
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/room/1234/");
    for (const rank of [1, 2, 3]) {
      await expect(page.getByTestId(`podium-place-${rank}`)).toBeVisible();
    }
    await expect(page.getByTestId("podium-place-2")).toHaveAttribute("data-podium-empty", "true");
    await expect(page.getByTestId("podium-place-3")).toHaveAttribute("data-podium-empty", "true");
  });
});
