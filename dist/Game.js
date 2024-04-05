var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _Game_loadingMoves, _Bot_botType, _Bot_botPersonality;
import { JSONDecycle } from "./cycle.js";
export class Game {
    static generateId() {
        return Math.floor(Math.random() * 1000000);
    }
    constructor(id, host, cap, lastPlayerKeepsPlaying, isPublic) {
        this.gameStarted = false;
        this.gameEnded = false;
        this.playersMoved = [];
        _Game_loadingMoves.set(this, []);
        this.id = id;
        this.host = host;
        this.players = [host];
        this.cap = cap;
        this.lastPlayerKeepsPlaying = lastPlayerKeepsPlaying;
        this.isPublic = isPublic;
        this.broadcast("game-created", {});
        if (host.socket) {
            const data = {
                type: "player-id",
                payload: { playerId: host.id, game: this },
            };
            const str = JSON.stringify(JSONDecycle(data, undefined));
            host.socket.send(str);
        }
    }
    searchable() {
        return (this.isPublic &&
            !this.gameStarted &&
            !this.gameEnded &&
            this.players.filter((p) => !p.bot).length < this.cap &&
            this.cap > 1);
    }
    hostStart(socket) {
        if (!this.isHost(socket))
            return;
        if ((!this.lastPlayerKeepsPlaying &&
            this.players.filter((p) => !p.bot).length < 2) ||
            this.players.filter((p) => !p.bot).length < 1 ||
            (this.players.filter((p) => p.bot).length < 1 &&
                this.players.filter((p) => !p.bot).length < 2) ||
            this.gameStarted) {
            socket.send(JSON.stringify({
                type: "error",
                payload: { error: "Player Count Not Enough" },
            }));
            return;
        }
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
            .length) {
            return;
        }
        if (this.players.filter((p) => !p.bot).length == this.cap)
            return;
        this.players.push(player);
        if (player.socket) {
            const data = {
                type: "player-id",
                payload: { playerId: player.id, game: this },
            };
            const str = JSON.stringify(JSONDecycle(data, undefined));
            player.socket.send(str);
        }
        this.broadcast("player-added", { newPlayerId: player.id });
        if (this.players.filter((p) => !p.bot).length == this.cap && this.cap > 1) {
            this.start();
        }
    }
    addBot(socket, id) {
        if (this.gameStarted)
            return;
        if (!this.isHost(socket))
            return;
        const bot = new Bot(id);
        this.players.push(bot);
        this.broadcast("player-added", { newPlayerId: bot.id });
    }
    removePlayer(playerId, socket) {
        if (this.isHost(socket)) {
            if (this.host.id == playerId) {
                this.end("host-left");
                if (this.players.filter((p) => p.id == playerId)[0].socket &&
                    !this.players.filter((p) => p.id == playerId)[0].bot) {
                    this.players.filter((p) => p.id == playerId)[0].socket.close(1000);
                }
                this.players = this.players.filter((p) => p.id != playerId);
                return;
            }
            if (this.players.filter((p) => p.id == playerId).length != 1)
                return;
            this.broadcast("player-removed", {
                reason: "host-kicked",
                removedPlayerId: playerId,
            });
            if (this.players.filter((p) => p.id == playerId)[0].socket &&
                !this.players.filter((p) => p.id == playerId)[0].bot) {
                this.players.filter((p) => p.id == playerId)[0].socket.close(1000);
            }
            this.players = this.players.filter((p) => p.id != playerId);
            this.broadcast("player-removed-update", {
                reason: "host-kicked",
                removedPlayerId: playerId,
            });
            if ((this.players.filter((p) => !p.bot && !p.isDead).length <= 1 &&
                this.gameStarted &&
                !this.lastPlayerKeepsPlaying) ||
                this.players.filter((p) => !p.bot && !p.isDead).length <= 0 ||
                this.players.filter((p) => !p.isDead).length <= 0 ||
                (this.players.filter((p) => !p.isDead).length <= 1 && this.gameStarted)) {
                this.end("all-left");
                return;
            }
            __classPrivateFieldSet(this, _Game_loadingMoves, __classPrivateFieldGet(this, _Game_loadingMoves, "f").filter((a) => a.playerId != playerId), "f");
            this.playersMoved = this.playersMoved.filter((id) => id != playerId);
            if (__classPrivateFieldGet(this, _Game_loadingMoves, "f").length ==
                this.players.filter((p) => !p.isDead && !p.bot).length) {
                this.move();
                __classPrivateFieldSet(this, _Game_loadingMoves, [], "f");
                this.playersMoved = [];
            }
            return;
        }
        const player = this.findPlayer(playerId, socket);
        if (!player)
            return;
        this.broadcast("player-removed", {
            reason: "left",
            removedPlayerId: playerId,
        });
        if (this.players.filter((p) => p.id == playerId)[0].socket &&
            !this.players.filter((p) => p.id == playerId)[0].bot) {
            this.players.filter((p) => p.id == playerId)[0].socket.close(1000);
        }
        this.players = this.players.filter((p) => p.id != playerId && p.socket != socket);
        this.broadcast("player-removed-update", {
            reason: "left",
            removedPlayerId: playerId,
        });
        if ((this.players.filter((p) => !p.bot && !p.isDead).length <= 1 &&
            this.gameStarted &&
            !this.lastPlayerKeepsPlaying) ||
            this.players.filter((p) => !p.bot && !p.isDead).length <= 0 ||
            this.players.filter((p) => !p.isDead).length <= 0 ||
            (this.players.filter((p) => !p.isDead).length <= 1 && this.gameStarted)) {
            this.end("all-left");
            return;
        }
        __classPrivateFieldSet(this, _Game_loadingMoves, __classPrivateFieldGet(this, _Game_loadingMoves, "f").filter((a) => a.playerId != playerId), "f");
        this.playersMoved = this.playersMoved.filter((id) => id != playerId);
        if (__classPrivateFieldGet(this, _Game_loadingMoves, "f").length ==
            this.players.filter((p) => !p.isDead && !p.bot).length) {
            this.move();
            __classPrivateFieldSet(this, _Game_loadingMoves, [], "f");
            this.playersMoved = [];
        }
    }
    skip(socket) {
        if (!this.gameStarted)
            return;
        if (!this.isHost(socket))
            return;
        if (__classPrivateFieldGet(this, _Game_loadingMoves, "f").length == 0) {
            socket.send(JSON.stringify({
                type: "error",
                payload: { error: "No One Has Moved Yet" },
            }));
            return;
        }
        this.broadcast("host-skipped", {});
        this.move();
        __classPrivateFieldSet(this, _Game_loadingMoves, [], "f");
        this.playersMoved = [];
    }
    load(action) {
        var _a, _b;
        if (!this.gameStarted)
            return;
        if (!this.findPlayer(action.playerId, action.socket))
            return;
        if ((_a = this.findPlayer(action.playerId, action.socket)) === null || _a === void 0 ? void 0 : _a.isDead)
            return;
        if (__classPrivateFieldGet(this, _Game_loadingMoves, "f").filter((a) => a.playerId == action.playerId).length) {
            return;
        }
        const move = moves.find((m) => m.id == action.moveId);
        if ((move === null || move === void 0 ? void 0 : move.dir) == "one") {
            if (!this.players.find((p) => p.id == action.direction))
                return;
        }
        else {
            action.direction = undefined;
        }
        if ((move === null || move === void 0 ? void 0 : move.method) == "offense" && ((_b = move === null || move === void 0 ? void 0 : move.needs) === null || _b === void 0 ? void 0 : _b.edition) == "any") {
            if (!action.using)
                return;
            if (action.using.length == 0)
                return;
            for (const use of action.using) {
                if (!["knife", "ball", "bazooka", "spiral"].includes(use.edition)) {
                    return;
                }
            }
        }
        else {
            action.using = undefined;
        }
        __classPrivateFieldGet(this, _Game_loadingMoves, "f").push(action);
        this.playersMoved.push(action.playerId);
        this.broadcast("player-loaded", { loadedPlayerId: action.playerId });
        if (__classPrivateFieldGet(this, _Game_loadingMoves, "f").length ==
            this.players.filter((p) => !p.isDead && !p.bot).length) {
            this.move();
            __classPrivateFieldSet(this, _Game_loadingMoves, [], "f");
            this.playersMoved = [];
        }
    }
    move() {
        const actions = __classPrivateFieldGet(this, _Game_loadingMoves, "f");
        for (const player of this.players.filter((p) => !p.bot)) {
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
        for (const bot of this.players.filter((p) => p.bot)) {
            if (bot.isDead) {
                bot.move = undefined;
                continue;
            }
            bot.chooseRandomMove(this.players);
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
        if (this.players.filter((p) => !p.isDead && !p.bot).length < 1 ||
            (this.players.filter((p) => !p.isDead && !p.bot).length < 2 &&
                !this.lastPlayerKeepsPlaying) ||
            this.players.filter((p) => !p.isDead).length <= 0 ||
            (this.players.filter((p) => !p.isDead).length <= 1 && this.gameStarted)) {
            this.end("all-dead");
        }
    }
    hostEnd(socket) {
        if (!this.isHost(socket))
            return;
        this.end("host-end");
    }
    end(reason) {
        if (this.gameEnded)
            return;
        this.gameEnded = true;
        this.broadcast("game-ended", { reason });
        for (const player of this.players.filter((p) => !p.bot)) {
            if (player.socket) {
                player.socket.close(1000);
            }
        }
    }
    broadcast(type, payload) {
        for (const player of this.players.filter((p) => !p.bot)) {
            if (player.socket) {
                const data = { type, payload: Object.assign(Object.assign({}, payload), { game: this }) };
                const str = JSON.stringify(JSONDecycle(data, undefined));
                player.socket.send(str);
            }
        }
    }
}
_Game_loadingMoves = new WeakMap();
export class Player {
    static generateId() {
        return Math.floor(Math.random() * 1000000);
    }
    constructor(id, name, server) {
        this.isDead = false;
        this.bot = false;
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
export class Bot extends Player {
    static generateId() {
        return Math.floor(Math.random() * 1000000);
    }
    constructor(id) {
        const theType = ["normal", "friendly", "enemy"][Math.floor(Math.random() * 3)];
        const thePersonality = ["normal", "aggressive", "defensive"][Math.floor(Math.random() * 3)];
        const botName = botNames[Math.floor(Math.random() * botNames.length)];
        super(id, botName, undefined);
        this.isDead = false;
        this.bot = true;
        _Bot_botType.set(this, void 0);
        _Bot_botPersonality.set(this, void 0);
        this.reloads = {
            knife: 0,
            ball: 0,
            bazooka: 0,
            spiral: 0,
        };
        this.id = id;
        this.name = botName;
        __classPrivateFieldSet(this, _Bot_botType, theType, "f");
        __classPrivateFieldSet(this, _Bot_botPersonality, thePersonality, "f");
    }
    chooseRandomMove(players) {
        const availableMoves = this.getAvailableMoves();
        let move;
        if (__classPrivateFieldGet(this, _Bot_botPersonality, "f") == "normal") {
            move = availableMoves[Math.floor(Math.random() * availableMoves.length)];
        }
        else if (__classPrivateFieldGet(this, _Bot_botPersonality, "f") == "aggressive") {
            const offensiveMoves = availableMoves.filter((m) => m.method == "offense");
            const reloadMoves = availableMoves.filter((m) => m.method == "reload");
            const goOffensive = Math.random() < 0.5;
            move = goOffensive
                ? offensiveMoves[Math.floor(Math.random() * offensiveMoves.length)]
                : reloadMoves[Math.floor(Math.random() * reloadMoves.length)];
        }
        else {
            const defensiveMoves = availableMoves.filter((m) => m.method == "defense" || m.method == "defense-offense");
            move = defensiveMoves[Math.floor(Math.random() * defensiveMoves.length)];
        }
        if (__classPrivateFieldGet(this, _Bot_botType, "f") == "normal") {
            if (move.dir == "all" || move.dir == "self") {
                this.move = new Move(move, {});
            }
            else {
                const options = players.filter((p) => !p.isDead && p.id != this.id);
                const direction = options[Math.floor(Math.random() * options.length)];
                this.move = new Move(move, { direction });
            }
        }
        else if (__classPrivateFieldGet(this, _Bot_botType, "f") == "friendly") {
            if (move.dir == "all" || move.dir == "self") {
                this.move = new Move(move, {});
            }
            else {
                const options = players.filter((p) => !p.isDead && p.id != this.id && p.bot);
                if (options.length > 0) {
                    const direction = options[Math.floor(Math.random() * options.length)];
                    this.move = new Move(move, { direction });
                }
                else {
                    this.move = undefined;
                }
            }
        }
        else {
            if (move.dir == "all" || move.dir == "self") {
                this.move = new Move(move, {});
            }
            else {
                const options = players.filter((p) => !p.isDead && p.id != this.id && !p.bot);
                const direction = options[Math.floor(Math.random() * options.length)];
                this.move = new Move(move, { direction });
            }
        }
    }
    getAvailableMoves() {
        var _a, _b;
        const availableMoves = [];
        for (const move of moves) {
            if (!((move.method == "offense" &&
                ((_a = move.needs) === null || _a === void 0 ? void 0 : _a.edition) != "any" &&
                !this.hasEnoughReloads(move.needs)) ||
                (move.method == "offense" && ((_b = move.needs) === null || _b === void 0 ? void 0 : _b.edition) == "any") ||
                move.id == "mask")) {
                availableMoves.push(move);
            }
        }
        return availableMoves;
    }
    hasEnoughReloads(reload) {
        if (!reload)
            return true;
        if (this.reloads[reload.edition] < reload.amount) {
            return false;
        }
        return true;
    }
}
_Bot_botType = new WeakMap(), _Bot_botPersonality = new WeakMap();
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
];
const botNames = [
    "Rey Wang",
    "Valentino Watson",
    "Aniyah Schultz",
    "Jadon Hendricks",
    "Emelia Wiggins",
    "Paola Soto",
    "Khloe Lawson",
    "Justine Grimes",
    "Sage Foster",
    "Tessa Chaney",
    "Frederick Harrington",
    "Melissa Johns",
    "Winston Randolph",
    "Jamison Wagner",
    "Izabelle Graham",
    "Kali Phelps",
    "Calvin Adams",
    "Magdalena Dennis",
    "Olivia Cunningham",
    "Iris Bradford",
    "Damian Patton",
    "Stephany Salinas",
    "Mariam Dunn",
    "Danika Sanders",
    "Kolby Wall",
    "Tristan Callahan",
    "Dangelo Silva",
    "Seamus Bender",
    "Julianna Thornton",
    "Abbigail Stanton",
    "Ryan Leon",
    "Emmett Rosales",
    "Tucker Boyer",
    "Ariella Everett",
    "Jayla Weiss",
    "Jaida Compton",
    "Rashad Pearson",
    "Frankie Colon",
    "Charlie Cameron",
    "Braylon Carrillo",
    "Jaycee Foster",
    "Fletcher Ortega",
    "Kristina Cain",
    "Marley Mcintyre",
    "Harper Pena",
    "Jaydan Avery",
    "Aron Powell",
    "Clayton Hall",
    "Adrian Nelson",
    "Cloe Gibson",
    "Tommy Mckinney",
    "Carley Stafford",
    "Deborah Krause",
    "Logan Farley",
    "Abel Howell",
    "Shamar Esparza",
    "Lily Case",
    "Kaleigh Christian",
    "Moises Guerra",
    "Lillie Hansen",
    "Carla Glover",
    "Jaron Kirk",
    "Keyon Hardy",
    "Kelly Higgins",
    "Josh Ibarra",
    "Kelvin Elliott",
    "Raiden Cooper",
    "Kinley Cain",
    "Gaven Nolan",
    "Ali Bender",
    "Sam Lambert",
    "Sergio Barajas",
    "Kaleb Mckenzie",
    "Tristan Mccarty",
    "Yareli Barr",
    "Sean Cunningham",
    "Aleena Silva",
    "Kayden Barry",
    "Bailey Baxter",
    "Mikayla Price",
    "Giselle Oneal",
    "Richard Brooks",
    "Landon Lucas",
    "Tony Werner",
    "Sara Baldwin",
    "Charlize Huffman",
    "Zane Zhang",
    "Kolten Daniel",
    "Devan Montgomery",
    "Erin Short",
    "Desiree Potts",
    "Darion Cobb",
    "Mike Monroe",
    "Cierra Colon",
    "Kinsley Wiggins",
    "Dayton Bonilla",
    "Uriah Bird",
    "Sincere Stanley",
    "Nathaly Ortega",
    "Tatum Whitney",
];
