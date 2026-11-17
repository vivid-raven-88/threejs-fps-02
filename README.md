# Kestrel Yard — a round-based tactical FPS

A complete, original, Counter-Strike-style tactical shooter built on three.js
0.187.0. Single-player against bots, offline static files, no build step, no
network requests.

## Play

Serve `game/` with any static file server and open `index.html` in desktop
Chrome (WebGL 2):

```
cd game && python3 -m http.server 8000
# open http://localhost:8000/
```

Demo presets for screenshots and smoke tests:

- `?demo=menu` — title screen over a slow orbit of the map (default)
- `?demo=play` — straight into a live round, bots fighting at mid
- `?demo=buy` — freeze time with the buy menu open
- `?demo=plant` — the charge planted at site A, defenders pushing in

## The game

- **Map** — Kestrel Yard, an industrial rail yard: north lane, mid and south
  lane, two bombsites (A amber, B teal), crates and cover, light poles.
- **Teams** — Ember Vipers (attack, you + 4 bots) vs Frost Sentinels (defend,
  5 bots). First to 5 rounds takes the match (max 9).
- **Objective** — carry the charge to A or B, hold E to plant (3 s); defenders
  hold E to defuse (5 s). The charge ticks 35 s, then detonates.
- **Economy** — $800 start, $3000 round win, $1900 loss, $300 per kill/plant/
  defuse. Buy menu (keys 2–6 or click) during freeze time: SMG $900, rifle
  $2500, sniper $4000, grenade $300, kevlar $650.
- **Gunplay** — hitscan with head/body hit spheres (headshots ×2), recoil and
  spread that punish firing on the move, reloads, ammo reserves, tracers,
  muzzle flash, grenades with fuse and area damage.
- **Bots** — waypoint patrols, site holds, vision cones, hearing (gunfire and
  explosions draw them in), burst fire with skill-based aim error, strafing,
  bomb carrier / planter / defuser roles, rotations after a plant.
- **HUD** — health, armour, ammo, money, timer, score, alive counts, kill
  feed, round banners, crosshair spread, hit markers, plant/defuse progress.

## Layout

- `main.ts` — entrypoint: copies `game/` + `screenshots/` to `/output` and
  writes `dossier.json` with the kit's `buildDossier`.
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.
- `game/index.html` — import map (`three` → vendored three.module.min.js),
  CSS and all HUD DOM.
- `game/src/` — one job per module: `config` (tuning), `map` (layout,
  waypoints, meshes), `collide` (AABB + ray math), `state` (match state),
  `weapons` (cadence/reload/spread), `combat` (hitscan/damage/grenades),
  `bots` (AI), `rounds` (flow + economy), `player` (controls), `hud` (DOM),
  `audio` (procedural WebAudio), `fx` (pooled tracers/particles),
  `main.js` (boot + fixed-step 60 Hz sim + render).
- `game/vendor/three/` — three.js 0.187.0, byte for byte from the kit.
