// The DOM HUD. All values are cached and the DOM is only touched when a value
// actually changes, so the per-frame update stays cheap.
import { WEAPONS, GRENADE } from './config.js';

function $(id) { return document.getElementById(id); }

const BUY_ITEMS = [
  { id: 'smg', name: 'VK-9 Raptor · SMG', price: 900, key: '2' },
  { id: 'rifle', name: 'AR-77 Longshot · Rifle', price: 2500, key: '3' },
  { id: 'sniper', name: 'LW-50 Hawkeye · Sniper', price: 4000, key: '4' },
  { id: 'grenade', name: 'Frag-9 · Grenade', price: 300, key: '5' },
  { id: 'armour', name: 'Kevlar Vest · Armour', price: 650, key: '6' },
];

export class Hud {
  constructor() {
    this.cache = {};
    this.onBuy = null;
    this.onStart = null;
    this._feedAt = -1;
    this._buildBuy();
    const start = $('start-btn');
    if (start) start.addEventListener('click', () => { if (this.onStart) this.onStart(); });
  }

  _set(id, text) {
    if (this.cache[id] === text) return;
    this.cache[id] = text;
    const el = $(id);
    if (el) el.textContent = text;
  }

  _buildBuy() {
    const list = $('buy-list');
    if (!list) return;
    for (const item of BUY_ITEMS) {
      const b = document.createElement('button');
      b.className = 'buy-item';
      b.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-price">$${item.price}</span>`;
      b.addEventListener('click', () => { if (this.onBuy) this.onBuy(item.id); });
      list.appendChild(b);
    }
  }

  showMenu(show) { const m = $('menu'); if (m) m.style.display = show ? 'flex' : 'none'; }
  showBuy(show) { const b = $('buy'); if (b) b.style.display = show ? 'block' : 'none'; }
  showDeath(show, text) {
    const d = $('death');
    if (!d) return;
    d.style.display = show ? 'flex' : 'none';
    if (text) this._set('death-text', text);
  }

  banner(text, sub, ms) {
    const b = $('banner');
    if (!b) return;
    this._set('banner-title', text);
    this._set('banner-sub', sub || '');
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.remove('show'), ms || 2600);
  }

  update(state, player) {
    const w = WEAPONS[player.weapon];
    this._set('health-num', String(Math.max(0, Math.ceil(player.hp))));
    const hb = $('health-bar');
    if (hb) hb.style.width = `${Math.max(0, player.hp)}%`;
    this._set('armour-tag', player.armour ? 'KEVLAR' : '');
    this._set('ammo-mag', player.reloading > 0 ? '--' : String(player.mag[player.weapon]));
    this._set('ammo-res', ` / ${player.reserve[player.weapon]}`);
    this._set('weapon-name', w.name);
    this._set('money', `$${player.money}`);
    this._set('grenades', player.grenades > 0 ? `◆ ${player.grenades}` : '');
    this._set('score-atk', String(state.score.atk));
    this._set('score-def', String(state.score.def));
    this._set('round-label', state.phase === 'menu' ? 'KESTREL YARD' : `ROUND ${Math.max(1, state.round)} / 9`);
    const t = Math.max(0, Math.ceil(state.bomb.state === 'planted' ? state.bomb.timer : state.timer));
    const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
    this._set('timer', state.bomb.state === 'planted' ? `💣 ${t}s` : `${mm}:${ss}`);
    const timerEl = $('timer');
    if (timerEl) timerEl.classList.toggle('danger', state.bomb.state === 'planted' || (state.phase === 'live' && t <= 10));
    this._set('alive-atk', `EMB ${state.aliveOf('atk')}`);
    this._set('alive-def', `FRS ${state.aliveOf('def')}`);
    let bomb = '';
    if (state.bomb.state === 'carried') bomb = state.bomb.carrier === player ? 'CHARGE: you carry it — take it to A or B' : `CHARGE: carried by ${state.bomb.carrier ? state.bomb.carrier.name : '?'}`;
    else if (state.bomb.state === 'dropped') bomb = 'CHARGE: dropped — pick it up';
    else if (state.bomb.state === 'planted') bomb = `CHARGE PLANTED at site ${state.bomb.site} — defend it`;
    else if (state.bomb.state === 'defused') bomb = 'CHARGE DEFUSED';
    else if (state.bomb.state === 'exploded') bomb = 'CHARGE DETONATED';
    this._set('bomb-status', bomb);
    // Crosshair spread from bloom + movement.
    const ch = $('crosshair');
    if (ch) ch.style.setProperty('--sp', `${6 + player.bloom * 260 + (player.moving ? 6 : 0)}px`);
    // Kill feed.
    const feed = $('feed');
    if (feed && state.feed.length && state.feed[0].at !== this._feedAt) {
      this._feedAt = state.feed[0].at;
      feed.innerHTML = state.feed.map((f) => `<div class="feed-line ${f.cls}">${f.text}</div>`).join('');
    }
    // Plant / defuse progress.
    const chEl = $('channel');
    if (chEl) {
      if (player.channel) {
        const need = player.channel.kind === 'plant' ? 3 : 5;
        const p = Math.min(1, (state.time - player.channel.at) / need);
        chEl.style.display = 'block';
        this._set('channel-label', player.channel.kind === 'plant' ? 'PLANTING CHARGE…' : 'DEFUSING…');
        const bar = $('channel-bar');
        if (bar) bar.style.width = `${p * 100}%`;
      } else {
        chEl.style.display = 'none';
      }
    }
    // Buy affordability.
    const list = $('buy-list');
    if (list && state.phase === 'freeze') {
      const items = list.children;
      BUY_ITEMS.forEach((item, i) => {
        const owned = item.id === 'armour' ? player.armour : item.id === 'grenade' ? player.grenades >= GRENADE.max : player.weapons.includes(item.id);
        const afford = player.money >= item.price;
        items[i].classList.toggle('owned', !!owned);
        items[i].classList.toggle('poor', !afford && !owned);
      });
    }
  }
}
