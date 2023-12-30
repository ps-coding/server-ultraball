import { WebSocketServer } from "ws";
import { Bot, Game, Player } from "./Game.js";

const wss = new WebSocketServer({ port: 8080 });

const games: Game[] = [];

wss.on("connection", (ws) => {
  let wsGame: Game | undefined;

  ws.on("message", (message: string) => {
    try {
      const { type, payload } = JSON.parse(message);

      switch (type) {
        case "create-game":
          if (
            !(
              payload.name &&
              typeof payload.name == "string" &&
              payload.cap &&
              typeof payload.cap == "number" &&
              payload.cap > 0 &&
              payload.lastPlayerKeepsPlaying !== undefined &&
              typeof payload.lastPlayerKeepsPlaying == "boolean" &&
              (payload.lastPlayerKeepsPlaying || payload.cap > 1) &&
              payload.isPublic !== undefined &&
              typeof payload.isPublic == "boolean" &&
              (!payload.isPublic || payload.cap > 1)
            ) ||
            wsGame
          ) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { error: "Invalid Request" },
              })
            );
            break;
          }

          let playerId = Player.generateId();

          while (playerId === 0) {
            playerId = Player.generateId();
          }

          const player = new Player(playerId, payload.name, ws);

          let gameId = Game.generateId();
          while (games.find((game) => game.id === gameId) || gameId === 0) {
            gameId = Game.generateId();
          }

          const game = new Game(
            gameId,
            player,
            payload.cap,
            payload.lastPlayerKeepsPlaying,
            payload.isPublic
          );
          wsGame = game;
          games.push(game);

          if (wsGame.gameEnded) {
            games.splice(games.indexOf(wsGame), 1);
          }

          break;
        case "join-game":
          if (
            !(
              payload.name &&
              typeof payload.name == "string" &&
              payload.gameId &&
              typeof payload.gameId == "number"
            ) ||
            wsGame
          ) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { error: "Invalid Request" },
              })
            );
            break;
          }

          const gameToJoin = games.find((game) => game.id === payload.gameId);

          if (gameToJoin) {
            if (
              gameToJoin.players.filter((p) => !p.bot).length >=
                gameToJoin.cap ||
              gameToJoin.cap <= 1 ||
              gameToJoin.gameStarted ||
              gameToJoin.gameEnded
            ) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  payload: { error: "Game Full" },
                })
              );
              break;
            }

            let playerId = Player.generateId();
            while (
              gameToJoin.players.find((player) => player.id === playerId) ||
              playerId === 0
            ) {
              playerId = Player.generateId();
            }

            const player = new Player(playerId, payload.name, ws);
            gameToJoin.addPlayer(player);
            wsGame = gameToJoin;

            if (wsGame.gameEnded) {
              games.splice(games.indexOf(wsGame), 1);
            }
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { error: "Game Not Found" },
              })
            );
          }

          break;
        case "search-games":
          const gamesToSearch = games.filter((g) => g.searchable());
          const gamesToSend = gamesToSearch.map((game) => ({
            id: game.id,
            host: game.host.name,
            players: game.players.filter((p) => !p.bot).length,
            bots: game.players.filter((p) => p.bot).length,
            cap: game.cap,
            lastPlayerKeepsPlaying: game.lastPlayerKeepsPlaying,
          }));
          ws.send(
            JSON.stringify({
              type: "available-games-found",
              payload: { availableGames: gamesToSend },
            })
          );
        case "add-bot":
          if (wsGame) {
            let botId = Bot.generateId();
            while (
              wsGame.players.find((player) => player.id === botId) ||
              botId === 0
            ) {
              botId = Bot.generateId();
            }

            wsGame.addBot(ws, botId);

            if (wsGame.gameEnded) {
              games.splice(games.indexOf(wsGame), 1);
            }
          }

          break;
        case "leave-game":
          if (!(payload.playerId && typeof payload.playerId == "number")) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { error: "Invalid Request" },
              })
            );
            break;
          }

          if (wsGame) {
            wsGame.removePlayer(payload.playerId, ws);

            if (wsGame.gameEnded) {
              games.splice(games.indexOf(wsGame), 1);
            }
          }

          break;

        case "kick-out":
          if (!(payload.playerId && typeof payload.playerId == "number")) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { error: "Invalid Request" },
              })
            );
            break;
          }

          if (wsGame) {
            wsGame.removePlayer(payload.playerId, ws);

            if (wsGame.gameEnded) {
              games.splice(games.indexOf(wsGame), 1);
            }
          }

          break;

        case "start-game":
          if (wsGame) {
            wsGame.hostStart(ws);

            if (wsGame.gameEnded) {
              games.splice(games.indexOf(wsGame), 1);
            }
          }

          break;

        case "end-game":
          if (wsGame) {
            wsGame.hostEnd(ws);

            if (wsGame.gameEnded) {
              games.splice(games.indexOf(wsGame), 1);
            }
          }

          break;

        case "load-move":
          if (
            !(
              payload.playerId &&
              typeof payload.playerId == "number" &&
              payload.moveId &&
              typeof payload.moveId == "string" &&
              (payload.direction === undefined ||
                typeof payload.direction == "number") &&
              (payload.using === undefined ||
                (Array.isArray(payload.using) &&
                  payload.using.every(
                    (item: any) =>
                      typeof item == "object" &&
                      "amount" in item &&
                      typeof item.amount == "number" &&
                      item.edition &&
                      typeof item.edition == "string" &&
                      ["knife", "ball", "bazooka", "spiral"].includes(
                        item.edition
                      )
                  )))
            )
          ) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { error: "Invalid Request" },
              })
            );
            break;
          }

          if (wsGame) {
            wsGame.load({ ...payload, socket: ws });

            if (wsGame.gameEnded) {
              games.splice(games.indexOf(wsGame), 1);
            }
          }

          break;

        case "skip":
          if (wsGame) {
            wsGame.skip(ws);

            if (wsGame.gameEnded) {
              games.splice(games.indexOf(wsGame), 1);
            }
          }

          break;
      }
    } catch (_) {
      ws.close(1007);
    }
  });

  ws.on("close", () => {
    if (wsGame) {
      const id = wsGame.players.find((p) => p.socket == ws)?.id;

      if (id) {
        wsGame.removePlayer(id, ws);

        if (wsGame.gameEnded) {
          games.splice(games.indexOf(wsGame), 1);
        }
      }
    }

    ws.close();
  });
});
