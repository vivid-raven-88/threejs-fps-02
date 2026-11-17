// Bot brains: waypoint patrol, site holds, vision, hearing, bursts, plant/defuse.
// Bots share the same shooting and damage code as the player (combat.js).
import { GAME, WEAPONS } from './config.js';
import { WAYPOINTS, nearestWaypoint, findPath, pointInSite } from './map.js';
import { SOLIDS } from './map.js';
import { segmentBlocked, collideCircle } from './collide.js';
import { fireHitscan, throwGrenade } from './combat.js';
import { canFire } from './weapons.js';

const EYE = 1.55;
const VIEW_DIST = 48;
const FOV = 1.05; // half-angle, radians
const TURN = 3.6; // rad/s

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(bot, want, dt) {
  const d = angDiff(want, bot.yaw);
  const step = Math.max(-TURN * dt, Math.min(TURN * dt, d));
  bot.yaw += step;
  return Math.abs(d) < 0.12;
}

function desiredYaw(fx, fz, tx, tz) {
  return Math.atan2(-(tx - fx), -(tz - fz));
}

// Can bot see ent? Distance, field of view, and a clear segment at eye height.
function canSee(bot, ent, state) {
  const dx = ent.pos.x - bot.pos.x, dz = ent.pos.z - bot.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > VIEW_DIST) return false;
  const want = desiredYaw(bot.pos.x, bot.pos.z, ent.pos.x, ent.pos.z);
  if (Math.abs(angDiff(want, bot.yaw)) > FOV && d > 6) return false;
  const ey = bot.pos.y + EYE;
  const ty = ent.pos.y + (ent.crouched ? 1.1 : 1.5);
  return !segmentBlocked(bot.pos.x, ey, bot.pos.z, ent.pos.x, ty, ent.pos.z, SOLIDS);
}

function nearestVisibleEnemy(bot, state) {
  let best = null, bd = Infinity;
  for (const e of state.entities) {
    if (!e.alive || e.team === bot.team) continue;
    // Being shot at reveals the shooter even outside the view cone.
    const known = e === bot.lastHitBy && state.time - bot.lastHitAt < 2;
    if (!known && !canSee(bot, e, state)) continue;
    if (known) {
      const dx = e.pos.x - bot.pos.x, dz = e.pos.z - bot.pos.z;
      if (segmentBlocked(bot.pos.x, bot.pos.y + EYE, bot.pos.z, e.pos.x, e.pos.y + 1.4, e.pos.z, SOLIDS)) continue;
    }
    const dx = e.pos.x - bot.pos.x, dz = e.pos.z - bot.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function setPath(bot, toWp) {
  const from = nearestWaypoint(bot.pos.x, bot.pos.z);
  bot.brain.path = findPath(from, toWp);
  bot.brain.pathIdx = 0;
  bot.brain.targetWp = toWp;
}

function followPath(bot, dt, speed) {
  const b = bot.brain;
  if (b.pathIdx >= b.path.length) return true;
  const wp = WAYPOINTS[b.path[b.pathIdx]];
  const dx = wp[0] - bot.pos.x, dz = wp[1] - bot.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.7) { b.pathIdx++; return b.pathIdx >= b.path.length; }
  const sp = speed || GAME.botSpeed;
  bot.pos.x += (dx / d) * sp * dt;
  bot.pos.z += (dz / d) * sp * dt;
  bot.moving = true;
  turnToward(bot, desiredYaw(bot.pos.x, bot.pos.z, wp[0], wp[1]), dt);
  return false;
}

function moveToward(bot, x, z, dt, speed) {
  const dx = x - bot.pos.x, dz = z - bot.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.05) return true;
  const sp = speed || GAME.botSpeed;
  bot.pos.x += (dx / d) * sp * dt;
  bot.pos.z += (dz / d) * sp * dt;
  bot.moving = true;
  return d < 0.6;
}

// Fire a burst at the target with skill-based error. One shot per call at most.
function shootAt(bot, state, target, fx, audio) {
  if (!canFire(bot, state.time)) return;
  const b = bot.brain;
  const skill = b.skill;
  // Aim error: wider base so bot duels last seconds, not a single burst; a moving
  // target is harder to hit, a dug-in defender aims steadier.
  let err = (0.07 - skill * 0.025) / (1 + b.aimTime * 1.0);
  if (bot.moving) err *= 1.7;
  if (target.moving) err *= 1.5;
  if (b.mode === 'hold' && !bot.moving) err *= 0.8; // a dug-in defender aims steadier
  const aimHead = Math.random() < 0.25;
  const ty = target.pos.y + (aimHead ? (target.crouched ? 1.1 : 1.55) : (target.crouched ? 0.75 : 1.05));
  const ox = bot.pos.x, oy = bot.pos.y + EYE, oz = bot.pos.z;
  let dx = target.pos.x - ox, dy = ty - oy, dz = target.pos.z - oz;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  dx /= len; dy /= len; dz /= len;
  // Random error in the plane perpendicular to the shot.
  const ex = -dz, ez = dx; // horizontal perpendicular
  const e1 = (Math.random() + Math.random() + Math.random() - 1.5) * err;
  const e2 = (Math.random() + Math.random() + Math.random() - 1.5) * err * 0.6;
  dx += ex * e1; dz += ez * e1; dy += e2;
  const nl = Math.sqrt(dx * dx + dy * dy + dz * dz);
  fireHitscan(state, bot, ox, oy, oz, dx / nl, dy / nl, dz / nl, fx, audio);
}

