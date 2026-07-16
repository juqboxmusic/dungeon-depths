// ============================================================
//  TOKENS — shared 3D model loading + placeholder pieces
//  Used by the game engine and the designer's preview viewer.
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map();

export function loadGLTF(path) {
  if (!path) return Promise.reject(new Error('no model'));
  if (!cache.has(path)) {
    cache.set(path, new Promise((res, rej) => loader.load(path, res, undefined, rej)));
  }
  return cache.get(path);
}

/**
 * Build a display token for a hero/monster definition.
 * Tries the GLB in def.model first; falls back to a stylized placeholder.
 * `accent` colors the illuminated base ring (the main attack's color).
 * Returns { group, animations, animTarget } — feet at y=0, normalized height.
 */
export async function buildToken(def, targetHeight, isMonster, accent) {
  try {
    const gltf = await loadGLTF(def.model);
    const model = cloneSkinned(gltf.scene); // safe for rigged/skinned models
    // Tripo exports face +x, but all game facing math assumes the front is
    // +z — normalize here. modelRotation (degrees) in data.js composes on
    // top for models that need a different fix.
    const [rx, ry, rz] = def.modelRotation || [0, 0, 0];
    model.rotation.set(
      (rx * Math.PI) / 180,
      (ry * Math.PI) / 180 - Math.PI / 2,
      (rz * Math.PI) / 180
    );
    model.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = targetHeight / Math.max(size.y, 0.001);
    model.scale.setScalar(scale);
    box.setFromObject(model);
    model.position.y -= box.min.y; // feet on ground
    const centre = box.getCenter(new THREE.Vector3());
    model.position.x -= centre.x;
    model.position.z -= centre.z;
    const wrap = new THREE.Group();
    wrap.add(model);
    wrap.add(makeBaseRing(targetHeight, accent || def.color));
    return { group: wrap, animations: gltf.animations || [], animTarget: model };
  } catch {
    return { group: buildPlaceholder(def, targetHeight, isMonster, accent), animations: [], animTarget: null };
  }
}

/** Illuminated disc under every token — colored by the main attack. */
function makeBaseRing(targetHeight, colorHex) {
  const col = new THREE.Color(colorHex || '#d4a017');
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(targetHeight * 0.3, targetHeight * 0.34, 0.1, 24),
    new THREE.MeshStandardMaterial({ color: 0x111116, emissive: col, emissiveIntensity: 0.9 })
  );
  base.position.y = 0.05;
  base.userData.baseRing = true;
  return base;
}

/** Recolor a token's base ring in place (live preview updates). */
export function setBaseRingColor(group, colorHex) {
  group?.traverse((o) => {
    if (o.userData.baseRing) o.material.emissive.set(colorHex);
  });
}

// ------------------------------------------------------------ room props
// Props are sized by what they ARE, not to a single uniform height —
// a boulder should hug the ground while a tree towers. Filename keywords
// decide first; the model's shape (tall vs squat) is the fallback.
const PROP_HEIGHTS = [
  [/tree|pine|oak|willow/, 3.4],
  [/pillar|column|obelisk|statue|totem|tower|lamp|torch|banner/, 2.6],
  [/altar|table|cart|tomb|grave|fence|throne/, 1.5],
  [/rock|stone|boulder|crate|box|barrel|chest|mushroom|bush|stump|skull|bone|pot|urn|jar/, 1.0],
];

function propTargetHeight(path, size) {
  const name = path.toLowerCase();
  for (const [re, h] of PROP_HEIGHTS) if (re.test(name)) return h;
  const aspect = size.y / Math.max(size.x, size.z, 0.001);
  if (aspect < 0.8) return 1.1;  // squat things sit low
  if (aspect > 1.8) return 2.8;  // slender things stand tall
  return 1.8;
}

/** Load a prop GLB, sized to fit its nature, feet on the ground. */
export async function buildProp(path) {
  const gltf = await loadGLTF(path);
  const model = cloneSkinned(gltf.scene);
  model.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(propTargetHeight(path, size) / Math.max(size.y, 0.001));
  box.setFromObject(model);
  model.position.y -= box.min.y;
  const centre = box.getCenter(new THREE.Vector3());
  model.position.x -= centre.x;
  model.position.z -= centre.z;
  const wrap = new THREE.Group();
  wrap.add(model);
  return wrap;
}

/**
 * Which files exist in a theme's drop-in folder (props, floor textures...)?
 * Dev: parses the local server's directory listing, so freshly dropped
 * files appear on the next page load with no config. Deployed hosts don't
 * list directories, so <baseDir>/manifest.json is the fallback there.
 */
