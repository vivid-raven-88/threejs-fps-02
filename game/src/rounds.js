// Round flow: freeze / live / round end / match end, the buy phase, the charge
// (plant / defuse / explode), and the economy. Win checks run every tick.
import { GAME, ECONOMY, WEAPONS } from './config.js';
import { SPAWNS, pointInSite } from './map.js';
import { assignRoundRoles } from './bots.js';
import { buyItem } from './state.js';

const BOT_LOADOUTS = {
  atk: ['rifle', 'rifle', 'smg', 'sniper'],
  def: ['rifle', 'smg', 'rifle', 'sniper', 'smg'],
};

function giveWeapon(ent, id) {
  ent.weapons.push(id);
  ent.mag[id] = WEAPONS[id].mag;
  ent.reserve[id] = WEAPONS[id].reserve;
}

export function startMatch(state) {
  state.resetMatch();
  state.round = 0;
  state.winner = null;
  startRound(state);
}

export function startRound(state) {
  state.round++;
  const site = state.round % 2 === 1 ? 'A' : 'B';
  // Reset every fighter to its spawn, fresh kit, full health.
  state.entities.forEach((e, i) => {
    const s = SPAWNS[e.team][i % SPAWNS[e.team].length];
    e.alive = true; e.hp = 100; e.armour = false;
    e.pos.x = s.x; e.pos.y = 0; e.pos.z = s.z;
    e.yaw = s.yaw; e.pitch = 0;
    e.vel.x = 0; e.vel.y = 0; e.vel.z = 0;
    e.weapons = ['pistol']; e.weapon = 'pistol';
    e.mag = { pistol: WEAPONS.pistol.mag };
    e.reserve = { pistol: WEAPONS.pistol.reserve };
    e.grenades = 0; e.reloading = 0; e.bloom = 0; e.channel = null;
    e.lastShot = -9; e.burstLeft = 0;
    if (e.mesh) e.mesh.visible = true;
    if (e.brain) {
      e.brain.mode = 'patrol'; e.brain.target = null; e.brain.path = [];
      e.brain.pathIdx = 0; e.brain.aimTime = 0; e.brain.investigate = null;
      e.brain.site = site;
    }
  });
  // Bot loadouts and one grenade each.
  const atkBots = state.entities.filter((e) => e.team === 'atk' && e.brain);
  const defBots = state.entities.filter((e) => e.team === 'def' && e.brain);
  atkBots.forEach((b, i) => { giveWeapon(b, BOT_LOADOUTS.atk[i]); b.weapon = BOT_LOADOUTS.atk[i]; b.grenades = 1; });
  defBots.forEach((b, i) => { giveWeapon(b, BOT_LOADOUTS.def[i]); b.weapon = BOT_LOADOUTS.def[i]; b.grenades = 1; });
  assignRoundRoles(state, site);

  // The charge: the player carries on odd rounds, the lead attacker bot on even ones.
  state.bomb = { state: 'carried', carrier: null, site, pos: { x: 0, y: 0.2, z: 0 }, timer: 0 };
  if (state.round % 2 === 1) {
    state.bomb.carrier = state.player;
  } else {
    state.bomb.carrier = atkBots[0];
  }
  state.grenades = [];
  state.events = [];
  state.phase = 'freeze';
  state.timer = GAME.freezeTime;
  state.roundWinner = null;
  state.roundReason = '';
  state.addFeed(`Round ${state.round} — site ${site} is the target`, '');
}

export function buyWeapon(state, id) {
  if (state.phase !== 'freeze') return false;
  return buyItem(state.player, id);
}

function endRound(state, winner, reason) {
  if (state.phase !== 'live') return;
  state.roundWinner = winner;
  state.roundReason = reason;
  state.score[winner]++;
  for (const e of state.entities) {
    e.money += e.team === winner ? ECONOMY.winBonus : ECONOMY.lossBonus;
  }
  state.addFeed(
    `${winner === 'atk' ? 'Ember Vipers' : 'Frost Sentinels'} take round ${state.round} — ${reason}`,
    winner === 'atk' ? 'atk' : 'def',
  );
  state.phase = 'roundEnd';
  state.timer = GAME.roundEndTime;
  // Match decided?
  if (state.score.atk >= GAME.winRounds || state.score.def >= GAME.winRounds || state.round >= GAME.maxRounds) {
    state.winner = state.score.atk > state.score.def ? 'atk' : state.score.atk < state.score.def ? 'def' : null;
  }
}

