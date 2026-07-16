// ============================================================
//  MP — online multiplayer orchestration
//  Host-authoritative: the host's Game is the source of truth.
//  Guests mirror state snapshots + replay visual events, and
//  send intents when it is their hero's turn.
// ============================================================
import { Net } from './net.js';
import { HEROES, MONSTERS, BOSSES } from './data.js';
import { loadGLTF, loadImage, propFilesFor, floorTextureFilesFor, sideCharacterFiles } from './tokens.js';
import { animateRoll } from './dice.js';

const $ = (id) => document.getElementById(id);

export class MP {
  constructor(ui) {
    this.ui = ui;
    this.net = new Net();
    this.active = false;
    this.name = '';
    this.players = [];   // [{connId, name, heroId, config, ready, connected}]
    this.phase = 'idle'; // designing | lobby | playing
    this.game = null;    // wired by main once the engine exists
    this.designer = null;
    this.onStart = null; // (campaign, isHost) => void
    this.pendingCampaign = null;
  }

  get isHost() { return this.net.isHost; }

  isConnected(playerName) {
    return !!this.players.find((p) => p.name === playerName)?.connected;
  }

  me() { return this.players.find((p) => p.name === this.name); }

  // ------------------------------------------------------ host
  async hostRoom(name) {
    this.name = name;
    const code = await this.net.host();
    this.active = true;
    this.phase = 'designing';
    this.players = [{ connId: 'host', name, heroId: null, config: null, ready: false, connected: true }];
    this.net.onMessage = (msg, from) => this._hostMsg(msg, from);
    this.net.onPeerLeave = (id) => this._peerLeft(id);
    return code;
  }

  _hostMsg(msg, from) {
    switch (msg.t) {
      case 'hello': {
        let name = String(msg.name || 'Player').slice(0, 16).trim() || 'Player';
        while (this.players.some((p) => p.name === name)) name += '2';
        this.players.push({ connId: from, name, heroId: null, config: null, ready: false, connected: true });
        this.net.broadcast({ t: 'welcome', name }, from);
        this._syncLobby();
        // late joiner while playing: send them the live game
        if (this.phase === 'playing' && this.game) {
          this.net.broadcast({ t: 'start', campaign: this.game.campaign }, from);
          this.net.broadcast({ t: 'state', snap: this.game.serialize() }, from);
        }
        break;
      }
      case 'pick': {
        const p = this.players.find((x) => x.connId === from);
        if (!p) return;
        const taken = this.players.some((x) => x !== p && x.ready && x.heroId === msg.heroId);
        if (taken) { this.net.broadcast({ t: 'pickRejected', heroId: msg.heroId }, from); this._syncLobby(); return; }
        p.heroId = msg.heroId;
        p.config = msg.config;
        p.ready = true;
        this._syncLobby();
        break;
      }
      case 'intent': {
        const sender = this.players.find((x) => x.connId === from);
        if (sender && this.game) this.game.handleIntent(msg, sender.name);
        break;
      }
    }
  }

  _peerLeft(id) {
    const p = this.players.find((x) => x.connId === id);
    if (!p) return;
    if (this.phase === 'playing') {
      p.connected = false;
      this.game?.log?.(`⚠ <b>${p.name}</b> disconnected — the host commands ${p.heroId ? HEROES.find((h) => h.id === p.heroId)?.name : 'their hero'} for now.`);
      this.game?.refreshActions?.();
    } else {
      this.players = this.players.filter((x) => x !== p);
    }
    this._syncLobby();
  }

  _syncLobby() {
    this.net.broadcast({
      t: 'lobby',
      players: this.players.map(({ name, heroId, ready, connected }) => ({ name, heroId, ready, connected })),
      phase: this.phase,
      preload: this._preloadManifest(),
    });
    this.renderLobby();
  }

