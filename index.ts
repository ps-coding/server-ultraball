import { WebSocketServer } from "ws";
import { Game, Player } from "./Game.js";

const wss = new WebSocketServer({ port: 8080 });

const games: Game[] = [];

wss.on("connection", (ws) => {
  let wsGame: Game | undefined;

  ws.on("message", (message: string) => {
    const { type, payload } = JSON.parse(message);

    switch (type) {
      case "create-game":
        if (
          !(
            payload.name &&
            typeof payload.name == "string" &&
            payload.cap &&
            typeof payload.cap == "number" &&
            payload.cap > 1
          ) ||
          wsGame
        )
          break;

        let playerId = Player.generateId();

        while (playerId === 0) {
          playerId = Player.generateId();
        }

        const player = new Player(Player.generateId(), payload.name, ws);

        let gameId = Game.generateId();
        while (games.find((game) => game.id === gameId) || gameId === 0) {
          gameId = Game.generateId();
        }

        const game = new Game(gameId, player, payload.cap);
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
        )
          break;

        const gameToJoin = games.find((game) => game.id === payload.gameId);
        if (gameToJoin) {
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
        }

        break;
      case "leave-game":
        if (!(payload.playerId && typeof payload.playerId == "number")) break;

        if (wsGame) {
          wsGame.removePlayer(payload.playerId, ws);

          if (wsGame.gameEnded) {
            games.splice(games.indexOf(wsGame), 1);
          }
        }

        break;

      case "kick-out":
        if (!(payload.playerId && typeof payload.playerId == "number")) break;

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
                    item.amount &&
                    typeof item.amount == "number" &&
                    item.edition &&
                    typeof item.edition == "string" &&
                    ["knife", "ball", "bazooka", "spiral"].includes(
                      item.edition
                    )
                )))
          )
        )
          break;

        if (wsGame) {
          wsGame.load({ ...payload, ws });

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
  });
});
