// ============================================================
//  DESIGNER — step-by-step campaign creation wizard
//  Name → Realm → Party → Monsters → Boss → Review
//  Party/Monsters/Boss share the "stage" layout: editor on the
//  left, a big 3D preview dominating centre-right, and a
//  character-switcher strip along the bottom.
// ============================================================
import {
  THEMES, ROOM_THEMES, HEROES, MONSTERS, BOSSES,
  MOVE_COLORS, ATTACK_STYLES, SPELL_EFFECTS, DIFFICULTIES,
  ATTACK_CAP, SPELL_CAP, RULE_FIELDS, rulesFor, rulesDesc, defaultRulesFor,
  defaultHeroConfig, defaultMonsterConfig, mainAttackColor, newMoveId,
} from './data.js';
import { Preview3D } from './preview3d.js';

const $ = (id) => document.getElementById(id);

const STEPS = [
  { id: 'name', title: 'Name Your Campaign', flavor: 'Every legend begins with a name — and a price.' },
  { id: 'theme', title: 'Choose Your Realm', flavor: 'The look of all seven rooms.' },
  { id: 'heroes', title: 'Assemble Your Party', flavor: 'Pick 1–4 heroes. Tune their stats, attacks and spells.' },
  { id: 'monsters', title: 'Summon the Monsters', flavor: 'Pick 5 — one per room. Make them as cruel as you dare.' },
  { id: 'boss', title: 'Crown the Final Boss', flavor: 'It waits behind the sealed door of Room 7.' },
  { id: 'review', title: 'The Adventure Awaits', flavor: 'One last look before the descent.' },
];

const NAME_A = ['Ember', 'Shadow', 'Bone', 'Crimson', 'Forgotten', 'Screaming', 'Sunken', 'Molten', 'Whispering', 'Cursed', 'Gilded', 'Frozen'];
const NAME_B = ['Crypts', 'Depths', 'Sanctum', 'Catacombs', 'Forge', 'Labyrinth', 'Hollows', 'Vaults', 'Spire', 'Warrens', 'Tombs', 'Abyss'];

const HERO_STATS = [
  { key: 'hp', label: '❤ Health', min: 10, max: 60 },
  { key: 'ac', label: '🛡 Armor', min: 8, max: 20 },
  { key: 'atk', label: '⚔ Attack Bonus', min: 0, max: 10 },
  { key: 'dmgBonus', label: '💥 Damage Bonus', min: 0, max: 8 },
];
const MONSTER_STATS = [
  { key: 'hp', label: '❤ Health', min: 8, max: 120 },
  { key: 'ac', label: '🛡 Armor', min: 8, max: 20 },
  { key: 'atk', label: '⚔ Attack Bonus', min: 0, max: 10 },
  { key: 'dmgLo', label: '💥 Damage Min', min: 1, max: 15 },
  { key: 'dmgHi', label: '💥 Damage Max', min: 1, max: 15 },
];

export class Designer {
  constructor() {
    this.previewCanvas = document.createElement('canvas');
    this.previewCanvas.id = 'wizard-preview';
    this.preview = null; // lazy — first WebGL context on demand
  }

  open(onComplete, opts = {}) {
    this.onComplete = onComplete;
    this.heroCap = opts.heroCap ?? 4;   // multiplayer host picks just their own
    this.pickMode = null;
    this.lockedHeroIds = [];
    this.step = 0;
    this.state = {
      name: '',
      difficulty: 'medium',
      themeId: THEMES[0].id,
      heroIds: [],
      heroConfig: {},
      monsterIds: [],
      bossId: null,
      monsterConfig: {},
      focusHero: HEROES[0].id,
      focusMonster: MONSTERS[0].id,
      focusBoss: BOSSES[0].id,
    };
    this.render();
  }

  /** Guest flow: pick + customize exactly one hero, then Ready.
   *  After readying up they can keep flipping forward to browse the
   *  monsters and bosses (read-only) while the host finishes designing. */
  openHeroPick(lockedIds, onReady, onExit) {
    this.onComplete = null;
    this.heroCap = 1;
    this.pickMode = { onReady, onExit };
    this.lockedHeroIds = lockedIds || [];
    this.step = 2; // the heroes stage
    // returning to change hero? keep their customizations
    const prev = this.state;
    const keptHero = prev?.heroIds?.find?.((id) => !this.lockedHeroIds.includes(id));
    this.state = {
      name: '-', difficulty: 'medium', themeId: THEMES[0].id,
      heroIds: keptHero ? [keptHero] : [], heroConfig: prev?.heroConfig || {},
      monsterIds: [], bossId: null, monsterConfig: {},
      focusHero: keptHero || HEROES.find((h) => !this.lockedHeroIds.includes(h.id))?.id || HEROES[0].id,
      focusMonster: MONSTERS[0].id, focusBoss: BOSSES[0].id,
    };
    this.render();
  }

