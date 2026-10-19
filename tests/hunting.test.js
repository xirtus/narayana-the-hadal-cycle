import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Cephalopod } from "../src/player/Cephalopod.js";
import { HuntSystem } from "../src/player/HuntSystem.js";

function fixture(t, { blocked = false, empty = false } = {}) {
  const scene = new THREE.Scene(),
    player = new Cephalopod(scene);
  const world = {
    getFloorHeight: () => -40,
    getCurrent: (p, time, out) => out.set(0, 0, 0),
    findAnchor: () => (blocked ? { distance: 0.3 } : null),
  };
  player.update(1 / 60, 0, {}, world);
  const mouth = player.getMouthPosition(),
    prey = {
      id: "actual-fish",
      name: "Sardine",
      species: "sardine",
      position: mouth.clone().add(new THREE.Vector3(0, 0, -2.7)),
      radius: 0.2,
    };
  const events = [],
    calls = { captures: 0, consumes: 0, releases: 0 };
  let available = !empty;
  const ecosystem = {
    acquirePrey(p, direction, { range }) {
      return available && prey.position.distanceTo(p) <= range ? prey : null;
    },
    capturePrey(candidate) {
      if (!available || candidate !== prey) return null;
      available = false;
      calls.captures++;
      const group = new THREE.Group();
      group.position.copy(prey.position);
      scene.add(group);
      return { ...prey, group, active: true };
    },
    consumePrey(held) {
      if (!held.active) return null;
      held.active = false;
      held.group.removeFromParent();
      calls.consumes++;
      return { energy: 0.14, species: "sardine", success: true };
    },
    releasePrey(held, position) {
      if (!held.active) return false;
      held.active = false;
      held.group.removeFromParent();
      prey.position.copy(position);
      available = true;
      calls.releases++;
      return true;
    },
  };
  const hunt = new HuntSystem(scene, player, ecosystem, world, {
    onEvent: (e) => events.push(e),
  });
  let time = 0;
  const tick = (duration) => {
    for (let i = 0; i < Math.ceil(duration * 120); i++) {
      time += 1 / 120;
      hunt.prepare(1 / 120, new THREE.Vector3(0, 0, -1));
      player.update(1 / 120, time, {}, world);
      hunt.update(1 / 120, time);
    }
  };
  t.after(() => {
    hunt.dispose();
    player.dispose();
  });
  return { hunt, player, prey, events, calls, tick };
}
test("a hunt visibly strikes, holds a real fish, reels it into the mouth, and only then feeds", (t) => {
  const { hunt, player, prey, events, calls, tick } = fixture(t);
  hunt.prepare(0, new THREE.Vector3(0, 0, -1));
  assert.equal(hunt.status.ready, true);
  assert.ok(hunt.attack());
  assert.equal(calls.consumes, 0);
  tick(0.4);
  assert.equal(hunt.phase, "retract");
  assert.equal(calls.captures, 1);
  assert.equal(calls.consumes, 0);
  assert.ok(hunt.held.group.parent);
  const far = hunt.held.group.position.distanceTo(player.getMouthPosition());
  tick(0.35);
  assert.ok(
    hunt.held.group.position.distanceTo(player.getMouthPosition()) < far * 0.7,
  );
  tick(0.3);
  assert.equal(hunt.phase, "feed");
  assert.ok(
    hunt.held.group.position.distanceTo(player.getMouthPosition()) < 0.3,
  );
  assert.equal(calls.consumes, 0);
  tick(1);
  assert.equal(calls.consumes, 1);
  assert.equal(hunt.phase, "idle");
  assert.equal(hunt.kills, 1);
  assert.ok(events.filter((e) => e.type === "bite").length >= 5);
  assert.equal(events.filter((e) => e.type === "consume").length, 1);
  tick(2);
  assert.equal(calls.consumes, 1);
});
test("misses and occluded fish never generate prey or feeding rewards", (t) => {
  for (const options of [{ empty: true }, { blocked: true }]) {
    const f = fixture(t, options);
    f.hunt.prepare(0, new THREE.Vector3(0, 0, -1));
    f.hunt.attack();
    f.tick(2);
    assert.equal(f.calls.captures, 0);
    assert.equal(f.calls.consumes, 0);
    assert.equal(f.hunt.lastResult, "miss");
  }
});
test("cancelling a pull releases the same prey exactly once and resets the arm pose", (t) => {
  const f = fixture(t);
  f.hunt.attack();
  f.tick(0.4);
  assert.ok(f.hunt.held);
  f.hunt.cancel();
  assert.equal(f.calls.releases, 1);
  assert.equal(f.calls.consumes, 0);
  assert.equal(f.hunt.phase, "idle");
  assert.equal(f.hunt.held, null);
  f.hunt.cancel();
  assert.equal(f.calls.releases, 1);
});
test("held attack cannot duplicate captures and a prey leaving reach can escape before contact", (t) => {
  const f = fixture(t);
  f.hunt.attack();
  assert.equal(f.hunt.attack(), false);
  f.prey.position.z -= 15;
  f.tick(2);
  assert.equal(f.calls.captures, 0);
  assert.equal(f.calls.consumes, 0);
  assert.equal(f.hunt.lastResult, "miss");
});
