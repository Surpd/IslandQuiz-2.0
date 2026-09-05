import { expect, test } from "@playwright/test";

for (const width of [320, 390, 1280]) {
  test(`player lifecycle and long answers at ${width}`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width, height: 844 });
    await page.route("https://api.islandquiz.online/**", route => route.fulfill({ json: [] }));
    await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
    await page.addInitScript(() => {
      localStorage.setItem("islandquiz.room.player.1234", "mock-credential");
      localStorage.setItem("islandquiz.room.player-info.1234", JSON.stringify({ playerId: "p1", nickname: "Александра", avatar: "" }));
      const questions = [
        { id: "q1", type: "choice", q: "Какой из этих городов расположен севернее остальных? Подумайте о географическом положении каждого города.", options: ["Сочи — город на побережье Чёрного моря", "Санкт-Петербург — город на побережье Финского залива", "Владивосток", "Калининград"], answer: "Санкт-Петербург — город на побережье Финского залива" },
        { id: "q2", type: "bool", q: "Озеро Байкал — самое глубокое пресноводное озеро в мире", options: [], answer: "true" },
        { id: "q3", type: "text", q: "Как называется процесс превращения воды в водяной пар?", options: [], answer: "Испарение" },
        { id: "q4", type: "matching", q: "Соотнесите природные объекты и страны, в которых они находятся", options: [], answer: JSON.stringify([{ left: "Водопад Виктория", right: "Замбия и Зимбабве" }, { left: "Самая высокая гора Японии — Фудзи", right: "Япония" }, { left: "Озеро Байкал", right: "Россия" }]) },
        { id: "q5", type: "ordering", q: "Расположите этапы научного исследования в логичном порядке", options: [], answer: JSON.stringify(["Сформулировать гипотезу и определить, какие данные действительно потребуются", "Провести наблюдение или эксперимент и аккуратно зафиксировать результаты", "Проанализировать данные, проверить выводы и представить результат"]) },
      ].map(q => ({ ...q, time: 120, points: 100 }));
      let state: any = { code: "1234", gameKind: "quiz", gameId: "g1", theme: "classic", hostId: "host", status: "waiting", questionIdx: 0, questionStartAt: Date.now(), players: [{ id: "p1", nickname: "Александра", avatar: "", score: 1200, streak: 0, connected: true }, { id: "p2", nickname: "Михаил", avatar: "", score: 1250, streak: 0, connected: true }], createdAt: Date.now() };
      let socket: any;
      let draft = "";
      let submissions = 0;
      function emit() { socket?.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "room_state", state }) })); }
      (window as any).__polish = {
        transition(status: string, index = state.questionIdx, correct = true, unanswered = false) {
          if (status === "active") { draft = ""; state.playerAnswerSubmitted = false; state.playerAnswerDraft = ""; }
          state = { ...state, status, questionIdx: index, questionStartAt: Date.now() };
          if (status === "reveal") {
            state.players[0] = { ...state.players[0], score: state.players[0].score + (correct ? 100 : 0), lastAnswer: unanswered ? undefined : { questionIdx: index, correct, given: draft, delta: correct ? 100 : 0, timeMs: 1000 } };
          }
          emit();
        },
        submissions: () => submissions,
      };
      const NativeWebSocket = window.WebSocket;
      class WS {
        static OPEN = 1; readyState = 1; onopen: any; onmessage: any; onclose: any;
        constructor(url: string, protocol?: string) { if (protocol === "vite-hmr") return new NativeWebSocket(url, protocol) as any; socket = this; setTimeout(() => { this.onopen?.(new Event("open")); emit(); this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "room_snapshot", snapshot: { gameId: "g1", kind: "quiz", data: { config: { title: "Открываем мир вместе" }, questions } } }) })); }, 0); }
        send(raw: string) { const message = JSON.parse(raw); if (message.action === "answer_draft") { draft = message.given; this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "answer_draft_saved", questionIdx: state.questionIdx }) })); } if (message.action === "answer") { submissions++; state.playerAnswerSubmitted = true; state.playerAnswerDraft = draft; emit(); } }
        close() { this.readyState = 3; }
      }
      Object.defineProperty(window, "WebSocket", { value: WS });
    });
    await page.goto("/room/1234/play");
    await expect(page.locator("html[data-app-hydrated=true]")).toBeVisible({ timeout: 30_000 });
    const shot = async (name: string) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(450);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/player-polish/${width}-${name}.png`, fullPage: true });
    };
    const transition = async (status: string, index = 0, correct = true, unanswered = false) => {
      await page.evaluate(args => (window as any).__polish.transition(...args), [status, index, correct, unanswered]);
    };
    await expect(page.getByText("Вы в комнате!")).toBeVisible();
    await shot("waiting");
    await transition("active");
    await expect(page.getByRole("button", { name: /Сочи/ })).toBeEnabled();
    await shot("choice");
    await page.getByRole("button", { name: /Сочи/ }).click();
    await page.getByRole("button", { name: /Санкт-Петербург/ }).click();
    await shot("selected");
    await page.getByRole("button", { name: "Ответить", exact: true }).click();
    await expect(page.getByText("Ответ принят", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as any).__polish.submissions())).toBe(1);
    await shot("accepted");
    await transition("reveal");
    await shot("correct");
    await transition("leaderboard");
    await shot("leaderboard");
    await transition("active", 1);
    await page.getByRole("button", { name: /Ложь/ }).click();
    await transition("reveal", 1, false);
    await shot("incorrect");
    await transition("active", 2);
    await page.getByRole("textbox", { name: "Ваш ответ" }).fill("Испарение");
    await shot("text");
    await transition("timeout", 2);
    await shot("timeout");
    await transition("reveal", 2, false, true);
    await shot("unanswered");
    await transition("active", 3);
    await page.getByRole("button", { name: /Водопад Виктория/ }).click();
    await page.getByRole("button", { name: "Замбия и Зимбабве", exact: true }).click();
    await shot("matching");
    await transition("active", 4);
    await page.getByRole("button", { name: "Вниз", exact: true }).first().click();
    await shot("ordering");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await transition("finished", 4);
    await shot("final-reduced");
    expect(errors).toEqual([]);
  });
}

test("legacy decorative background hydrates deterministically", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
  await page.route("https://api.islandquiz.online/**", route => route.fulfill({ json: [] }));
  await page.goto("/test-player");
  await expect(page.locator("html[data-app-hydrated=true]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".pt-amber")).toBeVisible();
  expect(errors).toEqual([]);
});
