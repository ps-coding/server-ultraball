import { WebSocket } from "ws";

const ws1 = new WebSocket("ws://localhost:8080");

ws1.on("open", () => {
  ws1.send(
    JSON.stringify({ type: "create-game", payload: { name: "Host", cap: 2 } })
  );
});

const ws2 = new WebSocket("ws://localhost:8080");

ws2.on("open", () => {});

ws2.on("message", (data) => {
  const m = JSON.parse(JSONRetrocycle(data));
  console.log("Player 2", m);
});

ws1.on("message", (data) => {
  const m = JSON.parse(JSONRetrocycle(data));

  if (m.type === "game-created") {
    const gameId = m.payload.game.id;
    ws2.send(
      JSON.stringify({
        type: "join-game",
        payload: { name: "Player 2", gameId: gameId },
      })
    );
  }

  console.log("Host: ", m);
});
