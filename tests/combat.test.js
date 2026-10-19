import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Cephalopod } from "../src/player/Cephalopod.js";
import {
  CombatSystem,
  ROUTE_ENEMIES,
  segmentDistance,
} from "../src/combat/CombatSystem.js";
import { RestorationSystem } from "../src/world/RestorationSystem.js";
import { validateSave } from "../src/core/SaveSystem.js";
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function fixture(t, options = {}) {
  const scene = new THREE.Scene(),
    player = new Cephalopod(scene);
  const world = {
    getFloorHeight: () => -50,
    getCurrent: (p, t, out) => out.set(0, 0, 0),
    findAnchor: () => null,
    levelEntries: Array.from({ length: 7 }, () => V(0, -12, 0)),
    levelCurrents: Array.from({ length: 6 }, (_, level) => ({
      level,
      position: V(0, -12, -48),
    })),
    habitats: [
      { id: "reef", name: "Living reef", level: 0, position: V(0, -14, 0) },
    ],
  };
  player.update(0.01, 0, {}, world);
  const events = [];
  const combat = new CombatSystem(scene, player, world, {
    ...options,
    onEvent: (e) => events.push(e),
  });
  combat.enterLevel(0);
  combat.grace = 100;
  let time = 0;
  const tick = (seconds) => {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) {
      time += 1 / 60;
      combat.update(1 / 60, time, { forward: V(0, 0, -1) });
    }
  };
  const place = (index = 0) => {
    const e = combat.enemies[index];
    e.position.copy(player.getMouthPosition()).add(V(0, 0, -e.radius - 2));
    e.home.copy(e.position);
    e.stun = 30;
    return e;
  };
  t.after(() => {
    combat.dispose();
    player.dispose();
  });
  return { scene, player, world, events, combat, tick, place };
}
test("route populations include shallow scuba hunters, sharks and whales, with bounded streaming and persistent clears", (t) => {
  const { combat, scene } = fixture(t);
  assert.equal(combat.enemies.filter((e) => e.kind === "diver").length, 2);
  for (let level = 1; level < 7; level++) {
    combat.enterLevel(level);
    assert.equal(combat.enemies.length, 3);
    assert.ok(combat.enemies.every((e) => e.kind !== "diver"));
  }
  assert.ok(ROUTE_ENEMIES[1].some((e) => e[0] === "whale"));
  const e = combat.enemies[0];
  combat.hit(e, 1000, "Test strike");
  const id = e.id;
  combat.enterLevel(0);
  combat.enterLevel(6);
  assert.ok(!combat.enemies.some((e) => e.id === id));
  assert.ok(scene.children.length < 20);
});
test("three strikes require real contact, chain distinct attacks, and reset after the combo window", (t) => {
  const { combat, place, tick } = fixture(t),
    e = place();
  e.hp = e.maxHp = 500;
  const hp = e.hp;
  for (const expected of ["Tentacle lash", "Crosscut", "Beak rush"]) {
    const before = e.hp;
    assert.ok(combat.attack(V(0, 0, -1)));
    assert.equal(combat.action.name, expected);
    assert.equal(
      e.hp,
      before,
      "starting an animation must not deal immediate damage",
    );
    tick(0.7);
    assert.ok(e.hp < hp);
  }
  assert.equal(e.hp, 500 - 18 - 25 - 40);
  assert.equal(combat.streak, 3);
  tick(2);
  assert.ok(combat.attack(V(0, 0, -1)));
  assert.equal(combat.action.step, 0);
});
test("an enemy escaping the arm reach or hidden behind rock is not hit", (t) => {
  const { combat, place, tick, world } = fixture(t),
    e = place();
  assert.ok(combat.attack(V(0, 0, -1)));
  e.position.z -= 20;
  e.home.copy(e.position);
  tick(0.7);
  assert.equal(e.hp, e.maxHp);
  place();
  world.findAnchor = () => ({ distance: 0.2 });
  assert.equal(combat.attack(V(0, 0, -1)), false);
});
test("jet evasion prevents a timed hit, grants a counter, spends stamina and rejects cooldown spam", (t) => {
  const { combat, player, place, events, tick } = fixture(t);
  place();
  assert.ok(combat.dodge(V(0, 0, -1), -1));
  assert.ok(player.velocity.x < 0);
  assert.ok(player.stamina < 1);
  assert.equal(combat.dodge(V(0, 0, -1)), false);
  assert.equal(combat.damage(0.2, "Shark"), false);
  assert.ok(!events.some((e) => e.type === "damage"));
  tick(0.5);
  assert.ok(combat.attack(V(0, 0, -1)));
  assert.equal(combat.action.name, "Dodge counter");
  tick(0.7);
  assert.equal(combat.damage(0.2, "Shark"), true);
  assert.equal(combat.damage(0.2, "Shark"), false);
});
test("ink interrupts aiming and enables ambush; sweep staggers only nearby unobstructed enemies", (t) => {
  const { combat, place, tick, player } = fixture(t),
    e = place();
  e.state = "windup";
  e.line.visible = true;
  combat.ink();
  assert.equal(e.state, "stunned");
  assert.equal(e.line.visible, false);
  assert.ok(combat.attack(V(0, 0, -1)));
  assert.equal(combat.action.name, "Ink ambush");
  tick(0.7);
  const before = e.hp;
  player.stamina = 1;
  assert.ok(combat.sweep());
  assert.ok(e.hp < before);
  assert.ok(e.stun > 1);
  assert.equal(combat.sweep(), false);
});
test("projectiles use swept collision and damage once; rocks intercept a shot", (t) => {
  const { combat, player, place, events, world } = fixture(t),
    e = place();
  assert.equal(segmentDistance(V(-10, 0, 0), V(10, 0, 0), V()), 0);
  e.position.copy(player.position).add(V(0, 0, -2));
  e.aim.copy(player.position);
  combat.shoot(e);
  combat.update(0.25, 1);
  assert.equal(combat.projectiles.length, 0);
  assert.equal(events.filter((e) => e.type === "damage").length, 1);
  combat.hurtCooldown = 0;
  combat.shoot(e);
  world.findAnchor = () => ({ distance: 0.01 });
  combat.update(0.25, 2);
  assert.equal(events.filter((e) => e.type === "damage").length, 1);
});
test("defeat is awarded once and a returning patrol cannot duplicate progress", (t) => {
  const { combat, events, place } = fixture(t),
    e = place();
  combat.hit(e, 1000, "Beak rush");
  combat.hit(e, 1000, "Beak rush");
  assert.equal(events.filter((e) => e.type === "defeat").length, 1);
  combat.reset();
  combat.enterLevel(0);
  assert.equal(combat.enemies.length, 2);
  const save = validateSave({
    version: 1,
    combatVictories: [...combat.defeated],
    bestCombo: 3,
    restored: ["reef", "reef"],
    observed: ["reef"],
  });
  assert.deepEqual(save.combatVictories, [e.id]);
  assert.deepEqual(save.restored, ["reef"]);
  assert.equal(save.bestCombo, 3);
});
test("restoration brings fish back once; observation requires calm, cancels on movement and cannot farm memories", (t) => {
  const { scene, world, player } = fixture(t),
    events = [];
  const r = new RestorationSystem(scene, world, {
    onEvent: (e) => events.push(e),
  });
  t.after(() => r.dispose());
  r.enterLevel(0);
  r.update(0.01, 0, player.position);
  assert.equal(r.sites[0].fish.visible, false);
  assert.ok(r.pulse(player.position));
  assert.equal(r.pulse(player.position), false);
  r.update(0.01, 0, player.position);
  assert.ok(r.sites[0].fish.visible);
  assert.ok(r.meditate());
  r.update(2, 2, player.position, { moving: true });
  assert.equal(r.meditating, null);
  assert.ok(r.meditate());
  r.update(6, 8, player.position);
  assert.equal(events.at(-1).memories, 1);
  assert.ok(r.meditate());
  r.update(6, 14, player.position);
  assert.equal(events.at(-1).memories, 0);
  r.update(0.1, 14, player.position, { threat: true });
  assert.equal(r.meditate(), false);
});

