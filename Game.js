import { JSONDecycle } from "./cycle.js";
export class Game {
    static generateId() {
        return Math.floor(Math.random() * 1000000);
    }
    static interpretBroadcast(data) { }
    constructor(id, host, cap) {
        this.gameStarted = false;
        this.loadingMoves = [];
        this.id = id;
        this.host = host;
        this.players = [host];
        this.cap = cap;
        this.broadcast("game-created", {});
    }
    hostStart(socket) {
        if (!this.isHost(socket))
            return;
        this.start();
    }
    start() {
        this.gameStarted = true;
        this.broadcast("game-started", {});
    }
    findPlayer(playerId, socket) {
        const results = this.players.filter((p) => p.id == playerId && p.socket == socket);
        return results.length == 1 ? results[0] : undefined;
    }
    isHost(socket) {
        return this.host.socket == socket;
    }
    addPlayer(player) {
        if (this.gameStarted)
            return;
        if (this.players.filter((p) => p.id == player.id || p.socket == player.socket)
            .length)
            return;
        this.players.push(player);
        this.broadcast("player-added", { newPlayerId: player.id });
        if (this.players.length == this.cap)
            this.start();
    }
    removePlayer(playerId, socket) {
        if (this.players.length <= 2) {
            this.end("all-left");
            return;
        }
        if (this.isHost(socket)) {
            if (this.host.id == playerId)
                return;
            if (this.players.filter((p) => p.id == playerId).length != 1)
                return;
            this.players = this.players.filter((p) => p.id != playerId);
            this.broadcast("player-removed", {
                reason: "host-kicked",
                removedPlayerId: playerId,
            });
            this.loadingMoves = this.loadingMoves.filter((a) => a.playerId != playerId);
            if (this.loadingMoves.length == this.players.length) {
                this.move();
                this.loadingMoves = [];
            }
            return;
        }
        const player = this.findPlayer(playerId, socket);
        if (!player)
            return;
        this.players = this.players.filter((p) => p.id != playerId && p.socket != socket);
        this.broadcast("player-removed", {
            reason: "left",
            removedPlayerId: playerId,
        });
        this.loadingMoves = this.loadingMoves.filter((a) => a.playerId != playerId);
        if (this.loadingMoves.length == this.players.length) {
            this.move();
            this.loadingMoves = [];
        }
    }
    skip(socket) {
        if (!this.gameStarted)
            return;
        if (!this.isHost(socket))
            return;
        if (this.loadingMoves.length == 0)
            return;
        this.broadcast("host-skipped", {});
        this.move();
        this.loadingMoves = [];
    }
    isLoading() {
        return this.loadingMoves.length > 0;
    }
    load(action) {
        var _a;
        if (!this.gameStarted)
            return;
        if (!this.findPlayer(action.playerId, action.socket))
            return;
        if ((_a = this.findPlayer(action.playerId, action.socket)) === null || _a === void 0 ? void 0 : _a.isDead)
            return;
        if (this.loadingMoves.filter((a) => a.playerId == action.playerId).length)
            return;
        this.loadingMoves.push(action);
        this.broadcast("player-loaded", { loadedPlayerId: action.playerId });
        if (this.loadingMoves.length == this.players.length) {
            this.move();
            this.loadingMoves = [];
        }
    }
    move() {
        const actions = this.loadingMoves;
        for (const player of this.players) {
            if (player.isDead) {
                player.move = undefined;
                continue;
            }
            const a = actions.filter((a) => a.playerId == player.id);
            if (a.length == 1) {
                const action = a[0];
                const theAction = moves.filter((m) => m.id == action.moveId);
                const theDirection = this.players.filter((p) => p.id == action.direction);
                if (theAction.length == 1) {
                    player.move = {
                        action: theAction[0],
                        direction: theDirection.length == 1 ? theDirection[0] : undefined,
                        using: action.using,
                    };
                }
                else {
                    player.move == undefined;
                }
            }
            else {
                player.move = undefined;
            }
        }
        this.update();
    }
    update() {
        for (const player of this.players) {
            if (player.move &&
                player.move.action.method == "offense" &&
                player.move.action.needs) {
                if (player.move.action.needs.edition == "any") {
                    if (player.move.using) {
                        let counter = 0;
                        for (const use of player.move.using) {
                            if (player.reloads[use.edition] >= use.amount) {
                                player.reloads[use.edition] -= use.amount;
                                counter += use.amount;
                            }
                            else {
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
                    }
                    else {
                        player.reloads.knife = 0;
                        player.reloads.ball = 0;
                        player.reloads.bazooka = 0;
                        player.reloads.spiral = 0;
                        player.move = undefined;
                    }
                }
                else {
                    if (player.reloads[player.move.action.needs.edition] >=
                        player.move.action.needs.amount) {
                        player.reloads[player.move.action.needs.edition] -=
                            player.move.action.needs.amount;
                    }
                    else {
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
            if (!player.move)
                continue;
            if (player.move.action.method == "reload") {
                player.reloads[player.move.action.id.substring(2)] += player.move.action.amount;
            }
            else if (player.move.action.method == "offense") {
                if (player.move.action.dir == "all") {
                    for (const pl of this.players.filter((p) => p.id != player.id)) {
                        if (pl.isDead)
                            continue;
                        if (!pl.move) {
                            pl.isDead = true;
                            continue;
                        }
                        if (pl.move.action.dir != "all" && pl.move.direction != player) {
                            pl.isDead = true;
                            continue;
                        }
                        if (pl.move.action.method == "offense") {
                            if (player.move.action.id == pl.move.action.id)
                                continue;
                            if (player.move.action.beats.includes(pl.move.action.id)) {
                                pl.isDead = true;
                            }
                            else {
                                player.isDead = true;
                            }
                        }
                        else if (pl.move.action.method == "defense") {
                            if (pl.move.action.penetrates.includes(player.move.action.id)) {
                                pl.isDead = true;
                            }
                        }
                        else if (pl.move.action.method == "defense-offense") {
                            if (pl.move.action.reflects.includes(player.move.action.id)) {
                                player.isDead = true;
                            }
                            else {
                                pl.isDead = true;
                            }
                        }
                        else {
                            pl.isDead = true;
                        }
                    }
                }
                else {
                    const pl = player.move.direction;
                    if (!pl)
                        continue;
                    if (pl.isDead)
                        continue;
                    if (!pl.move) {
                        pl.isDead = true;
                        continue;
                    }
                    if (pl.move.action.dir != "all" && pl.move.direction != player) {
                        pl.isDead = true;
                        continue;
                    }
                    if (pl.move.action.method == "offense") {
                        if (player.move.action.id == pl.move.action.id)
                            continue;
                        if (player.move.action.beats.includes(pl.move.action.id)) {
                            pl.isDead = true;
                        }
                        else {
                            player.isDead = true;
                        }
                    }
                    else if (pl.move.action.method == "defense") {
                        if (pl.move.action.penetrates.includes(player.move.action.id)) {
                            pl.isDead = true;
                        }
                    }
                    else if (pl.move.action.method == "defense-offense") {
                        if (pl.move.action.reflects.includes(player.move.action.id)) {
                            player.isDead = true;
                        }
                        else {
                            pl.isDead = true;
                        }
                    }
                    else {
                        pl.isDead = true;
                    }
                }
            }
        }
        this.broadcast("game-updated", {});
        if (this.players.filter((p) => !p.isDead).length <= 1) {
            this.end("all-dead");
        }
    }
    hostEnd(socket) {
        if (!this.isHost(socket))
            return;
        this.end("host-end");
    }
    end(reason) {
        for (const player of this.players) {
            player.socket.close(1000, JSON.stringify({ type: "game-end", payload: { reason, game: this } }));
        }
        this.players = [];
        this.gameStarted = false;
        this.loadingMoves = [];
    }
    broadcast(type, payload) {
        for (const player of this.players) {
            if (player.socket) {
                const data = { type, payload: Object.assign(Object.assign({}, payload), { game: this }) };
                const str = JSON.stringify(JSONDecycle(data, undefined));
                player.socket.send(str);
            }
        }
    }
    // TODO: Decide if I need this
    outputStatus() {
        var _a;
        let output = "MOVES:\n";
        for (const player of this.players) {
            if (player.move) {
                output +=
                    player.name +
                        " used " +
                        ((_a = player.move) === null || _a === void 0 ? void 0 : _a.action.title) +
                        direction(player) +
                        ".\n";
            }
        }
        output += "\n";
        function direction(player) {
            var _a, _b, _c, _d;
            if (((_a = player.move) === null || _a === void 0 ? void 0 : _a.action.dir) == "one") {
                return " against " + ((_c = (_b = player.move) === null || _b === void 0 ? void 0 : _b.direction) === null || _c === void 0 ? void 0 : _c.name);
            }
            else if (((_d = player.move) === null || _d === void 0 ? void 0 : _d.action.dir) == "self") {
                return " on itself";
            }
            else {
                return " against everyone";
            }
        }
        output += "RELOADS FOR ALIVE PLAYERS:\n";
        for (const player of this.players) {
            if (!player.isDead) {
                output +=
                    player.name +
                        " has " +
                        player.reloads.knife +
                        " knife reload(s), " +
                        player.reloads.ball +
                        " ball reload(s), " +
                        player.reloads.bazooka +
                        " bazooka reload(s), and " +
                        player.reloads.spiral +
                        " spiral reload(s).\n";
            }
        }
        output += "\n\n";
        return output;
    }
}
export class Player {
    static generateId() {
        return Math.floor(Math.random() * 1000000);
    }
    constructor(id, name, server) {
        this.isDead = false;
        this.reloads = {
            knife: 0,
            ball: 0,
            bazooka: 0,
            spiral: 0,
        };
        this.id = id;
        this.name = name;
        this.socket = server;
    }
}
export class Move {
    constructor(action, options) {
        var _a;
        this.action = action;
        if (action.dir == "one") {
            this.direction = options.direction;
        }
        if (action.method == "offense" && ((_a = action.needs) === null || _a === void 0 ? void 0 : _a.edition) == "any") {
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
        beats: ["spiralball"],
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
];
