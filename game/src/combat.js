// Hitscan shooting, damage, kills and grenades. The round-end check is not here:
// rounds.js re-checks alive counts every tick, so combat only reports what happened.
import { GRENADE, ARMOUR, ECONOMY, GAME } from './config.js';
import { rayHitEntity, rayHitWall, collideCircle } from './collide.js';
import { SOLIDS } from './map.js';
import { weaponOf, applyRecoil } from './weapons.js';

// One hitscan shot. origin/dir are world space. Returns 'hit' | 'kill' | 'miss' | 'wall'.
export function fireHitscan(state, shooter, ox, oy, oz, dx, dy, dz, fx, audio) {
  const w = weaponOf(shooter);
  if (shooter.mag[shooter.weapon] <= 0) return 'miss';
  shooter.mag[shooter.weapon]--;
  shooter.lastShot = state.time;
  applyRecoil(shooter);
  state.shotsFired++;
  state.hear(shooter.pos.x, shooter.pos.z, 26, 'shot');

  // Nearest enemy body in the ray, inside range and not behind a wall.
  let bestEnt = null, bestHit = null;
  for (const e of state.entities) {
    if (e === shooter || !e.alive || e.team === shooter.team) continue;
    const hit = rayHitEntity(ox, oy, oz, dx, dy, dz, e, w.range);
    if (hit && (bestHit === null || hit.dist < bestHit.dist)) { bestEnt = e; bestHit = hit; }
  }
  const wallDist = rayHitWall(ox, oy, oz, dx, dy, dz, SOLIDS, w.range);
  const hitDist = bestHit ? bestHit.dist : Infinity;

  const endX = ox + dx * Math.min(hitDist, wallDist);
  const endY = oy + dy * Math.min(hitDist, wallDist);
  const endZ = oz + dz * Math.min(hitDist, wallDist);
  fx.tracer(ox, oy, oz, endX, endY, endZ, w.tracer);
  fx.muzzle(ox, oy, oz);
  audio.shot(shooter.weapon, distToListener(state, shooter));

  if (bestEnt && hitDist < wallDist) {
    const dmg = w.damage * (bestHit.part === 'head' ? w.headMult : 1);
    const killed = applyDamage(state, bestEnt, dmg, shooter, bestHit.part === 'head', fx, audio);
    fx.hitSpark(endX, endY, endZ);
    if (shooter.isPlayer) fx.hitmarker(bestHit.part === 'head');
    return killed ? 'kill' : 'hit';
  }
  if (wallDist < w.range) { fx.impact(endX, endY, endZ); return 'wall'; }
  return 'miss';
}

function distToListener(state, shooter) {
  const p = state.player.pos;
  const dx = shooter.pos.x - p.x, dz = shooter.pos.z - p.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function applyDamage(state, target, dmg, attacker, head, fx, audio) {
  if (!target.alive) return false;
  if (target.armour) dmg *= 1 - ARMOUR.reduction;
  target.hp -= dmg;
  target.lastHitBy = attacker;
  target.lastHitAt = state.time;
  if (target.isPlayer) fx.damageFlash();
  if (attacker && attacker.isPlayer) audio.hit();
  if (target.hp > 0) return false;
  target.hp = 0;
  target.alive = false;
  target.deaths++;
  if (attacker) {
    attacker.kills++;
    attacker.money += ECONOMY.killReward;
    state.addFeed(`${attacker.name} ✕ ${target.name}${head ? ' · headshot' : ''}`, head ? 'head' : '');
    if (attacker.isPlayer) audio.kill();
  } else {
    state.addFeed(`${target.name} died`, '');
  }
  // A dead bomb carrier drops the charge where they fell.
  if (state.bomb.state === 'carried' && state.bomb.carrier === target) {
    state.bomb.state = 'dropped';
    state.bomb.carrier = null;
    state.bomb.pos = { x: target.pos.x, y: 0.2, z: target.pos.z };
    state.addFeed('The charge was dropped', 'warn');
  }
  if (target.mesh) target.mesh.visible = false;
  return true;
}

export function throwGrenade(state, ent, dx, dy, dz) {
  if (ent.grenades <= 0 || !ent.alive) return false;
  ent.grenades--;
  const eye = ent.pos.y + (ent.crouched ? 1.12 : 1.62);
  state.grenades.push({
    pos: { x: ent.pos.x + dx * 0.5, y: eye, z: ent.pos.z + dz * 0.5 },
    vel: { x: dx * 13, y: dy * 13 + 3.5, z: dz * 13 },
    fuse: GRENADE.fuse, owner: ent,
  });
  return true;
}

export function updateGrenades(state, dt, fx, audio) {
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.fuse -= dt;
    g.vel.y -= GAME.gravity * 0.6 * dt;
    g.pos.x += g.vel.x * dt;
    g.pos.y += g.vel.y * dt;
    g.pos.z += g.vel.z * dt;
    if (g.pos.y < 0.15) { g.pos.y = 0.15; g.vel.y *= -0.45; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    const before = { x: g.pos.x, z: g.pos.z };
    collideCircle(g.pos, 0.15, SOLIDS);
    if (g.pos.x !== before.x || g.pos.z !== before.z) { g.vel.x *= -0.4; g.vel.z *= -0.4; }
    if (g.fuse > 0) continue;
    state.grenades.splice(i, 1);
    explode(state, g, fx, audio);
  }
}

function explode(state, g, fx, audio) {
  fx.explosion(g.pos.x, g.pos.y, g.pos.z);
  audio.explosion(distToListener(state, g.owner));
  state.hear(g.pos.x, g.pos.z, 42, 'explosion');
  for (const e of state.entities) {
    if (!e.alive) continue;
    const dx = e.pos.x - g.pos.x, dz = e.pos.z - g.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > GRENADE.radius) continue;
    const dmg = GRENADE.damage * (1 - d / GRENADE.radius);
    applyDamage(state, e, dmg, g.owner, false, fx, audio);
  }
}