export function assignRoundRoles(state, site) {
  // Attackers push a site; defenders hold sites and mid.
  const atk = state.entities.filter((e) => e.team === 'atk' && e.brain);
  const def = state.entities.filter((e) => e.team === 'def' && e.brain);
  const otherSite = site === 'A' ? 'B' : 'A';
  const siteWp = site === 'A' ? 15 : 16;
  const otherWp = site === 'A' ? 16 : 15;
  atk.forEach((b, i) => {
    b.brain.site = site;
    if (i === 0) { b.brain.assignment = 'site'; setPath(b, siteWp); }
    else if (i === 1) { b.brain.assignment = 'site'; setPath(b, siteWp); }
    else if (i === 2) { b.brain.assignment = 'mid'; setPath(b, 8); }
    else { b.brain.assignment = 'fake'; setPath(b, otherWp); }
    b.brain.mode = 'patrol';
  });
  def.forEach((b, i) => {
    if (i === 0) { b.brain.assignment = 'holdA'; setPath(b, 15); }
    else if (i === 1) { b.brain.assignment = 'holdA'; setPath(b, 13); }
    else if (i === 2) { b.brain.assignment = 'holdB'; setPath(b, 16); }
    else if (i === 3) { b.brain.assignment = 'holdB'; setPath(b, 14); }
    else { b.brain.assignment = 'mid'; setPath(b, 11); }
    b.brain.mode = 'patrol';
  });
}

