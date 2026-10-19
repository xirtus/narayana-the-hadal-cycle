import * as THREE from "three";
import {
  SPACES,
  MAIN_SPACES,
  CLASSIC_SPACES,
  expeditionProgress,
} from "./Spaces.js";
import { buildSpace, animateSpace, disposeSpace } from "./SpaceGeometry.js";
import { makeFishGeometry, FISH_MATERIAL } from "../ecology/CreatureModels.js";
import {
  buildTerraces,
  animateTerraces,
  terraceNode,
  terraceHeight,
  TERRACE_NAMES,
} from "./Terraces.js";
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export class Expedition {
  constructor(
    scene,
    world,
    { save = {}, onEvent = () => {}, mode = "terraces" } = {},
  ) {
    this.scene = scene;
    this.world = world;
    this.mode = mode;
    this.spaces = mode === "trench" ? CLASSIC_SPACES : SPACES;
    this.mainSpaces = mode === "trench" ? CLASSIC_SPACES : MAIN_SPACES;
    this.data = expeditionProgress(save, mode);
    this.onEvent = onEvent;
    this.space = null;
    this.record = null;
    this.nodes = [];
    this.ping = 0;
    this.time = 0;
    this.companion = null;
    world.expedition = mode === "ocean" ? null : this;
    for (const s of this.spaces.filter(
      (s) => mode === "trench" || (mode === "terraces" && s.bonus),
    ))
      world.shelves.push({
        x: s.position.x,
        z: s.position.z - 25,
        floor: s.position.y - 8,
        inner: 115,
        radius: 145,
      });
    const terrain = world.shallowColliders?.[0]?.geometry;
    if (terrain) {
      const p = terrain.attributes.position;
      for (let i = 0; i < p.count; i++)
        p.setY(i, world.getFloorHeight(p.getX(i), p.getZ(i)));
      p.needsUpdate = true;
      terrain.computeVertexNormals();
    }
  }
  get unlocked() {
    return this.data.unlocked;
  }
  canEnter(index) {
    return (
      Number.isInteger(index) &&
      index >= 0 &&
      index < this.spaces.length &&
      this.mode !== "ocean" &&
      (this.mode === "trench" ||
        this.spaces[index].bonus ||
        index <= this.unlocked)
    );
  }
  canVisitZone(zone) {
    return this.spaces.some((s) => s.zone === zone && this.canEnter(s.index));
  }
  get current() {
    return this.space;
  }
  get status() {
    const s = this.space,
      n = s ? this.data.progress[s.id] : 0;
    return {
      active: s?.id,
      experience: this.mode,
      spaces: this.spaces.length,
      index: s?.index,
      name: s?.name,
      biome: s?.biome,
      depth: s?.depth,
      task: s?.task,
      progress: n,
      total: s?.count,
      unlocked: this.unlocked,
      complete: !!s && this.data.completed.includes(s.id),
      finished: this.data.finished,
      hint: s?.hint,
      next: s?.bonus
        ? this.mainSpaces[0].name
        : s && this.mainSpaces[s.index + 1]?.name,
      bonus: !!s?.bonus,
      terrace: s?.terraced ? TERRACE_NAMES[Math.min(n, 4)] : null,
      activity: this.lifeEvent || null,
      guide: this.record?.guide
        ? this.record.guide.getWorldPosition(V()).toArray()
        : null,
      nodes: this.nodes.map((n) => ({
        position: n.position.toArray(),
        done: n.done,
      })),
      gate: this.gate?.position.toArray(),
      ping: this.ping,
      target:
        this.nodes[n]?.position.toArray() || this.gate?.position.toArray(),
    };
  }
  enter(index) {
    if (!this.canEnter(index)) return false;
    this.clear();
    this.space = this.spaces[index];
    this.data.active = this.space.id;
    this.record = this.space.terraced
      ? buildTerraces(this.space, this.world)
      : buildSpace(this.space);
    this.lifeClock = 0;
    this.lifeEvent = null;
    this.scene.add(this.record.group);
    this.world.updateTerrainVisibility?.();
    const s = this.space;
    for (let i = 0; i < s.count; i++) {
      const offset = s.terraced
        ? terraceNode(i)
        : s.task === "current"
          ? V(Math.sin(i * 1.8) * 9, Math.sin(i * 1.3) * 4, 5 - i * 15)
          : V(i === 0 ? -10 : i === 1 ? 10 : 0, 0, -12 - i * 20);
      const group = new THREE.Group();
      group.position.copy(s.position).add(offset);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xb6ead1,
        emissive: 0x64cbbd,
        emissiveIntensity: 1,
        transparent: true,
        opacity: 0.95,
      });
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(s.task === "current" ? 3 : 1.25, 0.055, 6, 48),
        mat,
      );
      group.add(ring);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.38), mat);
      group.add(crystal);
      crystal.visible = s.task !== "current";
      // Number pips are visible geometry, matching the ordered sonar puzzle.
      for (let j = 0; j <= i; j++) {
        const pip = new THREE.Mesh(new THREE.SphereGeometry(0.085, 7, 5), mat);
        pip.position.set((j - i * 0.5) * 0.32, 1.75, 0);
        group.add(pip);
      }
      if (s.task === "rescue") {
        const cage = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(3, 3, 3)),
          new THREE.LineBasicMaterial({
            color: 0xacc4b8,
            transparent: true,
            opacity: 0.55,
          }),
        );
        group.add(cage);
        group.userData.cage = cage;
        const shoal = new THREE.InstancedMesh(
          makeFishGeometry(s.index < 2 ? "sardine" : "lanternfish"),
          FISH_MATERIAL.clone(),
          12,
        );
        shoal.frustumCulled = false;
        group.add(shoal);
        group.userData.shoal = shoal;
      }
      this.scene.add(group);
      this.nodes.push({
        group,
        position: group.position,
        ring,
        crystal,
        done: i < this.data.progress[s.id],
        material: mat,
      });
    }
    const gate = new THREE.Group();
    gate.position
      .copy(s.position)
      .add(
        s.terraced && s.id === "heart"
          ? V(0, -58, -281)
          : s.terraced
            ? V(0, -90, -235)
            : V(0, 0, -75),
      );
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(5 + i * 0.35, 0.06, 7, 64),
        new THREE.MeshBasicMaterial({
          color: 0x78cfd1,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
        }),
      );
      ring.position.z = -i;
      gate.add(ring);
    }
    this.scene.add(gate);
    this.gate = gate;
    if (s.id === "reef" && !s.terraced) {
      // Long rostrum, dorsal fin and horizontal flukes distinguish the dolphin guide.
      const g = new THREE.Group(),
        m = new THREE.MeshStandardMaterial({
          color: 0x819c9f,
          roughness: 0.4,
          metalness: 0.12,
        });
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m);
      body.scale.set(0.28, 0.33, 1.4);
      g.add(body);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7, 10), m);
      beak.rotation.x = -Math.PI / 2;
      beak.position.z = -1.4;
      g.add(beak);
      const fluke = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), m);
      fluke.scale.set(0.7, 0.035, 0.23);
      fluke.position.z = 1.3;
      g.add(fluke);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.65, 3), m);
      fin.position.set(0, 0.5, 0.05);
      fin.scale.z = 1.3;
      g.add(fin);
      this.scene.add(g);
      this.companion = g;
    }
    this.onEvent({ type: "entered", space: s });
    return true;
  }
  pulse(position) {
    if (!this.space) return false;
    this.ping = 8;
    if (this.space.task === "current") return false;
    const index = this.data.progress[this.space.id],
      node = this.nodes[index];
    if (!node || position.distanceTo(node.position) > 9) return false;
    const d = node.position.clone().sub(position),
      hit =
        d.length() > 0.1
          ? this.world.findAnchor(
              position,
              d.normalize(),
              position.distanceTo(node.position),
            )
          : null;
    if (hit && hit.distance < position.distanceTo(node.position) - 0.35)
      return false;
    this.advance();
    return true;
  }
  advance() {
    const s = this.space,
      index = this.data.progress[s.id];
    if (index >= s.count) return;
    this.nodes[index].done = true;
    this.data.progress[s.id]++;
    if (this.data.progress[s.id] === s.count) {
      if (!this.data.completed.includes(s.id)) this.data.completed.push(s.id);
      this.data = expeditionProgress(this.data, this.mode);
      this.onEvent({
        type: "opened",
        space: s,
        next: s.bonus ? this.mainSpaces[0] : this.mainSpaces[s.index + 1],
        memories: 3,
      });
    } else
      this.onEvent({
        type: "seal",
        space: s,
        progress: this.data.progress[s.id],
      });
  }
  interact(position) {
    if (!this.gate || position.distanceTo(this.gate.position) > 9) return null;
    if (!this.data.completed.includes(this.space.id))
      return { type: "locked", message: this.space.hint };
    if (this.space.id === "heart") {
      this.data.finished = true;
      this.onEvent({ type: "finished" });
      return { type: "finished" };
    }
    return {
      type: "travel",
      index: this.space.bonus ? 0 : this.space.index + 1,
    };
  }
  floorHeight(x, z, fallback) {
    if (this.mode !== "terraces") return fallback;
    const spaces = this.space?.terraced ? [this.space] : [];
    for (const space of spaces) {
      const terrace = terraceHeight(space, x, z);
      if (terrace)
        fallback = THREE.MathUtils.lerp(
          fallback,
          terrace.height,
          terrace.blend,
        );
    }
    return fallback;
  }
  currentForce(position, time, target) {
    if (!this.space) return target;
    if (!this.space.terraced) {
      const local = position.clone().sub(this.space.position);
      if (
        this.space.task === "current" &&
        Math.abs(local.x) < 17 &&
        local.z < 15 &&
        local.z > -85 &&
        Math.abs(local.y) < 16
      ) {
        target.z -= 1.6;
        target.y += Math.sin(local.z * 0.06 + time * 0.2) * 0.55;
        if (this.space.id === "hollow") target.multiplyScalar(1.35);
      }
      return target;
    }
    const local = position.clone().sub(this.space.position);
    if (Math.abs(local.x) < 23 && local.z < 20 && local.z > -255) {
      const index = this.data.progress[this.space.id];
      const dest = this.nodes[index]?.position || this.gate.position;
      const delta = dest.clone().sub(position);
      if (delta.length() > 5 && Math.abs(delta.y) < 30)
        target.addScaledVector(delta.normalize(), 2.2);
    }
    return target;
  }
  update(dt, time, position) {
    this.time = time;
    this.ping = Math.max(0, this.ping - dt);
    if (!this.record) return;
    if (this.space.terraced) {
      const target =
        this.nodes[this.data.progress[this.space.id]]?.position ||
        this.gate.position;
      animateTerraces(this.record, time, position, target);
      this.lifeClock += dt;
      if (this.lifeClock > 28) {
        this.lifeClock = 0;
        const whale = Math.abs(this.record.whale.position.x) < 45;
        this.lifeEvent = whale
          ? "Whale crossing overhead"
          : "Lantern shoals gathering on the next ledge";
        this.onEvent({
          type: "life",
          title: whale ? "A SONG ABOVE YOU" : "THE LEDGE IS ALIVE",
          message: whale
            ? "Look up: a whale is crossing the trench. The blue squid waits by your next terrace."
            : "Follow the living lights down the cliff. V reveals fluorescence; [ / ] adjusts UV brightness.",
        });
      }
    } else animateSpace(this.record, time);
    const index = this.data.progress[this.space.id];
    const node = this.nodes[index];
    if (
      this.space.task === "current" &&
      node &&
      (position.distanceTo(node.position) < 4 ||
        (this.previousPosition &&
          new THREE.Line3(this.previousPosition, position)
            .closestPointToPoint(node.position, true, V())
            .distanceTo(node.position) < 3))
    )
      this.advance();
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      n.done = i < this.data.progress[this.space.id];
      n.material.color.set(
        n.done ? 0x84c39c : i === index ? 0xe1dfad : 0x63828c,
      );
      n.material.emissiveIntensity = n.done ? 0.2 : i === index ? 1.2 : 0.25;
      n.ring.rotation.z = time * (i % 2 ? 0.12 : -0.12);
      n.crystal.rotation.y = time;
      if (n.group.userData.cage) n.group.userData.cage.visible = !n.done;
      if (n.group.userData.shoal) {
        const dummy = new THREE.Object3D();
        for (let f = 0; f < 12; f++) {
          const angle = time * 0.8 + f * 2.4,
            r = n.done ? 3.5 : 0.6;
          dummy.position.set(
            Math.cos(angle) * r,
            Math.sin(angle * 2) * 0.5 + (n.done ? 2 : 0),
            Math.sin(angle) * r,
          );
          dummy.rotation.set(0, -angle, 0);
          dummy.scale.setScalar(0.6);
          dummy.updateMatrix();
          n.group.userData.shoal.setMatrixAt(f, dummy.matrix);
        }
        n.group.userData.shoal.instanceMatrix.needsUpdate = true;
      }
      n.group.scale.setScalar(
        n.done ? 0.72 : 1 + (this.ping > 0 ? 0.08 * Math.sin(time * 5) : 0),
      );
    }
    this.previousPosition = position.clone();
    const open = this.data.completed.includes(this.space.id);
    this.gate.children.forEach((m, i) => {
      m.rotation.z = time * 0.07 * (i + 1);
      m.material.color.set(open ? 0xbdebd1 : 0x486573);
      m.material.opacity = open ? 0.7 : 0.3;
    });
    if (this.companion) {
      const dest = node?.position || this.gate.position;
      this.companion.position
        .copy(dest)
        .add(V(Math.sin(time * 0.6) * 2, 1.5, Math.cos(time * 0.6) * 2));
      this.companion.rotation.y = -time * 0.6;
      this.companion.children[2].rotation.x = Math.sin(time * 3) * 0.2;
    }
  }
  get colliders() {
    return this.record?.colliders || [];
  }
  resolveCollision(position, radius) {
    const boxes = (this.record?.boxes || []).map((b) =>
      b.clone().expandByScalar(radius),
    );
    if (!boxes.some((b) => b.containsPoint(position))) return;
    let best = null,
      bestDistance = Infinity;
    // Escape the union of overlapping cliff blocks, not back into an adjacent wall.
    for (const axis of ["x", "y", "z"])
      for (const sign of [-1, 1]) {
        const candidate = position.clone();
        for (let i = 0; i <= boxes.length; i++) {
          let inside = false;
          for (const box of boxes)
            if (box.containsPoint(candidate)) {
              candidate[axis] =
                sign < 0 ? box.min[axis] - 0.01 : box.max[axis] + 0.01;
              inside = true;
            }
          if (!inside) break;
        }
        const distance = candidate.distanceToSquared(position);
        if (
          distance < bestDistance &&
          !boxes.some((b) => b.containsPoint(candidate))
        ) {
          bestDistance = distance;
          best = candidate;
        }
      }
    if (best) position.copy(best);
  }
  clear() {
    if (this.record) disposeSpace(this.record);
    for (const node of this.nodes) disposeSpace({ group: node.group });
    if (this.gate) disposeSpace({ group: this.gate });
    if (this.companion) disposeSpace({ group: this.companion });
    this.record = null;
    this.nodes = [];
    this.gate = null;
    this.companion = null;
    this.previousPosition = null;
  }
  dispose() {
    this.clear();
    if (this.world.expedition === this) this.world.expedition = null;
  }
}
