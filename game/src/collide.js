// Collision and visibility math. Plain {x,y,z} objects only — no allocations in hot loops.
import { GAME } from './config.js';

// Push a circle (XZ) out of every solid AABB it overlaps. pos is mutated in place.
// AABB: {x1,z1,x2,z2} with y ignored (all solids are full height for movement).
export function collideCircle(pos, r, solids) {
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    const cx = Math.max(s.x1, Math.min(pos.x, s.x2));
    const cz = Math.max(s.z1, Math.min(pos.z, s.z2));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = pos.x - s.x1, pr = s.x2 - pos.x, pn = pos.z - s.z1, pf = s.z2 - pos.z;
      const m = Math.min(pl, pr, pn, pf);
      if (m === pl) pos.x = s.x1 - r;
      else if (m === pr) pos.x = s.x2 + r;
      else if (m === pn) pos.z = s.z1 - r;
      else pos.z = s.z2 + r;
    }
  }
  // Arena bounds.
  const B = GAME.bounds;
  if (pos.x < B.x1 + r) pos.x = B.x1 + r;
  if (pos.x > B.x2 - r) pos.x = B.x2 - r;
  if (pos.z < B.z1 + r) pos.z = B.z1 + r;
  if (pos.z > B.z2 - r) pos.z = B.z2 - r;
}

// Segment vs solid AABBs (full height h). True when anything blocks the segment.
// Slab test per box, eye-height segments only — cheap and allocation-free.
export function segmentBlocked(ax, ay, az, bx, by, bz, solids) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    let t0 = 0, t1 = 1;
    // X slab
    if (Math.abs(dx) < 1e-9) { if (ax < s.x1 || ax > s.x2) continue; }
    else {
      let ta = (s.x1 - ax) / dx, tb = (s.x2 - ax) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    // Z slab
    if (Math.abs(dz) < 1e-9) { if (az < s.z1 || az > s.z2) continue; }
    else {
      let ta = (s.z1 - az) / dz, tb = (s.z2 - az) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    // Y slab (solid occupies 0..h)
    if (Math.abs(dy) < 1e-9) { if (ay < 0 || ay > s.h) continue; }
    else {
      let ta = (0 - ay) / dy, tb = (s.h - ay) / dy;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    return true;
  }
  return false;
}

// Ray vs one entity's hit spheres. Returns {part, dist} or null.
// Head sphere at eye height, body sphere at chest height.
export function rayHitEntity(ox, oy, oz, dx, dy, dz, ent, maxDist) {
  const ex = ent.pos.x, ez = ent.pos.z;
  const eyeY = ent.pos.y + (ent.crouched ? 1.12 : 1.62);
  const chestY = ent.pos.y + (ent.crouched ? 0.75 : 1.05);
  let best = null;
  const t1 = raySphere(ox, oy, oz, dx, dy, dz, ex, eyeY, ez, 0.26, maxDist);
  if (t1 !== null) best = { part: 'head', dist: t1 };
  const t2 = raySphere(ox, oy, oz, dx, dy, dz, ex, chestY, ez, 0.52, maxDist);
  if (t2 !== null && (best === null || t2 < best.dist)) best = { part: 'body', dist: t2 };
  return best;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxDist) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  const t = tca - thc;
  if (t < 0 || t > maxDist) return null;
  return t;
}

// Distance from a ray to the nearest solid wall, for impact points. 0 when none within maxDist.
export function rayHitWall(ox, oy, oz, dx, dy, dz, solids, maxDist) {
  let best = maxDist;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    let t0 = 0, t1 = best;
    if (Math.abs(dx) < 1e-9) { if (ox < s.x1 || ox > s.x2) continue; }
    else {
      let ta = (s.x1 - ox) / dx, tb = (s.x2 - ox) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (oz < s.z1 || oz > s.z2) continue; }
    else {
      let ta = (s.z1 - oz) / dz, tb = (s.z2 - oz) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (Math.abs(dy) < 1e-9) { if (oy < 0 || oy > s.h) continue; }
    else {
      let ta = (0 - oy) / dy, tb = (s.h - oy) / dy;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (t0 < best) best = t0;
  }
  // Floor plane y=0.
  if (dy < -1e-9) {
    const tf = -oy / dy;
    if (tf > 0 && tf < best) best = tf;
  }
  return best;
}
