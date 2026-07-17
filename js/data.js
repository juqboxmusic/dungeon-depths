// ============================================================
//  GAME DATA REGISTRY
//  Add your Tripo AI models here:
//   - heroes → models/characters/   monsters → models/monsters/
//   - final bosses → models/bosses/
//   - set the `model` path on the matching entry below
//  If the file is missing, the game renders a placeholder token.
// ============================================================

// ---- MONSTER ROOM THEMES ------------------------------------
// Every monster (and boss) carries a room theme — the room it is fought in
// takes this look: themed floor, stones, platform, props and animations.
export const ROOM_THEMES = {
  scifi: {
    id: 'scifi', name: 'Sci-Fi', icon: '🛸',
    floor: '#0e141c', accent: '#35e0ff', glow: '#58e8ff',
    stone: '#1c2a38', platform: '#141f2b',
    pattern: 'circuit', propStyle: 'scifi',
  },
  darkforest: {
    id: 'darkforest', name: 'Dark Forest', icon: '🌲',
    floor: '#0c1309', accent: '#4fae4f', glow: '#7dff9a',
    stone: '#233018', platform: '#16210f',
    pattern: 'organic', propStyle: 'darkforest',
  },
  dungeon: {
    id: 'dungeon', name: 'Dungeon', icon: '⛓',
    floor: '#1a171c', accent: '#c88a3a', glow: '#ffab52',
    stone: '#2c2830', platform: '#211d25',
    pattern: 'slabs', propStyle: 'dungeon',
  },
  crystalcave: {
    id: 'crystalcave', name: 'Crystal Cave', icon: '💎',
    floor: '#150e1d', accent: '#b57aff', glow: '#cf9aff',
    stone: '#2a2038', platform: '#1e1629',
    pattern: 'crystal', propStyle: 'crystalcave',
  },
  backrooms: {
    id: 'backrooms', name: 'Backrooms', icon: '🚪',
    floor: '#57502e', accent: '#d8cc7a', glow: '#fff2a8',
    stone: '#6e6540', platform: '#4a442a',
    pattern: 'tiles', propStyle: 'backrooms',
  },
  cult: {
    id: 'cult', name: 'Ancient Cult', icon: '🕯',
    floor: '#160a0d', accent: '#e03434', glow: '#ff4040',
    stone: '#2c161a', platform: '#1f0f12',
    pattern: 'runes', propStyle: 'cult',
  },
  temple: {
    id: 'temple', name: 'Temple', icon: '🏛',
    floor: '#1e1810', accent: '#e8c56a', glow: '#ffd76a',
    stone: '#362b1a', platform: '#282013',
    pattern: 'inlay', propStyle: 'temple',
  },
};

// ---- REALMS (lobby look) ------------------------------------
// The realm choices are the same seven themes — the realm styles the
// Gathering Hall; each monster room is styled (and colored) by its monster.
const REALM_DESCS = {
  scifi: 'Chrome corridors humming with reactor light.',
  darkforest: 'Ancient pines where fireflies drift.',
  dungeon: 'Torch-lit stone halls of the old keep.',
  crystalcave: 'Caverns aglow with living crystal.',
  backrooms: 'Damp yellow halls that should not exist.',
  cult: 'A ritual chamber marked in blood.',
  temple: 'Gilded sanctums of a forgotten god.',
};
export const THEMES = Object.values(ROOM_THEMES).map((t) => ({
  ...t,
  desc: REALM_DESCS[t.id],
  swatch: [t.floor, t.accent],
}));

// ---- DIFFICULTY ----------------------------------------------
// Lives = how many times the whole party can fall before the run ends.
export const DIFFICULTIES = {
  story: { id: 'story', name: 'Story', icon: '📖', lives: Infinity, desc: 'You cannot die — pure adventure.' },
  easy: { id: 'easy', name: 'Easy', icon: '🌿', lives: 5, desc: '5 lives.' },
  medium: { id: 'medium', name: 'Medium', icon: '⚔', lives: 3, desc: '3 lives.' },
  hard: { id: 'hard', name: 'Hard', icon: '💀', lives: 2, desc: '2 lives.' },
};

/** Lighten a #rrggbb color toward white (amt 0..1). */
export function lightenHex(hex, amt = 0.25) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(v + (255 - v) * amt).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

