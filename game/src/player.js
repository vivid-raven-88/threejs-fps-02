// First-person controls: pointer-lock look, WASD with acceleration, crouch, jump,
// firing, reload, grenades, buy keys, plant/defuse channel. Movement runs in the
// fixed-step sim; look runs every frame from the latest mouse deltas.
import { GAME } from './config.js';
import { collideCircle } from './collide.js';
import { SOLIDS } from './map.js';
import { fireHitscan, throwGrenade } from './combat.js';
import { canFire, startReload, updateReload, switchWeapon, currentSpread } from './weapons.js';

export class PlayerController {
  constructor(state, camera, canvas, audio, fx, hooks) {
    this.state = state;
    this.camera = camera;
    this.canvas = canvas;
    this.audio = audio;
    this.fx = fx;
    this.hooks = hooks; // {onBuy, onStart, onToggleBuy}
    this.keys = new Set();
    this.firing = false;
    this.locked = false;
    this.stepAcc = 0;
    this.zoomed = false;
    canvas.addEventListener('click', () => this.tryLock());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const p = this.state.player;
      p.yaw -= e.movementX * 0.0023;
      p.pitch -= e.movementY * 0.0023;
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.zoomed = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.zoomed = false;
    });
    document.addEventListener('keydown', (e) => this.onKey(e, true));
    document.addEventListener('keyup', (e) => this.onKey(e, false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  tryLock() {
    const s = this.state;
    if (s.phase !== 'freeze' && s.phase !== 'live') return;
    if (!s.player.alive) return;
    if (this.locked) return;
    this.audio.ensure();
    this.canvas.requestPointerLock();
  }

  onKey(e, down) {
    if (e.repeat) return;
    const k = e.code;
    if (down) this.keys.add(k); else this.keys.delete(k);
    if (!down) return;
    const s = this.state;
    const p = s.player;
    if (k === 'KeyR') { if (startReload(p, s.time)) this.audio.reload(); }
    if (k === 'Digit1') switchWeapon(p, 'pistol');
    if (k === 'Digit2') switchWeapon(p, 'smg');
    if (k === 'Digit3') switchWeapon(p, 'rifle');
    if (k === 'Digit4') switchWeapon(p, 'sniper');
    if (k === 'Digit2' || k === 'Digit3' || k === 'Digit4' || k === 'Digit5' || k === 'Digit6') {
      if (s.phase === 'freeze' && this.hooks.onBuy) {
        const map = { Digit2: 'smg', Digit3: 'rifle', Digit4: 'sniper', Digit5: 'grenade', Digit6: 'armour' };
        if (this.hooks.onBuy(map[k])) this.audio.click();
      }
    }
    if (k === 'KeyG') this.throwGrenade();
    if (k === 'KeyB' && s.phase === 'freeze' && this.hooks.onToggleBuy) this.hooks.onToggleBuy();
    if (k === 'Enter' && s.phase === 'menu' && this.hooks.onStart) this.hooks.onStart();
  }

  throwGrenade() {
    const p = this.state.player;
    if (p.grenades <= 0) return;
    const dir = this.viewDir();
    throwGrenade(this.state, p, dir.x, dir.y, dir.z);
    this.audio.click();
  }

  // Camera forward, with spread applied for a shot.
  viewDir(spread) {
    const p = this.state.player;
    const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    // Forward for yaw=0 is -Z; pitch raises it.
    let dx = -sy * cp, dy = sp, dz = -cy * cp;
    if (spread) {
      const ex = -dz, ez = dx;
      const e1 = (Math.random() + Math.random() + Math.random() - 1.5) * spread;
      const e2 = (Math.random() + Math.random() + Math.random() - 1.5) * spread * 0.6;
      dx += ex * e1; dz += ez * e1; dy += e2;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      dx /= l; dy /= l; dz /= l;
    }
    return { x: dx, y: dy, z: dz };
  }

  update(dt) {
    const s = this.state;
    const p = s.player;
    if (s.phase !== 'freeze' && s.phase !== 'live') return;
    if (!p.alive) return;

    // Crouch + channel state.
    p.crouched = this.keys.has('KeyC') || this.keys.has('ControlLeft');
    p.channelHeld = this.keys.has('KeyE');

    // Wish direction from keys, camera-relative.
    let ix = 0, iz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    // Forward = (-sin yaw, -cos yaw); right = (cos yaw, -sin yaw)... right = forward x up.
    const fx = -sy, fz = -cy;
    const rx = cy, rz = -sy;
    let wx = fx * -iz + rx * ix;
    let wz = fz * -iz + rz * ix;
    const wl = Math.sqrt(wx * wx + wz * wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const speed = p.crouched ? GAME.crouchSpeed : GAME.walkSpeed;
    p.moving = wl > 0;
    // Exponential approach to the wish velocity: fast to speed up, quick to stop.
    const rate = wl > 0 ? 11 : 13;
    const k = 1 - Math.exp(-rate * dt);
    p.vel.x += (wx * speed - p.vel.x) * k;
    p.vel.z += (wz * speed - p.vel.z) * k;
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    collideCircle(p.pos, GAME.bodyRadius, SOLIDS);

    // Gravity + jump.
    if (this.keys.has('Space') && p.grounded) { p.vel.y = GAME.jumpSpeed; p.grounded = false; }
    p.vel.y -= GAME.gravity * dt;
    p.pos.y += p.vel.y * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.vel.y = 0; p.grounded = true; }

    // Footsteps.
    if (p.moving && p.grounded) {
      this.stepAcc += Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) * dt;
      if (this.stepAcc > 2.4) { this.stepAcc = 0; this.audio.step(); }
    }

    // Bloom decay.
    p.bloom = Math.max(0, p.bloom - dt * 0.1);

    // Reload progress.
    if (updateReload(p, dt)) this.audio.click();

    // Firing.
    if (this.firing && s.phase === 'live') {
      if (p.mag[p.weapon] <= 0) {
        if (startReload(p, s.time)) this.audio.reload();
        else if (s.time - (this._dryAt || 0) > 0.4) { this.audio.dry(); this._dryAt = s.time; }
      } else if (canFire(p, s.time)) {
        const eye = p.pos.y + (p.crouched ? GAME.crouchEye : GAME.eyeHeight);
        const dir = this.viewDir(currentSpread(p));
        // Muzzle sits slightly forward of the camera.
        fireHitscan(s, p, p.pos.x + dir.x * 0.4, eye, p.pos.z + dir.z * 0.4, dir.x, dir.y, dir.z, this.fx, this.audio);
      }
    }
  }
}
