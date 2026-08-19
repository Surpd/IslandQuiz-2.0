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
