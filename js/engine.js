// ============================================================
//  3D ENGINE — Three.js scene, rooms, stepping stones, tokens
// ============================================================
import * as THREE from 'three';
import { buildToken, buildProp, propFilesFor, floorTextureFilesFor, loadImage } from './tokens.js';

const RING_COUNT = 12;
const RING_R = 5.6;    // ring of stepping stones
const MORPH_HEIGHT = 3.6; // a summoned form is monster-sized (same as room monsters)
const PATH_R = 7.7;    // walkway stone toward each door
const DOOR_R = 9.4;    // door threshold stone
const FLOOR_SIZE = 22;

// Compass direction → ring index & unit vector (N = -z on screen/up)
const DIRS = {
  E: { ring: 0, v: [1, 0] },
  S: { ring: 3, v: [0, 1] },
  W: { ring: 6, v: [-1, 0] },
  N: { ring: 9, v: [0, -1] },
};

/** Wrap an angle difference to [-π, π] for shortest-path turning. */
function wrapAngle(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060509);
    this.scene.fog = new THREE.Fog(0x060509, 24, 44);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    this.camera.position.set(0, 15, 17);
    this.camera.lookAt(0, 0, 1);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.mixers = [];
    this._fx = []; // transient effects (spell projectiles, rings)
    this._animItems = []; // ambient prop animations (torches, fireflies, ...)

    this.roomGroup = null;
    this.stones = [];            // {id, x, z, type, dir, neighbors[], mesh}
    this.stoneMeshes = [];
    this.doorMeshes = {};        // dir -> mesh
    this.heroTokens = new Map(); // heroId -> group
    this.monsterToken = null;
    this.highlighted = new Set();
    this.onStoneTap = null;      // set by game
    this.onDoorTap = null;
    this._monsterFocus = null;   // heroId the monster is glaring at
    this._spin = null;           // active hold-and-spin session on a hero
    this.sideToken = null;       // quest side-character in this room
    this.questItemToken = null;  // floating relic in this room
    this._morph = null;          // { heroId, original } while a hero is transformed
    this.onSideTap = null;       // set by game

    canvas.addEventListener('pointerdown', (e) => this._tap(e));
    canvas.addEventListener('pointermove', (e) => {
      if (!this._spin) return;
      const tok = this._spin.monster ? this.monsterToken : this.heroTokens.get(this._spin.heroId);
      if (!tok) { this._spin = null; return; }
      const dx = e.clientX - this._spin.startX;
      if (Math.abs(dx) > 5) this._spin.moved = true;
      tok.rotation.y = this._spin.startYaw + dx * 0.02;
    });
    canvas.addEventListener('pointerup', () => this._endSpin());
    canvas.addEventListener('pointercancel', () => this._endSpin());
    window.addEventListener('resize', () => this.resize());
    this.resize();

    const animate = () => {
      requestAnimationFrame(animate);
      const dt = this.clock.getDelta();
      const t = this.clock.elapsedTime;
      for (const m of this.mixers) m.update(dt);
      // idle bobbing for tokens — upward only, so the lowest point of the
      // bob rests exactly on the stone/platform and never clips through it
      for (const g of this.heroTokens.values()) {
        if (g.userData.baseY !== undefined) g.position.y = g.userData.baseY + (Math.sin(t * 2 + g.userData.phase) + 1) * 0.035;
      }
      if (this.monsterToken) {
        this.monsterToken.position.y = this.monsterToken.userData.baseY + (Math.sin(t * 1.4) + 1) * 0.055;
        // no idle spin — the monster locks its gaze on the focused hero
        // (paused while the player is spinning it by hand; on release the
        // gaze-lock naturally pulls it back to face the active hero)
        const focus = !this._spin?.monster && this._monsterFocus && this.heroTokens.get(this._monsterFocus);
        if (focus) {
          const target = Math.atan2(focus.position.x, focus.position.z);
          const d = wrapAngle(target - this.monsterToken.rotation.y);
          this.monsterToken.rotation.y += d * Math.min(1, dt * 5);
        }
      }
      if (this._pulseMeshes) {
        const s = 1 + Math.sin(t * 5) * 0.06;
        for (const m of this._pulseMeshes) m.scale.setScalar(s);
      }
      if (this.sideToken) {
        this.sideToken.position.y = (Math.sin(t * 1.7) + 1) * 0.04;
      }
      if (this._morph) {
        const m = this.heroTokens.get(this._morph.heroId);
        if (m) {
          // ease into the target size (grow-in on summon, shrink near allies)
          const ts = m.userData.targetScale ?? 1;
          if (Math.abs(m.scale.x - ts) > 0.002) m.scale.setScalar(m.scale.x + (ts - m.scale.x) * Math.min(1, dt * 5));
          // strike: dart at the monster and back
          if (this._summonStrikeT0 != null && this._strikeHome) {
            const p = (t - this._summonStrikeT0) / 0.5;
            const home = this._strikeHome;
            if (p >= 1) {
              this._summonStrikeT0 = null;
              m.position.x = home.x; m.position.z = home.z;
            } else {
              const lunge = Math.sin(p * Math.PI) * 1.6;
              const len = Math.hypot(home.x, home.z) || 1;
              m.position.x = home.x - (home.x / len) * lunge;
              m.position.z = home.z - (home.z / len) * lunge;
            }
          }
        }
      }
      if (this.questItemToken) {
        this.questItemToken.rotation.y += dt * 1.2;
        this.questItemToken.position.y = this.questItemToken.userData.baseY + Math.sin(t * 2.1) * 0.18;
      }
      for (const fn of this._animItems) fn(t, dt);
      // transient spell/attack effects
      for (let i = this._fx.length - 1; i >= 0; i--) {
        const fx = this._fx[i];
        fx.t += dt;
        const p = Math.min(1, fx.t / fx.dur);
        fx.update(p);
        if (p >= 1) {
          fx.cleanup?.();
          fx.resolve?.();
          this._fx.splice(i, 1);
        }
      }
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // pull camera back on narrow/portrait screens so the side doors stay in view;
    // look-at is shifted south (+z) so the board sits high, clear of the bottom HUD
    const portrait = h > w;
    this.camera.fov = portrait ? 56 : 46;
    this.camera.position.set(0, portrait ? 18 : 15, portrait ? 21.5 : 17.5);
    this.camera.lookAt(0, 0, portrait ? 2.8 : 1.6);
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------- room build
  /** Build room scene. room = ROOMS def, theme = realm THEMES entry,
   *  opts = {monster, monsterAccent, cleared, doorStates, roomTheme}.
   *  Monster rooms take the look of opts.roomTheme (the monster's own theme);
   *  the lobby (and anything without one) uses the realm theme. */
  async loadRoom(room, theme, opts = {}) {
    if (this.roomGroup) this.scene.remove(this.roomGroup);
    this.mixers = [];
    this._animItems = [];
    this.heroTokens.clear();
    this.monsterToken = null;
    this.stones = [];
    this.stoneMeshes = [];
    this.doorMeshes = {};
    this._pulseMeshes = [];

    this.sideToken = null;
    this.questItemToken = null;
    this._morph = null; // transformed heroes get fresh tokens with the room
    this._summonStrikeT0 = null;

    const spec = opts.roomTheme || theme;
    const g = new THREE.Group();
    this.roomGroup = g;
    this.scene.add(g);

    // lights
    g.add(new THREE.AmbientLight(0xffffff, spec.propStyle === 'backrooms' ? 0.75 : 0.55));
    const key = new THREE.DirectionalLight(0xfff2e0, 1.0);
    key.position.set(6, 14, 6);
    g.add(key);
    const glow = new THREE.PointLight(new THREE.Color(spec.glow), 60, 20, 1.8);
    glow.position.set(0, 4.5, 0);
    g.add(glow);

    // floor — custom image if provided (maps/<themeId>/room-<id>.jpg|png), else procedural
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    floorMat.map = await this._floorTexture(room, spec);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.name = 'floor';
    g.add(floor);

    // central platform (monster arena) or lobby brazier
    const platMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.platform), roughness: 0.6, metalness: 0.3 });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.4, 0.5, 40), platMat);
    platform.position.y = 0.25;
    g.add(platform);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(3.1, 0.09, 10, 48),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.accent), emissive: new THREE.Color(spec.glow), emissiveIntensity: 1.4 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.5;
    g.add(rim);

    // themed props around the room edges (seeded by room → stable layout)
    await this._buildProps(g, spec, room);

    // stepping stones
    const stoneGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.32, 8);
    const stoneMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.stone), roughness: 0.8 });
    const addStone = (id, x, z, type, dir = null) => {
      const mesh = new THREE.Mesh(stoneGeo, stoneMat.clone());
      mesh.position.set(x, 0.16, z);
      mesh.userData.stoneId = id;
      g.add(mesh);
      const stone = { id, x, z, type, dir, neighbors: [], mesh };
      this.stones.push(stone);
      this.stoneMeshes.push(mesh);
      return stone;
    };

    for (let i = 0; i < RING_COUNT; i++) {
      const a = (i / RING_COUNT) * Math.PI * 2;
      addStone(`ring${i}`, Math.cos(a) * RING_R, Math.sin(a) * RING_R, 'ring');
    }
    for (let i = 0; i < RING_COUNT; i++) {
      this._stone(`ring${i}`).neighbors.push(`ring${(i + 1) % RING_COUNT}`, `ring${(i + RING_COUNT - 1) % RING_COUNT}`);
    }

    // door paths + door frames for each exit
    for (const [dir, targetRoom] of Object.entries(room.exits)) {
      const d = DIRS[dir];
      const path = addStone(`path${dir}`, d.v[0] * PATH_R, d.v[1] * PATH_R, 'path', dir);
      const door = addStone(`door${dir}`, d.v[0] * DOOR_R, d.v[1] * DOOR_R, 'door', dir);
      const ringStone = this._stone(`ring${d.ring}`);
      ringStone.neighbors.push(path.id);
      path.neighbors.push(ringStone.id, door.id);
      door.neighbors.push(path.id);
      this._buildDoorFrame(g, dir, spec, opts.doorStates?.[dir] || 'open', targetRoom);
    }

    // monster / boss token or lobby centrepiece
    if (room.kind !== 'lobby' && opts.monster && !opts.cleared) {
      this.monsterToken = await this._makeToken(opts.monster, room.kind === 'boss' ? 4.6 : 3.6, true, opts.monsterAccent);
      this.monsterToken.position.set(0, 0.5, 0);
      this.monsterToken.userData.baseY = 0.5;
      g.add(this.monsterToken);
    } else if (room.kind === 'lobby') {
      const fire = new THREE.PointLight(new THREE.Color(spec.glow), 30, 10, 2);
      fire.position.set(0, 2, 0);
      g.add(fire);
      const brazier = new THREE.Mesh(
        new THREE.ConeGeometry(0.9, 1.6, 6),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.accent), emissive: new THREE.Color(spec.glow), emissiveIntensity: 2 })
      );
      brazier.position.y = 1.3;
      g.add(brazier);
      this._pulseMeshes.push(brazier);
    } else if (opts.cleared) {
      // loot glow where the monster fell
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.5),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.accent), emissive: new THREE.Color(spec.glow), emissiveIntensity: 1.5 })
      );
      gem.position.set(0, 1, 0);
      g.add(gem);
      this._pulseMeshes.push(gem);
    }
  }

  _stone(id) { return this.stones.find((s) => s.id === id); }
  stoneById(id) { return this._stone(id); }

  _buildDoorFrame(g, dir, theme, state, targetRoom) {
    // state: 'open' | 'locked' | 'boss-locked' | 'combat-locked'
    const d = DIRS[dir];
    const grp = new THREE.Group();
    const isBoss = targetRoom === 6;
    const col = state === 'open' ? theme.glow : (isBoss ? '#ff3030' : '#553333');
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1620, roughness: 0.5, metalness: 0.5 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(col), emissive: new THREE.Color(col),
      emissiveIntensity: state === 'open' ? 1.6 : 0.9, transparent: true, opacity: 0.85,
    });
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.4, 0.4), frameMat);
    const post2 = post1.clone();
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.4, 0.4), frameMat);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), glowMat);
    post1.position.set(-1.4, 1.7, 0);
    post2.position.set(1.4, 1.7, 0);
    lintel.position.set(0, 3.4, 0);
    portal.position.set(0, 1.6, 0);
    grp.add(post1, post2, lintel, portal);

    const dist = FLOOR_SIZE / 2 - 0.4;
    grp.position.set(d.v[0] * dist, 0, d.v[1] * dist);
    grp.rotation.y = Math.atan2(-d.v[0], -d.v[1]); // face room centre
    grp.userData.doorDir = dir;
    portal.userData.doorDir = dir;
    this.doorMeshes[dir] = grp;
    g.add(grp);
  }

  setDoorState(dir, state) {
    const grp = this.doorMeshes[dir];
    if (!grp) return;
    const portal = grp.children[3];
    const open = state === 'open';
    portal.material.emissiveIntensity = open ? 1.8 : 0.9;
    portal.material.color.set(open ? '#59ffa0' : '#553333');
    portal.material.emissive.set(open ? '#59ffa0' : '#663333');
  }

  // ---------------------------------------------------------- tokens
  async _makeToken(def, targetHeight, isMonster, accent) {
    const built = await buildToken(def, targetHeight, isMonster, accent);
    if (built.animations.length && built.animTarget) {
      const mixer = new THREE.AnimationMixer(built.animTarget);
      mixer.clipAction(built.animations[0]).play();
      this.mixers.push(mixer);
    }
    return built.group;
  }

  // ---------------------------------------------------------- spell & attack fx
  /**
   * Fire a colored effect. kind: 'attack' | 'blast' → projectile hero→monster;
   * 'heal' | 'ward' → rising ring around the hero. Resolves when finished.
   */
  castEffect(heroId, colorHex, kind = 'attack') {
    return new Promise((resolveOnce) => {
      let settled = false;
      const resolve = () => { if (!settled) { settled = true; resolveOnce(); } };
      // safety: never let a paused render loop (hidden tab) stall the game
      setTimeout(resolve, 1600);
      const heroT = this.heroTokens.get(heroId);
      if (!heroT || !this.roomGroup) return resolve();
      const color = new THREE.Color(colorHex || '#ffffff');

      if (kind === 'heal' || kind === 'ward') {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.95, 0.07, 8, 32),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.copy(heroT.position);
        const light = new THREE.PointLight(color, 30, 8, 2);
        light.position.copy(heroT.position).y += 1;
        this.roomGroup.add(ring, light);
        this._fx.push({
          t: 0, dur: 0.7, resolve,
          update: (p) => {
            ring.position.y = heroT.position.y + p * 2.4;
            ring.scale.setScalar(1 + p * 0.5);
            ring.material.opacity = 0.95 * (1 - p);
            light.intensity = 30 * (1 - p);
          },
          cleanup: () => { this.roomGroup.remove(ring, light); },
        });
      } else {
        const from = heroT.position.clone().add(new THREE.Vector3(0, 1.6, 0));
        const to = (this.monsterToken ? this.monsterToken.position.clone() : new THREE.Vector3(0, 0.5, 0))
          .add(new THREE.Vector3(0, 1.4, 0));
        this._projectile(from, to, color, kind === 'blast' ? 0.45 : 0.3, kind === 'blast' ? 0.3 : 0.2, resolve);
      }
    });
  }

  /** Monster's attack effect: colored projectile monster → hero. */
  monsterCastEffect(targetHeroId, colorHex) {
    return new Promise((resolveOnce) => {
      let settled = false;
      const resolve = () => { if (!settled) { settled = true; resolveOnce(); } };
      setTimeout(resolve, 1600); // hidden-tab safety
      const heroT = this.heroTokens.get(targetHeroId);
      if (!heroT || !this.roomGroup) return resolve();
      const from = (this.monsterToken ? this.monsterToken.position.clone() : new THREE.Vector3(0, 0.5, 0))
        .add(new THREE.Vector3(0, 1.8, 0));
      const to = heroT.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      this._projectile(from, to, new THREE.Color(colorHex || '#ff5050'), 0.4, 0.26, resolve);
    });
  }

  _projectile(from, to, color, dur, size, resolve) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 10), new THREE.MeshBasicMaterial({ color }));
    const light = new THREE.PointLight(color, 40, 10, 2);
    orb.position.copy(from);
    light.position.copy(from);
    this.roomGroup.add(orb, light);
    this._fx.push({
      t: 0, dur, resolve,
      update: (p) => {
        const pos = from.clone().lerp(to, p);
        pos.y += Math.sin(p * Math.PI) * 1.1; // arc
        orb.position.copy(pos);
        light.position.copy(pos);
        orb.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.4);
      },
      cleanup: () => { this.roomGroup.remove(orb, light); },
    });
  }

  async placeHero(heroDef, stoneId, index = 0, accent = null) {
    let token = this.heroTokens.get(heroDef.id);
    if (!token) {
      token = await this._makeToken(heroDef, 2.6, false, accent);
      token.userData.phase = index * 1.3;
      this.heroTokens.set(heroDef.id, token);
      this.roomGroup.add(token);
    }
    const s = this._stone(stoneId);
    token.position.set(s.x, 0.32, s.z);
    token.userData.baseY = 0.32;
    token.rotation.set(0, Math.atan2(-s.x, -s.z), 0); // face the centre platform
  }

  moveHero(heroId, stoneId) {
    const token = this.heroTokens.get(heroId);
    const s = this._stone(stoneId);
    if (!token || !s) return;
    token.position.set(s.x, 0.32, s.z);
    token.rotation.set(0, Math.atan2(-s.x, -s.z), 0);
    this._fitMorph(); // a transformed hero may now (not) be crowding allies
  }

  removeHero(heroId) {
    const t = this.heroTokens.get(heroId);
    if (t) { this.roomGroup.remove(t); this.heroTokens.delete(heroId); }
  }

  setHeroDowned(heroId, downed) {
    const t = this.heroTokens.get(heroId);
    if (t) t.rotation.z = downed ? Math.PI / 2 : 0;
  }

  /** Tell the monster whose turn it is — it turns to face that hero. */
  setMonsterFocus(heroId) {
    this._monsterFocus = heroId;
  }

  // ---------------------------------------------------------- quest pieces
  /** A side character standing off the ring, facing the platform. */
  async spawnSideCharacter(def) {
    if (this.sideToken) return;
    const g = this.roomGroup;
    const built = await buildToken(def, 2.4, false, def.color || '#ffd76a');
    if (g !== this.roomGroup || this.sideToken) return; // room changed while loading
    this.sideToken = built.group;
    if (built.animations.length && built.animTarget) {
      const mixer = new THREE.AnimationMixer(built.animTarget);
      mixer.clipAction(built.animations[0]).play();
      this.mixers.push(mixer);
    }
    this.sideToken.position.set(4.7, 0, -4.7);
    this.sideToken.rotation.set(0, Math.atan2(-4.7, 4.7), 0); // face the centre
    g.add(this.sideToken);
  }

  /** Summoning: the HERO transforms into the chosen monster. The token is
   *  swapped in place on the hero's stone; the original is kept for revert. */
  async morphHero(heroId, def, accent) {
    this.unmorphHero();
    const g = this.roomGroup;
    const original = this.heroTokens.get(heroId);
    if (!original) return;
    const built = await buildToken(def, MORPH_HEIGHT, true, accent || def.color);
    if (g !== this.roomGroup || this.heroTokens.get(heroId) !== original) return; // room changed mid-load
    const morph = built.group;
    if (built.animations.length && built.animTarget) {
      const mixer = new THREE.AnimationMixer(built.animTarget);
      mixer.clipAction(built.animations[0]).play();
      this.mixers.push(mixer);
    }
    morph.position.copy(original.position);
    morph.rotation.y = original.rotation.y;
    morph.userData.baseY = original.userData.baseY;
    morph.userData.phase = original.userData.phase || 0;
    this._morph = { heroId, original };
    this.roomGroup.remove(original);
    this.roomGroup.add(morph);
    this.heroTokens.set(heroId, morph);
    this._fitMorph();
    morph.scale.setScalar(0.05); // grow into the new form
  }

  /** Revert the transformed hero to their own body (same stone, same pose). */
  unmorphHero() {
    if (!this._morph) return;
    const { heroId, original } = this._morph;
    const morph = this.heroTokens.get(heroId);
    this._morph = null;
    this._summonStrikeT0 = null;
    if (!morph || !this.roomGroup) return; // room was rebuilt — tokens are fresh
    original.position.copy(morph.position);
    original.position.y = original.userData.baseY ?? 0.32;
    original.rotation.y = morph.rotation.y;
    original.rotation.z = morph.rotation.z; // keep a downed pose if it happened mid-summon
    this.roomGroup.remove(morph);
    this.roomGroup.add(original);
    this.heroTokens.set(heroId, original);
  }

  /** Monster-sized by default; shrink toward hero bulk only when an ally
   *  stands close enough to collide. */
  _fitMorph() {
    const m = this._morph && this.heroTokens.get(this._morph.heroId);
    if (!m) return;
    let crowded = false;
    for (const [id, t] of this.heroTokens) {
      if (id === this._morph.heroId) continue;
      if (Math.hypot(t.position.x - m.position.x, t.position.z - m.position.z) < 3.0) { crowded = true; break; }
    }
    m.userData.targetScale = crowded ? 2.4 / MORPH_HEIGHT : 1;
  }

  /** Quick lunge toward the platform when the transformed hero lands its blow. */
  summonStrike() {
    const m = this._morph && this.heroTokens.get(this._morph.heroId);
    if (m) {
      this._summonStrikeT0 = this.clock.elapsedTime;
      this._strikeHome = { x: m.position.x, z: m.position.z };
    }
    this.punchMonster();
  }

  /** The floating relic the party must claim. */
  spawnQuestItem(item) {
    if (this.questItemToken) return;
    const grp = new THREE.Group();
    const col = new THREE.Color(item.color || '#ffd76a');
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.3 })
    );
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.04, 8, 28),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 })
    );
    halo.rotation.x = Math.PI / 2;
    const light = new THREE.PointLight(col, 18, 8, 2);
    grp.add(gem, halo, light);
    grp.position.set(-4.7, 1.5, 4.7);
    grp.userData.baseY = 1.5;
    this.questItemToken = grp;
    this.roomGroup.add(grp);
  }

  removeQuestItem() {
    if (this.questItemToken) {
      this.roomGroup.remove(this.questItemToken);
      this.questItemToken = null;
    }
  }

  _endSpin() {
    const s = this._spin;
    this._spin = null;
    if (!s) return;
    const tok = this.heroTokens.get(s.heroId);
    if (!tok) return;
    if (!s.moved) {
      // plain tap on a hero → treat as tapping the stone they stand on
      // (keeps the tap-an-ally-to-swap movement working)
      const st = this.stones.find((x) => Math.hypot(x.x - tok.position.x, x.z - tok.position.z) < 0.6);
      if (st && this.onStoneTap) this.onStoneTap(st.id);
      return;
    }
    if (this.monsterToken) {
      // a monster lives here — snap focus back onto it
      const from = tok.rotation.y;
      const d = wrapAngle(Math.atan2(-tok.position.x, -tok.position.z) - from);
      this._fx.push({
        t: 0, dur: 0.28,
        update: (p) => { tok.rotation.y = from + d * (1 - (1 - p) ** 3); },
      });
    }
    // no monster: the hero keeps looking wherever the player left them
  }

  killMonster() {
    if (this.monsterToken) { this.roomGroup.remove(this.monsterToken); this.monsterToken = null; }
  }

  punchMonster() {
    if (!this.monsterToken) return;
    this.monsterToken.scale.setScalar(1.18);
    setTimeout(() => this.monsterToken && this.monsterToken.scale.setScalar(1), 160);
  }

  // ---------------------------------------------------------- highlighting
  highlightStones(ids) {
    this.highlighted = new Set(ids);
    for (const s of this.stones) {
      const on = this.highlighted.has(s.id);
      s.mesh.material.emissive = new THREE.Color(on ? '#59ffa0' : '#000000');
      s.mesh.material.emissiveIntensity = on ? 0.8 : 0;
      s.mesh.position.y = on ? 0.26 : 0.16;
    }
  }

  markActiveStone(stoneId) {
    for (const s of this.stones) {
      if (s.id === stoneId && !this.highlighted.has(s.id)) {
        s.mesh.material.emissive = new THREE.Color('#ffd76a');
        s.mesh.material.emissiveIntensity = 0.5;
      } else if (!this.highlighted.has(s.id)) {
        s.mesh.material.emissive = new THREE.Color('#000000');
        s.mesh.material.emissiveIntensity = 0;
      }
    }
  }

  // ---------------------------------------------------------- input
  _tap(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    // matrices can be stale if the tab was just backgrounded (rAF throttled)
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.roomGroup?.children || [], true);

    // hold-and-drag on a hero or monster token spins it (heroes snap back
    // to face a living monster; the monster snaps back to the active hero;
    // a plain tap on a hero falls through to its stone)
    for (const hit of hits) {
      let o = hit.object;
      while (o && o.parent !== this.roomGroup) o = o.parent;
      if (!o) continue;
      if (o === this.sideToken && this.onSideTap) { this.onSideTap(); return; }
      if (o === this.monsterToken) {
        this._spin = { monster: true, startX: e.clientX, startYaw: o.rotation.y, moved: false };
        this.canvas.setPointerCapture?.(e.pointerId);
        return;
      }
      for (const [heroId, tok] of this.heroTokens) {
        if (tok === o) {
          this._spin = { heroId, startX: e.clientX, startYaw: tok.rotation.y, moved: false };
          this.canvas.setPointerCapture?.(e.pointerId);
          return;
        }
      }
    }

    // stones take priority over doors — door frames often stand between the
    // camera and the walkway stones and would otherwise swallow the tap
    let doorDir = null;
    for (const hit of hits) {
      let o = hit.object;
      while (o) {
        if (o.userData.stoneId && this.onStoneTap) { this.onStoneTap(o.userData.stoneId); return; }
        if (o.userData.doorDir && doorDir === null) doorDir = o.userData.doorDir;
        o = o.parent;
      }
    }
    // fat-finger fallback: snap to the nearest stone on the ground plane;
    // only consume the tap if it produced an actual move, else try the door
    if (this.onStoneTap) {
      const pt = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) {
        let best = null, bestD = 2.0;
        for (const s of this.stones) {
          const d = Math.hypot(s.x - pt.x, s.z - pt.z);
          if (d < bestD) { bestD = d; best = s; }
        }
        if (best && this.onStoneTap(best.id)) return;
      }
    }
    if (doorDir && this.onDoorTap) this.onDoorTap(doorDir);
  }

  // ---------------------------------------------------------- themed props
  /** Decorate the room edges. If the user has dropped .glb props into
   *  models/props/<propStyle>/, those replace the decoration; otherwise the
   *  built-in procedural props + animations are used. */
  async _buildProps(g, spec, room) {
    // seeded PRNG: a room's decoration is identical on every visit
    let seed = ((room?.id ?? 0) + 1) * 2654435761;
    for (const ch of String(spec.id)) seed = (seed ^ ch.charCodeAt(0)) * 16777619;
    let t = seed >>> 0;
    const R = () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
    const accent = new THREE.Color(spec.accent);
    const glow = new THREE.Color(spec.glow);
    const anim = (fn) => this._animItems.push(fn);
    const mat = (c, opts2 = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.75, ...opts2 });
    const glowMat = (c, i = 1.6) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), emissive: new THREE.Color(c), emissiveIntensity: i });
    // corner + off-axis edge spots (clear of doors, walkways and the stone ring)
    const corners = [[-8.3, -8.3], [8.3, -8.3], [-8.3, 8.3], [8.3, 8.3]];
    const edges = [[-8.6, -4.4], [8.6, -4.4], [-8.6, 4.4], [8.6, 4.4], [-4.4, -8.6], [4.4, -8.6], [-4.4, 8.6], [4.4, 8.6]];

    // glowing animated toadstools — dark forest keeps its magic even when
    // custom props decorate the room
    const toadstools = (positions) => {
      for (const [px, pz] of positions) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.42, 6), mat('#cfc4a8'));
        stem.position.set(px, 0.21, pz);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), glowMat(spec.glow, 1));
        cap.position.set(px, 0.42, pz);
        g.add(stem, cap);
        anim((t) => { cap.material.emissiveIntensity = 0.8 + Math.sin(t * 2.2 + pz) * 0.45; });
      }
    };

    // user-supplied prop models take over the room's decoration
    const files = (await propFilesFor(spec.propStyle).catch(() => [])).slice().sort();
    if (files.length) {
      // walk the spots in order around the room's perimeter and deal the
      // prop types out round-robin — evenly interleaved, never clumped
      const spots = [...corners, ...edges]
        .sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
      const startFile = Math.floor(R() * files.length); // seeded per room
      spots.forEach(([px, pz], i) => {
        const file = files[(startFile + i) % files.length];
        const rot = R() * Math.PI * 2;
        const size = 0.92 + R() * 0.16; // subtle variation between duplicates
        const jx = (R() - 0.5) * 0.6, jz = (R() - 0.5) * 0.6; // slight scatter
        buildProp(`models/props/${spec.propStyle}/${file}`).then((prop) => {
          if (g !== this.roomGroup) return; // room changed while loading
          prop.position.set(px + jx, 0, pz + jz);
          prop.rotation.y = rot;
          prop.scale.multiplyScalar(size);
          g.add(prop);
        }).catch(() => { /* bad file — skip the spot */ });
      });
      // soft accent light so the props read against the dark floor
      const fill = new THREE.PointLight(glow, 14, 16, 2);
      fill.position.set(0, 5, 6);
      g.add(fill);
      if (spec.propStyle === 'darkforest') {
        // magical toadstools glow on the diagonals, clear of the prop spots
        const diagonals = [[5.1, 5.1], [-5.1, 5.1], [-5.1, -5.1], [5.1, -5.1]]
          .map(([x, z]) => [x + (R() - 0.5), z + (R() - 0.5)]);
        diagonals.splice(Math.floor(R() * 4), 1); // seeded: skip one corner
        toadstools(diagonals);
      }
      return;
    }

    switch (spec.propStyle) {
      case 'scifi': {
        for (const [px, pz] of corners) { // glowing tech pillars
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, 0.6), mat('#1a2430', { metalness: 0.7, roughness: 0.35 }));
          pillar.position.set(px, 1.6, pz);
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.18, 0.66), glowMat(spec.accent, 2));
          band.position.set(px, 2.4, pz);
          g.add(pillar, band);
          anim((t) => { band.material.emissiveIntensity = 1.6 + Math.sin(t * 3 + px) * 0.8; });
        }
        for (const [px, pz] of [edges[0], edges[3], edges[5]]) { // canisters
          const can = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 10), mat('#26303c', { metalness: 0.6, roughness: 0.4 }));
          can.position.set(px, 0.55, pz);
          const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 10), glowMat(spec.glow, 1.2));
          lid.position.set(px, 1.15, pz);
          g.add(can, lid);
        }
        const holo = new THREE.Mesh( // spinning holo-cube
          new THREE.BoxGeometry(0.8, 0.8, 0.8),
          new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.8 })
        );
        holo.position.set(edges[6][0], 2.2, edges[6][1]);
        g.add(holo);
        anim((t, dt) => { holo.rotation.y += dt * 1.4; holo.rotation.x += dt * 0.6; holo.position.y = 2.2 + Math.sin(t * 1.8) * 0.25; });
        break;
      }
      case 'darkforest': {
        for (const [px, pz] of [...corners, edges[1], edges[6]]) { // gnarled trees
          const s = 0.8 + R() * 0.5;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 1.4 * s, 7), mat('#3a2c1c'));
          trunk.position.set(px, 0.7 * s, pz);
          g.add(trunk);
          for (let i = 0; i < 3; i++) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry((1.3 - i * 0.32) * s, 1.15 * s, 7), mat(i % 2 ? '#17301a' : '#1d3a20'));
            cone.position.set(px, (1.6 + i * 0.75) * s, pz);
            cone.rotation.y = R() * Math.PI;
            g.add(cone);
          }
        }
        toadstools([edges[0], edges[4], edges[7]]); // glowing mushrooms
        for (let i = 0; i < 5; i++) { // drifting fireflies
          const fly = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), glowMat(spec.glow, 3));
          const bx = (R() - 0.5) * 15, bz = (R() - 0.5) * 15, ph = R() * 9;
          g.add(fly);
          anim((t) => {
            fly.position.set(bx + Math.sin(t * 0.7 + ph) * 1.6, 1.4 + Math.sin(t * 1.3 + ph * 2) * 0.7, bz + Math.cos(t * 0.5 + ph) * 1.6);
            fly.material.emissiveIntensity = 2 + Math.sin(t * 4 + ph) * 1.6;
          });
        }
        break;
      }
      case 'dungeon': {
        for (const [px, pz] of corners) { // stone columns
          const col = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.4, 0.9), mat('#2b2730'));
          col.position.set(px, 1.7, pz);
          const cap = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.28, 1.15), mat('#221e28'));
          cap.position.set(px, 3.5, pz);
          g.add(col, cap);
        }
        for (const [px, pz] of [corners[0], corners[1]]) { // torches on the north columns
          const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5), mat('#4a3620'));
          stick.position.set(px, 2.4, pz + 0.55);
          stick.rotation.x = 0.5;
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 6), glowMat('#ffab52', 2.5));
          flame.position.set(px, 2.85, pz + 0.75);
          const light = new THREE.PointLight(new THREE.Color('#ff9a40'), 16, 9, 2);
          light.position.copy(flame.position);
          g.add(stick, flame, light);
          anim((t) => {
            const f = 1 + Math.sin(t * 11 + px) * 0.18 + Math.sin(t * 23) * 0.1;
            flame.scale.set(f, f, f);
            light.intensity = 14 + Math.sin(t * 13 + px) * 5;
          });
        }
        for (const [px, pz] of [edges[2], edges[5]]) { // bone piles
          for (let i = 0; i < 4; i++) {
            const bone = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.4, 3, 5), mat('#d8d2c0'));
            bone.position.set(px + (R() - 0.5) * 0.8, 0.08, pz + (R() - 0.5) * 0.8);
            bone.rotation.set(Math.PI / 2, 0, R() * Math.PI);
            g.add(bone);
          }
        }
        break;
      }
      case 'crystalcave': {
        for (const [px, pz] of [...corners, ...edges.slice(0, 4)]) { // crystal clusters
          const n = 2 + (R() * 3 | 0);
          for (let i = 0; i < n; i++) {
            const h = 0.7 + R() * 1.8;
            const crystal = new THREE.Mesh(
              new THREE.ConeGeometry(0.14 + R() * 0.22, h, 5),
              glowMat(R() > 0.4 ? spec.accent : spec.glow, 0.9)
            );
            crystal.position.set(px + (R() - 0.5) * 1.1, h * 0.42, pz + (R() - 0.5) * 1.1);
            crystal.rotation.set((R() - 0.5) * 0.5, R() * Math.PI, (R() - 0.5) * 0.5);
            g.add(crystal);
            anim((t) => { crystal.material.emissiveIntensity = 0.7 + Math.sin(t * 1.6 + px + crystal.position.x) * 0.35; });
          }
        }
        for (const [px, pz] of [edges[5], edges[6]]) { // dark stalagmites
          const stal = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6 + R(), 6), mat('#241a30'));
          stal.position.set(px, 0.8, pz);
          g.add(stal);
        }
        break;
      }
      case 'backrooms': {
        for (const [px, pz] of corners) { // square drywall pillars
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.6, 1.1), mat('#8a7f4e', { roughness: 0.95 }));
          pillar.position.set(px, 1.8, pz);
          const trim = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.2), mat('#6e6540'));
          trim.position.set(px, 0.1, pz);
          g.add(pillar, trim);
        }
        for (const [px, pz] of [[-4.4, -6], [4.4, 0], [-4.4, 6]]) { // buzzing fluorescents
          const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.9), glowMat('#fff2a8', 1.8));
          panel.position.set(px, 4.4, pz);
          const light = new THREE.PointLight(new THREE.Color('#fff2a8'), 10, 12, 2);
          light.position.set(px, 4, pz);
          g.add(panel, light);
          anim((t) => { // fluorescent flicker
            const flick = R() > 0.97 ? 0.25 : 1;
            panel.material.emissiveIntensity = (1.5 + Math.sin(t * 30 + px) * 0.15) * flick;
            light.intensity = 9 * flick;
          });
        }
        break;
      }
      case 'cult': {
        for (const [px, pz] of corners) { // rune obelisks
          const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.55, 3.2, 4), mat('#1d1116'));
          ob.position.set(px, 1.6, pz);
          ob.rotation.y = Math.PI / 4;
          const rune = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.46), glowMat(spec.accent, 1.4));
          rune.position.set(px + (px > 0 ? -0.31 : 0.31), 1.7, pz);
          g.add(ob, rune);
          anim((t) => { rune.material.emissiveIntensity = 1.1 + Math.sin(t * 2 + pz) * 0.6; });
        }
        const candleLight = new THREE.PointLight(new THREE.Color('#ff8840'), 14, 12, 2);
        candleLight.position.set(0, 2.5, -6);
        g.add(candleLight);
        const flames = [];
        for (const [px, pz] of edges.slice(0, 6)) { // guttering candles
          const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.5 + R() * 0.4, 7), mat('#d8cfc0'));
          wax.position.set(px, 0.3, pz);
          const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), glowMat('#ffab52', 3));
          flame.position.set(px, wax.position.y + 0.4, pz);
          g.add(wax, flame);
          flames.push(flame);
        }
        anim((t) => {
          flames.forEach((f, i) => { f.material.emissiveIntensity = 2.4 + Math.sin(t * 9 + i * 2.1) * 1.1; });
          candleLight.intensity = 12 + Math.sin(t * 12) * 4;
        });
        break;
      }
      case 'temple': {
        for (const [px, pz] of [...corners, edges[2], edges[3]]) { // sandstone columns
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 3.4, 12), mat('#4a3d26'));
          col.position.set(px, 1.7, pz);
          const capT = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.24, 1.2), mat('#5a4b2e'));
          capT.position.set(px, 3.5, pz);
          const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.24, 1.2), mat('#5a4b2e'));
          base.position.set(px, 0.12, pz);
          g.add(col, capT, base);
        }
        for (const [px, pz] of [edges[4], edges[7]]) { // gold idols
          const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8), mat('#c9a227', { metalness: 0.85, roughness: 0.3 }));
          body.position.set(px, 0.55, pz);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat('#c9a227', { metalness: 0.85, roughness: 0.3 }));
          head.position.set(px, 1.25, pz);
          g.add(body, head);
        }
        const shaft = new THREE.Mesh( // holy light shaft over the platform edge
          new THREE.CylinderGeometry(0.9, 1.4, 7, 16, 1, true),
          new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false })
        );
        shaft.position.set(-4.4, 3.5, -6);
        g.add(shaft);
        anim((t) => { shaft.material.opacity = 0.05 + Math.sin(t * 0.9) * 0.025; });
        break;
      }
    }
  }

  // ---------------------------------------------------------- floor texture
  async _floorTexture(room, spec) {
    // floors are expensive (network probes + 1024² canvas work) and
    // deterministic per room+theme+accent — build once, reuse forever
    this._floorCache = this._floorCache || new Map();
    const key = `${spec.id}|${spec.accent}|room-${room.id}`;
    if (!this._floorCache.has(key)) {
      this._floorCache.set(key, (async () => {
        // 1) full room art: maps/<themeId>/room-<id>.jpg or .png (parallel probe)
        const probe = (ext) => new Promise((res) => {
          new THREE.TextureLoader().load(`maps/${spec.id}/room-${room.id}.${ext}`, (t) => res(t), undefined, () => res(null));
        });
        const [jpg, png] = await Promise.all([probe('jpg'), probe('png')]);
        const art = jpg || png;
        if (art) { art.colorSpace = THREE.SRGBColorSpace; return art; }
        // 2) user-supplied tileable texture, with theme markings on top
        const texFiles = (await floorTextureFilesFor(spec.id).catch(() => [])).slice().sort();
        if (texFiles.length) {
          const file = texFiles[room.id % texFiles.length]; // stable per room
          const img = await loadImage(`floor-textures/${spec.id}/${file}`).catch(() => null);
          if (img) return this._proceduralFloor(spec, img);
        }
        // 3) fully procedural
        return this._proceduralFloor(spec);
      })());
    }
    return this._floorCache.get(key);
  }

  _proceduralFloor(spec, baseImg = null) {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const x = c.getContext('2d');
    const R = Math.random;
    x.fillStyle = spec.floor;
    x.fillRect(0, 0, 1024, 1024);
    if (baseImg) {
      // tile the texture 4×4 across the floor, tinted slightly toward the
      // theme's darkness so it doesn't fight the board lighting
      for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
        x.drawImage(baseImg, tx * 256, ty * 256, 256, 256);
      }
      x.fillStyle = 'rgba(0,0,0,0.32)';
      x.fillRect(0, 0, 1024, 1024);
    }
    const skipBase = !!baseImg; // texture already provides surface detail
    let drawRing = true;

    switch (spec.pattern) {
      case 'circuit': { // sci-fi: metal panels + glowing traces
        if (!skipBase) {
          x.strokeStyle = 'rgba(0,0,0,0.5)';
          x.lineWidth = 3;
          for (let i = 0; i <= 8; i++) {
            x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, 1024); x.stroke();
            x.beginPath(); x.moveTo(0, i * 128); x.lineTo(1024, i * 128); x.stroke();
          }
        }
        x.strokeStyle = spec.accent;
        x.fillStyle = spec.accent;
        x.globalAlpha = 0.4;
        x.lineWidth = 3;
        for (let i = 0; i < 30; i++) { // L-shaped circuit traces with node dots
          let px = R() * 1024, py = R() * 1024;
          x.beginPath(); x.moveTo(px, py);
          for (let s = 0; s < 2 + (R() * 2 | 0); s++) {
            const len = 40 + R() * 120;
            if (R() > 0.5) px += (R() > 0.5 ? 1 : -1) * len; else py += (R() > 0.5 ? 1 : -1) * len;
            x.lineTo(px, py);
          }
          x.stroke();
          x.beginPath(); x.arc(px, py, 5, 0, Math.PI * 2); x.fill();
        }
        x.globalAlpha = 1;
        break;
      }
      case 'organic': { // dark forest: moss blotches + roots
        if (skipBase) break;
        for (let i = 0; i < 90; i++) {
          const g2 = ['rgba(52,84,40,', 'rgba(34,58,30,', 'rgba(70,96,44,'][R() * 3 | 0];
          x.fillStyle = g2 + (0.1 + R() * 0.25) + ')';
          x.beginPath();
          x.ellipse(R() * 1024, R() * 1024, 20 + R() * 90, 14 + R() * 60, R() * Math.PI, 0, Math.PI * 2);
          x.fill();
        }
        x.strokeStyle = 'rgba(20,14,8,0.55)';
        for (let i = 0; i < 14; i++) { // winding roots
          x.lineWidth = 2 + R() * 4;
          let px = R() * 1024, py = R() * 1024;
          x.beginPath(); x.moveTo(px, py);
          for (let s = 0; s < 4; s++) {
            x.quadraticCurveTo(px + (R() - 0.5) * 160, py + (R() - 0.5) * 160, px += (R() - 0.5) * 220, py += (R() - 0.5) * 220);
          }
          x.stroke();
        }
        break;
      }
      case 'slabs': { // dungeon: big jittered stone slabs + cracks
        if (skipBase) break;
        x.strokeStyle = 'rgba(0,0,0,0.55)';
        x.lineWidth = 5;
        for (let i = 0; i <= 5; i++) {
          const j = () => (R() - 0.5) * 26;
          x.beginPath(); x.moveTo(i * 205 + j(), 0); x.lineTo(i * 205 + j(), 1024); x.stroke();
          x.beginPath(); x.moveTo(0, i * 205 + j()); x.lineTo(1024, i * 205 + j()); x.stroke();
        }
        x.lineWidth = 2;
        x.strokeStyle = 'rgba(0,0,0,0.4)';
        for (let i = 0; i < 16; i++) { // cracks
          let px = R() * 1024, py = R() * 1024;
          x.beginPath(); x.moveTo(px, py);
          for (let s = 0; s < 3; s++) x.lineTo(px += (R() - 0.5) * 120, py += (R() - 0.5) * 120);
          x.stroke();
        }
        break;
      }
      case 'crystal': { // crystal cave: faceted shards + sparkle
        for (let i = 0; i < (skipBase ? 0 : 46); i++) {
          const cx = R() * 1024, cy = R() * 1024, s = 14 + R() * 60;
          x.fillStyle = `rgba(${R() > 0.5 ? '181,122,255' : '207,154,255'},${0.08 + R() * 0.2})`;
          x.beginPath();
          x.moveTo(cx, cy - s);
          x.lineTo(cx + s * 0.6, cy + s * 0.4);
          x.lineTo(cx - s * 0.6, cy + s * 0.5);
          x.closePath();
          x.fill();
        }
        x.fillStyle = spec.glow;
        x.globalAlpha = 0.7;
        for (let i = 0; i < 110; i++) x.fillRect(R() * 1024, R() * 1024, 2, 2);
        x.globalAlpha = 1;
        break;
      }
      case 'tiles': { // backrooms: moist carpet tiles + stains
        if (skipBase) { drawRing = false; break; }
        for (let ty = 0; ty < 16; ty++) for (let tx = 0; tx < 16; tx++) {
          x.fillStyle = (tx + ty) % 2 ? 'rgba(255,244,160,0.07)' : 'rgba(0,0,0,0.08)';
          x.fillRect(tx * 64, ty * 64, 64, 64);
        }
        x.strokeStyle = 'rgba(60,52,20,0.5)';
        x.lineWidth = 2;
        for (let i = 0; i <= 16; i++) {
          x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, 1024); x.stroke();
          x.beginPath(); x.moveTo(0, i * 64); x.lineTo(1024, i * 64); x.stroke();
        }
        for (let i = 0; i < 14; i++) { // damp stains
          x.fillStyle = `rgba(40,34,10,${0.12 + R() * 0.15})`;
          x.beginPath();
          x.ellipse(R() * 1024, R() * 1024, 30 + R() * 90, 24 + R() * 70, R() * Math.PI, 0, Math.PI * 2);
          x.fill();
        }
        drawRing = false;
        break;
      }
      case 'runes': { // ancient cult: blood pentagram + scattered glyphs
        for (let i = 0; i < (skipBase ? 0 : 1600); i++) {
          x.fillStyle = `rgba(0,0,0,${R() * 0.1})`;
          x.fillRect(R() * 1024, R() * 1024, R() * 5 + 1, R() * 5 + 1);
        }
        x.strokeStyle = spec.accent;
        x.globalAlpha = 0.65;
        x.lineWidth = 7;
        x.beginPath(); x.arc(512, 512, 330, 0, Math.PI * 2); x.stroke();
        x.lineWidth = 5;
        x.beginPath(); // 5-pointed star
        for (let i = 0; i <= 5; i++) {
          const a = ((i * 2) % 5) / 5 * Math.PI * 2 - Math.PI / 2;
          const px = 512 + Math.cos(a) * 330, py = 512 + Math.sin(a) * 330;
          i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.stroke();
        x.lineWidth = 2; // small glyphs around the outside
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          x.save();
          x.translate(512 + Math.cos(a) * 395, 512 + Math.sin(a) * 395);
          x.rotate(a);
          for (let s = 0; s < 3; s++) { x.beginPath(); x.moveTo(-8 + R() * 16, -8); x.lineTo(-8 + R() * 16, 8); x.stroke(); }
          x.restore();
        }
        x.globalAlpha = 1;
        drawRing = false;
        break;
      }
      case 'inlay': { // temple: sandstone tiles + gold inlay border
        if (!skipBase) {
          x.strokeStyle = 'rgba(0,0,0,0.35)';
          x.lineWidth = 3;
          for (let i = 0; i <= 8; i++) {
            x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, 1024); x.stroke();
            x.beginPath(); x.moveTo(0, i * 128); x.lineTo(1024, i * 128); x.stroke();
          }
        }
        x.strokeStyle = spec.accent;
        x.globalAlpha = 0.55;
        x.lineWidth = 6;
        x.strokeRect(96, 96, 832, 832);
        x.lineWidth = 2;
        x.strokeRect(120, 120, 784, 784);
        for (const [cx, cy] of [[96, 96], [928, 96], [96, 928], [928, 928]]) { // corner diamonds
          x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4);
          x.strokeRect(-22, -22, 44, 44);
          x.restore();
        }
        x.globalAlpha = 1;
        break;
      }
    }

    // common: light speckle, centre accent ring, vignette
    for (let i = 0; i < (skipBase ? 0 : 1600); i++) {
      const a = R() * 0.08;
      x.fillStyle = R() > 0.5 ? `rgba(255,255,255,${a * 0.35})` : `rgba(0,0,0,${a})`;
      x.fillRect(R() * 1024, R() * 1024, R() * 4 + 1, R() * 4 + 1);
    }
    if (drawRing) {
      x.strokeStyle = spec.accent;
      x.globalAlpha = 0.5;
      x.lineWidth = 6;
      x.beginPath(); x.arc(512, 512, 205, 0, Math.PI * 2); x.stroke();
      x.lineWidth = 2;
      x.beginPath(); x.arc(512, 512, 300, 0, Math.PI * 2); x.stroke();
      x.globalAlpha = 1;
    }
    const grad = x.createRadialGradient(512, 512, 330, 512, 512, 740);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, spec.pattern === 'tiles' ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.88)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 1024, 1024);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