  /** Guest past the hero step — read-only bestiary pages. */
  get browsing() { return !!this.pickMode && STEPS[this.step]?.id !== 'heroes'; }

  /** Live "hero taken" updates while a pick screen is open. */
  updateLocks(lockedIds) {
    this.lockedHeroIds = lockedIds || [];
    if (this.pickMode && this._stage) this.refreshStage();
  }

  cfgForHero(id) {
    if (!this.state.heroConfig[id]) this.state.heroConfig[id] = defaultHeroConfig(HEROES.find((h) => h.id === id));
    return this.state.heroConfig[id];
  }

  cfgForMonster(id) {
    if (!this.state.monsterConfig[id]) {
      const def = MONSTERS.find((m) => m.id === id) || BOSSES.find((b) => b.id === id);
      this.state.monsterConfig[id] = defaultMonsterConfig(def);
    }
    return this.state.monsterConfig[id];
  }

  // ---------------------------------------------------------- validation
  stepError() {
    const s = this.state;
    if (this.browsing) return null; // read-only pages are always "valid"
    switch (STEPS[this.step].id) {
      case 'name': return s.name.trim() ? null : 'Give your campaign a name.';
      case 'theme': return s.themeId ? null : 'Choose a realm.';
      case 'heroes':
        if (this.heroCap === 1) return s.heroIds.length === 1 ? null : 'Choose your hero.';
        return s.heroIds.length ? null : 'Choose at least one hero.';
      case 'monsters': return s.monsterIds.length === 5 ? null : `Choose ${5 - s.monsterIds.length} more monster${5 - s.monsterIds.length === 1 ? '' : 's'}.`;
      case 'boss': return s.bossId ? null : 'Choose a final boss.';
      default: return null;
    }
  }

  // ---------------------------------------------------------- render shell
  render() {
    const step = STEPS[this.step];
    const PICK_HEADS = {
      heroes: ['Choose Your Hero', 'Pick one hero and make them yours — stats, attacks, spells.'],
      monsters: ['Meet the Monsters', 'A look at what may lurk below — the host picks the final five.'],
      boss: ['The Final Bosses', 'One of these will seal the last door.'],
    };
    $('wizard-step-title').textContent = this.pickMode ? PICK_HEADS[step.id][0] : step.title;
    $('wizard-step-flavor').textContent = this.pickMode
      ? PICK_HEADS[step.id][1]
      : (this.heroCap === 1 && step.id === 'heroes' ? 'Pick YOUR hero — the rest of the party joins in the lobby.' : step.flavor);
    $('wizard-dots').innerHTML = this.pickMode ? '' : STEPS.map((s, i) =>
      `<span class="wiz-dot ${i === this.step ? 'now' : ''} ${i < this.step ? 'done' : ''}"></span>`).join('');

    const body = $('wizard-body');
    const stage = ['heroes', 'monsters', 'boss'].includes(step.id);
    body.className = `wizard-body step-${step.id} ${stage ? 'stage-step' : ''}`;
    switch (step.id) {
      case 'name': this.renderName(body); break;
      case 'theme': this.renderTheme(body); break;
      case 'heroes':
        this.renderStage(body, {
          list: HEROES, isMonster: false, cap: this.heroCap, single: false, ordered: false,
          stateKey: 'heroIds', focusKey: 'focusHero',
          cfgFor: (id) => this.cfgForHero(id),
          defaults: (def) => defaultHeroConfig(def),
          statFields: HERO_STATS, allowSpells: true,
          addLabel: this.heroCap === 1 ? '⚔ This is my hero' : '+ Add to Party',
          pickedLabel: (n) => (this.heroCap === 1 ? `Your Hero ${n}/1` : `Party ${n}/4`),
        });
        break;
      case 'monsters':
        this.renderStage(body, {
          list: MONSTERS, isMonster: true, cap: 5, single: false, ordered: true,
          stateKey: 'monsterIds', focusKey: 'focusMonster',
          cfgFor: (id) => this.cfgForMonster(id),
          defaults: (def) => defaultMonsterConfig(def),
          statFields: MONSTER_STATS, allowSpells: false, browse: this.browsing,
          addLabel: '+ Add to Lineup', pickedLabel: (n) => `Lineup ${n}/5`,
        });
        break;
      case 'boss':
        this.renderStage(body, {
          list: BOSSES, isMonster: true, cap: 1, single: true, ordered: false,
          stateKey: 'bossId', focusKey: 'focusBoss',
          cfgFor: (id) => this.cfgForMonster(id),
          defaults: (def) => defaultMonsterConfig(def),
          statFields: MONSTER_STATS, allowSpells: false, browse: this.browsing,
          addLabel: '👑 Crown as Boss', pickedLabel: () => 'Final Boss',
        });
        break;
      case 'review': this.renderReview(body); break;
    }
    this.renderFooter();
  }