  /** Everything a client will need to render this campaign. */
  _preloadManifest() {
    const c = this.pendingCampaign;
    if (!c) return null;
    const models = new Set();
    for (const p of this.players) {
      const h = p.heroId && HEROES.find((x) => x.id === p.heroId);
      if (h) models.add(h.model);
    }
    const themes = new Set([c.themeId]);
    for (const id of c.monsterIds || []) {
      const m = MONSTERS.find((x) => x.id === id);
      if (m) { models.add(m.model); themes.add(c.monsterConfig?.[id]?.roomTheme || m.roomTheme); }
    }
    const b = BOSSES.find((x) => x.id === c.bossId);
    if (b) { models.add(b.model); themes.add(c.monsterConfig?.[b.id]?.roomTheme || b.roomTheme); }
    return { models: [...models].filter(Boolean), themes: [...themes].filter(Boolean) };
  }

  /** Warm the model/texture caches during the lobby wait, so the game
   *  starts instantly instead of downloading mid-fight. */
  async _preload(manifest) {
    if (!manifest) return;
    this._preloaded = this._preloaded || new Set();
    const jobs = [];
    for (const m of manifest.models || []) {
      if (this._preloaded.has(m)) continue;
      this._preloaded.add(m);
      jobs.push(() => loadGLTF(m).catch(() => {}));
    }
    if (!this._preloaded.has('side-chars')) {
      this._preloaded.add('side-chars');
      jobs.push(async () => {
        const files = await sideCharacterFiles().catch(() => []);
        for (const f of files) await loadGLTF(`models/side-characters/${f}`).catch(() => {});
      });
    }
    for (const t of manifest.themes || []) {
      const key = 'theme:' + t;
      if (this._preloaded.has(key)) continue;
      this._preloaded.add(key);
      jobs.push(async () => {
        const props = await propFilesFor(t).catch(() => []);
        for (const f of props) await loadGLTF(`models/props/${t}/${f}`).catch(() => {});
        const texs = await floorTextureFilesFor(t).catch(() => []);
        for (const f of texs) await loadImage(`floor-textures/${t}/${f}`).catch(() => {});
      });
    }
    for (const j of jobs) await j(); // sequential — don't choke the connection
  }

  /** Host finished the designer (their own hero is in the campaign). */
  hostDesignDone(campaign) {
    this.pendingCampaign = campaign;
    const me = this.players[0];
    me.heroId = campaign.heroIds[0];
    me.config = campaign.heroConfig[me.heroId];
    me.ready = true;
    this.phase = 'lobby';
    this._syncLobby();
    this._preload(this._preloadManifest()); // host warms its caches too
  }

  startGame() {
    const seated = this.players.filter((p) => p.ready && p.heroId);
    if (!seated.length) return;
    const campaign = { ...this.pendingCampaign };
    campaign.heroIds = seated.map((p) => p.heroId);
    campaign.heroConfig = Object.fromEntries(seated.map((p) => [p.heroId, p.config]));
    campaign.owners = Object.fromEntries(seated.map((p) => [p.heroId, p.name]));
    this.phase = 'playing';
    this._syncLobby();
    this.net.broadcast({ t: 'start', campaign });
    this.onStart?.(campaign, true);
  }

  /** Snapshots come thick and fast during combat — coalesce them so only
   *  the freshest state goes over the wire (~12/sec max). */
  broadcastState(snap) {
    if (!this.isHost) return;
    this._pendingSnap = snap;
    if (this._snapTimer) return;
    this._snapTimer = setTimeout(() => {
      this._snapTimer = null;
      if (this._pendingSnap) this.net.broadcast({ t: 'state', snap: this._pendingSnap });
      this._pendingSnap = null;
    }, 80);
  }
  broadcastEv(ev) { if (this.isHost) this.net.broadcast({ t: 'ev', ...ev }); }

  // ------------------------------------------------------ guest
  async joinRoom(code, name) {
    this.name = name;
    await this.net.join(code);
    this.active = true;
    this.phase = 'lobby';
    this.net.onMessage = (msg) => this._guestMsg(msg);
    this.net.onDisconnected = () => {
      this.ui.showEvent({ icon: '⚠', title: 'Connection lost', text: 'The host has vanished into the dungeon. Returning to the title screen.' });
      this.leave();
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
      $('screen-home').classList.add('active');
    };
    this.net.send({ t: 'hello', name });
  }

