// Boot, entity meshes, the fixed-step simulation loop and rendering.
// The sim runs at a fixed 60 Hz and never touches the renderer; rendering only
// mirrors entity state into meshes each frame.
import * as THREE from 'three';
import { GAME, TEAMS, PALETTE } from './config.js';
import { buildMap } from './map.js';
import { GameState } from './state.js';
import { updateBot } from './bots.js';
import { startMatch, updateRounds, buyWeapon } from './rounds.js';
import { updateGrenades } from './combat.js';
import { PlayerController } from './player.js';
import { Hud } from './hud.js';
import { AudioSys } from './audio.js';
import { FX } from './fx.js';

const params = new URLSearchParams(location.search);
const DEMO = params.get('demo'); // menu | play | buy | plant

window.addEventListener('error', (e) => { window.__error = String(e.message || e.error); });

function nameTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(text, 128, 32);
  g.fillStyle = color;
  g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeFighterMesh(ent) {
  const team = TEAMS[ent.team];
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23232e, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), suit);
  torso.position.y = 1.05; torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), skin);
  head.position.y = 1.62; head.castShadow = true;
  g.add(head);
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.42), dark);
  helm.position.y = 1.78;
  g.add(helm);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), dark);
    leg.position.set(0.16 * s, 0.31, 0);
    leg.castShadow = true;
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.16), suit);
    arm.position.set(0.4 * s, 1.08, 0.12);
    g.add(arm);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.72), dark);
  gun.position.set(0.22, 1.22, 0.42);
  g.add(gun);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(ent.name, team.css), transparent: true, depthWrite: false }));
  tag.scale.set(2.2, 0.55, 1);
  tag.position.y = 2.15;
  g.add(tag);
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffb020 }),
  );
  dot.position.y = 2.05;
  dot.visible = false;
  g.add(dot);
  ent.carrierDot = dot;
  return g;
}

function makeViewmodel(camera) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.45, metalness: 0.7 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.52), metal);
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.4);
  g.add(barrel);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), metal);
  sight.position.set(0, 0.09, -0.1);
  g.add(sight);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), grip);
  handle.position.set(0, -0.12, 0.14);
  handle.rotation.x = 0.3;
  g.add(handle);
  g.position.set(0.28, -0.26, -0.55);
  camera.add(g);
  return g;
}

