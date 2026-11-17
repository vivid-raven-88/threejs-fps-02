// Kestrel Yard — central tuning. One place for every number the game balances on.
export const GAME = {
  name: 'Kestrel Yard',
  tick: 1 / 60,
  roundTime: 100,
  freezeTime: 6,
  roundEndTime: 4,
  plantTime: 3,
  defuseTime: 5,
  bombTimer: 35,
  winRounds: 5,
  maxRounds: 9,
  teamSize: 5,
  eyeHeight: 1.62,
  crouchEye: 1.12,
  bounds: { x1: -32, x2: 32, z1: -22, z2: 22 },
  bodyRadius: 0.45,
  gravity: 18,
  jumpSpeed: 6.2,
  walkSpeed: 5.2,
  crouchSpeed: 2.6,
  botSpeed: 4.4,
  accel: 42,
  friction: 30,
};

export const ECONOMY = {
  startMoney: 800,
  winBonus: 3000,
  lossBonus: 1900,
  killReward: 300,
  plantReward: 300,
  defuseReward: 300,
};

// price 0 = owned from the start. slot = buy key / weapon key.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidewinder', slot: 1, price: 0, damage: 34, headMult: 2,
    interval: 0.38, auto: false, mag: 12, reserve: 48, reload: 1.4,
    spread: 0.012, moveSpread: 2.2, recoil: 0.011, range: 60, tracer: 0xffd27a,
  },
  smg: {
    id: 'smg', name: 'VK-9 Raptor', slot: 2, price: 900, damage: 25, headMult: 2,
    interval: 0.085, auto: true, mag: 28, reserve: 84, reload: 1.9,
    spread: 0.02, moveSpread: 2.0, recoil: 0.006, range: 45, tracer: 0xffe9a8,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Longshot', slot: 3, price: 2500, damage: 38, headMult: 2,
    interval: 0.13, auto: true, mag: 25, reserve: 75, reload: 2.2,
    spread: 0.008, moveSpread: 2.6, recoil: 0.013, range: 70, tracer: 0xffc46b,
  },
  sniper: {
    id: 'sniper', name: 'LW-50 Hawkeye', slot: 4, price: 4000, damage: 96, headMult: 2,
    interval: 1.15, auto: false, mag: 5, reserve: 15, reload: 3.0,
    spread: 0.002, moveSpread: 3.0, recoil: 0.05, range: 100, tracer: 0x9fd8ff,
  },
};

export const GRENADE = { price: 300, max: 2, fuse: 1.6, radius: 6.5, damage: 90 };
export const ARMOUR = { price: 650, reduction: 0.3 };

export const TEAMS = {
  atk: { id: 'atk', name: 'Ember Vipers', short: 'EMB', color: 0xff7a2f, css: '#ff7a2f', role: 'attack' },
  def: { id: 'def', name: 'Frost Sentinels', short: 'FRS', color: 0x35c4ff, css: '#35c4ff', role: 'defend' },
};

export const PALETTE = {
  sky: 0x2b2f4a,
  fog: 0x2b2f4a,
  floor: 0x8a7f6a,
  floorDark: 0x6f6653,
  wall: 0x4a4f63,
  wallTrim: 0xd98a2b,
  crate: 0x9a6b32,
  crateDark: 0x6e4a22,
  siteA: 0xffb020,
  siteB: 0x2fd4c4,
  rail: 0x33364a,
  light: 0xfff2cf,
};

export const BOT_NAMES = {
  atk: ['Rook', 'Havoc', 'Mira', 'Dune'],
  def: ['Vex', 'Onyx', 'Sable', 'Rune', 'Ash'],
};