export function updateBot(bot, state, dt, fx, audio) {
  const b = bot.brain;
  if (!bot.alive) { b.mode = 'dead'; return; }
  bot.moving = false;

  // --- Sense ---
  const seen = nearestVisibleEnemy(bot, state);
  if (seen) {
    if (b.target !== seen) { b.reactAt = state.time + 0.28 + (1.2 - b.skill) * 0.35; b.aimTime = 0; }
    b.target = seen;
    b.lastSeen = { x: seen.pos.x, z: seen.pos.z };
    b.lastSeenAt = state.time;
  } else if (b.target && state.time - b.lastSeenAt > 1.6) {
    b.target = null;
  }
  if (b.target) b.aimTime += dt; else b.aimTime = 0;

  // Hearing: a nearby shot without a target sends the bot to look.
  if (!b.target && state.events.length) {
    const ev = state.events[state.events.length - 1];
    if (state.time - ev.at < 1.2 && (ev.kind === 'shot' || ev.kind === 'explosion')) {
      const dx = ev.x - bot.pos.x, dz = ev.z - bot.pos.z;
      if (dx * dx + dz * dz < ev.radius * ev.radius && b.mode !== 'defuse' && b.mode !== 'plant') {
        b.investigate = { x: ev.x, z: ev.z, at: state.time };
      }
    }
  }

  // --- Bomb logic overrides ---
  if (state.bomb.state === 'planted') {
    if (bot.team === 'def' && b.mode !== 'defuse' && b.mode !== 'engage') {
      const siteWp = state.bomb.site === 'A' ? 15 : 16;
      if (b.targetWp !== siteWp) setPath(bot, siteWp);
      b.mode = 'rotate';
    }
    if (bot.team === 'atk' && b.mode !== 'engage') {
      // Hold near the planted site.
      const siteWp = state.bomb.site === 'A' ? 15 : 16;
      if (b.targetWp !== siteWp) setPath(bot, siteWp);
      b.mode = b.pathIdx >= b.path.length ? 'hold' : 'patrol';
    }
  }
  if (state.bomb.state === 'dropped' && bot.team === 'atk' && state.bomb.carrier === null) {
    if (b.mode !== 'pickup' && b.mode !== 'engage') {
      b.mode = 'pickup';
      b.pickupAt = state.time;
    }
  }
  if (state.bomb.state === 'carried' && state.bomb.carrier === bot && bot.team === 'atk') {
    const siteWp = b.site === 'A' ? 15 : 16;
    if (b.targetWp !== siteWp && b.mode !== 'plant') setPath(bot, siteWp);
    if (pointInSite(bot.pos.x, bot.pos.z, b.site) && !b.target) b.mode = 'plant';
    else if (b.mode === 'plant') b.mode = 'patrol';
  }

  // --- Act ---
  switch (b.mode) {
    case 'engage': break; // handled below
    case 'plant': {
      turnToward(bot, bot.yaw + 0.4 * dt, dt);
      if (b.target) { b.mode = 'engage'; break; }
      bot.channel = bot.channel || { kind: 'plant', at: state.time };
      if (state.time - bot.channel.at >= 3) {
        state.bomb.state = 'planted';
        state.bomb.site = pointInSite(bot.pos.x, bot.pos.z, 'A') ? 'A' : 'B';
        state.bomb.timer = 35;
        state.bomb.pos = { x: bot.pos.x, y: 0.2, z: bot.pos.z };
        state.addFeed(`${bot.name} planted the charge at site ${b.site}`, 'warn');
        audio.plant();
        bot.channel = null;
        b.mode = 'hold';
      }
      break;
    }
    case 'defuse': {
      if (b.target) { b.mode = 'engage'; bot.channel = null; break; }
      bot.channel = bot.channel || { kind: 'defuse', at: state.time };
      if (state.time - bot.channel.at >= 5) {
        state.bomb.state = 'defused';
        state.addFeed(`${bot.name} defused the charge`, 'good');
        audio.defuse();
        bot.channel = null;
        b.mode = 'hold';
      }
      break;
    }
    case 'pickup': {
      const bp = state.bomb.pos;
      if (state.bomb.state !== 'dropped') { b.mode = 'patrol'; break; }
      if (moveToward(bot, bp.x, bp.z, dt, GAME.botSpeed)) {
        state.bomb.state = 'carried';
        state.bomb.carrier = bot;
        state.addFeed(`${bot.name} picked up the charge`, '');
        b.mode = 'patrol';
        const siteWp = b.site === 'A' ? 15 : 16;
        setPath(bot, siteWp);
      }
      break;
    }
    case 'rotate': {
      const done = followPath(bot, dt);
      if (done) {
        // At the planted site: defuse if the coast is clear.
        const bp = state.bomb.pos;
        const dx = bp.x - bot.pos.x, dz = bp.z - bot.pos.z;
        if (dx * dx + dz * dz < 9 && !b.target) b.mode = 'defuse';
        else b.mode = 'hold';
      }
      break;
    }
    case 'hold': {
      // Slow scan sweep.
      bot.yaw += Math.sin(state.time * 0.5 + bot.id) * 0.25 * dt;
      if (b.investigate && state.time - b.investigate.at < 4) {
        b.mode = 'investigate';
        const wp = nearestWaypoint(b.investigate.x, b.investigate.z);
        setPath(bot, wp);
      }
      break;
    }
    case 'investigate': {
      const done = followPath(bot, dt);
      if (done || (b.investigate && state.time - b.investigate.at > 6)) {
        b.investigate = null;
        b.mode = 'hold';
      }
      break;
    }
    default: { // patrol
      const done = followPath(bot, dt);
      if (done) b.mode = 'hold';
      break;
    }
  }

  // --- Combat overrides movement modes ---
  if (b.target && b.target.alive) {
    const t = b.target;
    const want = desiredYaw(bot.pos.x, bot.pos.z, t.pos.x, t.pos.z);
    const facing = turnToward(bot, want, dt);
    const dx = t.pos.x - bot.pos.x, dz = t.pos.z - bot.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (state.time >= b.reactAt && facing) {
      if (b.burstLeft <= 0) {
        if (state.time >= b.burstPause) {
          b.burstLeft = 3 + Math.floor(Math.random() * 3);
          b.burstPause = state.time + 0.7 + Math.random() * 0.7;
        }
      } else if (canFire(bot, state.time)) {
        shootAt(bot, state, t, fx, audio);
        b.burstLeft--;
        // Occasional grenade at mid range.
        if (bot.grenades > 0 && dist > 10 && dist < 26 && Math.random() < 0.02 && !bot.grenadeAt) {
          bot.grenadeAt = state.time;
          const ty = t.pos.y + 1.2;
          const ox = bot.pos.x, oy = bot.pos.y + EYE, oz = bot.pos.z;
          let gx = t.pos.x - ox, gy = ty - oy, gz = t.pos.z - oz;
          const gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
          throwGrenade(state, bot, gx / gl, gy / gl, gz / gl);
        }
      }
    }
    // Strafe while engaging, but keep some distance.
    if (state.time - b.strafeAt > 0.9) { b.strafeDir *= -1; b.strafeAt = state.time; }
    const px = -dz / (dist || 1), pz = dx / (dist || 1);
    const wantDist = WEAPONS[bot.weapon].range * 0.45;
    const fw = dist > wantDist + 2 ? 1 : dist < wantDist - 4 ? -1 : 0;
    bot.pos.x += (px * b.strafeDir * 2.1 + (dx / (dist || 1)) * fw * 2.4) * dt;
    bot.pos.z += (pz * b.strafeDir * 2.1 + (dz / (dist || 1)) * fw * 2.4) * dt;
    bot.moving = true;
    b.mode = 'engage';
  } else if (b.mode === 'engage') {
    b.mode = b.pathIdx < b.path.length ? 'patrol' : 'hold';
  }

  if (bot.channel && b.mode !== 'plant' && b.mode !== 'defuse') bot.channel = null;
  collideCircle(bot.pos, GAME.bodyRadius, SOLIDS);
}
