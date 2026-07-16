// ============================================================
//  PREVIEW3D — turntable model viewer for the campaign designer
// ============================================================
import * as THREE from 'three';
import { buildToken, setBaseRingColor } from './tokens.js';

export class Preview3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    this.camera.position.set(0, 2.1, 5.6);
    this.camera.lookAt(0, 1.4, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xfff2e0, 1.6);
    key.position.set(3, 6, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8888ff, 0.8);
    rim.position.set(-4, 3, -4);
    this.scene.add(rim);

    // pedestal
    this.pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.7, 0.22, 36),
      new THREE.MeshStandardMaterial({ color: 0x1e1a26, roughness: 0.4, metalness: 0.5 })
    );
    this.pedestal.position.y = -0.11;
    this.scene.add(this.pedestal);
    this.glowRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.05, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0xd4a017, emissive: 0xd4a017, emissiveIntensity: 1.6 })
    );
    this.glowRing.rotation.x = Math.PI / 2;
    this.glowRing.position.y = 0.01;
    this.scene.add(this.glowRing);

    this.subject = null;
    this.mixer = null;
    this._token = 0;
    this.clock = new THREE.Clock();
    this.running = true;

    // click & drag to spin the model; auto-spin resumes on release
    this.dragging = false;
    this._lastX = 0;
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this._lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || !this.subject) return;
      this.subject.rotation.y += (e.clientX - this._lastX) * 0.013;
      this._lastX = e.clientX;
    });
    const endDrag = () => { this.dragging = false; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    const animate = () => {
      requestAnimationFrame(animate);
      if (!this.running || !this.canvas.isConnected) return;
      const dt = this.clock.getDelta();
      if (this.subject && !this.dragging) this.subject.rotation.y += dt * 0.7;
      if (this.mixer) this.mixer.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  resize() {
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Recolor the pedestal glow + the token's base ring (main attack color). */
  setAccent(hex) {
    this.glowRing.material.color.set(hex);
    this.glowRing.material.emissive.set(hex);
    setBaseRingColor(this.subject, hex);
  }

  /** Swap the displayed model. def = hero/monster entry, accent = main attack color */
  async show(def, isMonster = false, accent = null) {
    const token = ++this._token;
    const height = isMonster ? 2.9 : 2.6;
    const ring = accent || def.color || '#d4a017';
    const built = await buildToken(def, height, isMonster, ring);
    if (token !== this._token) return; // a newer request superseded this one
    if (this.subject) this.scene.remove(this.subject);
    this.mixer = null;
    this.subject = built.group;
    // start facing screen-left (toward the editor panel) so the model
    // sweeps around to face the front as the turntable turns
    this.subject.rotation.y = -Math.PI / 2;
    this.scene.add(this.subject);
    if (built.animations.length && built.animTarget) {
      this.mixer = new THREE.AnimationMixer(built.animTarget);
      this.mixer.clipAction(built.animations[0]).play();
    }
    this.setAccent(ring);
    // frame the camera to the subject height
    this.camera.position.set(0, height * 0.78, height * 2.2);
    this.camera.lookAt(0, height * 0.52, 0);
  }

  clear() {
    if (this.subject) this.scene.remove(this.subject);
    this.subject = null;
    this.mixer = null;
  }
}