const folderLists = new Map();
function listThemeFolder(baseDir, themeId, exts) {
  const key = `${baseDir}/${themeId}`;
  if (!folderLists.has(key)) {
    folderLists.set(key, (async () => {
      try {
        const r = await fetch(`${baseDir}/${themeId}/`);
        if (r.ok && (r.headers.get('content-type') || '').includes('html')) {
          const html = await r.text();
          const re = new RegExp(`href="([^"]+\\.(?:${exts}))"`, 'gi');
          const files = [...html.matchAll(re)].map((m) => decodeURIComponent(m[1].split('/').pop()));
          if (files.length) return [...new Set(files)];
        }
      } catch { /* no listing — try the manifest */ }
      try {
        const r = await fetch(`${baseDir}/manifest.json`);
        if (r.ok) {
          const manifest = await r.json();
          if (Array.isArray(manifest[themeId])) return manifest[themeId];
        }
      } catch { /* no manifest either */ }
      return [];
    })());
  }
  return folderLists.get(key);
}

// .glb (single file, e.g. Tripo) and .gltf (multi-file, e.g. Poly Haven —
// keep its textures/ folder and .bin alongside) both work as props
export const propFilesFor = (themeId) => listThemeFolder('models/props', themeId, 'glb|gltf');

// PBR bundles (Poly Haven etc.) ship normal/roughness/displacement maps the
// browser can't use as a floor — keep only color/diffuse-looking images.
const NON_COLOR_MAP = /(_|-)?(nor(_gl|_dx)?|normal|disp|displacement|height|rough(ness)?|metal(lic|ness)?|ao|ambientocclusion|arm|spec(ular)?|bump|mask)(_|-|\.|\d)/i;
export const floorTextureFilesFor = async (themeId) => {
  const files = await listThemeFolder('floor-textures', themeId, 'jpg|jpeg|png|webp');
  const colorOnly = files.filter((f) => !NON_COLOR_MAP.test(f));
  return colorOnly.length ? colorOnly : files;
};

/** Side-character models (models/side-characters/) — random pick per game. */
let sideList = null;
export function sideCharacterFiles() {
  if (!sideList) {
    sideList = (async () => {
      try {
        const r = await fetch('models/side-characters/');
        if (r.ok && (r.headers.get('content-type') || '').includes('html')) {
          const html = await r.text();
          const files = [...html.matchAll(/href="([^"]+\.glb)"/gi)].map((m) => decodeURIComponent(m[1].split('/').pop()));
          if (files.length) return [...new Set(files)];
        }
      } catch { /* try the manifest */ }
      try {
        const r = await fetch('models/side-characters/manifest.json');
        if (r.ok) {
          const m = await r.json();
          if (Array.isArray(m)) return m;
        }
      } catch { /* none */ }
      return [];
    })();
  }
  return sideList;
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export function buildPlaceholder(def, targetHeight, isMonster, accent) {
  const grp = new THREE.Group();
  const col = new THREE.Color(def.color || '#cccccc');
  const mat = new THREE.MeshStandardMaterial({
    color: col, roughness: 0.55, metalness: 0.15,
    emissive: col.clone().multiplyScalar(0.35),
  });
  const dark = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.4), roughness: 0.8 });
  if (isMonster) {
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(targetHeight * 0.33, 0), mat);
    body.position.y = targetHeight * 0.45;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(targetHeight * 0.17, 0), mat);
    head.position.y = targetHeight * 0.82;
    const hornGeo = new THREE.ConeGeometry(targetHeight * 0.05, targetHeight * 0.28, 5);
    const h1 = new THREE.Mesh(hornGeo, dark);
    const h2 = h1.clone();
    h1.position.set(-targetHeight * 0.13, targetHeight * 0.98, 0); h1.rotation.z = 0.5;
    h2.position.set(targetHeight * 0.13, targetHeight * 0.98, 0); h2.rotation.z = -0.5;
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(targetHeight * 0.045),
      new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 3 })
    );
    eye.position.set(0, targetHeight * 0.84, targetHeight * 0.15);
    grp.add(body, head, h1, h2, eye);
  } else {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(targetHeight * 0.18, targetHeight * 0.4, 4, 10), mat);
    body.position.y = targetHeight * 0.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(targetHeight * 0.16, 14, 12), mat);
    head.position.y = targetHeight * 0.92;
    grp.add(body, head);
  }
  grp.add(makeBaseRing(targetHeight, accent || def.color));
  return grp;
}
