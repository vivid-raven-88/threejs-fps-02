// The whole match in one place. Every module reads and writes this object;
// nothing else keeps a second copy of match state.
import { ECONOMY, WEAPONS, GRENADE, ARMOUR, BOT_NAMES } from './config.js';
import { SPAWNS } from './map.js';

let nextId = 1;

export function makeEntity(team, name, isPlayer, spawnIdx) {
  const s = SPAWNS[team][spawnIdx % SPAWNS[team].length];
  return {
    id: nextId++,
    name, team, isPlayer,
    alive: true, hp: 100, armour: false,
    pos: { x: s.x, y: 0, z: s.z },
    yaw: s.yaw, pitch: 0,
    vel: { x: 0, y: 0, z: 0 },
    grounded: true, crouched: false, moving: false,
    weapons: ['pistol'], weapon: 'pistol',
    mag: { pistol: WEAPONS.pistol.mag },
    reserve: { pistol: WEAPONS.pistol.reserve },
    grenades: 0,
    money: ECONOMY.startMoney,
    kills: 0, deaths: 0,
    // Combat runtime.
    lastShot: -9, reloading: 0, reloadEnd: 0, bloom: 0, burstLeft: 0, burstAt: 0,
    // Bot brain (ignored for the player).
    brain: null,
    // Channel state (plant/defuse/pickup progress 0..1).
    channel: null,
    // Visual mesh, attached by main.js.
    mesh: null, gunMesh: null,
    // Last damage source, for the kill feed.
    lastHitBy: null, lastHitAt: 0,
  };
}

export function makeBot(team, idx) {
  const ent = makeEntity(team, BOT_NAMES[team][idx % BOT_NAMES[team].length], false, idx);
  ent.brain = {
    mode: 'patrol', path: [], pathIdx: 0, targetWp: -1,
    target: null, lastSeen: null, lastSeenAt: -9, aimTime: 0,
    reactAt: 0, burstPause: 0, holdUntil: 0, strafeDir: 1, strafeAt: 0,
    skill: 0.75 + Math.random() * 0.5, // deterministic per match? set in resetMatch
    investigate: null,
  };
  return ent;
}

export class GameState {
  constructor() {
    this.phase = 'menu'; // menu | freeze | live | roundEnd | matchEnd
    this.round = 0;
    this.score = { atk: 0, def: 0 };
    this.timer = 0; // counts down in live/freeze
    this.roundEndAt = 0;
    this.winner = null; // match winner team
    this.roundWinner = null;
    this.roundReason = '';
    this.entities = [];
    this.player = null;
    this.bomb = {
      state: 'carried', // carried | dropped | planted | exploded | defused
      carrier: null, site: null,
      pos: { x: 0, y: 0, z: 0 },
      timer: 0,
    };
    this.feed = []; // {text, cls, at}
    this.events = []; // hearing events {x, z, radius, at, kind}
    this.grenades = []; // live grenades {pos, vel, fuse, owner}
    this.shotsFired = 0;
    this.time = 0; // match clock, seconds
    this.demo = null;
  }

  resetMatch() {
    this.entities = [];
    this.player = makeEntity('atk', 'You', true, 1);
    this.entities.push(this.player);
    for (let i = 0; i < 4; i++) this.entities.push(makeBot('atk', i));
    for (let i = 0; i < 5; i++) this.entities.push(makeBot('def', i));
    // Deterministic-ish skill spread (seeded by round so replays vary per match, not per frame).
    let seed = 12345 + this.round;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (const e of this.entities) if (e.brain) e.brain.skill = 0.7 + rnd() * 0.6;
    this.score = { atk: 0, def: 0 };
    this.round = 0;
    this.winner = null;
    this.feed = [];
    this.grenades = [];
    this.events = [];
    this.bomb = { state: 'carried', carrier: this.player, site: 'A', pos: { x: 0, y: 0.2, z: 0 }, timer: 0 };
  }

  aliveOf(team) {
    let n = 0;
    for (const e of this.entities) if (e.team === team && e.alive) n++;
    return n;
  }

  addFeed(text, cls) {
    this.feed.unshift({ text, cls: cls || '', at: this.time });
    if (this.feed.length > 6) this.feed.pop();
  }

  hear(x, z, radius, kind) {
    this.events.push({ x, z, radius, kind, at: this.time });
    if (this.events.length > 24) this.events.shift();
  }
}

export function buyItem(ent, id) {
  if (id === 'grenade') {
    if (ent.grenades >= GRENADE.max || ent.money < GRENADE.price) return false;
    ent.money -= GRENADE.price; ent.grenades++;
    return true;
  }
  if (id === 'armour') {
    if (ent.armour || ent.money < ARMOUR.price) return false;
    ent.money -= ARMOUR.price; ent.armour = true;
    return true;
  }
  const w = WEAPONS[id];
  if (!w || ent.weapons.includes(id) || ent.money < w.price) return false;
  ent.money -= w.price;
  ent.weapons.push(id);
  ent.mag[id] = w.mag;
  ent.reserve[id] = w.reserve;
  return true;
}