// ---- HEROES ------------------------------------------------
// Stats here are the "AI generated" defaults — players can edit every number
// (and their attacks/spells) in the campaign designer.
export const HEROES = [
  {
    id: 'mage', name: 'Mage', icon: '✦', color: '#b57aff',
    model: 'models/characters/Mage.glb',
    hp: 18, ac: 12, atk: 6, dmgBonus: 4,
    attackName: 'Arcane Bolt', spell: { name: 'Fireball', effect: 'blast', color: '#ff7a2a' },
  },
  {
    id: 'jester', name: 'Jester', icon: '🃏', color: '#e0b52a',
    model: 'models/characters/Jester.glb',
    hp: 22, ac: 15, atk: 6, dmgBonus: 2,
    attackName: 'Juggling Knives', spell: { name: 'Card Storm', effect: 'blast', color: '#ff7ab8' },
  },
  {
    id: 'redwarrior', name: 'Red Warrior', icon: '⚔', color: '#e04040',
    model: 'models/characters/Redwarrior.glb',
    hp: 32, ac: 14, atk: 5, dmgBonus: 3,
    attackName: 'Crimson Blade', spell: { name: 'Crimson Guard', effect: 'ward', color: '#e04040' },
  },
  {
    id: 'purple', name: 'Purple', icon: '🔮', color: '#b57aff',
    model: 'models/characters/Purple.glb',
    hp: 20, ac: 13, atk: 6, dmgBonus: 3,
    attackName: 'Void Lash', spell: { name: 'Arcane Burst', effect: 'blast', color: '#b57aff' },
  },
  {
    id: 'bob', name: 'Bob', icon: '🙂', color: '#9ab0c0',
    model: 'models/characters/Bob.glb',
    hp: 28, ac: 14, atk: 5, dmgBonus: 3,
    attackName: 'Haymaker', spell: { name: 'Unshakeable Calm', effect: 'ward', color: '#7ad9ff' },
  },
  {
    id: 'hamstergod', name: 'Hamster God', icon: '🐹', color: '#f2c14e',
    model: 'models/characters/Hamster-God.glb',
    hp: 26, ac: 13, atk: 6, dmgBonus: 3,
    attackName: 'Divine Nibble', spell: { name: 'Blessing of Seeds', effect: 'heal', color: '#f2c14e' },
  },
];

// ---- CUSTOM MOVES (attacks & spells) ------------------------
export const MOVE_COLORS = [
  '#cfd2da', '#e04040', '#ff7a2a', '#f2c14e', '#6ee68a',
  '#7ad9ff', '#7a8cff', '#b57aff', '#ff7ab8', '#8a9aa8',
];

export const ATTACK_STYLES = {
  balanced: { name: 'Balanced', hit: 0, dmg: 0, desc: 'No modifiers — reliable.' },
  swift: { name: 'Swift', hit: 2, dmg: -1, desc: '+2 to hit, −1 damage.' },
  heavy: { name: 'Heavy', hit: -2, dmg: 3, desc: '−2 to hit, +3 damage.' },
};

export const SPELL_EFFECTS = {
  blast: { name: 'Blast', icon: '☄', desc: 'Damaging burst of energy.' },
  heal: { name: 'Heal', icon: '✚', desc: 'Restore HP to the most wounded hero.' },
  ward: { name: 'Ward', icon: '🛡', desc: 'Bonus armor for the rest of the room.' },
  deceive: { name: 'Deceive', icon: '🌀', desc: 'Mind tricks — the confused monster attacks itself.' },
};

export const ATTACK_CAP = 2;
export const SPELL_CAP = 3;
export const SUMMON_CAP = 1;

// ---- MOVE RULES (advanced editor) ---------------------------
// Every attack/spell carries editable rules; missing fields fall back to these.
export function defaultRulesFor(move) {
  if (move.kind === 'attack') return { dmgDice: 1, dmgMod: 0, hitMod: 0, critOn: 20 };
  if (move.kind === 'summon') return { threshold: 11, turns: 3, cooldown: 6 };
  switch (move.effect) {
    case 'heal': return { healDice: 2 };
    case 'ward': return { acBonus: 4 };
    case 'deceive': return { threshold1: 10, turns1: 1, threshold2: 15, turns2: 3 };
    default: return { threshold: 10, hiDmg: 10, loDmg: 4, critOn: 20 }; // blast
  }
}

export function rulesFor(move) {
  return { ...defaultRulesFor(move), ...(move.rules || {}) };
}

