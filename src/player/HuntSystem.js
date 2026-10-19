import * as THREE from "three";

export const HUNT_TIMING = Object.freeze({
  windup: 0.14,
  strike: 0.22,
  retract: 0.58,
  feed: 0.78,
  recover: 0.18,
});
const smooth = (t) => t * t * (3 - 2 * t);

/** Orchestrates one real animal from a moving school into the arm crown and beak. */
export class HuntSystem {
  constructor(scene, player, ecosystem, world, { onEvent = () => {} } = {}) {
    this.scene = scene;
    this.player = player;
    this.ecosystem = ecosystem;
    this.world = world;
    this.onEvent = onEvent;
    this.phase = "idle";
    this.elapsed = 0;
    this.progress = 0;
    this.target = null;
    this.held = null;
    this.preview = null;
    this.cooldown = 0;
    this.kills = 0;
    this.lastResult = null;
    this.forward = new THREE.Vector3(0, 0, -1);
    this.mouth = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.capturePoint = new THREE.Vector3();
    this.heldScale = new THREE.Vector3(1, 1, 1);
    this.biteIndex = -1;
    this.reticle = new THREE.Group();
    this.reticle.name = "Feeding target";
    this.reticleMaterial = new THREE.MeshBasicMaterial({
      color: 0xe0c18c,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const arc = new THREE.TorusGeometry(0.42, 0.013, 5, 48, Math.PI * 0.38);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(arc, this.reticleMaterial);
      m.rotation.z = i * Math.PI * 0.5 + Math.PI * 0.06;
      this.reticle.add(m);
    }
    this.reticle.visible = false;
    scene.add(this.reticle);
    this.fragments = [];
    this.fragmentDummy = new THREE.Object3D();
    this.fragmentGeometry = new THREE.OctahedronGeometry(0.022, 0);
    this.fragmentMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4d3ba,
      roughness: 0.38,
      metalness: 0.28,
      emissive: 0x343029,
      emissiveIntensity: 0.2,
    });
    this.fragmentMesh = new THREE.InstancedMesh(
      this.fragmentGeometry,
      this.fragmentMaterial,
      90,
    );
    this.fragmentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fragmentMesh.count = 0;
    this.fragmentMesh.frustumCulled = false;
    scene.add(this.fragmentMesh);
  }
  get active() {
    return this.phase !== "idle";
  }
  get reach() {
    return this.player.getHuntReach();
  }
  get status() {
    const selected = this.active ? this.target : this.preview;
    const position = this.held?.group?.position || selected?.position;
    const distance = position ? this.mouth.distanceTo(position) : null;
    return {
      phase: this.phase,
      progress: this.progress,
      target: selected?.name || null,
      distance,
      ready: !this.active && !!selected && distance <= this.reach,
      reach: this.reach,
      kills: this.kills,
      result: this.lastResult,
    };
  }
  setDirection(direction) {
    this.forward.copy(direction).normalize();
  }
  obstructed(position) {
    const delta = new THREE.Vector3().subVectors(position, this.mouth),
      distance = delta.length();
    if (distance < 0.1) return false;
    const hit = this.world.findAnchor?.(
      this.mouth,
      delta.normalize(),
      distance,
    );
    return !!hit && hit.distance < distance - 0.2;
  }
  prepare(dt, direction, camera) {
    this.setDirection(direction);
    this.player.getMouthPosition(this.mouth);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.active) {
      this.preview = this.ecosystem.acquirePrey(this.mouth, this.forward, {
        range: 12,
        coneCos: 0.05,
      });
      if (this.preview && this.obstructed(this.preview.position))
        this.preview = null;
      this.player.setHuntPose({ phase: "idle" });
    } else if (this.target) {
      const point = this.held?.group?.position || this.target.position;
      this.player.setHuntPose({
        phase: this.phase,
        target: point,
        progress: this.progress,
      });
    }
    const selected =
      this.held || this.phase === "recover"
        ? null
        : this.active
          ? this.target
          : this.preview;
    this.reticle.visible = !!selected;
    if (selected) {
      this.reticle.position.copy(selected.position);
      if (camera) this.reticle.quaternion.copy(camera.quaternion);
      this.reticle.scale.setScalar(
        Math.max(0.7, (selected.radius || 0.2) * 2.6),
      );
      this.reticleMaterial.color.set(
        this.mouth.distanceTo(selected.position) <= this.reach
          ? 0xd6ef9f
          : 0xe5b778,
      );
      this.reticleMaterial.opacity = this.active ? 0.95 : 0.65;
    }
  }
  attack() {
    if (this.active || this.cooldown > 0) return false;
    this.player.getMouthPosition(this.mouth);
    const target = this.ecosystem.acquirePrey(this.mouth, this.forward, {
      range: this.reach,
      coneCos: 0.05,
    });
    if (target && !this.obstructed(target.position)) {
      this.target = target;
      this.aim.copy(target.position);
      this.lastResult = null;
      this.setPhase("windup");
      this.player.grapple(null);
      this.onEvent({ type: "attack", name: target.name });
      return true;
    }
    // A miss still gives immediate, visible tentacle feedback without inventing a catch.
    this.target = {
      id: null,
      name: null,
      position: this.mouth
        .clone()
        .addScaledVector(this.forward, this.reach * 0.94),
    };
    this.setPhase("strike");
    const repelled = this.ecosystem.repelThreat?.(
      this.mouth,
      this.forward,
      this.reach + 1,
    );
    this.lastResult = repelled ? "repelled" : "miss";
    this.onEvent(
      repelled
        ? { type: "repel", name: repelled.name }
        : { type: "miss", nearby: !!this.preview },
    );
    return true;
  }
  setPhase(phase) {
    this.phase = phase;
    this.elapsed = 0;
    this.progress = 0;
    this.player.setHuntPose({
      phase,
      target: this.held?.group?.position || this.target?.position,
      progress: 0,
    });
  }
  update(dt, time) {
    this.player.getMouthPosition(this.mouth);
    if (this.active) {
      if (this.held && this.held.active === false) {
        this.cancel();
        return;
      }
      this.elapsed += Math.max(0, dt);
      this.progress = Math.min(1, this.elapsed / HUNT_TIMING[this.phase]);
      if (this.phase === "windup" && this.progress >= 1)
        this.setPhase("strike");
      else if (this.phase === "strike" && this.progress >= 1) {
        const distance =
          this.target?.position.distanceTo(this.mouth) ?? Infinity;
        this.player.refreshHuntPose(
          { phase: "strike", target: this.target?.position, progress: 1 },
          time,
          this.world,
        );
        const contact = this.player
          .getFeedingTipPositions()
          .every((tip) => tip.distanceTo(this.target.position) < 0.18);
        if (
          this.target?.id &&
          distance <= this.reach + 0.06 &&
          contact &&
          !this.obstructed(this.target.position)
        )
          this.held = this.ecosystem.capturePrey(this.target);
        if (this.held) {
          this.capturePoint.copy(this.held.group.position);
          this.heldScale.copy(this.held.group.scale);
          this.heldQuaternion = this.held.group.quaternion.clone();
          this.onEvent({ type: "grab", name: this.held.name });
          this.setPhase("retract");
        } else {
          if (this.lastResult !== "repelled") this.lastResult = "miss";
          this.setPhase("recover");
        }
      } else if (this.phase === "retract") {
        const end = this.mouth.clone().addScaledVector(this.forward, 0.22);
        this.held.group.position.lerpVectors(
          this.capturePoint,
          end,
          smooth(this.progress),
        );
        this.held.group.quaternion.copy(this.heldQuaternion);
        this.held.group.rotateY(
          Math.sin(time * 35) * (1 - this.progress) * 0.3,
        );
        if (this.progress >= 1) {
          this.biteIndex = -1;
          this.setPhase("feed");
        }
      } else if (this.phase === "feed") {
        this.held.group.position
          .copy(this.mouth)
          .addScaledVector(this.forward, 0.15 * (1 - this.progress));
        const bite = Math.floor(this.progress * 6),
          remaining = Math.max(0.08, 1 - this.progress * 0.95);
        this.held.group.scale.copy(this.heldScale).multiplyScalar(remaining);
        this.held.group.rotateZ(Math.sin(time * 38) * 0.045);
        if (bite !== this.biteIndex) {
          this.biteIndex = bite;
          this.shred(time);
          this.onEvent({ type: "bite", name: this.held.name });
        }
        if (this.progress >= 1) {
          const name = this.held.name;
          const reward = this.ecosystem.consumePrey(this.held);
          this.held = null;
          if (reward) {
            this.kills++;
            this.lastResult = "fed";
            this.onEvent({ type: "consume", name, ...reward });
          }
          this.setPhase("recover");
        }
      } else if (this.phase === "recover" && this.progress >= 1) {
        this.target = null;
        this.phase = "idle";
        this.progress = 0;
        this.cooldown = 0.12;
        this.player.setHuntPose({ phase: "idle" });
      }
    }
    if (this.active)
      this.player.refreshHuntPose(
        {
          phase: this.phase,
          target: this.held?.group?.position || this.target?.position,
          progress: this.progress,
        },
        time,
        this.world,
      );
    this.updateFragments(dt, time);
  }
  shred(time) {
    for (let i = 0; i < 5; i++)
      this.fragments.push({
        position: this.mouth.clone(),
        velocity: new THREE.Vector3(
          Math.sin(time * 17 + i * 2.4) * 0.42,
          Math.cos(time * 14 + i) * 0.28,
          Math.sin(time * 11 + i * 3) * 0.35,
        ),
        age: 0,
        seed: i + time,
      });
    this.fragments = this.fragments.slice(-90);
  }
  updateFragments(dt, time) {
    this.fragments = this.fragments.filter((f) => f.age < 1.4);
    for (let i = 0; i < this.fragments.length; i++) {
      const f = this.fragments[i];
      f.age += dt;
      f.position.addScaledVector(f.velocity, dt);
      f.velocity.multiplyScalar(Math.exp(-dt * 0.7));
      this.fragmentDummy.position.copy(f.position);
      this.fragmentDummy.rotation.set(time + f.seed, time * 2 + f.seed, 0);
      this.fragmentDummy.scale.setScalar(Math.max(0.05, 1 - f.age / 1.4));
      this.fragmentDummy.updateMatrix();
      this.fragmentMesh.setMatrixAt(i, this.fragmentDummy.matrix);
    }
    this.fragmentMesh.count = this.fragments.length;
    this.fragmentMesh.instanceMatrix.needsUpdate = true;
  }
  cancel() {
    if (this.held) {
      this.held.group.scale.copy(this.heldScale);
      this.ecosystem.releasePrey(this.held, this.held.group.position.clone());
    }
    this.held = null;
    this.target = null;
    this.preview = null;
    this.phase = "idle";
    this.progress = 0;
    this.cooldown = 0;
    this.reticle.visible = false;
    this.player.setHuntPose({ phase: "idle" });
  }
  dispose() {
    this.cancel();
    this.reticle.removeFromParent();
    const geometries = new Set();
    this.reticle.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
    });
    geometries.forEach((g) => g.dispose());
    this.reticleMaterial.dispose();
    this.fragmentMesh.removeFromParent();
    this.fragmentGeometry.dispose();
    this.fragmentMaterial.dispose();
  }
}