function plantCharge(state, planter) {
  state.bomb.state = 'planted';
  // The site is where the planter stands, not the round's assigned target.
  state.bomb.site = pointInSite(planter.pos.x, planter.pos.z, 'A') ? 'A' : 'B';
  state.bomb.timer = GAME.bombTimer;
  state.bomb.pos = { x: planter.pos.x, y: 0.2, z: planter.pos.z };
  planter.money += ECONOMY.plantReward;
  state.addFeed(`${planter.name} planted the charge at site ${state.bomb.site}`, 'warn');
}

function updatePlayerChannel(state, dt, audio) {
  const p = state.player;
  if (!p.alive || state.phase !== 'live') { p.channel = null; return; }
  // Planting: attacker, inside a site, holding still. Defusing: defender near the planted charge.
  let kind = null;
  if (p.team === 'atk' && state.bomb.state === 'carried' && state.bomb.carrier === p) {
    if (pointInSite(p.pos.x, p.pos.z, 'A') || pointInSite(p.pos.x, p.pos.z, 'B')) kind = 'plant';
  } else if (p.team === 'def' && state.bomb.state === 'planted') {
    const dx = state.bomb.pos.x - p.pos.x, dz = state.bomb.pos.z - p.pos.z;
    if (dx * dx + dz * dz < 4) kind = 'defuse';
  }
  if (!kind || !p.channelHeld || p.moving) { p.channel = null; return; }
  if (!p.channel || p.channel.kind !== kind) p.channel = { kind, at: state.time, hp: p.hp };
  if (p.hp < p.channel.hp) { p.channel = null; return; } // taking damage breaks the channel
  const need = kind === 'plant' ? GAME.plantTime : GAME.defuseTime;
  if (state.time - p.channel.at >= need) {
    if (kind === 'plant') { plantCharge(state, p); audio.plant(); }
    else {
      state.bomb.state = 'defused';
      p.money += ECONOMY.defuseReward;
      state.addFeed(`${p.name} defused the charge`, 'good');
      audio.defuse();
    }
    p.channel = null;
  }
}

export function updateRounds(state, dt, fx, audio) {
  if (state.phase === 'freeze') {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.phase = 'live';
      state.timer = GAME.roundTime;
      state.addFeed('Go — round live', '');
    }
    return;
  }
  if (state.phase === 'roundEnd') {
    state.timer -= dt;
    if (state.timer <= 0) {
      if (state.winner !== null || state.round >= GAME.maxRounds) {
        state.phase = 'matchEnd';
      } else {
        startRound(state);
      }
    }
    return;
  }
  if (state.phase !== 'live') return;

  // The player picks up a dropped charge by walking over it.
  if (state.bomb.state === 'dropped' && state.player.alive && state.player.team === 'atk') {
    const dx = state.bomb.pos.x - state.player.pos.x, dz = state.bomb.pos.z - state.player.pos.z;
    if (dx * dx + dz * dz < 1.4) {
      state.bomb.state = 'carried';
      state.bomb.carrier = state.player;
      state.addFeed('You picked up the charge', '');
    }
  }

  updatePlayerChannel(state, dt, audio);

  if (state.bomb.state === 'planted') {
    state.bomb.timer -= dt;
    if (state.bomb.timer <= 0) {
      state.bomb.state = 'exploded';
      fx.explosion(state.bomb.pos.x, 0.6, state.bomb.pos.z);
      audio.explosion(0);
      // The blast kills everyone still on the site.
      for (const e of state.entities) {
        if (!e.alive) continue;
        const dx = e.pos.x - state.bomb.pos.x, dz = e.pos.z - state.bomb.pos.z;
        if (dx * dx + dz * dz < 64) { e.hp = 0; e.alive = false; e.deaths++; if (e.mesh) e.mesh.visible = false; }
      }
      endRound(state, 'atk', 'charge detonated');
      return;
    }
  }
  if (state.bomb.state === 'defused') { endRound(state, 'def', 'charge defused'); return; }

  const atkAlive = state.aliveOf('atk');
  const defAlive = state.aliveOf('def');
  if (atkAlive === 0) { endRound(state, 'def', 'attackers eliminated'); return; }
  if (defAlive === 0) { endRound(state, 'atk', 'defenders eliminated'); return; }

  state.timer -= dt;
  if (state.timer <= 0 && state.bomb.state !== 'planted') {
    endRound(state, 'def', 'time expired — charge never planted');
  }
}