  _guestMsg(msg) {
    switch (msg.t) {
      case 'welcome': this.name = msg.name; break;
      case 'lobby':
        this.players = msg.players;
        if (this.phase !== 'playing') this.phase = msg.phase;
        this.designer?.updateLocks?.(this.takenHeroIds());
        this.renderLobby();
        if (msg.preload) this._preload(msg.preload); // download models while we wait
        break;
      case 'pickRejected':
        this.ui.showEvent({ icon: '🔒', title: 'Hero taken', text: 'Another player claimed that hero first — choose a different one.' });
        break;
      case 'start':
        this.phase = 'playing';
        this.onStart?.(msg.campaign, false);
        break;
      case 'state': this.game?.applySnapshot(msg.snap); break;
      case 'ev': this._handleEv(msg); break;
    }
  }

  _handleEv(m) {
    const g = this.game;
    switch (m.ev) {
      case 'log': this.ui.log(m.html); break;
      case 'dice': animateRoll(m.sides, m.caption, m.result); break;
      case 'modal': this.ui.showEvent(m.evt); break;
      case 'banner': this.ui.showTurnBanner(m.text, m.isMonster); break;
      case 'float': this.ui.floatText(m.text, m.kind, m.color); break;
      case 'punch': g?.engine.punchMonster(); break;
      case 'room': g?.remoteRoomChange(m.roomId, m.entryDir); break;
      case 'fx':
        if (!g) break;
        if (m.kind === 'monsterCast') g.engine.monsterCastEffect(m.target, m.color);
        else g.engine.castEffect(m.heroId, m.color, m.kind);
        break;
      case 'end': this.ui.showEnd(m.won, m.text); break;
    }
  }

  sendIntent(intent) { this.net.send({ t: 'intent', ...intent }); }
  sendPick(heroId, config) { this.net.send({ t: 'pick', heroId, config }); }

  takenHeroIds() {
    return this.players.filter((p) => p.ready && p.name !== this.name && p.heroId).map((p) => p.heroId);
  }

  leave() {
    this.net.leave();
    this.active = false;
    this.phase = 'idle';
    this.players = [];
    this.pendingCampaign = null;
  }

  // ------------------------------------------------------ lobby UI
  renderLobby() {
    const el = $('lobby-players');
    if (!el) return;
    $('lobby-code').textContent = this.net.code || '·····';
    $('lobby-status').textContent =
      this.phase === 'designing' ? (this.isHost ? 'Design your campaign, then return here.' : 'The host is designing the campaign…')
      : this.phase === 'playing' ? 'The adventure is underway!'
      : 'Waiting for heroes to ready up…';

    el.innerHTML = this.players.map((p) => {
      const hero = p.heroId ? HEROES.find((h) => h.id === p.heroId) : null;
      return `<div class="lobby-player ${p.connected === false ? 'off' : ''}">
        <span class="lp-name">${p.name}${p.name === this.name ? ' (you)' : ''}</span>
        <span class="lp-hero">${hero ? `<i style="color:${hero.color}">${hero.icon}</i> ${hero.name}` : '<em>choosing…</em>'}</span>
        <span class="lp-ready">${p.connected === false ? '⚠ offline' : p.ready ? '✓ ready' : '…'}</span>
      </div>`;
    }).join('');

    const me = this.me();
    $('btn-lobby-pick').hidden = this.isHost || this.phase === 'playing';
    $('btn-lobby-pick').textContent = me?.ready ? '✎ Change Hero' : '⚔ Choose Your Hero';
    const startBtn = $('btn-lobby-start');
    startBtn.hidden = !this.isHost;
    const seated = this.players.filter((p) => p.ready && p.heroId).length;
    const allReady = this.players.every((p) => p.ready || p.connected === false);
    startBtn.disabled = !(seated >= 1 && allReady && this.phase === 'lobby');
    startBtn.textContent = allReady ? `⚑ Begin the Descent (${seated})` : 'Waiting for players…';
  }
}
