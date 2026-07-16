// ============================================================
//  UI — screens, HUD, designer wizard, modals
// ============================================================
import { ROOMS, MINIMAP_POS } from './data.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.logLines = [];
    // generic close buttons
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => { $(btn.dataset.close).hidden = true; this._eventResolve?.(); this._eventResolve = null; });
    });
  }

  showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(id).classList.add('active');
  }

  // ---------------------------------------------------------- HUD
  setRoomTitle(name, cleared) {
    $('hud-room-name').textContent = name;
    $('hud-cleared').innerHTML = Array.from({ length: 5 }, (_, i) =>
      `<span class="pip ${i < cleared ? 'done' : ''}">${i < cleared ? '✦' : '·'}</span>`).join('');
  }

  /** Popup spell menu. items = [{move, spent, desc}]. Resolves the picked move or null. */
  showMagicMenu(items) {
    return new Promise((resolve) => {
      const list = $('magic-list');
      list.innerHTML = items.map((it, i) => `
        <button class="magic-item ${it.spent ? 'spent' : ''}" data-i="${i}" ${it.spent ? 'disabled' : ''}
                style="--move-color:${it.move.color}">
          <span class="magic-name"><i style="background:${it.move.color}"></i>${it.move.name}</span>
          <span class="magic-desc">${it.spent ? `⏳ Ready in ${it.cooldown} turn${it.cooldown === 1 ? '' : 's'}.` : it.desc}</span>
        </button>`).join('');
      list.querySelectorAll('.magic-item').forEach((b) => b.addEventListener('click', () => {
        $('magic-overlay').hidden = true;
        this._eventResolve = null;
        resolve(items[+b.dataset.i].move);
      }));
      $('magic-overlay').hidden = false;
      this._eventResolve = () => resolve(null); // Cancel / close
    });
  }

  setLives(lives, difficultyId) {
    const el = $('hud-lives');
    if (!el) return;
    if (difficultyId === 'story') { el.textContent = '📖'; el.title = 'Story mode — the party cannot die'; return; }
    el.textContent = '♥'.repeat(Math.max(0, Math.min(lives, 6)));
    el.title = `${lives} ${lives === 1 ? 'life' : 'lives'} remaining`;
  }

  setMonsterBanner(def, state) {
    const banner = $('monster-banner');
    if (!def || !state || state.hp <= 0) { banner.hidden = true; return; }
    banner.hidden = false;
    $('monster-name').textContent = `${def.icon} ${def.name}${state.confusedTurns > 0 ? ' 😵' : ''}`;
    $('monster-hp-fill').style.width = `${(state.hp / state.maxHp) * 100}%`;
    $('monster-hp-text').textContent = `${state.hp}/${state.maxHp}`;
  }

  refreshParty(heroes) {
    this._heroes = heroes;
    $('party-strip').innerHTML = heroes.map((h) => `
      <div class="party-chip ${h.downed ? 'downed' : ''} ${h.id === this._activeId ? 'active' : ''}" data-id="${h.id}">
        <span class="chip-icon" style="color:${h.def.color}">${h.downed ? '☠' : h.def.icon}</span>
        <span class="chip-name">${h.def.name}</span>
        <div class="hp-track small"><div class="hp-fill" style="width:${(h.hp / h.maxHp) * 100}%"></div></div>
        <span class="chip-hp">${h.hp}/${h.maxHp}</span>
      </div>`).join('');
  }

  setActiveHero(id) {
    this._activeId = id;
    if (this._heroes) this.refreshParty(this._heroes);
  }

  showRoomLoading(name) {
    $('room-loading-name').textContent = `Entering ${name}…`;
    $('room-loading').hidden = false;
  }
  hideRoomLoading() { $('room-loading').hidden = true; }

  /** Multiplayer: another player's hero is acting. */
  setWaiting(text) {
    $('action-bar').innerHTML = `<button class="btn btn-ghost action-btn waiting" disabled>${text}</button>`;
  }

  setActions(actions, handler) {
    $('action-bar').innerHTML = actions.map((a, i) => `
      <button class="btn action-btn ${a.primary ? 'btn-primary' : 'btn-ghost'} ${a.color ? 'has-move-color' : ''}"
              data-i="${i}" ${a.disabled ? 'disabled' : ''} ${a.color ? `style="--move-color:${a.color}"` : ''}>
        ${a.label}${a.hint ? `<small>${a.hint}</small>` : ''}
      </button>`).join('');
    $('action-bar').querySelectorAll('.action-btn').forEach((b) =>
      b.addEventListener('click', () => handler(actions[+b.dataset.i])));
  }

  showTurnBanner(text, isMonster = false) {
    const el = $('turn-banner');
    el.textContent = text;
    el.className = `turn-banner show ${isMonster ? 'monster' : ''}`;
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => el.classList.remove('show'), 1700);
  }

  log(html) {
    this.logLines.push(html);
    if (this.logLines.length > 40) this.logLines.shift();
    $('action-log').innerHTML = this.logLines.slice(-3).map((l) => `<div class="log-line">${l}</div>`).join('');
  }

  floatText(text, kind, color) {
    const el = document.createElement('div');
    el.className = `float-text ${kind}`;
    el.textContent = text;
    el.style.left = `${44 + Math.random() * 12}%`;
    if (color) el.style.color = color;
    $('float-layer').appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  showEvent(evt) {
    return new Promise((resolve) => {
      $('event-icon').textContent = evt.icon;
      $('event-title').textContent = evt.title;
      $('event-text').textContent = evt.text;
      $('event-overlay').hidden = false;
      this._eventResolve = resolve;
    });
  }

  showEnd(won, text) {
    $('end-icon').textContent = won ? '🏆' : '☠';
    $('end-title').textContent = won ? 'VICTORY!' : 'The Party Has Fallen';
    $('end-text').innerHTML = text;
    $('end-overlay').hidden = false;
  }

  /** Waygate destination picker. Resolves a roomId or null on cancel. */
  showRoomPicker(game, allowedIds) {
    return new Promise((resolve) => {
      const mm = $('teleport-map');
      const cells = Array(9).fill(null);
      for (const room of ROOMS) {
        const [r, c] = MINIMAP_POS[room.id];
        cells[r * 3 + c] = room;
      }
      mm.innerHTML = cells.map((room) => {
        if (!room) return `<div class="mm-cell empty"></div>`;
        const rs = game.rooms[room.id];
        const here = game.currentRoom === room.id;
        const ok = allowedIds.includes(room.id);
        const mark = here ? '📍' : rs?.cleared ? '✦' : room.kind === 'boss' ? '🔒' : room.kind === 'lobby' ? '⌂' : '?';
        return `<div class="mm-cell ${here ? 'here' : ''} ${rs?.cleared ? 'cleared' : ''} ${room.kind} ${ok ? 'pickable' : 'blocked'}" data-room="${room.id}">
          <span class="mm-mark">${mark}</span>
          <span class="mm-name">${room.kind === 'lobby' ? 'Lobby' : room.kind === 'boss' ? 'Boss' : 'Room ' + room.id}</span>
        </div>`;
      }).join('');
      mm.querySelectorAll('.mm-cell.pickable').forEach((c) => c.addEventListener('click', () => {
        $('teleport-overlay').hidden = true;
        this._eventResolve = null;
        resolve(+c.dataset.room);
      }));
      $('teleport-overlay').hidden = false;
      this._eventResolve = () => resolve(null); // Cancel
    });
  }

  showMinimap(game) {
    const mm = $('minimap');
    mm.innerHTML = '';
    const cells = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push(null);
    for (const room of ROOMS) {
      const [r, c] = MINIMAP_POS[room.id];
      cells[r * 3 + c] = room;
    }
    mm.innerHTML = cells.map((room) => {
      if (!room) return `<div class="mm-cell empty"></div>`;
      const rs = game.rooms[room.id];
      const here = game.currentRoom === room.id;
      const clearedMark = rs?.cleared ? '✦' : (room.kind === 'boss' ? (game.cleared >= 5 ? '🔥' : '🔒') : (room.kind === 'lobby' ? '⌂' : '?'));
      return `<div class="mm-cell ${here ? 'here' : ''} ${rs?.cleared ? 'cleared' : ''} ${room.kind}">
        <span class="mm-mark">${clearedMark}</span>
        <span class="mm-name">${room.kind === 'lobby' ? 'Lobby' : room.kind === 'boss' ? 'Boss' : 'Room ' + room.id}</span>
      </div>`;
    }).join('');
    $('map-overlay').hidden = false;
  }
}