/** Human description of what a move actually does, from its rules. */
export function rulesDesc(move) {
  if (move.effect === 'teleport') return 'Open a waygate to any room you choose (except the Final Sanctum).';
  const r = rulesFor(move);
  const crit = (r.critOn && r.critOn < 20) ? ` Crits on ${r.critOn}+ (double damage).` : '';
  if (move.kind === 'summon') {
    const m = MONSTERS.find((x) => x.id === move.monsterId);
    return `Roll d20: ${r.threshold}+ transforms you into ${m ? `the ${m.name}` : 'a monster'} for ${r.turns} round${r.turns === 1 ? '' : 's'} — it strikes the enemy each monster turn. Recharges in ${r.cooldown} turns, success or not.`;
  }
  if (move.kind === 'attack') {
    const mods = [];
    if (r.hitMod) mods.push(`${r.hitMod > 0 ? '+' : ''}${r.hitMod} to hit`);
    if (r.dmgMod) mods.push(`${r.dmgMod > 0 ? '+' : ''}${r.dmgMod} damage`);
    return `${r.dmgDice}d6 + bonuses damage${mods.length ? ` (${mods.join(', ')})` : ''}.${crit}`;
  }
  switch (move.effect) {
    case 'heal': return `Restore ${r.healDice}d6 HP to the most wounded hero.`;
    case 'ward': return `+${r.acBonus} armor for the rest of the room.`;
    case 'deceive': return `Roll d20: ${r.threshold1}+ confuses the monster for ${r.turns1} turn${r.turns1 === 1 ? '' : 's'}; ${r.threshold2}+ for ${r.turns2} — it attacks itself.`;
    default: return `Roll d20: ${r.threshold}+ deals ${r.hiDmg} damage, otherwise ${r.loDmg}.${crit}`;
  }
}

export const RULE_FIELDS = {
  attack: [
    { key: 'dmgDice', label: '🎲 Damage dice (d6)', min: 1, max: 3 },
    { key: 'dmgMod', label: '💥 Bonus damage', min: -3, max: 8 },
    { key: 'hitMod', label: '🎯 Bonus to hit', min: -5, max: 5 },
    { key: 'critOn', label: '⚡ Critical hit on d20 ≥', min: 10, max: 20 },
  ],
  blast: [
    { key: 'threshold', label: '🎲 Success on d20 ≥', min: 2, max: 19 },
    { key: 'hiDmg', label: '💥 Full damage', min: 1, max: 20 },
    { key: 'loDmg', label: '💨 Graze damage', min: 0, max: 10 },
    { key: 'critOn', label: '⚡ Critical hit on d20 ≥', min: 10, max: 20 },
  ],
  heal: [{ key: 'healDice', label: '✚ Healing dice (d6)', min: 1, max: 4 }],
  ward: [{ key: 'acBonus', label: '🛡 Armor bonus', min: 1, max: 8 }],
  deceive: [
    { key: 'threshold1', label: '🌀 Confuse on d20 ≥', min: 2, max: 19 },
    { key: 'turns1', label: '↳ turns attacking itself', min: 1, max: 3 },
    { key: 'threshold2', label: '😵 Deep confuse on d20 ≥', min: 2, max: 20 },
    { key: 'turns2', label: '↳ turns attacking itself', min: 1, max: 5 },
  ],
  summon: [
    { key: 'threshold', label: '🎲 Succeeds on d20 ≥', min: 2, max: 19 },
    { key: 'turns', label: '🐉 Fights for (rounds)', min: 1, max: 6 },
    { key: 'cooldown', label: '⏳ Recharge (turns)', min: 4, max: 12 },
  ],
};

let moveSeq = 0;
export function newMoveId() { return 'mv' + (++moveSeq) + '_' + Math.random().toString(36).slice(2, 6); }

export function defaultMovesFor(heroDef) {
  return [
    { id: newMoveId(), kind: 'attack', name: heroDef.attackName || 'Strike', color: heroDef.color, style: 'balanced' },
    { id: newMoveId(), kind: 'spell', name: heroDef.spell?.name || 'Arcane Blast', color: heroDef.spell?.color || '#b57aff', effect: heroDef.spell?.effect || 'blast' },
  ];
}

export function defaultHeroConfig(heroDef) {
  return {
    stats: { hp: heroDef.hp, ac: heroDef.ac, atk: heroDef.atk, dmgBonus: heroDef.dmgBonus },
    moves: defaultMovesFor(heroDef),
  };
}

