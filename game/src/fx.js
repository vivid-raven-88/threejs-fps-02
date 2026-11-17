// Visual effects. Everything is pooled: no mesh, material or vector is created
// during play, so the hot loop never allocates.
import * as THREE from 'three';

const TRACERS = 24;
const PARTICLES = 72;

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    for (let i = 0; i < TRACERS; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.particles = [];
    const pGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    for (let i = 0; i < PARTICLES; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      const m = new THREE.Mesh(pGeo, mat);
      m.visible = false;
      scene.add(m);
      this.particles.push({ mesh: m, vel: { x: 0, y: 0, z: 0 }, life: 0, max: 1 });
    }
    // Muzzle flash light + glow sprite.
    this.flashLight = new THREE.PointLight(0xffc46b, 0, 9, 1.8);
    scene.add(this.flashLight);
    this.flashLife = 0;
    // Explosion shell.
    const eGeo = new THREE.SphereGeometry(1, 20, 14);
    this.boomMat = new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0 });
    this.boom = new THREE.Mesh(eGeo, this.boomMat);
    this.boom.visible = false;
    scene.add(this.boom);
    this.boomLight = new THREE.PointLight(0xff7a2f, 0, 30, 1.4);
    scene.add(this.boomLight);
    this.boomLife = 0;
    this.shakeAmp = 0;
  }

  tracer(x1, y1, z1, x2, y2, z2, color) {
    const t = this.tracers.find((t) => t.life <= 0) || this.tracers[0];
    const p = t.line.geometry.attributes.position.array;
    p[0] = x1; p[1] = y1; p[2] = z1; p[3] = x2; p[4] = y2; p[5] = z2;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.09;
  }

  muzzle(x, y, z) {
    this.flashLight.position.set(x, y, z);
    this.flashLight.intensity = 26;
    this.flashLife = 0.05;
  }

  burst(x, y, z, color, n, speed, up) {
    let made = 0;
    for (const p of this.particles) {
      if (made >= n) break;
      if (p.life > 0) continue;
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      p.mesh.material.color.setHex(color);
      p.mesh.material.opacity = 1;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.vel.x = Math.cos(a) * s;
      p.vel.z = Math.sin(a) * s;
      p.vel.y = (up || 2) * (0.5 + Math.random());
      p.life = p.max = 0.35 + Math.random() * 0.4;
      made++;
    }
  }

  hitSpark(x, y, z) { this.burst(x, y, z, 0xffe9a8, 5, 2.5, 2); }
  impact(x, y, z) { this.burst(x, y, z, 0x9a938a, 4, 1.8, 1.2); }

  explosion(x, y, z) {
    this.boom.position.set(x, y + 0.5, z);
    this.boom.visible = true;
    this.boom.scale.setScalar(0.5);
    this.boomMat.opacity = 0.9;
    this.boomLight.position.set(x, y + 1.5, z);
    this.boomLight.intensity = 60;
    this.boomLife = 0.6;
    this.burst(x, y + 0.5, z, 0xff7a2f, 26, 7, 6);
    this.burst(x, y + 0.5, z, 0x3a3a3a, 14, 4, 5);
    this.shakeAmp = 0.5;
  }

  hitmarker(head) {
    const el = document.getElementById('hitmarker');
    if (!el) return;
    el.classList.toggle('head', !!head);
    el.classList.remove('show');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('show');
  }

  damageFlash() {
    const el = document.getElementById('dmg');
    if (!el) return;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.line.visible = false; t.line.material.opacity = 0; }
      else t.line.material.opacity = t.life / 0.09 * 0.9;
    }
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= 9 * dt;
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y += p.vel.y * dt;
      p.mesh.position.z += p.vel.z * dt;
      if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.vel.y *= -0.4; }
      p.mesh.material.opacity = p.life / p.max;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flashLight.intensity = Math.max(0, this.flashLife / 0.05) * 26;
    }
    if (this.boomLife > 0) {
      this.boomLife -= dt;
      const k = 1 - this.boomLife / 0.6;
      this.boom.scale.setScalar(0.5 + k * 6.5);
      this.boomMat.opacity = Math.max(0, 0.9 * (1 - k));
      this.boomLight.intensity = Math.max(0, 60 * (1 - k));
      if (this.boomLife <= 0) this.boom.visible = false;
    }
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 1.4);
  }

  shakeOffset() {
    if (this.shakeAmp <= 0) return 0;
    return (Math.random() - 0.5) * this.shakeAmp * 0.06;
  }
}
