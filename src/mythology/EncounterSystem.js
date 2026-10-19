import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const clamp = THREE.MathUtils.clamp;
function organicRing(radius = 0.65) {
  const pieces = [];
  for (let strand = 0; strand < 3; strand++) {
    const points = [];
    for (let i = 0; i <= 90; i++) {
      const t = i / 90,
        a = t * Math.PI * 5.3 + strand * 2.094,
        r = radius * (0.33 + t * 0.67) + Math.sin(a * 4) * 0.025;
      points.push(
        new THREE.Vector3(
          Math.cos(a) * r,
          Math.sin(a) * r,
          Math.sin(a * 2 + strand) * 0.065 + t * 0.12,
        ),
      );
    }
    pieces.push(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        100,
        0.018,
        5,
        false,
      ),
    );
  }
  const geometry = mergeGeometries(pieces);
  pieces.forEach((g) => g.dispose());
  return geometry;
}

export class EncounterSystem {
  constructor(scene, world, ecosystem) {
    this.scene = scene;
    this.world = world;
    this.ecosystem = ecosystem;
    this.group = new THREE.Group();
    this.group.name = "Living encounters";
    scene.add(this.group);
    this.time = 0;
    this.events = [];
    this._pulse = false;
    this._objective = null;
    this._context = null;
    this.player = null;
    this.signals = {};
    this.touchUntil = 0;
    this.research = null;
    this.whale = null;
    this.pressure = null;
    const observatory = world.landmarks.find(
      (site) => site.id === "research" || site.type === "research",
    );
    const whale = world.landmarks.find(
      (site) => site.id === "whalefall" || site.type === "whalefall",
    );
    if (observatory) this.buildObservatory(observatory);
    if (whale) this.buildWhaleFall(whale);
    this.buildPressureRoute();
  }
  get objective() {
    return this._objective;
  }
  get context() {
    return this._context;
  }
  get nearestContext() {
    return this._context;
  }
  material(color, glow = 0) {
    return new THREE.MeshStandardMaterial({
      color,
      emissive: glow ? color : 0x000000,
      emissiveIntensity: glow,
      roughness: 0.52,
      metalness: 0.22,
    });
  }
  buildObservatory(site) {
    const group = new THREE.Group();
    this.group.add(group);
    const state = (this.research = {
      id: "observatory",
      site,
      group,
      nodes: [],
      complete: false,
      announced: false,
    });
    const offsets = [
      [-3.6, 1, 1.6],
      [3.6, 2, -1.4],
      [0, 5.1, 0.5],
    ];
    for (let i = 0; i < 3; i++) {
      const node = new THREE.Group();
      node.position.copy(site.position).add(new THREE.Vector3(...offsets[i]));
      node.rotation.y = (i - 1) * 0.35;
      group.add(node);
      const housing = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.045, 8, 48),
        this.material(0x5e7879),
      );
      node.add(housing);
      const film = new THREE.Mesh(organicRing(0.66), this.material(0x7f7160));
      node.add(film);
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 10),
        this.material(0x97bdad, 0.06),
      );
      node.add(core);
      state.nodes.push({
        group: node,
        position: node.position,
        film,
        core,
        housing,
        revealed: false,
        purged: false,
      });
    }
  }
  buildWhaleFall(site) {
    const group = new THREE.Group();
    group.position.copy(site.position).add(new THREE.Vector3(0, -0.25, -9.4));
    this.group.add(group);
    const state = (this.whale = {
      id: "whale-fall",
      site,
      group,
      position: group.position,
      complete: false,
      attunedUntil: 0,
      announced: false,
    });
    const ring = new THREE.Mesh(
      organicRing(1.7),
      this.material(0x648983, 0.08),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    group.add(ring);
    state.ring = ring;
    // The visual light belongs to the ritual, not a claim that whale bones glow naturally.
    const geometry = new THREE.BufferGeometry(),
      positions = [];
    for (let i = 0; i < 96; i++) {
      const a = i * 2.399,
        r = 0.6 + ((i % 13) / 13) * 2.4;
      positions.push(
        Math.cos(a) * r,
        0.3 + ((i % 17) / 17) * 2,
        Math.sin(a) * r,
      );
    }
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    const motes = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0x85ddbf,
        size: 0.037,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    group.add(motes);
    state.motes = motes;
  }
  buildPressureRoute() {
    if (typeof this.world.getFloorHeight !== "function") return;
    // Derive positions from the real descending terrain, so the encounter crosses the route.
    let near = -50,
      far = -6000;
    for (let i = 0; i < 40; i++) {
      const mid = (near + far) / 2;
      if (this.world.getFloorHeight(0, mid) > -6590) near = mid;
      else far = mid;
    }
    const z = (near + far) / 2,
      group = new THREE.Group();
    this.group.add(group);
    const state = (this.pressure = {
      id: "pressure-rhythm",
      group,
      points: [],
      complete: false,
      announced: false,
      progress: 0,
      hold: 0,
      lastHitBeat: -1,
    });
    for (let i = 0; i < 3; i++) {
      const pz = z + 19 - i * 19,
        x = i === 1 ? 3 : -2,
        position = new THREE.Vector3(
          x,
          this.world.getFloorHeight(x, pz) + 7,
          pz,
        );
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.7, 0.027, 5, 60),
        this.material(0x729491, 0.2),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(position);
      group.add(ring);
      const ribs = [];
      for (let j = 0; j < 7; j++) {
        const a = (j / 7) * Math.PI * 2,
          curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6),
            new THREE.Vector3(Math.cos(a) * 1.42, 0.55, Math.sin(a) * 1.42),
            new THREE.Vector3(Math.cos(a) * 1.12, 0.85, Math.sin(a) * 1.12),
          ]);
        ribs.push(new THREE.TubeGeometry(curve, 8, 0.023, 4, false));
      }
      const branches = new THREE.Mesh(
        mergeGeometries(ribs),
        this.material(0x659c99, 0.08),
      );
      ribs.forEach((g) => g.dispose());
      branches.position.copy(position);
      group.add(branches);
      state.points.push({ position, ring, branches });
    }
    state.position = state.points[1].position;
  }
  announce(state, message, label) {
    if (!state.announced) {
      state.announced = true;
      this.events.push({ message, label });
    }
  }
  isAnchored(player) {
    return Boolean(
      player._anchor ||
      player.mode === "crawling" ||
      player.mode === "anchored" ||
      player.arms?.some((arm) => arm.anchor),
    );
  }
  update(dt, time, player, signals = {}) {
    this.time = time;
    this.player = player;
    this.signals = signals;
    this._objective = null;
    this._context = null;
    const risingPulse = Boolean(signals.pulse) && !this._pulse;
    this._pulse = Boolean(signals.pulse);
    if (this.touchUntil && time > this.touchUntil) {
      player.interact?.(null);
      this.touchUntil = 0;
    }
    const position = player.position,
      step = clamp(dt, 0, 0.1);
    if (this.research) {
      const r = this.research,
        distance = position.distanceTo(r.site.position);
      r.group.visible = distance < 100;
      if (distance < 42 && !r.complete) {
        this.announce(
          r,
          "Three instrument channels are silent. A pulse can reveal what has settled over them.",
          "THE LOST OBSERVATORY",
        );
        if (risingPulse) {
          for (const node of r.nodes) node.revealed = true;
          this.events.push({
            message:
              "The pulse finds three fouled sensors. Reach each light and let an arm clear the instrument.",
            label: "THREE SIGNALS RETURN",
          });
        }
        const progress = r.nodes.filter((node) => node.purged).length;
        this._objective = {
          title: "Return the observatory’s voice",
          hint: r.nodes.some((n) => n.revealed)
            ? "Grasp each revealed sensor · F nearby"
            : "Release a Narayana Pulse · E",
          progress: progress / 3,
        };
        const node = r.nodes
          .filter((n) => !n.purged)
          .sort(
            (a, b) =>
              a.position.distanceToSquared(position) -
              b.position.distanceToSquared(position),
          )[0];
        if (node && node.position.distanceTo(position) < 5.2)
          this._context = {
            text: node.revealed
              ? "F · Clear the fouled sensor"
              : "E · Listen for the buried signal",
            position: node.position,
          };
      }
      for (let i = 0; i < r.nodes.length; i++) {
        const n = r.nodes[i];
        n.film.rotation.z = Math.sin(time * 0.25 + i) * 0.08;
        n.film.scale.setScalar(
          n.purged ? 0.18 : 1 + Math.sin(time * 0.9 + i) * 0.025,
        );
        n.core.material.emissiveIntensity = n.purged
          ? 1.4
          : n.revealed
            ? 0.65 + Math.sin(time * 2 + i) * 0.2
            : 0.025;
        n.film.material.emissiveIntensity = n.revealed && !n.purged ? 0.075 : 0;
      }
    }
    if (this.whale) {
      const w = this.whale,
        distance = position.distanceTo(w.position);
      w.group.visible = distance < 95;
      if (distance < 36 && !w.complete) {
        this.announce(
          w,
          "One life has become shelter for thousands. Be still beside the skull; let your skin soften before you listen.",
          "A GIFT TO THE DEEP",
        );
        if (risingPulse && signals.camouflage && distance < 16) {
          w.attunedUntil = time + 24;
          this.events.push({
            message:
              "Life answers from the bones. Approach the skull and preserve this living exchange.",
            label: "THE WHALE FALL ANSWERS",
          });
        }
        this._objective = {
          title: "A gift that keeps becoming",
          hint:
            w.attunedUntil > time
              ? "Approach the whale skull · F"
              : "Camouflage, then pulse near the skull · R + E",
          progress: w.attunedUntil > time ? 0.5 : 0,
        };
        if (distance < 5.8)
          this._context = {
            text:
              w.attunedUntil > time
                ? "F · Honor the life within the bones"
                : "R + E · Become quiet and listen",
            position: w.position,
          };
      }
      const active = w.complete || w.attunedUntil > time;
      w.ring.material.emissiveIntensity = active
        ? 0.65 + Math.sin(time * 0.8) * 0.12
        : 0.025;
      w.motes.material.opacity = active ? 0.48 : 0.06;
      w.motes.rotation.y = time * 0.035;
    }
    if (this.pressure) {
      const p = this.pressure,
        distance = Math.min(
          ...p.points.map((point) => point.position.distanceTo(position)),
        ),
        beat = Math.floor(time / 6),
        beatPhase = time % 6;
      p.group.visible = distance < 100;
      if (distance < 34 && !p.complete) {
        this.announce(
          p,
          "The rock contracts in slow beats. Keep your fins quiet; camouflage or anchor when the water tightens.",
          "THE EARTH KEEPS TIME",
        );
        const protectedBody = signals.camouflage || this.isAnchored(player),
          quiet =
            (signals.jet || 0) < 0.15 &&
            (protectedBody || (player.velocity?.length() || 0) < 1.5);
        if (
          beatPhase < 0.85 &&
          (signals.jet || 0) > 0.35 &&
          !protectedBody &&
          p.lastHitBeat !== beat
        ) {
          p.lastHitBeat = beat;
          p.hold = 0;
          this.events.push({
            message:
              "Your mantle jet meets a pressure beat. Fold into the current, or anchor before the next contraction.",
            label: "SEISMIC PRESSURE",
            damage: 0.045,
          });
        }
        const next = p.points[p.progress];
        if (next && next.position.distanceTo(position) < 8) {
          p.hold = quiet ? p.hold + step : 0;
          if (p.hold >= 1.3) {
            p.progress++;
            p.hold = 0;
            if (p.progress === 3) {
              p.complete = true;
              this.events.push({
                message:
                  "You pass through the rhythm without fighting it. Transformation is not the enemy of life.",
                label: "A MEMORY OF TANDAVA",
                completed: p.id,
                memories: 3,
              });
            } else
              this.events.push({
                message:
                  "The current loosens. Carry this stillness into the next shelter.",
                label: `QUIET CROSSING · ${p.progress} / 3`,
              });
          }
        }
        if (!p.complete) {
          this._objective = {
            title: "Cross the earth’s slow rhythm",
            hint:
              beatPhase < 0.85
                ? "Pressure beat · camouflage or anchor"
                : "Follow the three pale shelters with quiet fins",
            progress: (p.progress + p.hold / 1.3) / 3,
          };
          this._context = {
            text: "Quiet fins · R camouflage · right-click anchor",
            position: p.points[p.progress].position,
          };
        }
      }
      for (let i = 0; i < p.points.length; i++) {
        const q = p.points[i],
          passed = i < p.progress,
          pulse = beatPhase < 0.85 ? Math.sin((beatPhase / 0.85) * Math.PI) : 0;
        q.ring.material.emissiveIntensity = passed ? 0.8 : 0.15 + pulse * 0.7;
        q.ring.scale.setScalar(1 + pulse * 0.07);
        q.branches.material.emissiveIntensity = passed
          ? 0.35
          : 0.05 + pulse * 0.2;
      }
    }
    return this.events.shift() || null;
  }
  interact(player) {
    const position = player.position;
    if (this.research && !this.research.complete) {
      const r = this.research,
        node = r.nodes
          .filter((n) => !n.purged && n.position.distanceTo(position) < 5.2)
          .sort(
            (a, b) =>
              a.position.distanceToSquared(position) -
              b.position.distanceToSquared(position),
          )[0];
      if (node) {
        if (!node.revealed)
          return {
            message:
              "Your arms feel the instrument beneath the film. A pulse will separate its signal from the surrounding life.",
            label: "LISTEN BEFORE YOU REACH",
          };
        node.purged = true;
        player.interact?.(node.position.clone());
        this.touchUntil = this.time + 0.8;
        const count = r.nodes.filter((n) => n.purged).length;
        if (count === 3) {
          r.complete = true;
          return {
            message:
              "The observatory listens again. Its recovered archive carries the changing voices of the canyon.",
            label: "THE OBSERVATORY REMEMBERS",
            memories: 3,
            completed: r.id,
          };
        }
        return {
          message: `A precise arm releases the instrument. ${3 - count} ${count === 2 ? "sensor remains" : "sensors remain"}.`,
          label: `SIGNAL RESTORED · ${count} / 3`,
        };
      }
    }
    if (
      this.whale &&
      !this.whale.complete &&
      position.distanceTo(this.whale.position) < 5.8
    ) {
      const w = this.whale;
      if (w.attunedUntil <= this.time)
        return {
          message:
            "Soften your skin, then send a pulse beside the skull. Preservation begins by understanding what is already alive.",
          label: "A QUIET EXCHANGE",
        };
      w.complete = true;
      player.interact?.(w.position.clone());
      this.touchUntil = this.time + 0.8;
      return {
        message:
          "The whale’s ending sustains a whole community. Vishnu preserves its gift; Shiva makes this becoming possible. Neither can exist alone.",
        label: "PRESERVATION THROUGH TRANSFORMATION",
        memories: 4,
        healing: 0.25,
        completed: w.id,
      };
    }
    return null;
  }
  reset({ preserveCompleted = true } = {}) {
    this.events.length = 0;
    this._pulse = false;
    this._context = null;
    this._objective = null;
    this.touchUntil = 0;
    this.player?.interact?.(null);
    if (this.research) {
      const r = this.research;
      r.announced = false;
      if (!preserveCompleted || !r.complete) {
        r.complete = false;
        for (const n of r.nodes) {
          n.revealed = false;
          n.purged = false;
        }
      }
    }
    if (this.whale) {
      this.whale.announced = false;
      this.whale.attunedUntil = 0;
      if (!preserveCompleted) this.whale.complete = false;
    }
    if (this.pressure) {
      const p = this.pressure;
      p.announced = false;
      p.hold = 0;
      p.lastHitBeat = -1;
      if (!preserveCompleted || !p.complete) {
        p.complete = false;
        p.progress = 0;
      }
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.touchUntil) this.player?.interact?.(null);
    this.group.removeFromParent();
    const geometry = new Set(),
      materials = new Set();
    this.group.traverse((object) => {
      if (object.geometry) geometry.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometry.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.events.length = 0;
  }
}