export function defaultMonsterConfig(mDef) {
  return {
    stats: { hp: mDef.hp, ac: mDef.ac, atk: mDef.atk, dmgLo: mDef.dmg[0], dmgHi: mDef.dmg[1] },
    roomTheme: mDef.roomTheme || 'dungeon',
    moves: [
      { id: newMoveId(), kind: 'attack', name: mDef.attackName || 'Savage Strike', color: mDef.color, style: 'balanced' },
    ],
  };
}

/** The token's illuminated base ring takes the color of the main (first) attack. */
export function mainAttackColor(cfg, fallback) {
  return cfg?.moves?.find((m) => m.kind === 'attack')?.color || fallback || '#d4a017';
}

// ---- MONSTERS (pick 5) --------------------------------------
export const MONSTERS = [
  {
    id: 'experimentd', name: 'Experiment D', icon: '🧟', color: '#7ab87a',
    model: 'models/monsters/ExperimentD.glb',
    desc: 'A failed experiment that clawed its way out of the vats.',
    attackName: 'Vat-Grown Claw',
    roomTheme: 'scifi',
    hp: 30, ac: 14, atk: 5, dmg: [3, 8],
  },
  {
    id: 'necromancer', name: 'Necromancer', icon: '☠', color: '#8a6ae8',
    model: 'models/monsters/Necromancer.glb',
    desc: 'A robed spellbinder who commands the restless dead.',
    attackName: 'Soul Drain',
    roomTheme: 'cult',
    hp: 26, ac: 14, atk: 5, dmg: [2, 7],
  },
  {
    id: 'scarecrow', name: 'Scarecrow', icon: '🎃', color: '#e0b52a',
    model: 'models/monsters/Scarecrow.glb',
    desc: 'It was not standing in that field yesterday.',
    attackName: 'Reaping Claw',
    roomTheme: 'darkforest',
    hp: 22, ac: 15, atk: 6, dmg: [2, 6],
  },
  {
    id: 'smilermech', name: 'Smiler Mech', icon: '🤖', color: '#35e0ff',
    model: 'models/monsters/Smiler-Mech.glb',
    desc: 'A grinning machine that should never have been switched on.',
    attackName: 'Grinning Beam',
    roomTheme: 'scifi',
    hp: 30, ac: 15, atk: 5, dmg: [3, 8],
  },
  {
    id: 'wickerwendigo', name: 'Wicker Wendigo', icon: '🦌', color: '#8a9a5a',
    model: 'models/monsters/Wicker-Wendigo.glb',
    desc: 'An antlered husk of woven branches, always hungry.',
    attackName: 'Antler Gore',
    roomTheme: 'darkforest',
    hp: 28, ac: 14, atk: 6, dmg: [3, 8],
  },
  {
    id: 'wickerworm', name: 'Wicker Worm', icon: '🪱', color: '#b8925a',
    model: 'models/monsters/Wicker-Worm.glb',
    desc: 'Woven coils that tighten while you sleep.',
    attackName: 'Constrict',
    roomTheme: 'darkforest',
    hp: 34, ac: 12, atk: 4, dmg: [3, 9],
  },
  {
    id: 'drhalvek', name: 'Dr. Halvek', icon: '🧪', color: '#7ad9ff',
    model: 'models/monsters/Dr-Halvek.glb',
    desc: 'The doctor will see you now.',
    attackName: 'Scalpel Flurry',
    roomTheme: 'scifi',
    hp: 26, ac: 14, atk: 6, dmg: [2, 7],
  },
  {
    id: 'janitor', name: 'The Janitor', icon: '🧹', color: '#8a9aa8',
    model: 'models/monsters/Janitor.glb',
    desc: 'He has always worked here. He always will.',
    attackName: 'Mop Strike',
    roomTheme: 'backrooms',
    hp: 28, ac: 13, atk: 5, dmg: [3, 7],
  },
  {
    id: 'nemisymbiote', name: 'Nemi Symbiote', icon: '🦠', color: '#4fae4f',
    model: 'models/monsters/Nemi-Symbiote.glb',
    desc: 'It only wants to get closer.',
    attackName: 'Latch On',
    roomTheme: 'darkforest',
    hp: 24, ac: 15, atk: 6, dmg: [2, 6],
  },
  {
    id: 'nemimountain', name: 'Nemi Mountain', icon: '⛰', color: '#9aa0a6',
    model: 'models/monsters/NemiMountain.glb',
    desc: 'You thought it was scenery. It thought you were lunch.',
    attackName: 'Rockslide',
    roomTheme: 'crystalcave',
    hp: 40, ac: 12, atk: 4, dmg: [3, 9],
  },
  {
    id: 'nemigorgon', name: 'Nemigorgon', icon: '🐍', color: '#6ee68a',
    model: 'models/monsters/Nemigorgon.glb',
    desc: 'Do not meet its eyes. Do not.',
    attackName: 'Petrifying Gaze',
    roomTheme: 'temple',
    hp: 28, ac: 15, atk: 6, dmg: [2, 7],
  },
  {
    id: 'smilerspider', name: 'Smiler Spider', icon: '🕷', color: '#d8cc7a',
    model: 'models/monsters/Smiler-Spider.glb',
    desc: 'Eight legs, one grin, zero mercy.',
    attackName: 'Skittering Grin',
    roomTheme: 'backrooms',
    hp: 22, ac: 16, atk: 7, dmg: [2, 6],
  },
  {
    id: 'wickercyclops', name: 'Wicker Cyclops', icon: '👁', color: '#b8925a',
    model: 'models/monsters/Wicker-Cyclops.glb',
    desc: 'A one-eyed tower of woven branches and spite.',
    attackName: 'Timber Smash',
    roomTheme: 'darkforest',
    hp: 36, ac: 12, atk: 4, dmg: [3, 9],
  },
];