test("sharks telegraph before a committed lunge, damage once, then expose a recovery window", (t) => {
  const { combat, player, events, tick } = fixture(t);
  combat.grace = 0;
  for (const e of combat.enemies) {
    e.position.set(100, -12, -100);
    e.home.copy(e.position);
  }
  const shark = combat.enemies.find((e) => e.kind === "shark");
  shark.position.copy(player.position).add(V(0, 0, -8));
  shark.home.copy(shark.position);
  shark.state = "approach";
  shark.cooldown = 0;
  tick(0.1);
  assert.equal(shark.state, "windup");
  assert.ok(events.some((e) => e.type === "warning"));
  assert.equal(events.filter((e) => e.type === "damage").length, 0);
  tick(1.1);
  assert.equal(shark.state, "lunge");
  tick(0.8);
  assert.equal(events.filter((e) => e.type === "damage").length, 1);
  assert.equal(shark.state, "recover");
});
test("whale pressure waves expand visibly and hit at most once per wave", (t) => {
  const { combat, player, events, tick } = fixture(t);
  combat.enterLevel(1);
  for (const e of combat.enemies) {
    e.position.set(100, -12, -100);
    e.home.copy(e.position);
  }
  const whale = combat.enemies.find((e) => e.kind === "whale");
  whale.position.copy(player.position).add(V(0, 0, -12));
  whale.home.copy(whale.position);
  whale.state = "approach";
  whale.cooldown = 0;
  tick(0.1);
  assert.equal(whale.state, "windup");
  tick(1.7);
  assert.equal(whale.state, "sonar");
  tick(0.8);
  assert.ok(whale.warning.scale.x > 1);
  assert.equal(events.filter((e) => e.type === "damage").length, 1);
  tick(0.8);
  assert.equal(whale.state, "recover");
  assert.equal(events.filter((e) => e.type === "damage").length, 1);
});
