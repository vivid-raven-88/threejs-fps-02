// Weapon runtime: fire cadence, reload, spread. Damage itself lives in combat.js.
import { WEAPONS } from './config.js';

export function weaponOf(ent) {
  return WEAPONS[ent.weapon];
}

// Can this entity start a shot right now?
export function canFire(ent, now) {
  if (!ent.alive) return false;
  const w = WEAPONS[ent.weapon];
  if (ent.reloading > 0) return false;
  if (ent.mag[ent.weapon] <= 0) return false;
  return now - ent.lastShot >= w.interval;
}

// Spread in radians for this shot: base, worse while moving/airborne, plus recoil bloom.
export function currentSpread(ent) {
  const w = WEAPONS[ent.weapon];
  let s = w.spread;
  if (ent.moving) s *= w.moveSpread;
  if (!ent.grounded) s *= 1.8;
  return s + ent.bloom;
}

// Start a reload if it makes sense. Returns true when a reload began.
export function startReload(ent, now) {
  const w = WEAPONS[ent.weapon];
  if (ent.reloading > 0) return false;
  if (ent.mag[ent.weapon] >= w.mag) return false;
  if (ent.reserve[ent.weapon] <= 0) return false;
  ent.reloading = w.reload;
  ent.reloadEnd = now + w.reload;
  return true;
}

// Advance reload timers; completes the reload when the timer runs out.
export function updateReload(ent, dt) {
  if (ent.reloading <= 0) return false;
  ent.reloading -= dt;
  if (ent.reloading > 0) return false;
  const w = WEAPONS[ent.weapon];
  const need = w.mag - ent.mag[ent.weapon];
  const take = Math.min(need, ent.reserve[ent.weapon]);
  ent.mag[ent.weapon] += take;
  ent.reserve[ent.weapon] -= take;
  ent.reloading = 0;
  return true;
}

export function switchWeapon(ent, id) {
  if (!ent.weapons.includes(id) || ent.weapon === id) return false;
  ent.weapon = id;
  ent.reloading = 0;
  ent.bloom = 0;
  return true;
}

// Recoil kick applied to the shooter's pitch (player) or aim error (bots).
export function applyRecoil(ent) {
  const w = WEAPONS[ent.weapon];
  ent.bloom = Math.min(0.09, ent.bloom + w.recoil * 0.55);
  if (ent.isPlayer) ent.pitch += w.recoil * 0.55;
}