// ---- FINAL BOSSES (pick 1) ----------------------------------
export const BOSSES = [
  {
    id: 'cultleader', name: 'Cult Leader', icon: '🕯', color: '#e03434',
    model: 'models/bosses/Cult-Leader.glb',
    desc: 'The voice behind every whispered ritual in the deep.',
    attackName: 'Blood Rite',
    roomTheme: 'cult',
    hp: 60, ac: 16, atk: 7, dmg: [4, 10], attacks: 2,
  },
  {
    id: 'nemihydra', name: 'Nemihydra', icon: '🐉', color: '#4fae4f',
    model: 'models/bosses/Nemihydra.glb',
    desc: 'Cut one head from the dark, and two more answer.',
    attackName: 'Hydra Fangs',
    roomTheme: 'darkforest',
    hp: 80, ac: 15, atk: 6, dmg: [4, 11], attacks: 2,
  },
  {
    id: 'thesmiler', name: 'The Smiler', icon: '😁', color: '#d8cc7a',
    model: 'models/bosses/The-Smiler.glb',
    desc: 'It has always been standing at the end of the hall.',
    attackName: 'Frozen Grin',
    roomTheme: 'backrooms',
    hp: 65, ac: 17, atk: 7, dmg: [4, 10], attacks: 2,
  },
  {
    id: 'yellowking', name: 'The Yellow King', icon: '👑', color: '#e8c56a',
    model: 'models/bosses/The-Yellow-King.glb',
    desc: 'Have you seen the yellow sign?',
    attackName: 'Maddening Whisper',
    roomTheme: 'cult',
    hp: 70, ac: 16, atk: 8, dmg: [4, 11], attacks: 2,
  },
];

// ---- DUNGEON LAYOUT -----------------------------------------
// Grid:            [ BOSS(6) ]
//        [ R3 ]    [  R2  ]    [ R4 ]
//        [ R1 ]    [LOBBY(0)]  [ R5 ]
// Exits use compass dirs. Boss door (room 2, north) unlocks at 5 clears.
export const ROOMS = [
  { id: 0, name: 'The Gathering Hall', kind: 'lobby', exits: { N: 2, W: 1, E: 5 } },
  { id: 1, name: 'Monster Room I', kind: 'monster', exits: { E: 0, N: 3 } },
  { id: 2, name: 'Monster Room II', kind: 'monster', exits: { S: 0, W: 3, E: 4, N: 6 } },
  { id: 3, name: 'Monster Room III', kind: 'monster', exits: { S: 1, E: 2 } },
  { id: 4, name: 'Monster Room IV', kind: 'monster', exits: { W: 2, S: 5 } },
  { id: 5, name: 'Monster Room V', kind: 'monster', exits: { N: 4, W: 0 } },
  { id: 6, name: 'The Final Sanctum', kind: 'boss', exits: { S: 2 } },
];

// Minimap layout: [row, col] on a 3x3 grid, boss on its own row above.
export const MINIMAP_POS = { 6: [0, 1], 3: [1, 0], 2: [1, 1], 4: [1, 2], 1: [2, 0], 0: [2, 1], 5: [2, 2] };

