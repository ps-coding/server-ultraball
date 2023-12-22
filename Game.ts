import { WebSocket } from "ws";

import { JSONDecycle } from "./cycle.js";

export class Game {
  id: number;
  players: Player[];
  host: Player;
  cap: number;
  gameStarted = false;
  gameEnded = false;
  playersMoved: number[] = [];

  #loadingMoves: {
    playerId: number;
    moveId: (typeof moves)[number]["id"];
    direction?: number;
    using?: {
      amount: number;
      edition: "knife" | "ball" | "bazooka" | "spiral";
    }[];
  }[] = [];

  static generateId() {
    return Math.floor(Math.random() * 1000000);
  }

  constructor(id: number, host: Player, cap: number) {
    this.id = id;
    this.host = host;
    this.players = [host];
    this.cap = cap;

    this.broadcast("game-created", {});
  }

  hostStart(socket: WebSocket) {
    if (!this.isHost(socket)) return;
    if (this.players.filter((p) => !p.bot).length < 2) return;

    this.start();
  }

  private start() {
    this.gameStarted = true;
    this.broadcast("game-started", {});
  }

  findPlayer(playerId: number, socket: WebSocket) {
    const results = this.players.filter(
      (p) => p.id == playerId && p.socket == socket
    );

    return results.length == 1 ? results[0] : undefined;
  }

  isHost(socket: WebSocket) {
    return this.host.socket == socket;
  }

  addPlayer(player: Player) {
    if (this.gameStarted) return;
    if (
      this.players.filter((p) => p.id == player.id || p.socket == player.socket)
        .length
    )
      return;
    this.players.push(player);
    this.broadcast("player-added", { newPlayerId: player.id });
    if (this.players.filter((p) => !p.bot).length == this.cap) this.start();
  }

  addBot(socket: WebSocket, id: number) {
    if (this.gameStarted) return;
    if (!this.isHost(socket)) return;

    const bot = new Bot(id);
    this.players.push(bot);

    this.broadcast("player-added", { newPlayerId: bot.id });
    if (this.players.filter((p) => !p.bot).length == this.cap) this.start();
  }

  removePlayer(playerId: number, socket: WebSocket) {
    if (
      (this.players.filter((p) => !p.bot).length <= 2 && this.gameStarted) ||
      this.players.filter((p) => !p.bot).length <= 1
    ) {
      this.end("all-left");
      return;
    }

    if (this.isHost(socket)) {
      if (this.host.id == playerId) {
        this.end("host-left");
        return;
      }

      if (this.players.filter((p) => p.id == playerId).length != 1) return;

      this.players = this.players.filter((p) => p.id != playerId);
      this.broadcast("player-removed", {
        reason: "host-kicked",
        removedPlayerId: playerId,
      });

      this.#loadingMoves = this.#loadingMoves.filter(
        (a) => a.playerId != playerId
      );
      this.playersMoved = this.playersMoved.filter((id) => id != playerId);

      if (
        this.#loadingMoves.length ==
        this.players.filter((p) => !p.isDead && !p.bot).length
      ) {
        this.move();
        this.#loadingMoves = [];
        this.playersMoved = [];
      }

      return;
    }

    const player = this.findPlayer(playerId, socket);
    if (!player) return;
    this.players = this.players.filter(
      (p) => p.id != playerId && p.socket != socket
    );
    this.broadcast("player-removed", {
      reason: "left",
      removedPlayerId: playerId,
    });

    this.#loadingMoves = this.#loadingMoves.filter(
      (a) => a.playerId != playerId
    );
    this.playersMoved = this.playersMoved.filter((id) => id != playerId);

    if (
      this.#loadingMoves.length ==
      this.players.filter((p) => !p.isDead && !p.bot).length
    ) {
      this.move();
      this.#loadingMoves = [];
      this.playersMoved = [];
    }
  }

  skip(socket: WebSocket) {
    if (!this.gameStarted) return;

    if (!this.isHost(socket)) return;

    if (this.#loadingMoves.length == 0) return;

    this.broadcast("host-skipped", {});

    this.move();
    this.#loadingMoves = [];
    this.playersMoved = [];
  }

  load(action: {
    playerId: number;
    socket: WebSocket;
    moveId: (typeof moves)[number]["id"];
    direction?: number;
    using?: {
      amount: number;
      edition: "knife" | "ball" | "bazooka" | "spiral";
    }[];
  }) {
    if (!this.gameStarted) return;

    if (!this.findPlayer(action.playerId, action.socket)) return;

    if (this.findPlayer(action.playerId, action.socket)?.isDead) return;

    if (this.#loadingMoves.filter((a) => a.playerId == action.playerId).length)
      return;

    this.#loadingMoves.push(action);
    this.playersMoved.push(action.playerId);

    this.broadcast("player-loaded", { loadedPlayerId: action.playerId });

    if (
      this.#loadingMoves.length ==
      this.players.filter((p) => !p.isDead && !p.bot).length
    ) {
      this.move();
      this.#loadingMoves = [];
      this.playersMoved = [];
    }
  }

  private move() {
    const actions = this.#loadingMoves;

    for (const player of this.players.filter((p) => !p.bot)) {
      if (player.isDead) {
        player.move = undefined;
        continue;
      }

      const a = actions.filter((a) => a.playerId == player.id);
      if (a.length == 1) {
        const action = a[0];
        const theAction = moves.filter((m) => m.id == action.moveId);
        const theDirection = this.players.filter(
          (p) => p.id == action.direction
        );

        if (theAction.length == 1) {
          player.move = {
            action: theAction[0],
            direction: theDirection.length == 1 ? theDirection[0] : undefined,
            using: action.using,
          };
        } else {
          player.move == undefined;
        }
      } else {
        player.move = undefined;
      }
    }

    for (const bot of this.players.filter((p) => p.bot)) {
      if (bot.isDead) {
        bot.move = undefined;
        continue;
      }

      (bot as Bot).chooseRandomMove(this.players);
    }

    this.update();
  }

  private update() {
    for (const player of this.players) {
      if (
        player.move &&
        player.move.action.method == "offense" &&
        player.move.action.needs
      ) {
        if (player.move.action.needs.edition == "any") {
          if (player.move.using) {
            let counter = 0;
            for (const use of player.move.using) {
              if (player.reloads[use.edition] >= use.amount) {
                player.reloads[use.edition] -= use.amount;
                counter += use.amount;
              } else {
                break;
              }
            }

            if (counter < player.move.action.needs.amount) {
              player.reloads.knife = 0;
              player.reloads.ball = 0;
              player.reloads.bazooka = 0;
              player.reloads.spiral = 0;
              player.move = undefined;
            }
          } else {
            player.reloads.knife = 0;
            player.reloads.ball = 0;
            player.reloads.bazooka = 0;
            player.reloads.spiral = 0;
            player.move = undefined;
          }
        } else {
          if (
            player.reloads[player.move.action.needs.edition] >=
            player.move.action.needs.amount
          ) {
            player.reloads[player.move.action.needs.edition] -=
              player.move.action.needs.amount;
          } else {
            player.reloads.knife = 0;
            player.reloads.ball = 0;
            player.reloads.bazooka = 0;
            player.reloads.spiral = 0;
            player.move = undefined;
          }
        }
      }
    }

    for (const player of this.players) {
      if (!player.move) continue;

      if (player.move.action.method == "reload") {
        player.reloads[
          player.move.action.id.substring(2) as keyof typeof player.reloads
        ] += player.move.action.amount;
      } else if (player.move.action.method == "offense") {
        if (player.move.action.dir == "all") {
          for (const pl of this.players.filter((p) => p.id != player.id)) {
            if (pl.isDead) continue;

            if (!pl.move) {
              pl.isDead = true;
              continue;
            }

            if (pl.move.action.dir != "all" && pl.move.direction != player) {
              pl.isDead = true;
              continue;
            }

            if (pl.move.action.method == "offense") {
              if (player.move.action.id == pl.move.action.id) continue;

              if (
                (player.move.action.beats as unknown as string[]).includes(
                  pl.move.action.id
                )
              ) {
                pl.isDead = true;
              } else {
                player.isDead = true;
              }
            } else if (pl.move.action.method == "defense") {
              if (
                (pl.move.action.penetrates as unknown as string[]).includes(
                  player.move.action.id
                )
              ) {
                pl.isDead = true;
              }
            } else if (pl.move.action.method == "defense-offense") {
              if (
                (pl.move.action.reflects as unknown as string[]).includes(
                  player.move.action.id
                )
              ) {
                player.isDead = true;
              } else {
                pl.isDead = true;
              }
            } else {
              pl.isDead = true;
            }
          }
        } else {
          const pl = player.move.direction;

          if (!pl) continue;

          if (pl.isDead) continue;

          if (!pl.move) {
            pl.isDead = true;
            continue;
          }

          if (pl.move.action.dir != "all" && pl.move.direction != player) {
            pl.isDead = true;
            continue;
          }

          if (pl.move.action.method == "offense") {
            if (player.move.action.id == pl.move.action.id) continue;

            if (
              (player.move.action.beats as unknown as string[]).includes(
                pl.move.action.id
              )
            ) {
              pl.isDead = true;
            } else {
              player.isDead = true;
            }
          } else if (pl.move.action.method == "defense") {
            if (
              (pl.move.action.penetrates as unknown as string[]).includes(
                player.move.action.id
              )
            ) {
              pl.isDead = true;
            }
          } else if (pl.move.action.method == "defense-offense") {
            if (
              (pl.move.action.reflects as unknown as string[]).includes(
                player.move.action.id
              )
            ) {
              player.isDead = true;
            } else {
              pl.isDead = true;
            }
          } else {
            pl.isDead = true;
          }
        }
      }
    }

    this.broadcast("game-updated", {});

    if (this.players.filter((p) => !p.isDead && !p.bot).length <= 1) {
      this.end("all-dead");
    }
  }

  hostEnd(socket: WebSocket) {
    if (!this.isHost(socket)) return;

    this.end("host-end");
  }

  private end(reason: string) {
    this.gameEnded = true;

    this.broadcast("game-ended", { reason });

    for (const player of this.players.filter((p) => !p.bot)) {
      player.socket.close(1000);
    }
  }

  broadcast(type: string, payload: any) {
    for (const player of this.players.filter((p) => !p.bot)) {
      if (player.socket) {
        const data = { type, payload: { ...payload, game: this } };

        const str = JSON.stringify(JSONDecycle(data, undefined));

        player.socket.send(str);
      }
    }
  }
}

export class Player {
  id: number;
  socket: WebSocket;
  name: string;
  isDead = false;
  readonly bot: boolean = false;
  move?: Move;
  reloads = {
    knife: 0,
    ball: 0,
    bazooka: 0,
    spiral: 0,
  };

  static generateId() {
    return Math.floor(Math.random() * 1000000);
  }

  constructor(id: number, name: string, server: WebSocket) {
    this.id = id;
    this.name = name;
    this.socket = server;
  }
}

export class Bot extends Player {
  id: number;
  name: string;
  isDead = false;
  readonly bot = true;
  move?: Move;
  reloads = {
    knife: 0,
    ball: 0,
    bazooka: 0,
    spiral: 0,
  };

  static generateId() {
    return Math.floor(Math.random() * 1000000);
  }

  constructor(id: number) {
    super(id, "Bot #" + id, undefined as unknown as WebSocket);
    this.id = id;
    this.name = "Bot #" + id;
  }

  chooseRandomMove(players: Player[]) {
    const availableMoves = this.getAvailableMoves();

    const move =
      availableMoves[Math.floor(Math.random() * availableMoves.length)];

    if (move.dir == "all" || move.dir == "self") {
      this.move = new Move(move, {});
    } else {
      const direction = players.filter((p) => !p.isDead && p.id != this.id)[
        Math.floor(Math.random() * players.length)
      ];

      this.move = new Move(move, { direction });
    }
  }

  private getAvailableMoves() {
    const availableMoves: (typeof moves)[number][] = [];

    for (const move of moves) {
      if (
        !(
          (move.method == "offense" &&
            move.needs?.edition != "any" &&
            !this.hasEnoughReloads(move.needs)) ||
          (move.method == "offense" && move.needs?.edition == "any")
        )
      ) {
        availableMoves.push(move);
      }
    }

    return availableMoves;
  }

  private hasEnoughReloads(reload: any) {
    if (!reload) return true;
    if (
      this.reloads[reload.edition as keyof typeof this.reloads] < reload.amount
    ) {
      return false;
    }
    return true;
  }
}

export class Move {
  action: (typeof moves)[number];
  direction?: Player;
  using?: {
    amount: number;
    edition: "knife" | "ball" | "bazooka" | "spiral";
  }[];

  constructor(
    action: (typeof moves)[number],
    options: {
      direction?: Player;
      using?: {
        amount: number;
        edition: "knife" | "ball" | "bazooka" | "spiral";
      }[];
    }
  ) {
    this.action = action;

    if (action.dir == "one") {
      this.direction = options.direction;
    }

    if (action.method == "offense" && action.needs?.edition == "any") {
      this.using = options.using;
    }
  }
}

export const moves = [
  {
    id: "shotgun",
    title: "Shotgun",
    method: "offense",
    needs: null,
    beats: ["knife", "spiralball"],
    dir: "one",
  },
  {
    id: "knife",
    title: "Knife",
    method: "offense",
    needs: { amount: 1, edition: "knife" },
    beats: [],
    dir: "one",
  },
  {
    id: "waterball",
    title: "Water Ball",
    method: "offense",
    needs: { amount: 1, edition: "ball" },
    beats: ["shotgun", "knife", "fireball"],
    dir: "one",
  },
  {
    id: "iceball",
    title: "Ice Ball",
    method: "offense",
    needs: { amount: 1, edition: "ball" },
    beats: ["shotgun", "knife", "waterball"],
    dir: "one",
  },
  {
    id: "fireball",
    title: "Fire Ball",
    method: "offense",
    needs: { amount: 2, edition: "ball" },
    beats: ["shotgun", "knife", "iceball"],
    dir: "one",
  },
  {
    id: "bazooka",
    title: "Bazooka",
    method: "offense",
    needs: { amount: 3, edition: "bazooka" },
    beats: ["shotgun", "knife", "waterball", "iceball", "fireball"],
    dir: "one",
  },
  {
    id: "spiralball",
    title: "Spiral Ball",
    method: "offense",
    needs: { amount: 5, edition: "spiral" },
    beats: ["knife", "waterball", "iceball", "fireball", "bazooka"],
    dir: "one",
  },
  {
    id: "deathsmoke",
    title: "Death Smoke",
    method: "offense",
    needs: { amount: 10, edition: "any" },
    beats: [
      "shotgun",
      "knife",
      "waterball",
      "iceball",
      "fireball",
      "bazooka",
      "spiralball",
    ],
    dir: "all",
  },
  {
    id: "shield",
    title: "Shield",
    method: "defense",
    penetrates: ["spiralball", "deathsmoke"],
    dir: "all",
  },
  {
    id: "mirror",
    title: "Mirror",
    method: "defense-offense",
    reflects: ["shotgun", "waterball", "iceball"],
    dir: "one",
  },
  {
    id: "mask",
    title: "Mask",
    method: "defense",
    penetrates: [
      "shotgun",
      "knife",
      "waterball",
      "iceball",
      "fireball",
      "bazooka",
      "spiralball",
    ],
    dir: "all",
  },
  {
    id: "r-knife",
    title: "Knife Sheath",
    method: "reload",
    amount: 1,
    dir: "self",
  },
  {
    id: "r-ball",
    title: "Ball Power",
    method: "reload",
    amount: 1,
    dir: "self",
  },
  {
    id: "r-bazooka",
    title: "Bazooka Reload",
    method: "reload",
    amount: 1,
    dir: "self",
  },
  {
    id: "r-spiral",
    title: "Spiral Energy",
    method: "reload",
    amount: 1,
    dir: "self",
  },
] as const;
