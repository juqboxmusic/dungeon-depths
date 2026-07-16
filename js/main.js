// ============================================================
//  MAIN — boot, screen wiring, PWA registration
// ============================================================
import { UI } from './ui.js';
import { Engine } from './engine.js';
import { Game } from './game.js';
import { Designer } from './designer.js';
import { MP } from './mp.js';
import { HEROES, MONSTERS, BOSSES } from './data.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'dungeon-depths-save-v1';

const ui = new UI();
let engine = null;
let game = null;

function ensureEngine() {
  if (!engine) {
    engine = new Engine($('game-canvas'));
    game = new Game(engine, ui, mp);
    mp.game = game;
    window.game = game; // handy for debugging

    // wire in-game buttons once
    $('btn-map').addEventListener('click', () => ui.showMinimap(game));
    $('btn-menu').addEventListener('click', () => {
      $('menu-campaign-name').textContent = game.campaign?.name || 'Campaign';
      $('menu-overlay').hidden = false;
    });
    $('btn-quit').addEventListener('click', () => {
      Game.clearSave();
      $('menu-overlay').hidden = true;
      ui.showScreen('screen-home');
      refreshHome();
    });
    $('btn-end-home').addEventListener('click', () => {
      $('end-overlay').hidden = true;
      ui.showScreen('screen-home');
      refreshHome();
    });
  }
  return game;
}

function refreshHome() {
  $('btn-continue').hidden = !Game.hasSave();
}

// ---- home ----
const designer = new Designer();
window.designer = designer; // handy for debugging

$('btn-new-campaign').addEventListener('click', () => {
  ui.showScreen('screen-designer');
  designer.open(async (campaign) => {
    ensureEngine();
    ui.showScreen('screen-game');
    engine.resize();
    await game.startNew(campaign);
  });
});
$('btn-continue').addEventListener('click', async () => {
  const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
  if (!saved) return refreshHome();
  // saves from an older roster (removed heroes/monsters) can't be resumed
  const known = (id) => HEROES.some((h) => h.id === id) || MONSTERS.some((m) => m.id === id) || BOSSES.some((b) => b.id === id);
  const ids = [...(saved.campaign?.heroIds || []), ...(saved.campaign?.monsterIds || []), saved.campaign?.bossId];
  if (!ids.every(known)) {
    Game.clearSave();
    refreshHome();
    return;
  }
  ensureEngine();
  ui.showScreen('screen-game');
  engine.resize();
  await game.resume(saved);
});

// ---- multiplayer ----
const mp = new MP(ui);
window.mp = mp; // handy for debugging
mp.designer = designer; // live hero-lock updates while picking

mp.onStart = async (campaign, isHost) => {
  ensureEngine();
  ui.showScreen('screen-game');
  engine.resize();
  if (isHost) await game.startNew(campaign);
  else await game.startReplica(campaign);
};

let mpMode = 'host';
function openMpSetup(mode) {
  mpMode = mode;
  $('mp-setup-title').textContent = mode === 'host' ? '🌐 Host Online Game' : '🔗 Join Online Game';
  $('mp-code').hidden = mode === 'host';
  $('mp-setup-error').textContent = '';
  $('btn-mp-go').disabled = false;
  $('mp-setup-overlay').hidden = false;
  $('mp-name').focus();
}
$('btn-mp-host').addEventListener('click', () => openMpSetup('host'));
$('btn-mp-join').addEventListener('click', () => openMpSetup('join'));

$('btn-mp-go').addEventListener('click', async () => {
  const name = $('mp-name').value.trim();
  const code = $('mp-code').value.trim().toUpperCase();
  const err = $('mp-setup-error');
  if (!name) { err.textContent = 'Enter your name.'; return; }
  if (mpMode === 'join' && code.length !== 5) { err.textContent = 'Room codes are 5 characters.'; return; }
  $('btn-mp-go').disabled = true;
  err.textContent = mpMode === 'host' ? 'Creating room…' : 'Connecting…';
  try {
    if (mpMode === 'host') {
      await mp.hostRoom(name);
      $('mp-setup-overlay').hidden = true;
      ui.showScreen('screen-designer');
      designer.open((campaign) => {
        mp.hostDesignDone(campaign);
        ui.showScreen('screen-lobby');
        mp.renderLobby();
      }, { heroCap: 1 });
    } else {
      await mp.joinRoom(code, name);
      $('mp-setup-overlay').hidden = true;
      ui.showScreen('screen-lobby');
      mp.renderLobby();
    }
  } catch (e) {
    err.textContent = e.message || 'Connection failed — try again.';
    $('btn-mp-go').disabled = false;
  }
});

$('btn-lobby-pick').addEventListener('click', () => {
  ui.showScreen('screen-designer');
  designer.openHeroPick(mp.takenHeroIds(), (pick) => {
    mp.sendPick(pick.heroId, pick.config);
    ui.showScreen('screen-lobby');
    mp.renderLobby();
  });
});
$('btn-lobby-start').addEventListener('click', () => mp.startGame());
$('btn-lobby-leave').addEventListener('click', () => {
  mp.leave();
  ui.showScreen('screen-home');
  refreshHome();
});

// ---- designer wizard chrome ----
$('btn-designer-back').addEventListener('click', () => {
  if (mp.active && designer.pickMode) { ui.showScreen('screen-lobby'); mp.renderLobby(); return; }
  if (mp.active) { mp.leave(); }
  ui.showScreen('screen-home');
  refreshHome();
});
$('btn-wiz-back').addEventListener('click', () => designer.go(-1));
$('btn-wiz-next').addEventListener('click', () => designer.next());

refreshHome();

// ---- PWA ----
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
  });
}
