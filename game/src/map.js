// Kestrel Yard: an industrial rail yard. Two lanes + mid, two bombsites, 5v5.
// All solids are AABBs {x1,z1,x2,z2,h}; movement collision is XZ-only (full height).
import * as THREE from 'three';
import { PALETTE } from './config.js';

export const SITES = {
  A: { x1: 18, z1: -20, x2: 30, z2: -9, color: PALETTE.siteA, label: 'A' },
  B: { x1: 18, z1: 9, x2: 30, z2: 20, color: PALETTE.siteB, label: 'B' },
};

export const SPAWNS = {
  atk: [
    { x: -29, z: -6, yaw: -Math.PI / 2 }, { x: -29, z: 0, yaw: -Math.PI / 2 },
    { x: -29, z: 6, yaw: -Math.PI / 2 }, { x: -27, z: -3, yaw: -Math.PI / 2 },
    { x: -27, z: 3, yaw: -Math.PI / 2 },
  ],
  def: [
    { x: 29, z: -6, yaw: Math.PI / 2 }, { x: 29, z: 0, yaw: Math.PI / 2 },
    { x: 29, z: 6, yaw: Math.PI / 2 }, { x: 27, z: -3, yaw: Math.PI / 2 },
    { x: 27, z: 3, yaw: Math.PI / 2 },
  ],
};

// Waypoints: north lane (z=-16), mid (z=0), south lane (z=16), site approaches.
export const WAYPOINTS = [
  [-28, 0], [-20, -16], [-20, 0], [-20, 16], [-8, -16], [-8, 0], [-8, 16],
  [4, -16], [4, 0], [4, 16], [16, -16], [16, 0], [16, 16], [24, -14], [24, 14],
  [25, -14], [25, 14], [28, 0], [28, -8], [28, 8], [-8, -8], [-8, 8], [4, -8],
  [4, 8], [21, -16], [21, 16], [-14, -16], [-14, 16], [10, -16], [10, 16],
];

const EDGES = [
  [0, 1], [0, 2], [0, 3], [1, 26], [26, 4], [4, 7], [7, 28], [28, 10],
  [10, 24], [24, 13], [13, 15], [3, 27], [27, 6], [6, 9], [9, 29], [29, 12],
  [12, 25], [25, 14], [14, 16], [2, 5], [5, 8], [8, 11], [11, 17],
  [1, 2], [2, 3], [4, 20], [20, 5], [5, 21], [21, 6], [7, 22], [22, 8],
  [8, 23], [23, 9], [17, 18], [17, 19], [18, 13], [19, 14], [18, 15], [19, 16],
];

const ADJ = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }

export function nearestWaypoint(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i][0] - x, dz = WAYPOINTS[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// BFS on the waypoint graph. Returns a list of waypoint indices from `from` to `to`.
export function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const q = [from];
  prev[from] = from;
  for (let h = 0; h < q.length; h++) {
    const n = q[h];
    for (const m of ADJ[n]) {
      if (prev[m] !== -1) continue;
      prev[m] = n;
      if (m === to) {
        const path = [to];
        let c = to;
        while (c !== from) { c = prev[c]; path.push(c); }
        return path.reverse();
      }
      q.push(m);
    }
  }
  return [to];
}

export function pointInSite(x, z, site) {
  const s = SITES[site];
  return x >= s.x1 && x <= s.x2 && z >= s.z1 && z <= s.z2;
}

const WALLS = [
  // Outer boundary.
  { x1: -32.6, z1: -22.6, x2: 32.6, z2: -22, h: 3.6 },
  { x1: -32.6, z1: 22, x2: 32.6, z2: 22.6, h: 3.6 },
  { x1: -32.6, z1: -22, x2: -32, z2: 22, h: 3.6 },
  { x1: 32, z1: -22, x2: 32.6, z2: 22, h: 3.6 },
  // Lane dividers (gaps at x -12..12 let lanes cross at mid).
  { x1: -24, z1: -8, x2: -12, z2: -6, h: 3.2 },
  { x1: -24, z1: 6, x2: -12, z2: 8, h: 3.2 },
  { x1: 12, z1: -8, x2: 24, z2: -6, h: 3.2 },
  { x1: 12, z1: 6, x2: 24, z2: 8, h: 3.2 },
  // Mid blocks and site approach cover.
  { x1: -2, z1: -20, x2: 2, z2: -10, h: 3.2 },
  { x1: -2, z1: 10, x2: 2, z2: 20, h: 3.2 },
  { x1: 8, z1: -20, x2: 12, z2: -14, h: 3.2 },
  { x1: 8, z1: 14, x2: 12, z2: 20, h: 3.2 },
];