  renderFooter() {
    const err = this.stepError();
    const last = this.step === STEPS.length - 1;
    $('wizard-validation').textContent = this.browsing ? '👁 just looking' : (err || (last ? '' : '✓'));
    $('wizard-validation').classList.toggle('ok', !err && !this.browsing);
    $('btn-wiz-back').style.visibility = (this.step === 0 || (this.pickMode && !this.browsing)) ? 'hidden' : 'visible';
    const next = $('btn-wiz-next');
    if (this.pickMode) {
      const id = STEPS[this.step].id;
      next.textContent = id === 'heroes' ? '✓ Ready ›' : id === 'monsters' ? 'The Bosses ›' : '↩ Back to Lobby';
      next.classList.toggle('btn-begin', id === 'heroes');
    } else {
      next.textContent = last ? '⚑ Begin the Descent' : 'Next ›';
      next.classList.toggle('btn-begin', last);
    }
    next.disabled = !!err;
  }

  next() {
    if (this.pickMode) {
      const id = STEPS[this.step].id;
      if (id === 'heroes') {
        if (this.stepError()) return;
        const heroId = this.state.heroIds[0];
        // ready up, then pass the wait browsing the bestiary
        this.pickMode.onReady({ heroId, config: this.cfgForHero(heroId) });
        this.go(1);
      } else if (id === 'monsters') {
        this.go(1);
      } else {
        this.pickMode.onExit?.();
      }
      return;
    }
    if (this.step === STEPS.length - 1) this.finish();
    else this.go(1);
  }

  go(delta) {
    const n = this.step + delta;
    if (n < 0 || n >= STEPS.length) return;
    if (this.pickMode && (n < 2 || n > 4)) return; // guests: heroes ↔ monsters ↔ boss only
    if (delta > 0 && this.stepError()) return;
    this.step = n;
    this.render();
  }

  finish() {
    if (this.stepError()) return;
    const s = this.state;
    const heroConfig = {};
    for (const id of s.heroIds) heroConfig[id] = this.cfgForHero(id);
    const monsterConfig = {};
    for (const id of [...s.monsterIds, s.bossId]) monsterConfig[id] = this.cfgForMonster(id);
    this.onComplete({
      name: s.name.trim(), themeId: s.themeId, difficulty: s.difficulty,
      heroIds: [...s.heroIds], monsterIds: [...s.monsterIds], bossId: s.bossId,
      heroConfig, monsterConfig,
    });
  }

  // ---------------------------------------------------------- step: name
  renderName(body) {
    body.innerHTML = `
      <div class="wiz-name-wrap">
        <div class="wiz-name-emblem">⬢</div>
        <div class="wiz-name-row">
          <input id="wiz-name-input" class="text-input big" type="text" maxlength="32"
                 placeholder="e.g. The Ember Crypts" value="${escapeHtml(this.state.name)}" />
          <button id="btn-roll-name" class="btn btn-ghost dice-btn" title="Roll a name">🎲</button>
        </div>
        <p class="hint centered">Tap the die to let fate decide.</p>
        <div class="wiz-diff">
          <p class="diff-label">Difficulty</p>
          <div class="diff-pills">
            ${Object.values(DIFFICULTIES).map((d) => `
              <button class="diff-pill ${this.state.difficulty === d.id ? 'on' : ''}" data-diff="${d.id}">
                <span class="diff-icon">${d.icon}</span>
                <span class="diff-name">${d.name}</span>
                <span class="diff-desc">${d.desc}</span>
              </button>`).join('')}
          </div>
        </div>
      </div>`;
    body.querySelectorAll('.diff-pill').forEach((p) => p.addEventListener('click', () => {
      this.state.difficulty = p.dataset.diff;
      body.querySelectorAll('.diff-pill').forEach((x) => x.classList.toggle('on', x === p));
    }));
    $('wiz-name-input').addEventListener('input', (e) => {
      this.state.name = e.target.value;
      this.renderFooter();
    });
    $('btn-roll-name').addEventListener('click', () => {
      const name = `The ${pick(NAME_A)} ${pick(NAME_B)}`;
      this.state.name = name;
      $('wiz-name-input').value = name;
      $('wiz-name-input').classList.remove('rolled');
      void $('wiz-name-input').offsetWidth;
      $('wiz-name-input').classList.add('rolled');
      this.renderFooter();
    });
  }