function boot() {
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 45, 110);
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 220);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  buildMap(scene);
  const state = new GameState();
  const fx = new FX(scene);
  const audio = new AudioSys();
  const hud = new Hud();
  state.resetMatch();

  // One mesh per fighter (the player has none — first person).
  // startMatch() rebuilds the entities, so the meshes attached here belong
  // to discarded objects after any (re)start — attachFighterMeshes() must
  // run again after every startMatch, or the fighters are invisible
  // (in real play as well as in the demo presets; the v1 play screenshot's
  // lone "bot" was a stale mesh left standing at the map origin).
  const fighterMeshes = [];
  function attachFighterMeshes() {
    for (const m of fighterMeshes) scene.remove(m);
    fighterMeshes.length = 0;
    for (const e of state.entities) {
      if (e.isPlayer) continue;
      const m = makeFighterMesh(e);
      scene.add(m);
      e.mesh = m;
      fighterMeshes.push(m);
    }
  }
  attachFighterMeshes();
  const viewmodel = makeViewmodel(camera);

  const controller = new PlayerController(state, camera, canvas, audio, fx, {
    onBuy: (id) => buyWeapon(state, id),
    onStart: () => startGame(),
    onToggleBuy: () => hud.showBuy(document.getElementById('buy').style.display !== 'block'),
  });
  hud.onBuy = (id) => { if (buyWeapon(state, id)) audio.click(); };
  hud.onStart = () => startGame();

  function startGame() {
    audio.ensure();
    hud.showMenu(false);
    hud.showDeath(false);
    startMatch(state);
    attachFighterMeshes();
    hud.banner(`ROUND 1`, 'First to 5 rounds takes the match', 2600);
    controller.tryLock();
  }

  // --- Demo presets (screenshots / smoke tests) ---
  if (DEMO === 'play' || DEMO === 'buy' || DEMO === 'plant') {
    startMatch(state);
    attachFighterMeshes();
    hud.showMenu(false);
    const p = state.player;
    if (DEMO === 'play') {
      state.phase = 'live'; state.timer = 90;
      p.pos.x = -8; p.pos.z = 0; p.yaw = -Math.PI / 2;
      const spots = [[-5, -3], [-5, 3], [10, -2], [13, 3], [15, -4], [9, 5]];
      const bots = state.entities.filter((e) => e.brain);
      bots.forEach((b, i) => { const s = spots[i % spots.length]; b.pos.x = s[0]; b.pos.z = s[1]; });
    } else if (DEMO === 'buy') {
      state.phase = 'freeze'; state.timer = 5.9;
      p.money = 4500;
      hud.showBuy(true);
    } else if (DEMO === 'plant') {
      // Staged in freeze time: the fight is paused, so the composition holds
      // still for the camera — in live time the staged defenders shoot the
      // player within the first seconds and the shot becomes a spectate view
      // with an "eliminated" banner. Freeze is a real phase (the buy preset
      // stages in it too); the HUD still reads as a live plant defence:
      // bomb timer, "CHARGE PLANTED at site A", all ten fighters alive.
      state.phase = 'freeze'; state.timer = 120;
      state.bomb.state = 'planted';
      state.bomb.site = 'A';
      state.bomb.timer = 30;
      state.bomb.pos = { x: 25, y: 0.2, z: -14 };
      // East end of the north lane, looking east down the lane into site A:
      // the amber site decal, the floating 'A', the crates and the defenders
      // pushing in are all in view. (The old spot, x=6, faced the approach
      // wall at x=8 head-on, 2 m away, so the frame was flat grey wall.)
      p.pos.x = 16; p.pos.z = -16; p.yaw = -Math.PI / 2; p.pitch = -0.08;
      // Defenders staged in the open on the east side of site A, so they
      // read as pushing in toward the planted charge.
      const defs = state.entities.filter((e) => e.team === 'def' && e.brain);
      const defSpots = [[28, -11], [29, -15], [27, -18], [28, -13], [26, -16]];
      defs.forEach((b, i) => { const s = defSpots[i % defSpots.length]; b.pos.x = s[0]; b.pos.z = s[1]; });
      // One attacker teammate holding the site near the planted charge.
      const atk = state.entities.filter((e) => e.team === 'atk' && e.brain);
      if (atk.length) { atk[0].pos.x = 23; atk[0].pos.z = -17; atk[0].yaw = -Math.PI / 2; }
    }
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  let lastPhase = state.phase;
  let lastBeep = -1;
  let bobPhase = 0;
  let acc = 0;
  let lastT = performance.now();
  let frames = 0;

  function simStep(dt) {
    state.time += dt;
    if (state.phase === 'freeze' || state.phase === 'live' || state.phase === 'roundEnd' || state.phase === 'matchEnd') {
      updateRounds(state, dt, fx, audio);
      controller.update(dt);
      // Bots fight only once the round is live — freeze time is for buying.
      if (state.phase === 'live') {
        for (const e of state.entities) if (e.brain) updateBot(e, state, dt, fx, audio);
        updateGrenades(state, dt, fx, audio);
      }
    }
    // Bomb beeps while planted.
    if (state.bomb.state === 'planted') {
      const sec = Math.ceil(state.bomb.timer);
      if (sec !== lastBeep && sec <= 10) { lastBeep = sec; audio.beep(); }
    }
    // Phase-change banners and sounds.
    if (state.phase !== lastPhase) {
      if (state.phase === 'live' && lastPhase === 'freeze') {
        hud.banner(`ROUND ${state.round}`, 'Go — eliminate or plant', 2200);
        hud.showBuy(false); // the buy menu never survives into the live round
      }
      if (state.phase === 'roundEnd' && state.roundWinner) {
        const w = state.roundWinner === 'atk' ? 'Ember Vipers' : 'Frost Sentinels';
        hud.banner(`${w} win the round`, state.roundReason, 3000);
        if (state.roundWinner === state.player.team) audio.roundWin();
      }
      if (state.phase === 'matchEnd') {
        const w = state.winner === 'atk' ? 'Ember Vipers' : state.winner === 'def' ? 'Frost Sentinels' : 'Nobody';
        hud.banner(w === 'Nobody' ? 'MATCH DRAW' : `${w} win the match`, `Final score ${state.score.atk} — ${state.score.def}`, 6000);
      }
      lastPhase = state.phase;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let steps = 0;
    while (acc >= GAME.tick && steps < 5) {
      simStep(GAME.tick);
      acc -= GAME.tick;
      steps++;
    }
    if (steps === 5) acc = 0;

    // --- Render: mirror state into meshes and the camera ---
    const p = state.player;
    for (const e of state.entities) {
      if (!e.mesh) continue;
      e.mesh.position.set(e.pos.x, e.pos.y, e.pos.z);
      e.mesh.rotation.y = e.yaw;
      if (e.carrierDot) e.carrierDot.visible = state.bomb.state === 'carried' && state.bomb.carrier === e;
    }
    const eye = p.pos.y + (p.crouched ? GAME.crouchEye : GAME.eyeHeight);
    if (state.phase === 'menu') {
      // Slow orbit for the menu backdrop.
      const a = now * 0.00004;
      camera.position.set(Math.sin(a) * 26, 16, Math.cos(a) * 26);
      camera.lookAt(0, 0, 0);
      viewmodel.visible = false;
    } else if (!p.alive) {
      const ally = state.entities.find((e) => e.alive && e.team === p.team && e.brain)
        || state.entities.find((e) => e.alive && e.brain);
      if (ally) {
        camera.position.set(ally.pos.x, ally.pos.y + GAME.eyeHeight, ally.pos.z);
        // Spectate the action, not the ally's exact view: the planted charge,
        // else the nearest enemy of the ally.
        let tx = null, tz = null;
        if (state.bomb.state === 'planted') { tx = state.bomb.pos.x; tz = state.bomb.pos.z; }
        else {
          let bd = Infinity;
          for (const e of state.entities) {
            if (!e.alive || e.team === ally.team) continue;
            const dx = e.pos.x - ally.pos.x, dz = e.pos.z - ally.pos.z;
            const d = dx * dx + dz * dz;
            if (d < bd) { bd = d; tx = e.pos.x; tz = e.pos.z; }
          }
        }
        if (tx !== null) camera.lookAt(tx, ally.pos.y + 1.4, tz);
        else camera.rotation.set(0, ally.yaw, 0);
      }
      viewmodel.visible = false;
    } else {
      camera.position.set(p.pos.x, eye, p.pos.z);
      camera.rotation.set(p.pitch, p.yaw, fx.shakeOffset());
      const wantFov = controller.zoomed && p.weapon === 'sniper' ? 42 : 75;
      if (Math.abs(camera.fov - wantFov) > 0.2) {
        camera.fov += (wantFov - camera.fov) * 0.25;
        camera.updateProjectionMatrix();
      }
      viewmodel.visible = true;
      if (p.moving && p.grounded) bobPhase += dt * 9;
      const bob = p.moving && p.grounded ? Math.sin(bobPhase) * 0.008 : 0;
      const recoil = Math.max(0, (state.time - p.lastShot) < 0.12 ? 0.05 : 0);
      viewmodel.position.set(0.28, -0.26 + bob, -0.55 + recoil);
    }
    fx.update(dt);
    hud.update(state, p);
    if (!p.alive && (state.phase === 'live' || state.phase === 'freeze')) {
      hud.showDeath(true, 'You were eliminated — spectating a teammate. Next round you are back in.');
    } else if (p.alive) {
      hud.showDeath(false);
    }
    if (state.phase === 'matchEnd') hud.showBuy(false);
    renderer.render(scene, camera);
    frames++;
    if (frames === 3) window.__ready = true;
  }

  window.__game = { state, hud, audio, fx };
  requestAnimationFrame(frame);
}

try {
  boot();
} catch (err) {
  window.__error = String(err && err.message || err);
  const el = document.getElementById('err');
  if (el) { el.style.display = 'block'; el.textContent = `Error: ${window.__error}`; }
}