// ---- PLOT TWISTS (rolled on a natural 1) --------------------
export const TWISTS = [
  { icon: '🕳', title: 'Collapsing Floor!', text: 'The stones give way beneath you. Take 3 damage.', effect: { dmgSelf: 3 } },
  { icon: '🌫', title: 'Cursed Mist', text: 'A choking mist saps your strength. Take 2 damage.', effect: { dmgSelf: 2 } },
  { icon: '👻', title: 'Vengeful Spirit', text: 'A spirit shrieks through the party. Everyone takes 1 damage.', effect: { dmgParty: 1 } },
  { icon: '🧪', title: 'Strange Fumes', text: 'Something in the air stings... yet you feel oddly restored. Heal 3 HP.', effect: { healSelf: 3 } },
  { icon: '⚡', title: 'Surge of Dark Power', text: 'The dungeon feeds the monster. It regains 4 HP.', effect: { healMonster: 4 } },
  { icon: '🪤', title: 'Hidden Trap!', text: 'A blade whips out of the wall. Take 4 damage.', effect: { dmgSelf: 4 } },
];

// ---- BOONS (rolled on a natural 20, after the crit) ---------
export const BOONS = [
  { icon: '✨', title: 'Heroic Momentum', text: 'The crowd of ghosts roars its approval. Heal 3 HP.', effect: { healSelf: 3 } },
  { icon: '🗝', title: 'Ancient Blessing', text: 'Runes flare beneath your feet. The whole party heals 2 HP.', effect: { healParty: 2 } },
  { icon: '💎', title: 'Crystal Shard', text: 'You pocket a glowing shard. Heal 4 HP.', effect: { healSelf: 4 } },
];

// Reward when a monster room is cleared.
export const ROOM_REWARD_HEAL = 4;

// ---- SIDE-CHARACTER RELIC QUEST ------------------------------
// A random side character (models/side-characters/) appears mid-game and
// sends the party after a relic hidden in another room. Claiming it teaches
// every hero these two spells.
export const QUEST_ITEMS = [
  { name: 'Ancient Crystal', icon: '💎', color: '#7ad9ff' },
  { name: 'Tome of Whispers', icon: '📖', color: '#b57aff' },
  { name: 'Fallen Star', icon: '✨', color: '#ffd76a' },
];

// Per-character personas, keyed by filename in models/side-characters/.
// {room} in dialog is replaced with the item room's name. Characters not
// listed here get a generic persona with a random QUEST_ITEMS relic.
export const SIDE_PERSONAS = {
  'Death.glb': {
    name: 'Death', icon: '💀', color: '#cfd2da',
    surgeName: "Reaper's Edge",
    item: { name: "Death's Scythe", icon: '⚰️', color: '#cfd2da' },
    offered: `"Do not be alarmed. I am... between appointments. It seems I have misplaced my scythe — embarrassing, really — it lies in {room}. Return it, and I will teach you to step between rooms as I do... and lend your magic an edge that nothing on this earth ignores."`,
    reminder: `"The scythe. {room}. I would fetch it myself, but — appearances. You understand."`,
    thanks: `"Ah. Balance, restored. Walk the ways freely, heroes... and give your final boss my warmest regards. I will see them soon either way."`,
  },
  'Scrapbook-Guy.glb': {
    name: 'Scrapbook Guy', icon: '📖', color: '#e0b52a',
    surgeName: 'Dirty Secret',
    item: { name: 'Scrapbook of Secrets', icon: '📖', color: '#e0b52a' },
    offered: `"You! Yes, YOU — you're in here somewhere, everyone's in here. *pats empty pocket* My book. My BOOK. Someone's taken it to {room}. Bring it back and I'll share what's inside — names, weaknesses, doors that aren't doors. Trust me. Everyone trusts me. That's rather the point."`,
    reminder: `"The book! {room}! Every page a person, every person a lever. Off you go — and no peeking. ...Fine, peek."`,
    thanks: `"Ohh, you READ it, didn't you? Wonderful. Then you know how this ends for your boss. Page 3 was particularly damning."`,
  },
};

export const QUEST_SPELLS = [
  {
    id: 'quest_surge', kind: 'spell', name: 'Relic Surge', color: '#ffd76a',
    effect: 'blast', rules: { threshold: 8, hiDmg: 14, loDmg: 6, critOn: 18 },
  },
  {
    id: 'quest_waygate', kind: 'spell', name: 'Waygate', color: '#7ad9ff',
    effect: 'teleport',
  },
];