  // ---------------------------------------------------------- step: theme
  renderTheme(body) {
    body.innerHTML = `<div class="card-grid themes big-tiles">${THEMES.map((t) => `
      <button class="card theme-card ${t.id === this.state.themeId ? 'selected' : ''}" data-id="${t.id}">
        <span class="theme-swatch tall" style="background:
          radial-gradient(circle at 50% 45%, ${t.glow}33, transparent 60%),
          linear-gradient(160deg, ${t.swatch[0]} 55%, ${t.swatch[1]})">
          <span class="theme-ring" style="border-color:${t.accent}"></span>
        </span>
        <span class="card-name">${t.icon} ${t.name}</span>
        <span class="card-desc">${t.desc}</span>
      </button>`).join('')}</div>`;
    body.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => {
      this.state.themeId = c.dataset.id;
      body.querySelectorAll('.card').forEach((x) => x.classList.toggle('selected', x === c));
      this.renderFooter();
    }));
  }

  // ---------------------------------------------------------- stage steps
  // Big 3D preview centre-right, editor on the left, switcher strip below.
  renderStage(body, opts) {
    body.innerHTML = `
      <div class="wiz-stage">
        <div class="wiz-left"><div id="stage-panel"></div></div>
        <div class="wiz-main">
          <div id="preview-slot" class="preview-slot main-event"></div>
          <div id="stage-name-tag" class="stage-name-tag"></div>
        </div>
        <div class="wiz-bottom">
          <div id="picked-row" class="picked-row slim"></div>
          <div id="stage-roster" class="roster-strip"></div>
        </div>
      </div>`;
    this._stage = opts;
    this.mountPreview();
    this.refreshStage();
    this.showFocused();
  }

  chosenIds(opts) {
    const v = this.state[opts.stateKey];
    return opts.single ? (v ? [v] : []) : v;
  }

  showFocused() {
    const opts = this._stage;
    const def = opts.list.find((x) => x.id === this.state[opts.focusKey]);
    const cfg = opts.cfgFor(def.id);
    this.preview?.show(def, opts.isMonster, mainAttackColor(cfg, def.color));
    $('stage-name-tag').innerHTML = `<span style="color:${def.color}">${def.icon}</span> ${def.name}`;
  }

  refreshStage() {
    const opts = this._stage;
    const s = this.state;
    const chosen = this.chosenIds(opts);

    // picked chips (browse mode: guests just window-shop the bestiary)
    if (opts.browse) {
      $('picked-row').innerHTML = `<span class="picked-empty">👁 Bestiary preview — the host picks the lineup and may tweak it before the descent.</span>`;
    } else
    $('picked-row').innerHTML =
      `<span class="picked-label">${opts.pickedLabel(chosen.length)}:</span>` +
      (chosen.length
        ? chosen.map((id, i) => {
          const d = opts.list.find((x) => x.id === id);
          return `<button class="picked-chip" data-id="${id}"><span style="color:${d.color}">${d.icon}</span> ${opts.ordered ? `R${i + 1} ` : ''}${d.name} ✕</button>`;
        }).join('')
        : `<span class="picked-empty">tap a card below, twice to choose</span>`);
    $('picked-row').querySelectorAll('.picked-chip').forEach((c) => c.addEventListener('click', () => {
      this.setChosen(c.dataset.id, false);
      this.refreshStage();
      this.renderFooter();
    }));

    // bottom switcher strip (locked = taken by another online player)
    const locked = (id) => !opts.isMonster && this.lockedHeroIds.includes(id);
    $('stage-roster').innerHTML = opts.list.map((d) => `
      <button class="roster-card ${chosen.includes(d.id) ? 'selected' : ''} ${s[opts.focusKey] === d.id ? 'focused' : ''} ${locked(d.id) ? 'locked' : ''}" data-id="${d.id}">
        <span class="roster-icon" style="color:${d.color}">${d.icon}</span>
        <span class="roster-name">${d.name}</span>
        ${locked(d.id) ? `<span class="roster-badge">🔒</span>` :
          opts.ordered && chosen.includes(d.id) ? `<span class="roster-badge">R${chosen.indexOf(d.id) + 1}</span>` :
          !opts.ordered && chosen.includes(d.id) ? `<span class="roster-badge">✓</span>` : ''}
      </button>`).join('');
    $('stage-roster').querySelectorAll('.roster-card').forEach((c) => c.addEventListener('click', () => {
      const id = c.dataset.id;
      const wasFocused = s[opts.focusKey] === id;
      s[opts.focusKey] = id;
      if (wasFocused && !opts.browse) this.setChosen(id, !chosen.includes(id)); // 2nd tap toggles
      this.refreshStage();
      this.renderFooter();
      this.showFocused();
    }));

    this.renderStagePanel();
  }

  setChosen(id, add) {
    const opts = this._stage;
    if (opts.single) {
      this.state[opts.stateKey] = add ? id : (this.state[opts.stateKey] === id ? null : this.state[opts.stateKey]);
    } else {
      const arr = this.state[opts.stateKey];
      if (add && !arr.includes(id) && arr.length < opts.cap) arr.push(id);
      if (!add) this.state[opts.stateKey] = arr.filter((x) => x !== id);
    }
  }

  // -------- left editor panel (stats + moves) --------
  renderStagePanel() {
    const opts = this._stage;
    const s = this.state;
    const def = opts.list.find((x) => x.id === s[opts.focusKey]);
    const cfg = opts.cfgFor(def.id);
    const chosen = this.chosenIds(opts).includes(def.id);
    const panel = $('stage-panel');
    if (opts.browse) return this.renderBrowsePanel(panel, def, cfg, opts);

    panel.innerHTML = `
      <div class="edit-head">
        <span class="edit-name" style="color:${def.color}">${def.icon} ${def.name}</span>
        <button id="btn-stage-toggle" class="btn btn-small ${chosen ? 'btn-danger' : 'btn-primary'}">
          ${chosen ? '− Remove' : opts.addLabel}
        </button>
      </div>
      ${def.desc ? `<p class="edit-flavor">${def.desc}</p>` : ''}

      ${opts.isMonster ? `
      <div class="theme-editor">
        <div class="stat-row-head"><span>Room Theme</span></div>
        <div class="theme-pills">
          ${Object.values(ROOM_THEMES).map((t) => `
            <button class="opt-pill theme-pill ${(cfg.roomTheme || def.roomTheme) === t.id ? 'on' : ''}"
                    data-theme="${t.id}" style="--th:${t.accent}">${t.icon} ${t.name}</button>`).join('')}
        </div>
        <p class="hint">The room this ${opts.single ? 'boss' : 'monster'} is fought in takes this look — floor, stones, props and all.</p>
      </div>` : ''}

      <div class="stat-editor">
        <div class="stat-row-head">
          <span>Stats</span>
          <span class="stat-tools">
            <button id="btn-reroll-stats" class="btn btn-ghost btn-tiny">🎲 Reroll</button>
            <button id="btn-reset-stats" class="btn btn-ghost btn-tiny">↺ Reset</button>
          </span>
        </div>
        ${opts.statFields.map((f) => statRow(f.key, f.label, cfg.stats[f.key], f.min, f.max)).join('')}
      </div>

      <div class="moves-editor">
        <div class="stat-row-head"><span>${opts.allowSpells ? 'Attacks & Spells' : 'Attacks'}</span></div>
        <div id="moves-list">${cfg.moves.map((m) => moveRow(m)).join('')}</div>
        <div class="moves-add">
          <button id="btn-add-attack" class="btn btn-ghost btn-tiny" ${countKind(cfg, 'attack') >= ATTACK_CAP ? 'disabled' : ''}>+ Attack</button>
          ${opts.allowSpells ? `<button id="btn-add-spell" class="btn btn-ghost btn-tiny" ${countKind(cfg, 'spell') >= SPELL_CAP ? 'disabled' : ''}>+ Spell</button>` : ''}
        </div>
        <p class="hint">The glowing ring under the ${opts.isMonster ? 'monster' : 'hero'} takes the colour of its first attack.</p>
      </div>`;

    $('btn-stage-toggle').addEventListener('click', () => {
      this.setChosen(def.id, !chosen);
      this.refreshStage();
      this.renderFooter();
    });

    panel.querySelectorAll('.theme-pill').forEach((p) => p.addEventListener('click', () => {
      cfg.roomTheme = p.dataset.theme;
      panel.querySelectorAll('.theme-pill').forEach((x) => x.classList.toggle('on', x === p));
    }));

    $('btn-reroll-stats').addEventListener('click', () => {
      if (opts.isMonster) {
        const lo = 1 + Math.floor(Math.random() * 5);
        cfg.stats = {
          hp: 14 + Math.floor(Math.random() * 47), ac: 10 + Math.floor(Math.random() * 9),
          atk: 2 + Math.floor(Math.random() * 7), dmgLo: lo, dmgHi: lo + 1 + Math.floor(Math.random() * 7),
        };
      } else {
        cfg.stats = {
          hp: 16 + Math.floor(Math.random() * 21), ac: 11 + Math.floor(Math.random() * 7),
          atk: 3 + Math.floor(Math.random() * 6), dmgBonus: 1 + Math.floor(Math.random() * 5),
        };
      }
      this.renderStagePanel();
    });
    $('btn-reset-stats').addEventListener('click', () => {
      const fresh = opts.defaults(def);
      Object.assign(cfg, { stats: fresh.stats, moves: fresh.moves });
      this.renderStagePanel();
      this.showFocused(); // ring color may have reset
    });

    // stat steppers
    panel.querySelectorAll('.stat-step').forEach((b) => b.addEventListener('click', () => {
      const { stat, dir, min, max } = b.dataset;
      cfg.stats[stat] = Math.max(+min, Math.min(+max, cfg.stats[stat] + +dir));
      // keep damage range sane
      if (stat === 'dmgLo' && cfg.stats.dmgHi !== undefined) cfg.stats.dmgHi = Math.max(cfg.stats.dmgHi, cfg.stats.dmgLo);
      if (stat === 'dmgHi' && cfg.stats.dmgLo !== undefined) cfg.stats.dmgLo = Math.min(cfg.stats.dmgLo, cfg.stats.dmgHi);
      opts.statFields.forEach((f) => { panel.querySelector(`[data-stat-val="${f.key}"]`).textContent = cfg.stats[f.key]; });
    }));

    // moves
    const syncAccent = () => {
      this.preview?.setAccent(mainAttackColor(cfg, def.color));
    };
    panel.querySelectorAll('.move-name').forEach((inp) => inp.addEventListener('input', () => {
      const mv = cfg.moves.find((m) => m.id === inp.dataset.move);
      mv.name = inp.value.slice(0, 24) || (mv.kind === 'attack' ? 'Attack' : 'Spell');
    }));
    panel.querySelectorAll('.move-del').forEach((b) => b.addEventListener('click', () => {
      const mv = cfg.moves.find((m) => m.id === b.dataset.move);
      if (cfg.moves.filter((m) => m.kind === mv.kind).length <= 1 && mv.kind === 'attack') return; // always keep one attack
      cfg.moves = cfg.moves.filter((m) => m.id !== b.dataset.move);
      this.renderStagePanel();
      syncAccent();
    }));
    panel.querySelectorAll('.swatch').forEach((sw) => sw.addEventListener('click', () => {
      const mv = cfg.moves.find((m) => m.id === sw.dataset.move);
      mv.color = sw.dataset.color;
      this.renderStagePanel();
      syncAccent(); // live ring recolor
    }));
    panel.querySelectorAll('.opt-pill:not(.theme-pill)').forEach((p) => p.addEventListener('click', () => {
      const mv = cfg.moves.find((m) => m.id === p.dataset.move);
      if (!mv) return;
      if (mv.kind === 'attack') mv.style = p.dataset.opt;
      else { mv.effect = p.dataset.opt; mv.rules = defaultRulesFor(mv); } // new effect → fresh rules
      this.renderStagePanel();
    }));
    panel.querySelectorAll('.move-edit').forEach((b) => b.addEventListener('click', () => {
      const mv = cfg.moves.find((m) => m.id === b.dataset.move);
      this.openMoveEditor(mv);
    }));
    $('btn-add-attack')?.addEventListener('click', () => {
      cfg.moves.push({ id: newMoveId(), kind: 'attack', name: 'New Attack', color: pick(MOVE_COLORS), style: 'balanced' });
      this.renderStagePanel();
      syncAccent();
    });
    $('btn-add-spell')?.addEventListener('click', () => {
      cfg.moves.push({ id: newMoveId(), kind: 'spell', name: 'New Spell', color: pick(MOVE_COLORS), effect: 'blast' });
      this.renderStagePanel();
    });
  }

  /** Read-only monster/boss sheet for waiting guests. */
  renderBrowsePanel(panel, def, cfg, opts) {
    const theme = ROOM_THEMES[cfg.roomTheme || def.roomTheme];
    panel.innerHTML = `
      <div class="edit-head"><span class="edit-name" style="color:${def.color}">${def.icon} ${def.name}</span></div>
      ${def.desc ? `<p class="edit-flavor">${def.desc}</p>` : ''}
      ${theme ? `<p class="browse-lair">Lair: <b style="color:${theme.accent}">${theme.icon} ${theme.name}</b></p>` : ''}
      <div class="stat-editor">
        <div class="stat-row-head"><span>Stats</span></div>
        ${opts.statFields.map((f) => `
          <div class="stat-row">
            <span class="stat-label">${f.label}</span>
            <span class="stat-val">${cfg.stats[f.key]}</span>
          </div>`).join('')}
      </div>
      <div class="moves-editor">
        <div class="stat-row-head"><span>Attacks</span></div>
        ${cfg.moves.map((m) => `
          <div class="move-row">
            <div class="move-top">
              <span class="move-kind ${m.kind}">${m.kind === 'attack' ? '⚔' : '✦'}</span>
              <span class="move-name-read"><i style="background:${m.color}"></i>${escapeHtml(m.name)}</span>
            </div>
            <p class="move-desc">${m.kind === 'attack' && ATTACK_STYLES[m.style] ? ATTACK_STYLES[m.style].desc + ' ' : ''}${rulesDesc(m)}</p>
          </div>`).join('')}
      </div>
      <p class="hint">👁 Know thy enemy — study up while the host finishes the campaign.</p>`;
  }

  // ---------------------------------------------------------- advanced move editor
  openMoveEditor(move) {
    move.rules = rulesFor(move); // materialize defaults so steppers have values
    const fields = RULE_FIELDS[move.kind === 'attack' ? 'attack' : move.effect] || [];
    $('move-editor-title').innerHTML =
      `<i class="me-dot" style="background:${move.color}"></i> ${escapeHtml(move.name)}`;
    const body = $('move-editor-body');
    body.innerHTML = fields.map((f) => `
      <div class="stat-row">
        <span class="stat-label">${f.label}</span>
        <span class="stat-ctrl">
          <button class="stat-step" data-rule="${f.key}" data-dir="-1" data-min="${f.min}" data-max="${f.max}">−</button>
          <span class="stat-val" data-rule-val="${f.key}">${move.rules[f.key]}</span>
          <button class="stat-step" data-rule="${f.key}" data-dir="1" data-min="${f.min}" data-max="${f.max}">+</button>
        </span>
      </div>`).join('');
    const syncDesc = () => { $('move-editor-desc').textContent = rulesDesc(move); };
    syncDesc();
    body.querySelectorAll('.stat-step').forEach((b) => b.addEventListener('click', () => {
      const { rule, dir, min, max } = b.dataset;
      move.rules[rule] = Math.max(+min, Math.min(+max, move.rules[rule] + +dir));
      // keep deceive thresholds ordered
      if (rule === 'threshold1') move.rules.threshold2 = Math.max(move.rules.threshold2 ?? 15, move.rules.threshold1);
      if (rule === 'threshold2') move.rules.threshold1 = Math.min(move.rules.threshold1 ?? 10, move.rules.threshold2);
      fields.forEach((f) => { body.querySelector(`[data-rule-val="${f.key}"]`).textContent = move.rules[f.key]; });
      syncDesc();
    }));
    const done = $('btn-move-editor-done');
    const onDone = () => { done.removeEventListener('click', onDone); this.renderStagePanel(); };
    done.addEventListener('click', onDone);
    $('move-editor-overlay').hidden = false;
  }

  // ---------------------------------------------------------- step: review
  renderReview(body) {
    const s = this.state;
    const theme = THEMES.find((t) => t.id === s.themeId);
    const boss = BOSSES.find((b) => b.id === s.bossId);
    const monLine = (id, label) => {
      const m = MONSTERS.find((x) => x.id === id) || BOSSES.find((x) => x.id === id);
      const cfg = this.cfgForMonster(id);
      const rt = ROOM_THEMES[cfg.roomTheme || m.roomTheme];
      return `<div class="review-hero">
        <span class="rh-name" style="color:${m.color}">${m.icon} ${m.name}</span>
        <span class="rh-room">${label}${rt ? ` · ${rt.icon} ${rt.name}` : ''}</span>
        <span class="rh-stats">❤${cfg.stats.hp} 🛡${cfg.stats.ac} ⚔+${cfg.stats.atk} 💥${cfg.stats.dmgLo}–${cfg.stats.dmgHi}</span>
        <span class="rh-moves">${cfg.moves.map((mv) =>
          `<span class="move-chip" style="border-color:${mv.color}"><i style="background:${mv.color}"></i>${escapeHtml(mv.name)}</span>`).join('')}</span>
      </div>`;
    };
    body.innerHTML = `
      <div class="review-wrap">
        <h2 class="review-name">⬢ ${escapeHtml(s.name)}</h2>
        <p class="review-theme">Realm: <b style="color:${theme.accent}">${theme.icon} ${theme.name}</b>
          · Difficulty: <b>${DIFFICULTIES[s.difficulty].icon} ${DIFFICULTIES[s.difficulty].name}</b>
          <small>(${DIFFICULTIES[s.difficulty].desc})</small></p>
        <div class="review-section"><h4>The Party</h4>
          ${s.heroIds.map((id) => {
            const h = HEROES.find((x) => x.id === id);
            const cfg = this.cfgForHero(id);
            return `<div class="review-hero">
              <span class="rh-name" style="color:${h.color}">${h.icon} ${h.name}</span>
              <span class="rh-stats">❤${cfg.stats.hp} 🛡${cfg.stats.ac} ⚔+${cfg.stats.atk} 💥+${cfg.stats.dmgBonus}</span>
              <span class="rh-moves">${cfg.moves.map((m) =>
                `<span class="move-chip" style="border-color:${m.color}"><i style="background:${m.color}"></i>${escapeHtml(m.name)}</span>`).join('')}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="review-section"><h4>The Gauntlet</h4>
          ${s.monsterIds.map((id, i) => monLine(id, `Room ${i + 1}`)).join('')}
          ${monLine(boss.id, 'Room 7 — Final Boss')}
        </div>
      </div>`;
  }

  // ---------------------------------------------------------- 3D preview mount
  mountPreview() {
    const slot = $('preview-slot');
    if (!slot) return;
    slot.appendChild(this.previewCanvas);
    if (!this.preview) this.preview = new Preview3D(this.previewCanvas);
    requestAnimationFrame(() => this.preview.resize());
  }
}

// ---------------------------------------------------------- template helpers
function statRow(key, label, val, min, max) {
  return `<div class="stat-row">
    <span class="stat-label">${label}</span>
    <span class="stat-ctrl">
      <button class="stat-step" data-stat="${key}" data-dir="-1" data-min="${min}" data-max="${max}">−</button>
      <span class="stat-val" data-stat-val="${key}">${val}</span>
      <button class="stat-step" data-stat="${key}" data-dir="1" data-min="${min}" data-max="${max}">+</button>
    </span>
  </div>`;
}

function moveRow(m) {
  const opts = m.kind === 'attack' ? ATTACK_STYLES : SPELL_EFFECTS;
  const current = m.kind === 'attack' ? m.style : m.effect;
  return `<div class="move-row">
    <div class="move-top">
      <span class="move-kind ${m.kind}">${m.kind === 'attack' ? '⚔' : '✦'}</span>
      <input class="move-name" data-move="${m.id}" maxlength="24" value="${escapeHtml(m.name)}" />
      <button class="move-edit btn btn-ghost btn-tiny" data-move="${m.id}" title="Edit rules &amp; damage">⚙ Edit</button>
      <button class="move-del" data-move="${m.id}" title="Remove">✕</button>
    </div>
    <div class="move-opts">
      ${Object.entries(opts).map(([k, o]) =>
        `<button class="opt-pill ${current === k ? 'on' : ''}" data-move="${m.id}" data-opt="${k}" title="${o.desc}">${o.name}</button>`).join('')}
    </div>
    <div class="move-swatches">
      ${MOVE_COLORS.map((c) =>
        `<button class="swatch ${m.color === c ? 'on' : ''}" data-move="${m.id}" data-color="${c}" style="background:${c}"></button>`).join('')}
    </div>
    <p class="move-desc">${m.kind === 'attack' ? ATTACK_STYLES[m.style].desc + ' ' : ''}${rulesDesc(m)}</p>
  </div>`;
}

function countKind(cfg, kind) { return cfg.moves.filter((m) => m.kind === kind).length; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
