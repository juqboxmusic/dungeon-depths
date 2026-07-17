// ============================================================
//  GAME — state machine, turns, combat, dungeon progression
// ============================================================
import {
  THEMES, ROOM_THEMES, HEROES, MONSTERS, BOSSES, ROOMS, TWISTS, BOONS, ROOM_REWARD_HEAL,
  ATTACK_STYLES, DIFFICULTIES, QUEST_ITEMS, QUEST_SPELLS, SIDE_PERSONAS,
  defaultHeroConfig, defaultMonsterConfig, mainAttackColor, lightenHex,
  rulesFor, rulesDesc,
} from './data.js';
import { sideCharacterFiles } from './tokens.js';
import { roll, animateRoll } from './dice.js';

const SAVE_KEY = 'dungeon-depths-save-v1';
const RING_FOR_DIR = { E: 0, S: 3, W: 6, N: 9 };
const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor(engine, ui, mp = null) {
    this.engine = engine;
    this.ui = ui;
    this.mp = mp;
    this.busy = false;
    engine.onStoneTap = (id) => this.stoneTapped(id);
    engine.onDoorTap = (dir) => this.doorTapped(dir);
    engine.onSideTap = () => this.sideCharacterTapped();
  }

  static hasSave() { return !!localStorage.getItem(SAVE_KEY); }
  static clearSave() { localStorage.removeItem(SAVE_KEY); }

  // ------- multiplayer-aware wrappers: solo they just do the local thing;
  // ------- online the host mirrors every one to the guests
  log(html) { this.ui.log(html); if (this.mp?.active) this.mp.broadcastEv({ ev: 'log', html }); }
  modal(evt) { if (this.mp?.active) this.mp.broadcastEv({ ev: 'modal', evt }); return this.ui.showEvent(evt); }
  banner(text, isMonster = false) { this.ui.showTurnBanner(text, isMonster); if (this.mp?.active) this.mp.broadcastEv({ ev: 'banner', text, isMonster }); }
  float(text, kind, color) { this.ui.floatText(text, kind, color); if (this.mp?.active) this.mp.broadcastEv({ ev: 'float', text, kind, color }); }
  fxCast(heroId, color, kind) { if (this.mp?.active) this.mp.broadcastEv({ ev: 'fx', heroId, color, kind }); return this.engine.castEffect(heroId, color, kind); }
  fxMonster(targetId, color) { if (this.mp?.active) this.mp.broadcastEv({ ev: 'fx', kind: 'monsterCast', target: targetId, color }); return this.engine.monsterCastEffect(targetId, color); }
  fxSummonStrike() { if (this.mp?.active) this.mp.broadcastEv({ ev: 'fx', kind: 'summonStrike' }); this.engine.summonStrike(); }
  async rollAnim(sides, caption) {
    const result = roll(sides);
    if (this.mp?.active) this.mp.broadcastEv({ ev: 'dice', sides, caption, result });
    return animateRoll(sides, caption, result);
  }

  // ------- hero ownership (multiplayer)
  ownerOf(heroId) { return this.campaign?.owners?.[heroId] || null; }
  isMyHero(h) {
    if (!this.mp?.active) return true;
    const owner = this.ownerOf(h.id);
    if (!owner) return this.mp.isHost;
    if (owner === this.mp.name) return true;
    return this.mp.isHost && !this.mp.isConnected(owner); // host covers dropouts
  }

  serialize() {
    return {
      heroes: this.heroes, rooms: this.rooms,
      currentRoom: this.currentRoom, entryDir: this.entryDir,
      cleared: this.cleared,
      lives: Number.isFinite(this.lives) ? this.lives : null,
      quest: this.quest || null,
      summon: this.summon || null,
      turnIndex: this.turnIndex, turn: this.turn || null,
    };
  }

  save() {
    if (this.over) return; // victory/defeat already wiped the save
    if (this.mp?.active) {
      if (this.mp.isHost) this.mp.broadcastState(this.serialize());
      return; // online games are not saved to this device
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      campaign: this.campaign,
      heroes: this.heroes,
      rooms: this.rooms,
      currentRoom: this.currentRoom,
      entryDir: this.entryDir,
      cleared: this.cleared,
      lives: Number.isFinite(this.lives) ? this.lives : null, // story mode → null
      quest: this.quest || null,
    }));
  }

  // ------- guest replica: mirrors host snapshots, never runs game logic
  async startReplica(campaign) {
    this.over = false;
    this.campaign = campaign;
    this.theme = THEMES.find((t) => t.id === campaign.themeId) || THEMES[0];
    this.lives = this.difficulty.lives;
    this.quest = null;
    this.heroes = campaign.heroIds.map((id) => {
      const stats = this.cfgFor(id).stats;
      return { id, hp: stats.hp, maxHp: stats.hp, acBonus: 0, dmgBoost: 0, spellsUsed: {}, downed: false, stoneId: null };
    });
    this.rooms = {};
    this.cleared = 0;
    this.turnIndex = 0;
    this.currentRoom = -1; // force a room render on the first snapshot
  }

  /** Guest: host committed to a room change — start building it right away
   *  (same deterministic entry placement the host will compute). */
  async remoteRoomChange(roomId, entryDir) {
    if (this._applying || roomId === this.currentRoom) return;
    this._applying = true;
    this.ui.showRoomLoading(ROOMS[roomId].name);
    try {
      await this.renderRoom(roomId, entryDir);
    } finally {
      this.ui.hideRoomLoading();
      this._applying = false;
      if (this._pendingSnap) { const p = this._pendingSnap; this._pendingSnap = null; this.applySnapshot(p); }
    }
  }

  async applySnapshot(s) {
    if (this._applying) { this._pendingSnap = s; return; }
    this._applying = true;
    try {
      const roomChanged = s.currentRoom !== this.currentRoom;
      const prevSummon = this.summon;
      this.heroes = s.heroes;
      this.rooms = s.rooms;
      this.cleared = s.cleared;
      this.summon = s.summon || null;
      this.lives = this.difficulty.lives === Infinity ? Infinity : (s.lives ?? this.difficulty.lives);
      this.quest = s.quest || null;
      this.turnIndex = s.turnIndex;
      this.turn = s.turn;
      if (roomChanged) {
        this.ui.showRoomLoading(ROOMS[s.currentRoom].name);
        try {
          await this.renderRoom(s.currentRoom, s.entryDir || 'S', { keepPositions: true });
        } finally {
          this.ui.hideRoomLoading();
        }
      } else {
        for (const h of this.heroes) {
          this.engine.moveHero(h.id, h.stoneId);
          this.engine.setHeroDowned(h.id, h.downed);
        }
        const rs = this.roomState;
        if (rs && rs.hp <= 0) this.engine.killMonster();
        if (this.quest?.status === 'collected') this.engine.removeQuestItem();
        // mirror the host's transformation
        if (this.summon && this.summon.moveId !== prevSummon?.moveId) {
          const sDef = MONSTERS.find((m) => m.id === this.summon.monsterId);
          if (sDef) this.engine.morphHero(this.summon.heroId, sDef, this.summon.color);
        } else if (!this.summon && prevSummon) {
          this.engine.unmorphHero();
        }
        // door locks can change without a room change (combat start/clear)
        for (const dir of Object.keys(this.roomDef.exits)) {
          this.engine.setDoorState(dir, this.doorOpen(dir) ? 'open' : 'locked');
        }
        this.ui.setRoomTitle(this.roomDef.name, this.cleared);
        this.ui.setMonsterBanner(this.inCombat ? this.monsterDefFor(this.currentRoom) : null, rs);
      }
      this.ui.setLives(this.lives, this.campaign.difficulty || 'medium');
      this.ui.refreshParty(this.heroes.map((h) => ({ ...h, def: this.heroDef(h) })));
      if (this.turn && this.activeHero) this.engine.setMonsterFocus(this.activeHero.id);
      if (this.turn) this.refreshActions();
    } finally {
      this._applying = false;
      if (this._pendingSnap) { const p = this._pendingSnap; this._pendingSnap = null; this.applySnapshot(p); }
    }
  }

  get difficulty() { return DIFFICULTIES[this.campaign.difficulty] || DIFFICULTIES.medium; }

  // ---------------------------------------------------------- setup
  async startNew(campaign) {
    this.over = false;
    this.campaign = campaign;
    this.theme = THEMES.find((t) => t.id === campaign.themeId) || THEMES[0];
    this.lives = this.difficulty.lives;
    this.quest = null;
    this.heroes = campaign.heroIds.map((id) => {
      const stats = this.cfgFor(id).stats;
      return { id, hp: stats.hp, maxHp: stats.hp, acBonus: 0, dmgBoost: 0, spellsUsed: {}, downed: false, stoneId: null };
    });
    this.rooms = {};
    for (let i = 1; i <= 5; i++) {
      const def = MONSTERS.find((m) => m.id === campaign.monsterIds[i - 1]);
      const hp = this.cfgForMonster(def.id).stats.hp;
      this.rooms[i] = { monsterId: def.id, hp, maxHp: hp, cleared: false };
    }
    const boss = BOSSES.find((b) => b.id === campaign.bossId);
    const bossHp = this.cfgForMonster(boss.id).stats.hp;
    this.rooms[6] = { monsterId: boss.id, hp: bossHp, maxHp: bossHp, cleared: false, isBoss: true };
    this.cleared = 0;
    this.turnIndex = 0;
    await this.enterRoom(0, 'S');
    this.log(`⚑ The party descends into <b>${campaign.name}</b>...`);
  }

  async resume(saved) {
    this.over = false;
    this.campaign = saved.campaign;
    this.theme = THEMES.find((t) => t.id === saved.campaign.themeId) || THEMES[0];
    this.lives = this.difficulty.lives === Infinity ? Infinity : (saved.lives ?? this.difficulty.lives);
    this.quest = saved.quest || null;
    this.heroes = saved.heroes;
    for (const h of this.heroes) {
      h.spellsUsed = h.spellsUsed || {}; // pre-moves saves
      for (const k of Object.keys(h.spellsUsed)) {
        if (h.spellsUsed[k] === true) h.spellsUsed[k] = 2; // once-per-room era → short cooldown
      }
    }
    this.rooms = saved.rooms;
    this.cleared = saved.cleared;
    this.turnIndex = 0;
    await this.enterRoom(saved.currentRoom, saved.entryDir || 'S');
    this.log(`▶ The adventure continues...`);
  }

  heroDef(h) { return HEROES.find((d) => d.id === h.id); }

  /** Player-customized config (stats + moves) with defaults as fallback. */
  cfgFor(heroId) {
    if (!this.campaign.heroConfig) this.campaign.heroConfig = {};
    if (!this.campaign.heroConfig[heroId]) {
      this.campaign.heroConfig[heroId] = defaultHeroConfig(HEROES.find((h) => h.id === heroId));
    }
    return this.campaign.heroConfig[heroId];
  }
  statsFor(h) { return this.cfgFor(h.id).stats; }

  /** Player-customized monster/boss config (stats + attacks). */
  cfgForMonster(monsterId) {
    if (!this.campaign.monsterConfig) this.campaign.monsterConfig = {};
    if (!this.campaign.monsterConfig[monsterId]) {
      const def = MONSTERS.find((m) => m.id === monsterId) || BOSSES.find((b) => b.id === monsterId);
      this.campaign.monsterConfig[monsterId] = defaultMonsterConfig(def);
    }
    return this.campaign.monsterConfig[monsterId];
  }
  monsterDefFor(roomId) {
    const rs = this.rooms[roomId];
    if (!rs) return null;
    return rs.isBoss ? BOSSES.find((b) => b.id === rs.monsterId) : MONSTERS.find((m) => m.id === rs.monsterId);
  }
  get roomDef() { return ROOMS[this.currentRoom]; }
  get roomState() { return this.rooms[this.currentRoom] || null; }
  get inCombat() { return !!(this.roomState && !this.roomState.cleared && this.roomState.hp > 0); }

  // ---------------------------------------------------------- rooms
  doorOpen(dir) {
    const target = this.roomDef.exits[dir];
    if (target === undefined) return false;
    if (this.inCombat) return false;                 // door slams shut during combat
    if (target === 6 && this.cleared < 5) return false; // boss door sealed
    return true;
  }

  /** Pure scene render — safe for guest replicas (no game-state mutation
   *  beyond hero placement, no saves, no turn changes, no quest logic). */
  async renderRoom(roomId, entryDir, opts = {}) {
    this.currentRoom = roomId;
    this.entryDir = entryDir;
    const room = this.roomDef;
    const monsterDef = this.monsterDefFor(roomId);
    const rs = this.roomState;

    const doorStates = {};
    for (const dir of Object.keys(room.exits)) doorStates[dir] = this.doorOpen(dir) ? 'open' : 'locked';

    // monster rooms take the monster's own room theme, COLORED by its main
    // attack; the lobby keeps the realm look
    const mCfg = monsterDef ? this.cfgForMonster(monsterDef.id) : null;
    const atkColor = monsterDef ? mainAttackColor(mCfg, monsterDef.color) : null;
    const baseTheme = monsterDef ? ROOM_THEMES[mCfg.roomTheme || monsterDef.roomTheme] : null;
    const roomTheme = baseTheme
      ? { ...baseTheme, accent: atkColor, glow: lightenHex(atkColor, 0.3) }
      : null;

    await this.engine.loadRoom(room, this.theme, {
      monster: monsterDef,
      monsterAccent: atkColor,
      cleared: rs ? rs.cleared || rs.hp <= 0 : true,
      doorStates,
      roomTheme,
    });

    if (opts.keepPositions) {
      // replica: heroes already know their stones from the host snapshot
      for (let i = 0; i < this.heroes.length; i++) {
        const h = this.heroes[i];
        if (!this.engine.stoneById(h.stoneId)) h.stoneId = `ring${i}`;
        const hDef = this.heroDef(h);
        await this.engine.placeHero(hDef, h.stoneId, i, mainAttackColor(this.cfgFor(hDef.id), hDef.color));
        this.engine.setHeroDowned(h.id, h.downed);
      }
    } else {
      // place party along the entry walkway (entryDir = side we came in through)
      const d = entryDir;
      const chain = [`door${d}`, `path${d}`, `ring${RING_FOR_DIR[d]}`, `ring${(RING_FOR_DIR[d] + 1) % 12}`];
      // lobby has no door on its "entry" side necessarily — fall back to ring stones
      const valid = chain.filter((id) => this.engine.stoneById(id));
      let vi = 0;
      for (let i = 0; i < this.heroes.length; i++) {
        const stoneId = valid[vi] || `ring${(RING_FOR_DIR[d] + 2 + i) % 12}`;
        vi++;
        this.heroes[i].stoneId = this.engine.stoneById(stoneId) ? stoneId : `ring${i}`;
        const hDef = this.heroDef(this.heroes[i]);
        await this.engine.placeHero(hDef, this.heroes[i].stoneId, i, mainAttackColor(this.cfgFor(hDef.id), hDef.color));
        this.engine.setHeroDowned(this.heroes[i].id, this.heroes[i].downed);
      }
    }

    this.ui.setRoomTitle(room.name, this.cleared);
    this.ui.setLives(this.lives, this.campaign.difficulty || 'medium');
    this.ui.setMonsterBanner(this.inCombat ? monsterDef : null, rs);
    this.ui.refreshParty(this.heroes.map((h) => ({ ...h, def: this.heroDef(h) })));

    // side-character quest pieces in this room (visuals only)
    if (this.quest?.status === 'offered') {
      if (roomId === this.quest.spawnRoom) this.engine.spawnSideCharacter(this._sideDef());
      if (roomId === this.quest.itemRoom) this.engine.spawnQuestItem(this.quest.item);
    }

    return { room, monsterDef, rs };
  }

  async enterRoom(roomId, entryDir) {
    this.summon = null; // a summoned ally never follows through doors
    // tell guests NOW so they build the room in parallel with us,
    // instead of waiting for our render + the state broadcast
    if (this.mp?.active && this.mp.isHost) this.mp.broadcastEv({ ev: 'room', roomId, entryDir });
    this.ui.showRoomLoading(ROOMS[roomId].name);
    let result;
    try {
      result = await this.renderRoom(roomId, entryDir);
    } finally {
      this.ui.hideRoomLoading();
    }
    const { room, monsterDef, rs } = result;

    // relic pickup (host/solo logic)
    if (this.quest?.status === 'offered' && roomId === this.quest.itemRoom && !this.inCombat) {
      await this.collectQuestItem();
    }

    if (this.inCombat) {
      this.log(`⚔ <b>${monsterDef.name}</b> awaits! The doors slam shut...`);
    } else if (room.kind === 'boss' && rs.cleared) {
      // already victorious — shouldn't normally happen
    } else if (room.kind === 'lobby') {
      this.log(`You stand in ${room.name}. Choose a door.`);
    } else {
      this.log(`${room.name} lies silent. The monster here is slain.`);
    }

    this.turnIndex = 0;
    this.save();
    this.beginHeroTurn();
  }

  // ---------------------------------------------------------- turn flow
  get activeHero() { return this.heroes[this.turnIndex]; }

  beginHeroTurn() {
    // skip downed heroes
    let guard = 0;
    while (this.activeHero.downed && guard++ < this.heroes.length) {
      this.turnIndex = (this.turnIndex + 1) % this.heroes.length;
    }
    if (this.heroes.every((h) => h.downed)) return; // defeat already triggered
    const h = this.activeHero;
    // tick down spell cooldowns at the start of this hero's turn
    for (const k of Object.keys(h.spellsUsed)) {
      if (h.spellsUsed[k] > 0) h.spellsUsed[k]--;
      if (!h.spellsUsed[k]) delete h.spellsUsed[k];
    }
    this.turn = { movePoints: 0, rolledMove: false, attacked: false };
    if (this.mp?.active && this.mp.isHost) this.mp.broadcastState(this.serialize());
    this.engine.setMonsterFocus(h.id); // the monster turns to face whoever acts
    this.banner(`${this.heroDef(h).icon} ${this.heroDef(h).name}'s turn`);
    this.ui.setActiveHero(h.id);
    this.engine.highlightStones([]);
    this.engine.markActiveStone(h.stoneId);
    this.refreshActions();
  }

  refreshActions() {
    if (!this.turn) return;
    const h = this.activeHero;
    const def = this.heroDef(h);
    const onRing = h.stoneId?.startsWith('ring');
    const onDoor = h.stoneId?.startsWith('door');
    const doorDir = onDoor ? h.stoneId.slice(4) : null;
    const actions = [];
    actions.push({
      id: 'move', label: this.turn.rolledMove ? `🥾 ${this.turn.movePoints} left` : '🎲 Roll Move (d6)',
      disabled: this.turn.rolledMove && this.turn.movePoints <= 0,
      primary: !this.turn.rolledMove,
    });
    const cfg = this.cfgFor(h.id);
    if (this.inCombat) {
      for (const mv of cfg.moves.filter((m) => m.kind === 'attack')) {
        actions.push({
          id: 'attack', move: mv, label: `⚔ ${mv.name}`, color: mv.color,
          disabled: this.turn.attacked || !onRing,
          primary: onRing && !this.turn.attacked,
          hint: onRing ? null : 'step onto the inner ring',
        });
      }
      for (const mv of cfg.moves.filter((m) => m.kind === 'summon')) {
        const cd = h.spellsUsed[mv.id] || 0;
        actions.push({
          id: 'summon', move: mv, label: `🐉 ${mv.name}`, color: mv.color,
          disabled: cd > 0 || !!this.summon,
          hint: cd > 0 ? `recharging — ${cd} turn${cd === 1 ? '' : 's'}` : this.summon ? 'a transformation is active' : null,
        });
      }
    }
    // spells are usable in AND out of combat (Waygate travel, healing up...)
    const spells = [...cfg.moves.filter((m) => m.kind === 'spell'), ...this.partySpells()];
    if (spells.length) {
      const allCooling = spells.every((mv) => h.spellsUsed[mv.id] > 0);
      const soonest = Math.min(...spells.map((mv) => h.spellsUsed[mv.id] || 0).filter((n) => n > 0));
      actions.push({
        id: 'magic', label: '✦ Magic',
        disabled: allCooling,
        hint: allCooling ? `recharging — ${soonest} turn${soonest === 1 ? '' : 's'}` : null,
      });
    }
    if (doorDir && this.doorOpen(doorDir)) {
      actions.push({ id: 'exit', label: `🚪 Exit ${doorDir}`, primary: true, dir: doorDir });
    }
    actions.push({ id: 'end', label: '⏭ End Turn' });

    // multiplayer: only the hero's owner sees live controls
    const mine = this.isMyHero(h);
    if (mine) {
      this.ui.setActions(actions, (a) => this.doAction(a));
    } else {
      this.ui.setWaiting(`⏳ ${this.ownerOf(h.id) || 'Player'} — ${def.name}'s turn…`);
    }
    // movement highlights
    if (mine && this.turn.movePoints > 0) {
      this.engine.highlightStones(this.reachableNeighbors(h.stoneId));
    } else {
      this.engine.highlightStones([]);
      this.engine.markActiveStone(h.stoneId);
    }

    // nothing left to do (move spent, no attack/spell/exit)? pass the turn
    // (host-only online — guests never drive the game clock)
    if (this.mp?.active && !this.mp.isHost) return;

    // replay a remote press that arrived while we were animating
    if (this.mp?.active && this.mp.isHost && !this.busy && this._queuedIntent) {
      const q = this._queuedIntent;
      this._queuedIntent = null;
      setTimeout(() => this.handleIntent(q.msg, q.senderName), 30);
    }
    const hasOption = actions.some((a) => a.id !== 'end' && !a.disabled);
    if (this.turn.rolledMove && !hasOption && !this._autoEnding && !this.busy) {
      this._autoEnding = true;
      this.log(`⏭ ${def.name} has no actions left — the turn passes.`);
      setTimeout(async () => {
        this._autoEnding = false;
        if (this.turn && !this.busy) await this.endTurn();
      }, 900);
    }
  }

  reachableNeighbors(stoneId) {
    // all adjacent stones are legal — stepping onto an ally swaps places
    return this.engine.stoneById(stoneId)?.neighbors || [];
  }

  async doAction(action) {
    // guests: pick locally where needed, then send the intent to the host
    if (this.mp?.active && !this.mp.isHost) return this._guestAction(action);
    // host: block direct taps on heroes owned by connected remote players
    if (this.mp?.active && this.mp.isHost && !this._remoteAct && !this.isMyHero(this.activeHero)) return;
    if (this.busy) return;
    const h = this.activeHero;
    const def = this.heroDef(h);
    this.busy = true;
    try {
      switch (action.id) {
        case 'move': {
          if (this.turn.rolledMove) break;
          const r = await this.rollAnim(6, `${def.name} moves`);
          this.turn.rolledMove = true;
          this.turn.movePoints = r;
          this.log(`🎲 ${def.name} rolls <b>${r}</b> movement.`);
          this.save(); // sync move points to guests → their stone highlights
          break;
        }
        case 'attack':
          if (this.turn.attacked) break; // stale remote press — one attack per turn
          await this.heroAttack(action.move);
          break;
        case 'summon':
          await this.castSummon(action.move);
          break;
        case 'magic': {
          const cfg = this.cfgFor(h.id);
          const spells = [...cfg.moves.filter((m) => m.kind === 'spell'), ...this.partySpells()];
          const picked = await this.ui.showMagicMenu(spells.map((mv) => ({
            move: mv, spent: h.spellsUsed[mv.id] > 0, cooldown: h.spellsUsed[mv.id] || 0, desc: rulesDesc(mv),
          })));
          if (picked) await this.castSpell(picked);
          break;
        }
        case 'exit': { this.busy = false; await this.exitRoom(action.dir); return; }
        case 'end': { this.busy = false; await this.endTurn(); return; }
      }
    } finally {
      this.busy = false;
    }
    this.refreshActions();
  }

  /** Guest side of doAction — routes intents to the host. */
  async _guestAction(action) {
    const h = this.activeHero;
    if (!this.turn || !h || !this.isMyHero(h)) return;
    if (action.id === 'magic') {
      const cfg = this.cfgFor(h.id);
      const spells = [...cfg.moves.filter((m) => m.kind === 'spell'), ...this.partySpells()];
      const picked = await this.ui.showMagicMenu(spells.map((mv) => ({
        move: mv, spent: h.spellsUsed[mv.id] > 0, cooldown: h.spellsUsed[mv.id] || 0, desc: rulesDesc(mv),
      })));
      if (!picked) return;
      if (picked.effect === 'teleport') {
        const allowed = ROOMS.filter((r) => r.id !== 6 && r.id !== this.currentRoom).map((r) => r.id);
        const target = await this.ui.showRoomPicker(this, allowed);
        if (target == null) return;
        this.mp.sendIntent({ op: 'cast', moveId: picked.id, target });
      } else {
        this.mp.sendIntent({ op: 'cast', moveId: picked.id });
      }
      return;
    }
    this.mp.sendIntent({ op: action.id, moveId: action.move?.id, dir: action.dir });
  }

  /** Host: execute a validated action sent by a remote player. */
  handleIntent(msg, senderName) {
    if (!this.turn || this.over) return;
    // mid-animation? queue it (last press wins) instead of swallowing it —
    // a dropped tap feels like lag to the player who sent it
    if (this.busy) { this._queuedIntent = { msg, senderName }; return; }
    const h = this.activeHero;
    if (this.ownerOf(h.id) !== senderName) return; // not their hero's turn
    this._remoteAct = true;
    try {
      switch (msg.op) {
        case 'stone': this.stoneTapped(msg.id); break;
        case 'door': this.doorTapped(msg.dir); break;
        case 'move': case 'end': this.doAction({ id: msg.op }); break;
        case 'exit': this.doAction({ id: 'exit', dir: msg.dir }); break;
        case 'attack': {
          const mv = this.cfgFor(h.id).moves.find((m) => m.id === msg.moveId && m.kind === 'attack');
          if (mv) this.doAction({ id: 'attack', move: mv });
          break;
        }
        case 'cast': {
          if (this.busy) break;
          const all = [...this.cfgFor(h.id).moves, ...this.partySpells()];
          const mv = all.find((m) => m.id === msg.moveId && m.kind === 'spell');
          if (!mv || h.spellsUsed[mv.id] > 0) break;
          this.busy = true;
          this.castSpell(mv, { target: msg.target }).finally(() => {
            this.busy = false;
            if (this.turn) this.refreshActions();
          });
          break;
        }
        case 'summon': {
          if (this.busy) break;
          const mv = this.cfgFor(h.id).moves.find((m) => m.id === msg.moveId && m.kind === 'summon');
          if (!mv || h.spellsUsed[mv.id] > 0 || this.summon) break;
          this.busy = true;
          this.castSummon(mv).finally(() => {
            this.busy = false;
            if (this.turn) this.refreshActions();
          });
          break;
        }
      }
    } finally {
      this._remoteAct = false;
    }
  }

  stoneTapped(stoneId) {
    // returns true only when a move actually happened (engine uses this to
    // decide whether the tap was consumed or should fall through to a door)
    if (this.mp?.active && !this.mp.isHost) {
      if (this.turn && this.activeHero && this.isMyHero(this.activeHero)) this.mp.sendIntent({ op: 'stone', id: stoneId });
      return false;
    }
    if (this.mp?.active && this.mp.isHost && !this._remoteAct && this.activeHero && !this.isMyHero(this.activeHero)) return false;
    if (this.busy || !this.turn || this.turn.movePoints <= 0) return false;
    const h = this.activeHero;
    if (!this.reachableNeighbors(h.stoneId).includes(stoneId)) return false;
    const ally = this.heroes.find((x) => x !== h && x.stoneId === stoneId);
    if (ally) {
      ally.stoneId = h.stoneId;
      this.engine.moveHero(ally.id, ally.stoneId);
      this.log(`↔ ${this.heroDef(h).name} swaps places with ${this.heroDef(ally).name}.`);
    }
    h.stoneId = stoneId;
    this.turn.movePoints--;
    this.engine.moveHero(h.id, stoneId);
    this.save();
    this.refreshActions();
    return true;
  }

  doorTapped(dir) {
    if (this.mp?.active && !this.mp.isHost) {
      if (this.turn && this.activeHero && this.isMyHero(this.activeHero)) this.mp.sendIntent({ op: 'door', dir });
      return;
    }
    if (this.mp?.active && this.mp.isHost && !this._remoteAct && this.activeHero && !this.isMyHero(this.activeHero)) return;
    if (this.busy || !this.turn) return;
    const h = this.activeHero;
    if (h.stoneId === `door${dir}` && this.doorOpen(dir)) this.exitRoom(dir);
  }

  async exitRoom(dir) {
    if (this.busy) return;
    this.busy = true;
    const target = this.roomDef.exits[dir];
    this.log(`🚪 The party moves ${dirName(dir)}...`);
    await delay(300);
    this.busy = false;
    await this.enterRoom(target, OPPOSITE[dir]);
  }

  async endTurn() {
    this.turnIndex = (this.turnIndex + 1) % this.heroes.length;
    if (this.turnIndex === 0 && this.inCombat) {
      await this.monsterTurn();
      if (this.heroes.every((x) => x.downed)) return;
    }
    this.save();
    this.beginHeroTurn();
  }

  // ---------------------------------------------------------- hero combat
  async heroAttack(move) {
    const h = this.activeHero;
    const def = this.heroDef(h);
    const st = this.statsFor(h);
    const mDef = this.monsterDefFor(this.currentRoom);
    const rs = this.roomState;
    const style = ATTACK_STYLES[move?.style] || ATTACK_STYLES.balanced;
    const rules = rulesFor(move || { kind: 'attack' });
    const color = move?.color || def.color;
    const name = move?.name || 'Attack';
    const mAC = this.cfgForMonster(rs.monsterId).stats.ac;
    this.turn.attacked = true;

    const dice = (n) => { let s = 0; for (let i = 0; i < n; i++) s += roll(6); return s; };
    const bonuses = st.dmgBonus + h.dmgBoost + style.dmg + rules.dmgMod;
    const r = await this.rollAnim(20, `${def.name} — ${name}!`);
    const total = r + st.atk + style.hit + rules.hitMod;
    if (r === 1) {
      this.log(`💫 <b>Natural 1!</b> ${name} goes horribly wrong...`);
      await this.triggerTwist(h);
    } else if (r >= (rules.critOn ?? 20)) {
      const dmg = Math.max(1, dice(rules.dmgDice * 2) + bonuses); // crit: double dice
      await this.fxCast(h.id, color, 'attack');
      this.log(`💥 <b>CRITICAL HIT!</b> (rolled ${r}) ${name} deals <b>${dmg}</b> damage!`);
      await this.damageMonster(dmg, color);
      if (r === 20 && rs.hp > 0) await this.triggerBoon(h); // boons stay nat-20 only
    } else if (total >= mAC) {
      const dmg = Math.max(1, dice(rules.dmgDice) + bonuses);
      await this.fxCast(h.id, color, 'attack');
      this.log(`⚔ ${name} hits (${total} vs AC ${mAC}) for <b>${dmg}</b>.`);
      await this.damageMonster(dmg, color);
    } else {
      this.log(`🛡 ${name} misses (${total} vs AC ${mAC}).`);
    }
    this.save(); // sync attacked-flag to guests even on a miss
  }

  async castSpell(move, opts = {}) {
    const h = this.activeHero;
    const def = this.heroDef(h);
    if (h.spellsUsed[move.id] > 0) return;
    h.spellsUsed[move.id] = 3; // turns until it recharges
    const rules = rulesFor(move);
    this.log(`✦ ${def.name} casts <b>${move.name}</b>!`);

    switch (move.effect) {
      case 'heal': {
        const target = [...this.heroes].filter((x) => !x.downed).sort((p, q) => (p.hp / p.maxHp) - (q.hp / q.maxHp))[0];
        let amt = 0;
        for (let i = 0; i < rules.healDice; i++) amt += roll(6);
        target.hp = Math.min(target.maxHp, target.hp + amt);
        await this.fxCast(target.id, move.color, 'heal');
        this.log(`✚ ${move.name} restores <b>${amt}</b> HP to ${this.heroDef(target).name}.`);
        this.float(`+${amt}`, 'heal', move.color);
        break;
      }
      case 'ward': {
        h.acBonus = Math.max(h.acBonus, rules.acBonus);
        await this.fxCast(h.id, move.color, 'ward');
        this.log(`🛡 ${move.name} shields ${def.name} — +${rules.acBonus} armor this room.`);
        break;
      }
      case 'teleport': {
        const allowed = ROOMS.filter((r) => r.id !== 6 && r.id !== this.currentRoom).map((r) => r.id);
        const target = (opts.target != null && allowed.includes(opts.target))
          ? opts.target
          : (opts.target != null ? null : await this.ui.showRoomPicker(this, allowed));
        if (target == null) { delete h.spellsUsed[move.id]; break; } // cancelled — refund
        await this.fxCast(h.id, move.color, 'ward');
        this.log(`🌀 <b>${move.name}</b> tears open a waygate...`);
        await this.enterRoom(target, 'S');
        return; // enterRoom rebuilt the turn — skip the tail below
      }
      case 'deceive': {
        const rs = this.roomState;
        const mDef = this.monsterDefFor(this.currentRoom);
        const r = await this.rollAnim(20, `${def.name} casts ${move.name}!`);
        if (r === 1) { await this.triggerTwist(h); break; }
        if (!this.inCombat) { this.log(`🌀 ${move.name} swirls into empty air...`); break; }
        await this.fxCast(h.id, move.color, 'blast');
        if (r >= rules.threshold2) {
          rs.confusedTurns = Math.max(rs.confusedTurns || 0, rules.turns2);
          this.log(`😵 <b>${mDef.name} is deeply confused!</b> It will attack itself for <b>${rules.turns2}</b> turns.`);
        } else if (r >= rules.threshold1) {
          rs.confusedTurns = Math.max(rs.confusedTurns || 0, rules.turns1);
          this.log(`🌀 <b>${mDef.name} is confused!</b> It will attack itself for <b>${rules.turns1}</b> turn${rules.turns1 === 1 ? '' : 's'}.`);
        } else {
          this.log(`💨 ${mDef.name} shakes off the illusion (rolled ${r}).`);
        }
        this.ui.setMonsterBanner(mDef, rs);
        break;
      }
      default: { // blast
        const r = await this.rollAnim(20, `${def.name} casts ${move.name}!`);
        if (r === 1) { await this.triggerTwist(h); break; }
        const crit = r >= (rules.critOn ?? 20);
        const dmg = crit ? rules.hiDmg * 2 : (r >= rules.threshold ? rules.hiDmg : rules.loDmg);
        await this.fxCast(h.id, move.color, 'blast');
        if (crit) this.log(`💥 <b>CRITICAL!</b> (rolled ${r}) ${move.name} erupts for <b>${dmg}</b>!`);
        else this.log(`☄ ${move.name} ${r >= rules.threshold ? 'engulfs' : 'grazes'} the enemy for <b>${dmg}</b>!`);
        if (this.inCombat && dmg > 0) await this.damageMonster(dmg, move.color);
        break;
      }
    }
    this.ui.refreshParty(this.heroes.map((x) => ({ ...x, def: this.heroDef(x) })));
    this.save();
  }

  /** Summon move: d20 ritual that calls a monster to fight for the party. */
  async castSummon(mv) {
    const h = this.activeHero;
    const def = this.heroDef(h);
    if (h.spellsUsed[mv.id] > 0 || this.summon || !this.inCombat) return;
    const rules = rulesFor(mv);
    const mDef = MONSTERS.find((m) => m.id === mv.monsterId) || MONSTERS[0];
    h.spellsUsed[mv.id] = rules.cooldown; // the rite exhausts you, success or not
    this.log(`🐉 ${def.name} performs <b>${mv.name}</b> — calling on ${mDef.name}...`);
    const r = await this.rollAnim(20, `${def.name} — ${mv.name}!`);
    if (r === 1) { await this.triggerTwist(h); this.save(); return; }
    if (r >= rules.threshold) {
      this.summon = { moveId: mv.id, monsterId: mDef.id, heroId: h.id, turnsLeft: rules.turns, color: mv.color };
      await this.fxCast(h.id, mv.color, 'ward');
      await this.engine.morphHero(h.id, mDef, mv.color);
      this.log(`🐉 <b>${def.name} transforms into ${mDef.name}!</b> The form holds for <b>${rules.turns}</b> round${rules.turns === 1 ? '' : 's'}.`);
      this.banner(`${mDef.icon} ${def.name} becomes ${mDef.name}!`);
    } else {
      this.log(`💨 The summoning fizzles (rolled ${r}, needed ${rules.threshold}).`);
      this.float('Fizzle!', 'miss', mv.color);
    }
    this.save();
  }

  /** The transformed hero strikes at the start of the monster's turn. */
  async summonStrike() {
    if (!this.summon || !this.inCombat) return;
    const rs = this.roomState;
    const mDef = this.monsterDefFor(this.currentRoom);
    const sDef = MONSTERS.find((m) => m.id === this.summon.monsterId);
    const caster = this.heroes.find((x) => x.id === this.summon.heroId);
    const casterName = caster ? this.heroDef(caster).name : 'The hero';
    if (!sDef || !caster || caster.downed) { // a fallen caster can't hold the form
      this.summon = null;
      this.engine.unmorphHero();
      if (caster?.downed) this.log(`💨 The summoning breaks — ${casterName} returns to their own form.`);
      this.save();
      return;
    }
    const { dmgLo, dmgHi } = defaultMonsterConfig(sDef).stats;
    const dmg = Math.max(1, dmgLo + Math.floor(Math.random() * (Math.max(dmgHi, dmgLo) - dmgLo + 1)));
    this.fxSummonStrike();
    await delay(450);
    rs.hp = Math.max(0, rs.hp - dmg);
    this.float(`-${dmg}`, 'dmg', this.summon.color);
    this.summon.turnsLeft--;
    this.log(`🐉 ${casterName} — as <b>${sDef.name}</b> — savages ${mDef.name} for <b>${dmg}</b>!`);
    this.ui.setMonsterBanner(mDef, rs);
    if (this.summon.turnsLeft <= 0) {
      this.summon = null;
      this.engine.unmorphHero();
      this.log(`✨ The form dissolves — ${casterName} is themself again.`);
    }
    this.save();
    if (rs.hp <= 0) await this.roomCleared();
  }

  async damageMonster(dmg, color) {
    const rs = this.roomState;
    const mDef = this.monsterDefFor(this.currentRoom);
    rs.hp = Math.max(0, rs.hp - dmg);
    this.engine.punchMonster();
    this.float(`-${dmg}`, 'dmg', color);
    this.ui.setMonsterBanner(mDef, rs);
    if (rs.hp <= 0) await this.roomCleared();
    this.save();
  }

  // ---------------------------------------------------------- monster turn
  async monsterTurn() {
    const rs = this.roomState;
    const mDef = this.monsterDefFor(this.currentRoom);
    if (!this.inCombat) return;
    this.banner(`${mDef.icon} ${mDef.name}'s turn`, true);
    await delay(700);

    // a summoned ally gets its blow in first — it may even finish the fight
    if (this.summon) {
      await this.summonStrike();
      if (!this.inCombat) return; // the summon slew the monster
      await delay(400);
    }

    const mCfg = this.cfgForMonster(rs.monsterId);

    // confused monsters attack themselves instead
    if (rs.confusedTurns > 0) {
      rs.confusedTurns--;
      const { dmgLo, dmgHi } = mCfg.stats;
      const dmg = Math.max(1, dmgLo + Math.floor(Math.random() * (Math.max(dmgHi, dmgLo) - dmgLo + 1)));
      await delay(500);
      this.engine.punchMonster();
      rs.hp = Math.max(0, rs.hp - dmg);
      this.float(`-${dmg}`, 'dmg');
      this.log(`😵 Dazed by illusions, <b>${mDef.name}</b> savages itself for <b>${dmg}</b>!${rs.confusedTurns > 0 ? ` (confused for ${rs.confusedTurns} more)` : ''}`);
      this.ui.setMonsterBanner(mDef, rs);
      this.save();
      if (rs.hp <= 0) await this.roomCleared();
      return;
    }

    const mAttacks = mCfg.moves.filter((m) => m.kind === 'attack');
    const attacks = mDef.attacks || 1;
    for (let i = 0; i < attacks; i++) {
      const targets = this.heroes.filter((h) => !h.downed);
      if (!targets.length) break;
      const target = targets[Math.floor(Math.random() * targets.length)];
      const tDef = this.heroDef(target);
      const move = mAttacks[Math.floor(Math.random() * mAttacks.length)] || { name: 'Savage Strike', color: mDef.color, style: 'balanced' };
      const style = ATTACK_STYLES[move.style] || ATTACK_STYLES.balanced;
      this.engine.setMonsterFocus(target.id); // glare at the victim
      const r = await this.rollAnim(20, `${mDef.name} — ${move.name}!`);
      const total = r + mCfg.stats.atk + style.hit;
      const ac = this.statsFor(target).ac + (target.acBonus || 0);
      if (r === 20 || (r !== 1 && total >= ac)) {
        const { dmgLo, dmgHi } = mCfg.stats;
        let dmg = Math.max(1, dmgLo + Math.floor(Math.random() * (Math.max(dmgHi, dmgLo) - dmgLo + 1)) + style.dmg);
        if (r === 20) { dmg *= 2; this.log(`💥 <b>CRITICAL!</b>`); }
        await this.fxMonster(target.id, move.color);
        target.hp = Math.max(0, target.hp - dmg);
        this.log(`🩸 ${mDef.name}'s ${move.name} hits ${tDef.name} for <b>${dmg}</b>.`);
        this.float(`-${dmg}`, 'dmg', move.color);
        if (target.hp <= 0 && !target.downed) {
          target.downed = true;
          this.engine.setHeroDowned(target.id, true);
          this.log(`☠ <b>${tDef.name} falls!</b>`);
        }
      } else {
        this.log(`💨 ${move.name} misses ${tDef.name} (${total} vs AC ${ac}).`);
      }
      this.ui.refreshParty(this.heroes.map((x) => ({ ...x, def: this.heroDef(x) })));
      await delay(350);
    }
    this.save();
    if (this.heroes.every((h) => h.downed)) await this.partyWiped();
  }

  /** The whole party has fallen — spend a life (or end the run). */
  async partyWiped() {
    if (this.over) return;
    const d = this.difficulty;
    if (d.lives !== Infinity) {
      this.lives--;
      if (this.lives <= 0) { this.defeat(); return; }
    }
    await this.modal({
      icon: d.lives === Infinity ? '📖' : '💫',
      title: d.lives === Infinity
        ? 'The story goes on...'
        : `${this.lives} ${this.lives === 1 ? 'life' : 'lives'} remaining`,
      text: 'Darkness takes the party... then a distant drumbeat calls them back. The heroes rise again, battered but breathing.',
    });
    for (const h of this.heroes) {
      h.downed = false;
      h.hp = Math.ceil(h.maxHp * 0.5);
      this.engine.setHeroDowned(h.id, false);
    }
    this.log(`💫 <b>The party rises again!</b>${d.lives === Infinity ? '' : ` (${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left)`}`);
    this.ui.setLives(this.lives, this.campaign.difficulty || 'medium');
    this.ui.refreshParty(this.heroes.map((x) => ({ ...x, def: this.heroDef(x) })));
    this.save();
  }

  // ---------------------------------------------------------- events
  async triggerTwist(hero) {
    const twist = TWISTS[Math.floor(Math.random() * TWISTS.length)];
    await this.modal(twist);
    await this.applyEffect(twist.effect, hero);
  }

  async triggerBoon(hero) {
    const boon = BOONS[Math.floor(Math.random() * BOONS.length)];
    await this.modal(boon);
    await this.applyEffect(boon.effect, hero);
  }

  async applyEffect(fx, hero) {
    const def = this.heroDef(hero);
    if (fx.dmgSelf) {
      hero.hp = Math.max(0, hero.hp - fx.dmgSelf);
      this.log(`🩸 ${def.name} takes <b>${fx.dmgSelf}</b>.`);
      if (hero.hp <= 0) { hero.downed = true; this.engine.setHeroDowned(hero.id, true); this.log(`☠ <b>${def.name} falls!</b>`); }
    }
    if (fx.dmgParty) for (const h of this.heroes.filter((x) => !x.downed)) {
      h.hp = Math.max(0, h.hp - fx.dmgParty);
      if (h.hp <= 0) { h.downed = true; this.engine.setHeroDowned(h.id, true); }
    }
    if (fx.healSelf) hero.hp = Math.min(hero.maxHp, hero.hp + fx.healSelf);
    if (fx.healParty) for (const h of this.heroes.filter((x) => !x.downed)) h.hp = Math.min(h.maxHp, h.hp + fx.healParty);
    if (fx.healMonster && this.roomState && this.roomState.hp > 0) {
      this.roomState.hp = Math.min(this.roomState.maxHp, this.roomState.hp + fx.healMonster);
      this.ui.setMonsterBanner(this.monsterDefFor(this.currentRoom), this.roomState);
    }
    this.ui.refreshParty(this.heroes.map((x) => ({ ...x, def: this.heroDef(x) })));
    if (this.heroes.every((h) => h.downed)) await this.partyWiped();
    this.save();
  }

  // ---------------------------------------------------------- outcomes
  async roomCleared() {
    const rs = this.roomState;
    const mDef = this.monsterDefFor(this.currentRoom);
    rs.cleared = true;
    this.engine.killMonster();
    this.ui.setMonsterBanner(null, null);
    if (this.summon) { // the fight is over — return to your own form
      this.summon = null;
      this.engine.unmorphHero();
    }

    if (rs.isBoss) { this.victory(); return; }

    this.cleared = Object.values(this.rooms).filter((r) => r.cleared && !r.isBoss).length;
    this.ui.setRoomTitle(this.roomDef.name, this.cleared);
    this.log(`🏆 <b>${mDef.name} is defeated!</b> (${this.cleared}/5 monsters slain)`);

    // rally: revive the fallen, heal the standing
    for (const h of this.heroes) {
      if (h.downed) {
        h.downed = false;
        h.hp = Math.ceil(h.maxHp * 0.3);
        this.engine.setHeroDowned(h.id, false);
        this.log(`✚ ${this.heroDef(h).name} is back on their feet.`);
      } else {
        h.hp = Math.min(h.maxHp, h.hp + ROOM_REWARD_HEAL);
      }
      h.spellsUsed = {};
      h.acBonus = 0;
    }
    this.ui.refreshParty(this.heroes.map((x) => ({ ...x, def: this.heroDef(x) })));

    // unlock doors
    for (const dir of Object.keys(this.roomDef.exits)) {
      this.engine.setDoorState(dir, this.doorOpen(dir) ? 'open' : 'locked');
    }
    if (this.cleared === 5) {
      this.log(`🔥 <b>A distant rumble... the door to the Final Sanctum grinds open!</b>`);
    }

    // side-character quest: appearance + relic collection
    await this.maybeStartQuest();
    if (this.quest?.status === 'offered' && this.currentRoom === this.quest.itemRoom) {
      await this.collectQuestItem();
    }

    this.save();
    this.refreshActions();
  }

  // ---------------------------------------------------------- relic quest
  _sideDef() {
    return {
      model: this.quest?.file ? `models/side-characters/${this.quest.file}` : null,
      color: this.quest?.color || '#ffd76a',
    };
  }

  /** Usually after the 3rd kill (always by the 4th), a side character appears. */
  async maybeStartQuest() {
    if (this.quest || this.roomDef.kind !== 'monster') return;
    const chance = this.cleared === 3 ? 0.7 : this.cleared === 4 ? 1 : 0;
    if (Math.random() > chance) return;
    const files = await sideCharacterFiles().catch(() => []);
    const file = files.length ? files[Math.floor(Math.random() * files.length)] : null;
    const candidates = [1, 2, 3, 4, 5].filter((r) => r !== this.currentRoom);
    const itemRoom = candidates[Math.floor(Math.random() * candidates.length)];
    const boss = BOSSES.find((b) => b.id === this.campaign.bossId);
    const roomName = ROOMS[itemRoom].name;

    // persona: hand-written character if we know this model, else generic
    const persona = (file && SIDE_PERSONAS[file]) || null;
    const name = persona?.name || (file ? file.replace(/\.glb$/i, '').replace(/[-_]+/g, ' ') : 'Mysterious Stranger');
    const item = persona?.item || QUEST_ITEMS[Math.floor(Math.random() * QUEST_ITEMS.length)];
    const sub = (s) => s.replaceAll('{room}', roomName);
    const dialog = persona
      ? { offered: sub(persona.offered), reminder: sub(persona.reminder), thanks: persona.thanks }
      : {
          offered: `"Heroes — I have waited long for you. Seek the ${item.name}: it lies in ${roomName}. Claim it, and you will wield magic fit to fell ${boss.name} — and the power to walk the ways between these rooms."`,
          reminder: `"The ${item.name} waits in ${roomName}. Go — before the dark claims it first."`,
          thanks: `"You have it! Wield the relic's magic well, heroes — and may the waygates carry you swiftly."`,
        };

    this.quest = {
      status: 'offered', file, name, spawnRoom: this.currentRoom, itemRoom, item,
      icon: persona?.icon || item.icon, color: persona?.color || '#ffd76a',
      surgeName: persona?.surgeName || null, dialog,
    };
    await this.engine.spawnSideCharacter(this._sideDef());
    await this.modal({ icon: this.quest.icon, title: name, text: dialog.offered });
    this.log(`🧭 <b>Quest:</b> find <b>${item.name}</b> in <b>${roomName}</b>!`);
    this.save();
  }

  async collectQuestItem() {
    if (this.quest?.status !== 'offered') return;
    this.quest.status = 'collected';
    this.engine.removeQuestItem();
    await this.modal({
      icon: this.quest.item.icon,
      title: `${this.quest.item.name} claimed!`,
      text: `Power floods through the party! Everyone learns ${this.quest.surgeName || 'Relic Surge'} and Waygate — find them in the ✦ Magic menu. Waygate can carry the party to any room except the Final Sanctum.`,
    });
    this.log(`✨ The party claims the <b>${this.quest.item.name}</b> — new magic learned!`);
    this.save();
    if (this.turn) this.refreshActions();
  }

  sideCharacterTapped() {
    if (!this.quest) return;
    const line = this.quest.status === 'offered'
      ? (this.quest.dialog?.reminder || `"The ${this.quest.item.name} waits in ${ROOMS[this.quest.itemRoom].name}."`)
      : (this.quest.dialog?.thanks || `"You have it! Wield the relic's magic well, heroes."`);
    this.modal({ icon: this.quest.icon || this.quest.item.icon, title: this.quest.name, text: line });
  }

  /** Spells every hero knows once the relic is claimed. */
  partySpells() {
    if (this.quest?.status !== 'collected') return [];
    // the damage spell takes the side character's flavor (Reaper's Edge...)
    return QUEST_SPELLS.map((s) =>
      s.id === 'quest_surge' && this.quest.surgeName ? { ...s, name: this.quest.surgeName } : s);
  }

  victory() {
    const boss = BOSSES.find((b) => b.id === this.campaign.bossId);
    this.over = true;
    Game.clearSave();
    const text = `${boss.name} crumbles to dust. <b>${this.campaign.name}</b> is conquered — the dungeon is yours, heroes!`;
    if (this.mp?.active) this.mp.broadcastEv({ ev: 'end', won: true, text });
    this.ui.showEnd(true, text);
  }

  defeat() {
    this.over = true;
    Game.clearSave();
    const text = `The party has fallen in <b>${this.roomDef.name}</b>. The dungeon claims another band of heroes...`;
    if (this.mp?.active) this.mp.broadcastEv({ ev: 'end', won: false, text });
    this.ui.showEnd(false, text);
  }
}

function dirName(d) { return { N: 'north', S: 'south', E: 'east', W: 'west' }[d]; }
