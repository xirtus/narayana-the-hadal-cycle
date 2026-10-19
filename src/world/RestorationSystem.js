import * as THREE from "three";
import { makeFishGeometry, FISH_MATERIAL } from "../ecology/CreatureModels.js";
import { disposeEnemy } from "../combat/EnemyModels.js";

export class RestorationSystem {
  constructor(
    scene,
    world,
    { restored = [], observed = [], onEvent = () => {} } = {},
  ) {
    this.scene = scene;
    this.world = world;
    this.restored = new Set(restored);
    this.observed = new Set(observed);
    this.onEvent = onEvent;
    this.level = -1;
    this.sites = [];
    this.nearest = null;
    this.meditating = null;
    this.progress = 0;
    this.dummy = new THREE.Object3D();
    this.unsafe = false;
  }
  enterLevel(level) {
    if (level === this.level) return;
    this.clear();
    this.level = level;
    for (const h of this.world.habitats.filter((h) => h.level === level)) {
      const group = new THREE.Group();
      group.position.copy(h.position).add(new THREE.Vector3(0, 2, 0));
      const mat = new THREE.MeshBasicMaterial({
        color: 0xa9e3c2,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.7, 0.035, 5, 48),
        mat,
      );
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);
      const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), mat);
      diamond.position.y = 1;
      group.add(diamond);
      const fishMat = FISH_MATERIAL.clone();
      fishMat.emissive?.set(level > 0 ? 0x42b9c5 : 0x000000);
      const fish = new THREE.InstancedMesh(
        makeFishGeometry(level > 0 ? "lanternfish" : "sardine"),
        fishMat,
        24,
      );
      fish.frustumCulled = false;
      group.add(fish);
      this.scene.add(group);
      this.sites.push({ ...h, group, ring, diamond, fish });
    }
  }
  pulse(position) {
    const site = this.sites.find(
      (s) =>
        s.group.position.distanceTo(position) < 14 && !this.restored.has(s.id),
    );
    if (!site || this.unsafe) return false;
    this.restored.add(site.id);
    this.onEvent({
      type: "restore",
      id: site.id,
      name: site.name,
      memories: 2,
    });
    return true;
  }
  meditate() {
    if (this.meditating) {
      this.cancel();
      return true;
    }
    if (
      !this.nearest ||
      !this.restored.has(this.nearest.id) ||
      this.nearest.distance > 14 ||
      this.unsafe
    )
      return false;
    this.meditating = this.nearest;
    this.progress = 0;
    return true;
  }
  cancel() {
    this.meditating = null;
    this.progress = 0;
  }
  update(
    dt,
    time,
    position,
    { moving = false, threat = false, attacking = false } = {},
  ) {
    this.unsafe = threat;
    this.nearest =
      this.sites
        .map((s) => ({ ...s, distance: s.group.position.distanceTo(position) }))
        .sort((a, b) => a.distance - b.distance)[0] || null;
    if (this.meditating) {
      if (
        moving ||
        threat ||
        attacking ||
        this.meditating.group.position.distanceTo(position) > 16
      )
        this.cancel();
      else {
        this.progress = Math.min(1, this.progress + dt / 6);
        if (this.progress === 1) {
          const s = this.meditating,
            first = !this.observed.has(s.id);
          this.observed.add(s.id);
          this.onEvent({
            type: "observe",
            id: s.id,
            name: s.name,
            memories: first ? 1 : 0,
          });
          this.cancel();
        }
      }
    }
    for (const s of this.sites) {
      const restored = this.restored.has(s.id);
      s.fish.visible = restored;
      s.diamond.visible = !restored;
      s.ring.material.color.set(restored ? 0x99e9ce : 0xe8c485);
      s.ring.material.opacity = 0.4 + Math.sin(time * 1.4) * 0.15;
      s.diamond.rotation.y = time * 0.5;
      s.diamond.position.y = 1.2 + Math.sin(time) * 0.25;
      if (restored)
        for (let i = 0; i < 24; i++) {
          const a = time * 0.18 + i * 2.39996,
            r = 3 + (i % 6) * 0.7;
          this.dummy.position.set(
            Math.cos(a) * r,
            2 + Math.sin(a * 2 + i) * 1.2,
            Math.sin(a) * r,
          );
          this.dummy.rotation.set(0, -a, Math.sin(time + i) * 0.06);
          this.dummy.scale.setScalar(0.65 + (i % 4) * 0.12);
          this.dummy.updateMatrix();
          s.fish.setMatrixAt(i, this.dummy.matrix);
        }
      if (restored) s.fish.instanceMatrix.needsUpdate = true;
    }
  }
  get status() {
    const s = this.nearest;
    return {
      name: s?.name,
      id: s?.id,
      distance: s?.distance,
      position: s?.group.position.toArray(),
      restored: !!s && this.restored.has(s.id),
      observed: !!s && this.observed.has(s.id),
      meditating: !!this.meditating,
      progress: this.progress,
      count: this.restored.size,
    };
  }
  clear() {
    this.cancel();
    for (const s of this.sites) disposeEnemy(s.group);
    this.sites = [];
    this.nearest = null;
  }
  dispose() {
    this.clear();
  }
}
