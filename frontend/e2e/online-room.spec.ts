import { test, expect } from "@playwright/test";

const largeAvatar = `data:image/png;base64,${"A".repeat(20_000)}`;

test("joins a room with a large profile avatar without exceeding the room action limit", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("islandquiz.token", "guest-token");
    (window as Window & { roomMessages?: string[] }).roomMessages = [];
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
            new MessageEvent("message", { data: JSON.stringify({ type: "room_available" }) }),
          );
        });
      }

      send(raw: string) {
        (window as Window & { roomMessages?: string[] }).roomMessages?.push(raw);
        const message = JSON.parse(raw) as {
          action?: string;
          player?: { nickname?: string; avatar?: string };
        };
        if (message.action !== "join") return;
        if (new TextEncoder().encode(raw).byteLength > 16 * 1024) {
          this.onmessage?.(
            new MessageEvent("message", {
              data: JSON.stringify({ type: "error", error: "Сообщение комнаты слишком большое" }),
            }),
          );
          return;
        }
        this.onmessage?.(
          new MessageEvent("message", {
            data: JSON.stringify({
              type: "room_identity",
              credential: "guest-credential",
              role: "player",
              playerId: "player-1",
            }),
          }),
        );
        this.onmessage?.(
          new MessageEvent("message", {
            data: JSON.stringify({
              type: "room_state",
              state: {
                code: "1234",
                players: [
                  {
                    id: "player-1",
                    nickname: message.player?.nickname,
                    avatar: message.player?.avatar,
                    score: 0,
                    streak: 0,
                  },
                ],
                status: "waiting",
                theme: "midnight",
              },
            }),
          }),
        );
      }

      close() {
        this.readyState = 3;
        this.onclose?.(new CloseEvent("close"));
      }
    }
    Object.defineProperty(window, "WebSocket", { value: RoomWebSocket });
  });

  await page.goto("/");
  const result = await page.evaluate(async (avatar) => {
    const { joinRoom } = await import("/src/lib/api.ts");
    return joinRoom("1234", "Guest", avatar);
  }, largeAvatar);

  expect(result).toEqual({ success: true, player_id: "player-1" });
  const sent = await page.evaluate(() => window.roomMessages);
  expect(sent).toHaveLength(1);
  expect(new TextEncoder().encode(sent![0]).byteLength).toBeLessThanOrEqual(16 * 1024);
});

test("createRoom sends the Play Setup theme as room runtime state", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { roomMessages?: string[] }).roomMessages = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (String(input).includes("/api/games/game-1/play-snapshot")) {
        return new Response(JSON.stringify({ snapshotToken: "snapshot-token", version: "1", data: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    };
    class RoomWebSocket {
      static OPEN = 1;
      readyState = RoomWebSocket.OPEN;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;

      constructor() {
        setTimeout(() => {
          this.onopen?.(new Event("open"));
        });
      }

      send(raw: string) {
        (window as Window & { roomMessages?: string[] }).roomMessages?.push(raw);
        const message = JSON.parse(raw) as { theme?: string; gameKind?: string; gameId?: string };
        this.onmessage?.(
          new MessageEvent("message", {
            data: JSON.stringify({
              type: "room_state",
              state: {
                code: "1234",
                gameKind: message.gameKind,
                gameId: message.gameId,
                theme: message.theme,
                status: "waiting",
                players: [],
              },
            }),
          }),
        );
      }

      close() {}
    }
    Object.defineProperty(window, "WebSocket", { value: RoomWebSocket });
  });

  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createRoom } = await import("/src/lib/api.ts");
    return createRoom("quiz", "game-1", "midnight");
  });

  expect(result.code).toMatch(/^\d{4}$/);
  expect(result.room_url).toBe(`/room/${result.code}`);
  const sent = await page.evaluate(() => window.roomMessages);
  expect(JSON.parse(sent![0])).toMatchObject({ action: "create_room", theme: "midnight" });
});

test("reconnects a player after the tab is reopened", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("islandquiz.room.player.1234", "persisted-credential");
    localStorage.setItem(
      "islandquiz.room.player-info.1234",
      JSON.stringify({ playerId: "player-1", nickname: "Guest", avatar: "" }),
    );
    (window as Window & { roomMessages?: string[]; roomUrl?: string }).roomMessages = [];
    class RoomWebSocket {
      static OPEN = 1;
      readyState = RoomWebSocket.OPEN;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      constructor(url: string) {
        (window as Window & { roomUrl?: string }).roomUrl = url;
        setTimeout(() => {
          this.onopen?.(new Event("open"));
          this.onmessage?.(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "room_state",
                state: {
                  code: "1234",
                  gameKind: "quiz",
                  gameId: "game-1",
                  theme: "classic",
                  hostId: "host-1",
                  status: "waiting",
                  questionIdx: 0,
                  questionStartAt: null,
                  players: [{ id: "player-1", nickname: "Guest", avatar: "", score: 0, streak: 0 }],
                  createdAt: Date.now(),
                },
              }),
            }),
          );
        });
      }
      send(raw: string) {
        (window as Window & { roomMessages?: string[] }).roomMessages?.push(raw);
      }
      close() {}
    }
    Object.defineProperty(window, "WebSocket", { value: RoomWebSocket });
  });

  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { joinRoom } = await import("/src/lib/api.ts");
    return joinRoom("1234", "Guest", "");
  });

  expect(result).toEqual({ success: true, player_id: "player-1" });
  expect(await page.evaluate(() => window.roomMessages)).toEqual([]);
  expect(await page.evaluate(() => window.roomUrl)).toContain("credential=persisted-credential");
});

test("finishRoom sends the early-finish action", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("islandquiz.room.host.1234", "host-credential");
    (window as Window & { roomMessages?: string[] }).roomMessages = [];
    class RoomWebSocket {
      static OPEN = 1;
      readyState = RoomWebSocket.OPEN;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      constructor() {
        setTimeout(() => this.onopen?.(new Event("open")));
      }
      send(raw: string) {
        (window as Window & { roomMessages?: string[] }).roomMessages?.push(raw);
        if (JSON.parse(raw).action === "finish") {
          this.onmessage?.(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "room_state",
                state: {
                  code: "1234",
                  gameKind: "quiz",
                  gameId: "game-1",
                  theme: "classic",
                  hostId: "host-1",
                  status: "finished",
                  questionIdx: 0,
                  questionStartAt: null,
                  players: [],
                  createdAt: Date.now(),
                },
              }),
            }),
          );
        }
      }
      close() {}
    }
    Object.defineProperty(window, "WebSocket", { value: RoomWebSocket });
  });

  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { finishRoom } = await import("/src/lib/api.ts");
    return finishRoom("1234");
  });

  expect(result?.status).toBe("finished");
  expect(JSON.parse((await page.evaluate(() => window.roomMessages))![0])).toMatchObject({ action: "finish" });
});

test("answers URL keeps the existing answers route and scoped room credential", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("islandquiz.room.answers.1234", "answers-credential");
  });
  await page.goto("/");
  const url = await page.evaluate(async () => {
    const { getRoomAnswersUrl } = await import("/src/lib/api.ts");
    return getRoomAnswersUrl("1234");
  });
  expect(url).toContain("/room/1234/answers");
  expect(url).toContain("credential=answers-credential");
});