const CRATES = [
  { x1: -16, z1: -3.5, x2: -14, z2: -1.5, h: 1.2 },
  { x1: -16, z1: 1.5, x2: -14, z2: 3.5, h: 1.2 },
  { x1: 0, z1: -2.8, x2: 2, z2: -0.8, h: 2.2 },
  { x1: 0, z1: 0.8, x2: 2, z2: 2.8, h: 1.2 },
  { x1: 14, z1: -2.8, x2: 16, z2: -0.8, h: 1.2 },
  { x1: 14, z1: 0.8, x2: 16, z2: 2.8, h: 1.2 },
  { x1: 19, z1: -19, x2: 21, z2: -17.5, h: 1.2 },
  { x1: 26, z1: -16, x2: 28, z2: -14, h: 1.2 },
  { x1: 20, z1: 17, x2: 22, z2: 19, h: 1.2 },
  { x1: 27, z1: 11, x2: 29, z2: 13, h: 1.2 },
  { x1: -26, z1: -18, x2: -24, z2: -16, h: 2.2 },
  { x1: -26, z1: 16, x2: -24, z2: 18, h: 2.2 },
  { x1: -6, z1: -14, x2: -4, z2: -12, h: 1.2 },
  { x1: -6, z1: 12, x2: -4, z2: 14, h: 1.2 },
  { x1: -1.5, z1: -5.4, x2: 1.5, z2: -3.4, h: 2.4 },
];

export const SOLIDS = [...WALLS, ...CRATES];

function letterTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, 128, 128);
  g.font = 'bold 96px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#111111';
  g.strokeText(letter, 64, 68);
  g.fillStyle = color;
  g.fillText(letter, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildMap(scene) {
  const group = new THREE.Group();
  const floorMat = new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.95 });
  const floorDark = new THREE.MeshStandardMaterial({ color: PALETTE.floorDark, roughness: 0.95 });
  const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.wallTrim, roughness: 0.6 });
  const crateMat = new THREE.MeshStandardMaterial({ color: PALETTE.crate, roughness: 0.9 });
  const crateDark = new THREE.MeshStandardMaterial({ color: PALETTE.crateDark, roughness: 0.9 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(65.2, 0.2, 45.2), floorMat);
  floor.position.set(0, -0.1, 0);
  floor.receiveShadow = true;
  group.add(floor);
  // Darker lane strips so the three routes read at a glance.
  for (const z of [-16, 0, 16]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(64, 0.06, 7.4), floorDark);
    strip.position.set(0, 0.02, z);
    strip.receiveShadow = true;
    group.add(strip);
  }

  const addBox = (x1, z1, x2, z2, h, mat, trim) => {
    const w = x2 - x1, d = z2 - z1;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    if (trim) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.14, d + 0.08), trimMat);
      t.position.set((x1 + x2) / 2, h + 0.02, (z1 + z2) / 2);
      group.add(t);
    }
    return m;
  };
  for (const w of WALLS) addBox(w.x1, w.z1, w.x2, w.z2, w.h, wallMat, true);
  CRATES.forEach((c, i) => addBox(c.x1, c.z1, c.x2, c.z2, c.h, i % 2 ? crateDark : crateMat, false));

  // Site decals + floating letters.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const decal = new THREE.Mesh(
      new THREE.BoxGeometry(s.x2 - s.x1, 0.05, s.z2 - s.z1),
      new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.7, transparent: true, opacity: 0.35 }),
    );
    decal.position.set((s.x1 + s.x2) / 2, 0.04, (s.z1 + s.z2) / 2);
    decal.receiveShadow = true;
    group.add(decal);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: letterTexture(key, key === 'A' ? '#ffb020' : '#2fd4c4'), transparent: true, depthWrite: false,
    }));
    sprite.scale.set(4, 4, 1);
    sprite.position.set((s.x1 + s.x2) / 2, 4.6, (s.z1 + s.z2) / 2);
    group.add(sprite);
  }

  // Light poles at the four lane junctions.
  const poleMat = new THREE.MeshStandardMaterial({ color: PALETTE.rail, roughness: 0.5, metalness: 0.6 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: PALETTE.light, emissive: PALETTE.light, emissiveIntensity: 1.6 });
  for (const [px, pz] of [[-12, -12], [-12, 12], [12, -12], [12, 12]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 8), poleMat);
    pole.position.set(px, 2.7, pz);
    pole.castShadow = true;
    group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), bulbMat);
    bulb.position.set(px, 5.5, pz);
    group.add(bulb);
    const pl = new THREE.PointLight(PALETTE.light, 18, 22, 1.6);
    pl.position.set(px, 5.2, pz);
    group.add(pl);
  }

  // A second container stacked on the mid landmark crate (drawn from CRATES above).
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.4), crateMat);
  top.position.set(0, 3.0, -4.4);
  top.castShadow = true; top.receiveShadow = true;
  group.add(top);

  const hemi = new THREE.HemisphereLight(0x8fa3ff, 0x4a3f30, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe8c0, 1.9);
  sun.position.set(-18, 26, -14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(group);
  return group;
}
