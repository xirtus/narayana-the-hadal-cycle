import { terraceNode } from "../expedition/Terraces.js";
import * as THREE from "three";
import { makeEnemy, animateEnemy, disposeEnemy } from "./EnemyModels.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
export const ROUTE_ENEMIES = [
  [
    ["diver", "Scuba hunter"],
    ["shark", "Great white shark"],
    ["diver", "Net patrol leader"],
  ],
  [
    ["drone", "Hunter submersible"],
    ["shark", "Canyon shark"],
    ["whale", "Sperm whale"],
  ],
  [
    ["shark", "Asuric deepwater hunter", true],
    ["drone", "Abyss survey hunter"],
    ["whale", "Asuric sperm whale", true],
  ],
  [
    ["drone", "Whale-fall scavenger drone"],
    ["shark", "Asuric abyss shark", true],
    ["whale", "The Hollow Whale", true],
  ],
  [
    ["drone", "Trench hunter"],
    ["shark", "Asuric trench shark", true],
    ["drone", "Chimney sentinel"],
  ],
  [
    ["shark", "Nāga-bound shark", true],
    ["drone", "Drowned sentinel"],
    ["whale", "Violet leviathan", true],
  ],
  [
    ["drone", "Fissure sentinel"],
    ["shark", "The last abyss hunter", true],
    ["whale", "Challenger leviathan", true],
  ],
];
export const STRIKES = [
  { name: "Tentacle lash", damage: 18, duration: 0.42, hit: 0.18 },
  { name: "Crosscut", damage: 25, duration: 0.46, hit: 0.2 },
  { name: "Beak rush", damage: 40, duration: 0.62, hit: 0.3 },
];
// Swept tests prevent fast lunges and projectiles tunnelling at low frame rates.
export function segmentDistance(a, b, p) {
  const delta = b.clone().sub(a),
    t = clamp(p.clone().sub(a).dot(delta) / (delta.lengthSq() || 1), 0, 1);
  return a.clone().addScaledVector(delta, t).distanceTo(p);
}
export class CombatSystem {
  constructor(
    scene,
    player,
    world,
    { onEvent = () => {}, defeated = [] } = {},
  ) {
    this.scene = scene;
    this.player = player;
    this.world = world;
    this.onEvent = onEvent;
    this.defeated = new Set(defeated);
    this.enemies = [];
    this.projectiles = [];
    this.level = -1;
    this.forward = V(0, 0, -1);
    this.locked = null;
    this.target = null;
    this.action = null;
    this.chain = 0;
    this.chainTime = 0;
    this.streak = 0;
    this.streakTime = 0;
    this.best = 0;
    this.dodgeTime = 0;
    this.dodgeCooldown = 0;
    this.sweepCooldown = 0;
    this.counterTime = 0;
    this.hurtCooldown = 0;
    this.grace = 8;
    this.time = 0;
    this.lastMove = "";
    this.marker = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.025, 5, 64),
      new THREE.MeshBasicMaterial({
        color: 0xefb775,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    this.marker.visible = false;
    scene.add(this.marker);
    this.sweepRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.04, 5, 64),
      new THREE.MeshBasicMaterial({
        color: 0xb9f1e9,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.sweepRing.rotation.x = Math.PI / 2;
    scene.add(this.sweepRing);
    this.sweepVisual = 0;
  }
  get active() {
    return !!this.action;
  }
  get nearby() {
    return this.enemies.some(
      (e) =>
        e.hp > 0 &&
        e.position.distanceTo(this.player.position) < 24 &&
        e.state !== "patrol",
    );
  }
  get status() {
    const e =
      this.locked ||
      this.target ||
      this.enemies
        .filter((e) => e.hp > 0)
        .sort(
          (a, b) =>
            a.position.distanceToSquared(this.player.position) -
            b.position.distanceToSquared(this.player.position),
        )[0];
    return {
      target: e
        ? {
            id: e.id,
            name: e.name,
            hp: e.hp,
            maxHp: e.maxHp,
            state: e.state,
            distance: Math.max(
              0,
              e.position.distanceTo(this.player.position) - e.radius,
            ),
            mythic: e.mythic,
          }
        : null,
      move: this.lastMove,
      chain: this.chain,
      streak: this.streak,
      chainTime: this.chainTime,
      streakTime: this.streakTime,
      locked: !!this.locked,
      active: this.active,
      dodgeCooldown: this.dodgeCooldown,
      sweepCooldown: this.sweepCooldown,
      dodging: this.dodgeTime > 0,
      remaining: this.enemies.filter((e) => e.hp > 0).length,
      total: this.routeTotal || ROUTE_ENEMIES[this.level]?.length || 0,
    };
  }
  enterLevel(level, space = null) {
    if (level === this.level && this.routeKey === (space?.id || String(level)))
      return;
    this.clearLevel();
    this.level = level;
    this.routeKey = space?.id || String(level);
    this.grace = 8;
    const entry = space?.position || this.world.levelEntries[level];
    const exit =
      this.world.levelCurrents?.find((c) => c.level === level)?.position ||
      entry.clone().add(V(0, 0, -42));
    const roster = space
      ? space.kinds.map((kind, i) => [
          kind,
          kind === "diver"
            ? [
                "Scuba spear hunter",
                "Scuba pursuit hunter",
                "Scuba patrol leader",
              ][i % 3]
            : kind === "drone"
              ? "Piloted hunter submersible"
              : kind === "whale"
                ? level > 1
                  ? "Asuric whale guardian"
                  : "Sperm whale"
                : level > 1
                  ? "Asuric predator"
                  : "Oceanic shark",
          level > 1 && ["shark", "whale"].includes(kind),
        ])
      : ROUTE_ENEMIES[level];
    this.routeTotal = roster.length;
    roster.forEach(([kind, name, mythic = false], i) => {
      const id = space ? `expedition-${space.id}-${i}` : `route-${level}-${i}`;
      if (this.defeated.has(id)) return;
      const position = entry
        .clone()
        .lerp(exit, 0.48 + i * 0.22)
        .add(V(i === 1 ? -9 : 8, kind === "whale" ? 9 : 3, 0));
      if (space)
        position
          .copy(entry)
          .add(
            V(
              kind === "whale" ? -30 : i % 2 ? 12 : -12,
              kind === "whale" ? 12 : 4,
              -28 - i * 13,
            ),
          );
      if (space?.terraced)
        position
          .copy(entry)
          .add(terraceNode(Math.min(4, i + 1)))
          .add(V(i % 2 ? 18 : -18, kind === "whale" ? 15 : 4, -8));
      position.y = Math.min(
        -3,
        Math.max(
          position.y,
          this.world.getFloorHeight(position.x, position.z) +
            (kind === "whale" ? 8 : 3),
        ),
      );
      const group = makeEnemy(kind, mythic);
      group.position.copy(position);
      group.name = name;
      this.scene.add(group);
      const hp =
        kind === "diver"
          ? 80
          : kind === "drone"
            ? 100
            : kind === "shark"
              ? 145
              : 270;
      const radius =
        kind === "whale"
          ? 3.4
          : kind === "shark"
            ? 1.4
            : kind === "drone"
              ? 0.95
              : 0.65;
      const warning = new THREE.Mesh(
        new THREE.TorusGeometry(radius + 0.6, 0.04, 5, 48),
        new THREE.MeshBasicMaterial({
          color: 0xf3aa65,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      this.scene.add(warning);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([V(), V()]),
        new THREE.LineBasicMaterial({
          color: 0xff745e,
          transparent: true,
          opacity: 0.65,
        }),
      );
      line.visible = false;
      this.scene.add(line);
      const materials = new Set();
      group.traverse((o) => {
        if (o.material?.emissive) materials.add(o.material);
      });
      const glow = [...materials].map((material) => ({
        material,
        color: material.emissive.clone(),
        intensity: material.emissiveIntensity,
      }));
      let bubbles = null;
      if (kind === "diver") {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(new Float32Array(24 * 3), 3),
        );
        bubbles = new THREE.Points(
          geometry,
          new THREE.PointsMaterial({
            color: 0xc7e9e0,
            size: 0.075,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
          }),
        );
        bubbles.frustumCulled = false;
        this.scene.add(bubbles);
      }
      this.enemies.push({
        id,
        kind,
        name,
        mythic,
        group,
        glow,
        bubbles,
        position: group.position,
        home: position.clone(),
        hp,
        maxHp: hp,
        radius,
        state: "patrol",
        timer: 0,
        cooldown: 1 + i * 0.8,
        warning,
        line,
        aim: V(),
        velocity: V(),
        stun: 0,
        ink: 0,
        hit: false,
        flash: 0,
        index: i,
      });
    });
  }
  blocked(a, b) {
    const d = b.clone().sub(a),
      length = d.length();
    if (length < 0.2) return false;
    const hit = this.world.findAnchor?.(a, d.normalize(), length);
    return !!hit && hit.distance < length - 0.2;
  }
  select(forward = this.forward, range = 12) {
    const mouth = this.player.getMouthPosition();
    if (
      this.locked?.hp > 0 &&
      this.locked.position.distanceTo(mouth) < 40 &&
      !this.blocked(mouth, this.contact(this.locked))
    )
      return this.locked;
    return (
      this.enemies
        .filter((e) => {
          const delta = e.position.clone().sub(mouth),
            distance = delta.length();
          return (
            e.hp > 0 &&
            distance - e.radius < range &&
            delta.normalize().dot(forward) > -0.05 &&
            !this.blocked(mouth, this.contact(e))
          );
        })
        .sort(
          (a, b) =>
            a.position.distanceTo(mouth) -
            a.radius -
            (b.position.distanceTo(mouth) - b.radius),
        )[0] || null
    );
  }
  focus() {
    if (this.locked) {
      this.locked = null;
      return null;
    }
    this.locked =
      this.enemies
        .filter(
          (e) =>
            e.hp > 0 &&
            e.position.distanceTo(this.player.position) < 65 &&
            !this.blocked(this.player.position, this.contact(e)),
        )
        .sort(
          (a, b) =>
            a.position.distanceToSquared(this.player.position) -
            b.position.distanceToSquared(this.player.position),
        )[0] || null;
    return this.locked;
  }
  contact(e) {
    const mouth = this.player.getMouthPosition(),
      delta = mouth.clone().sub(e.position);
    const distance = delta.length();
    return e.position
      .clone()
      .addScaledVector(delta.normalize(), Math.min(e.radius, distance));
  }
  attack(forward, { jet = false } = {}) {
    if (this.active || this.dodgeTime > 0) return true;
    this.forward.copy(forward);
    const target = this.select(forward, this.player.getHuntReach() + 1);
    if (
      !target ||
      this.contact(target).distanceTo(this.player.getMouthPosition()) >
        this.player.getHuntReach() + 0.4
    )
      return false;
    this.target = target;
    this.player.grapple(null);
    const step = this.chainTime > 0 ? this.chain % 3 : 0;
    const spec = STRIKES[step];
    const special = jet
      ? "Jet ram"
      : this.counterTime > 0
        ? "Dodge counter"
        : target.ink > 0
          ? "Ink ambush"
          : spec.name;
    this.action = {
      ...spec,
      name: special,
      damage: spec.damage * (special !== spec.name ? 1.5 : 1),
      elapsed: 0,
      target,
      hitDone: false,
      step,
    };
    this.lastMove = special;
    this.chain = step + 1;
    this.chainTime = 1.6;
    this.onEvent({ type: "swing", name: special });
    return true;
  }
  dodge(forward, side = 1) {
    if (this.dodgeCooldown > 0 || this.player.stamina < 0.12) return false;
    this.cancelAction();
    this.player.grapple(null);
    this.dodgeTime = 0.48;
    this.dodgeCooldown = 1.15;
    this.player.stamina -= 0.12;
    const lateral = V(-forward.z, 0, forward.x)
      .normalize()
      .multiplyScalar(side < 0 ? -1 : 1);
    this.player.velocity
      .addScaledVector(lateral, 13)
      .addScaledVector(forward, 3);
    this.lastMove = "Jet evade";
    this.onEvent({ type: "dodge", name: "Jet evade" });
    return true;
  }
  sweep() {
    if (this.sweepCooldown > 0 || this.player.stamina < 0.18) return false;
    this.cancelAction();
    this.sweepCooldown = 3.5;
    this.player.stamina -= 0.18;
    this.sweepVisual = 0.5;
    this.sweepRing.position.copy(this.player.position);
    this.lastMove = "Eight-arm sweep";
    for (const e of this.enemies)
      if (
        e.hp > 0 &&
        this.contact(e).distanceTo(this.player.getMouthPosition()) < 5.2 &&
        !this.blocked(this.player.position, this.contact(e))
      ) {
        this.hit(e, 22, "Eight-arm sweep");
        e.stun = 1.8;
        e.velocity
          .copy(e.position)
          .sub(this.player.position)
          .normalize()
          .multiplyScalar(8);
      }
    this.onEvent({ type: "sweep", name: this.lastMove });
    return true;
  }
  ink() {
    for (const e of this.enemies)
      if (e.hp > 0 && e.position.distanceTo(this.player.position) < 16) {
        e.ink = 5;
        e.stun = Math.max(e.stun, 2);
        e.state = "stunned";
        e.timer = 0;
        e.line.visible = false;
      }
  }
  hit(e, damage, name) {
    if (e.hp <= 0) return;
    e.hp = Math.max(0, e.hp - damage);
    e.flash = 0.2;
    this.streak++;
    this.streakTime = 4;
    this.best = Math.max(this.best, this.streak);
    if (e.hp === 0) {
      e.state = "defeated";
      e.timer = 0;
      e.line.visible = false;
      e.warning.visible = false;
      this.defeated.add(e.id);
      if (this.locked === e) this.locked = null;
      this.onEvent({
        type: "defeat",
        id: e.id,
        name: e.name,
        kind: e.kind,
        memories: e.kind === "whale" ? 4 : 2,
        streak: this.streak,
        cleared: this.enemies.every((a) => a.hp <= 0),
      });
    } else {
      e.state = "stunned";
      e.stun = Math.max(e.stun, name === "Beak rush" ? 1.4 : 0.48);
      e.line.visible = false;
      this.onEvent({ type: "hit", name, damage, streak: this.streak });
    }
  }
  damage(amount, name) {
    if (this.dodgeTime > 0) {
      this.counterTime = 1.3;
      this.lastMove = "Perfect evade";
      this.onEvent({ type: "evaded", name });
      return false;
    }
    if (this.hurtCooldown > 0) return false;
    this.hurtCooldown = 0.8;
    this.streak = 0;
    this.streakTime = 0;
    this.chain = 0;
    this.chainTime = 0;
    this.onEvent({ type: "damage", damage: amount, name });
    return true;
  }
  setState(e, state) {
    e.state = state;
    e.timer = 0;
    e.hit = false;
    e.aim.copy(this.player.position);
  }
  shoot(e) {
    if (this.projectiles.length >= 18) return;
    const start = e.position.clone(),
      direction = e.aim.clone().sub(start).normalize();
    const group = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.75, 6),
      new THREE.MeshBasicMaterial({ color: 0xeecba0 }),
    );
    group.quaternion.setFromUnitVectors(V(0, 1, 0), direction);
    group.position.copy(start);
    this.scene.add(group);
    this.projectiles.push({
      group,
      velocity: direction.multiplyScalar(17),
      age: 0,
      name: e.name,
    });
    this.onEvent({ type: "shot", name: e.name });
  }
  update(
    dt,
    time,
    {
      forward = this.forward,
      camera = null,
      camouflage = false,
      jet = 0,
      allowPose = true,
    } = {},
  ) {
    this.time = time;
    this.forward.copy(forward);
    this.grace = Math.max(0, this.grace - dt);
    for (const k of [
      "chainTime",
      "streakTime",
      "dodgeTime",
      "dodgeCooldown",
      "sweepCooldown",
      "counterTime",
      "hurtCooldown",
      "sweepVisual",
    ])
      this[k] = Math.max(0, this[k] - dt);
    if (this.chainTime === 0 && !this.active) this.chain = 0;
    if (this.streakTime === 0) this.streak = 0;
    if (
      this.locked &&
      (this.locked.hp <= 0 ||
        this.locked.position.distanceTo(this.player.position) > 70)
    )
      this.locked = null;
    this.target = this.select(forward, 14);
    for (const e of this.enemies) {
      const distance = e.position.distanceTo(this.player.position);
      e.timer += dt;
      e.cooldown = Math.max(0, e.cooldown - dt);
      e.ink = Math.max(0, e.ink - dt);
      e.flash = Math.max(0, e.flash - dt);
      animateEnemy(e.group, time + e.index, e.state === "lunge" ? 3 : 1);
      e.warning.visible = e.hp > 0;
      e.warning.position.copy(e.position);
      if (camera) e.warning.quaternion.copy(camera.quaternion);
      e.warning.material.opacity =
        e.state === "windup" ? 0.45 + Math.sin(time * 16) * 0.3 : 0;
      for (const g of e.glow) {
        g.material.emissive.copy(
          e.flash > 0 ? new THREE.Color(0xbfa172) : g.color,
        );
        g.material.emissiveIntensity = e.flash > 0 ? 0.7 : g.intensity;
      }
      if (e.bubbles) {
        e.bubbles.visible = e.hp > 0;
        const a = e.bubbles.geometry.attributes.position;
        for (let i = 0; i < 24; i++) {
          const rise = (time * 1.4 + i * 0.31) % 7;
          a.setXYZ(
            i,
            e.position.x + Math.sin(time + i) * rise * 0.06,
            Math.min(-0.1, e.position.y + rise),
            e.position.z - 0.7 + Math.cos(time + i) * rise * 0.06,
          );
        }
        a.needsUpdate = true;
      }
      if (e.hp <= 0) {
        e.position.addScaledVector(
          V(0, e.kind === "diver" ? 1 : -0.2, 1),
          dt * 2,
        );
        e.group.scale.multiplyScalar(Math.exp(-dt * 0.5));
        if (e.timer > 4) e.group.visible = false;
        continue;
      }
      if (e.stun > 0) {
        e.stun -= dt;
        e.state = "stunned";
        e.position.addScaledVector(e.velocity, dt);
        e.velocity.multiplyScalar(Math.exp(-dt * 5));
        if (e.stun <= 0) this.setState(e, "recover");
      } else if (e.state === "patrol") {
        const dest = e.home
          .clone()
          .add(
            V(
              Math.sin(time * 0.22 + e.index) * 4,
              Math.sin(time * 0.3) * 1.3,
              Math.cos(time * 0.22 + e.index) * 3,
            ),
          );
        this.moveToward(e, dest, 1.6, dt);
        if (
          this.grace === 0 &&
          distance < (camouflage && jet < 0.3 ? 9 : 26) &&
          !this.blocked(e.position, this.player.position)
        )
          this.setState(e, "approach");
      } else if (e.state === "approach") {
        if (distance > 65 || (camouflage && jet < 0.3 && distance > 14)) {
          this.setState(e, "patrol");
        } else {
          const range =
            e.kind === "diver" || e.kind === "drone"
              ? 15
              : e.kind === "whale"
                ? 19
                : 11;
          if (distance > range)
            this.moveToward(
              e,
              this.player.position,
              e.kind === "whale" ? 4 : 5,
              dt,
            );
          else if (
            e.cooldown === 0 &&
            !this.blocked(e.position, this.player.position)
          ) {
            this.setState(e, "windup");
            this.onEvent({ type: "warning", name: e.name, kind: e.kind });
          }
        }
      } else if (e.state === "windup") {
        // Aim locks before release; a sideways jet can evade the committed line.
        const duration = e.kind === "whale" ? 1.65 : 1.15;
        if (e.timer < duration * 0.55) e.aim.copy(this.player.position);
        this.face(e, e.aim, dt);
        if (e.kind === "diver" || e.kind === "drone") {
          e.line.visible = true;
          const a = e.line.geometry.attributes.position;
          a.setXYZ(0, ...e.position);
          a.setXYZ(1, ...e.aim);
          a.needsUpdate = true;
          e.line.geometry.computeBoundingSphere();
        }
        if (e.timer >= duration) {
          e.line.visible = false;
          if (e.kind === "diver" || e.kind === "drone") {
            this.shoot(e);
            this.setState(e, "recover");
          } else if (e.kind === "whale") {
            this.setState(e, "sonar");
          } else {
            e.velocity
              .copy(e.aim)
              .sub(e.position)
              .normalize()
              .multiplyScalar(18);
            this.setState(e, "lunge");
          }
        }
      } else if (e.state === "lunge") {
        const before = e.position.clone();
        e.position.addScaledVector(e.velocity, dt);
        if (this.blocked(before, e.position)) {
          e.position.copy(before);
          this.setState(e, "recover");
          continue;
        }
        if (
          !e.hit &&
          segmentDistance(before, e.position, this.player.position) <
            e.radius + 1 &&
          !this.blocked(before, this.player.position)
        ) {
          this.damage(0.18, e.name);
          e.hit = true;
        }
        if (e.timer > 0.8) this.setState(e, "recover");
      } else if (e.state === "sonar") {
        const radius = e.timer * 19;
        e.warning.material.opacity = Math.max(0, 0.7 - e.timer * 0.45);
        e.warning.scale.setScalar(radius / (e.radius + 0.6));
        if (
          !e.hit &&
          Math.abs(distance - radius) < 1.4 &&
          !this.blocked(e.position, this.player.position)
        ) {
          this.damage(0.22, e.name);
          e.hit = true;
        }
        if (e.timer > 1.5) {
          e.warning.scale.setScalar(1);
          this.setState(e, "recover");
        }
      } else if (e.state === "recover") {
        if (e.timer > 2.3) {
          e.cooldown = 0.4;
          this.setState(e, "approach");
        }
      }
      this.world.resolveCollision?.(e.position, e.radius);
      e.position.y = Math.min(
        -1.8,
        Math.max(
          e.position.y,
          this.world.getFloorHeight(e.position.x, e.position.z) + e.radius + 1,
        ),
      );
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i],
        before = p.group.position.clone();
      p.age += dt;
      p.group.position.addScaledVector(p.velocity, dt);
      let spent = p.age > 3 || this.blocked(before, p.group.position);
      if (
        !spent &&
        segmentDistance(before, p.group.position, this.player.position) < 0.85
      ) {
        this.damage(0.14, p.name);
        spent = true;
      }
      if (spent) {
        disposeEnemy(p.group);
        this.projectiles.splice(i, 1);
      }
    }
    if (this.action) {
      const a = this.action;
      a.elapsed += dt;
      if (a.target.hp <= 0 && !a.hitDone) {
        this.cancelAction();
      } else {
        const point = this.contact(a.target),
          mouth = this.player.getMouthPosition();
        if (allowPose) {
          const p = point.clone().sub(mouth);
          p.clampLength(0, this.player.getHuntReach());
          p.add(mouth);
          this.player.refreshHuntPose(
            {
              phase:
                a.elapsed < a.hit
                  ? "strike"
                  : a.step === 2
                    ? "feed"
                    : "retract",
              target: p,
              progress: clamp(a.elapsed / a.hit, 0, 1),
            },
            time,
            this.world,
          );
        }
        if (a.elapsed >= a.hit && !a.hitDone) {
          a.hitDone = true;
          if (
            point.distanceTo(mouth) <= this.player.getHuntReach() + 0.6 &&
            !this.blocked(mouth, point)
          ) {
            this.hit(a.target, a.damage, a.name);
            if (a.step === 2)
              a.target.velocity
                .copy(a.target.position)
                .sub(this.player.position)
                .normalize()
                .multiplyScalar(7);
          }
        }
        if (a.elapsed >= a.duration) this.cancelAction();
      }
    }
    this.marker.visible = !!this.target && !this.active;
    if (this.target) {
      this.marker.position.copy(this.target.position);
      this.marker.scale.setScalar(this.target.radius + 0.4);
      if (camera) this.marker.quaternion.copy(camera.quaternion);
      this.marker.material.color.set(this.locked ? 0xe8c978 : 0xf7a48c);
    }
    this.sweepRing.material.opacity = this.sweepVisual;
    this.sweepRing.scale.setScalar(1 + (1 - this.sweepVisual / 0.5) * 5);
    if (this.sweepVisual > 0 && !this.action && allowPose)
      this.player.refreshHuntPose(
        {
          phase: "sweep",
          target: this.player.position,
          progress: 1 - this.sweepVisual / 0.5,
        },
        time,
        this.world,
      );
  }
  face(e, p, dt) {
    const direction = p.clone().sub(e.position);
    if (direction.lengthSq() < 0.01) return;
    const q = new THREE.Quaternion().setFromUnitVectors(
      V(0, 0, -1),
      direction.normalize(),
    );
    e.group.quaternion.slerp(q, 1 - Math.exp(-dt * 4));
  }
  moveToward(e, p, speed, dt) {
    this.face(e, p, dt);
    const d = p.clone().sub(e.position);
    const next = e.position
      .clone()
      .addScaledVector(
        d.normalize(),
        Math.min(speed * dt, e.position.distanceTo(p)),
      );
    if (!this.blocked(e.position, next)) e.position.copy(next);
  }
  cancelAction() {
    this.action = null;
    this.player.setHuntPose({ phase: "idle" });
  }
  reset() {
    this.clearLevel();
    this.level = -1;
    this.streak = 0;
    this.streakTime = 0;
    this.dodgeTime = 0;
    this.dodgeCooldown = 0;
    this.sweepCooldown = 0;
    this.counterTime = 0;
    this.hurtCooldown = 0;
  }
  clearLevel() {
    this.cancelAction();
    for (const e of this.enemies) {
      disposeEnemy(e.group);
      disposeEnemy(e.warning);
      disposeEnemy(e.line);
      if (e.bubbles) disposeEnemy(e.bubbles);
    }
    for (const p of this.projectiles) disposeEnemy(p.group);
    this.enemies = [];
    this.projectiles = [];
    this.locked = null;
    this.target = null;
    this.chain = 0;
    this.chainTime = 0;
    this.marker.visible = false;
  }
  dispose() {
    this.clearLevel();
    disposeEnemy(this.marker);
    disposeEnemy(this.sweepRing);
  }
}
