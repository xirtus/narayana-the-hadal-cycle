import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  SPACES,
  MAIN_SPACES,
  expeditionProgress,
} from "../src/expedition/Spaces.js";
import { Expedition } from "../src/expedition/Expedition.js";
import {
  buildSpace,
  animateSpace,
  disposeSpace,
} from "../src/expedition/SpaceGeometry.js";
import {
  buildTerraces,
  terraceNode,
  terraceFloor,
} from "../src/expedition/Terraces.js";
import { DiveLamp } from "../src/player/DiveLamp.js";
import { validateSave } from "../src/core/SaveSystem.js";
const V = (...a) => new THREE.Vector3(...a);
function fixture(t) {
  const scene = new THREE.Scene(),
    world = { shelves: [], findAnchor: () => null };
  const events = [];
  const e = new Expedition(scene, world, { onEvent: (x) => events.push(x) });
  t.after(() => e.dispose());
  return { e, scene, world, events };
}
test("sonar requires proximity and line of sight and unlocks only the adjacent region", (t) => {
  const { e, world, events } = fixture(t);
  assert.equal(e.enter(1), false);
  e.data = expeditionProgress({ completed: ["reef", "canyon"] });
  e.enter(2);
  assert.equal(e.pulse(V(999, -18, 0)), false);
  world.findAnchor = () => ({ distance: 0.1 });
  assert.equal(e.pulse(e.nodes[0].position.clone().add(V(3, 0, 0))), false);
  world.findAnchor = () => null;
  for (const node of e.nodes) assert.ok(e.pulse(node.position));
  assert.equal(e.unlocked, 3);
  assert.equal(e.enter(4), false);
  assert.equal(events.filter((e) => e.type === "opened").length, 1);
  assert.equal(e.pulse(e.nodes[4].position), false);
  assert.equal(e.interact(e.gate.position).index, 3);
});
test("city is optional, old city openings migrate to the reef and bonus completion cannot unlock the route", (t) => {
  const { e } = fixture(t);
  const city = SPACES.find((s) => s.bonus);
  assert.equal(e.data.active, "reef");
  assert.equal(
    expeditionProgress({ active: "city", completed: ["city"] }).active,
    "reef",
  );
  assert.ok(e.enter(city.index));
  for (const n of e.nodes) e.pulse(n.position);
  assert.equal(e.unlocked, 0);
  assert.equal(e.interact(e.gate.position).index, 0);
  assert.equal(expeditionProgress(e.data).active, "city");
});
test("terraced current courses require ordered passage and detect rings crossed during turbo", (t) => {
  const { e } = fixture(t);
  e.enter(0);
  e.update(0.02, 1, e.nodes[2].position);
  assert.equal(e.status.progress, 0);
  const flow = e.currentForce(e.space.position, 0, V());
  assert.ok(flow.z < -1);
  for (let i = 0; i < 5; i++) {
    const node = e.nodes[i];
    e.previousPosition = node.position.clone().add(V(0, 0, 5));
    e.update(0.02, 2 + i, node.position.clone().add(V(0, 0, -5)));
    assert.equal(e.status.progress, i + 1);
  }
  assert.equal(e.unlocked, 1);
  assert.ok(e.status.complete);
  assert.ok(e.record.guide);
});
test("all twelve spaces have finite geometry, open central entries, bounded streaming and distinct missions", (t) => {
  const { e, scene } = fixture(t);
  e.data = expeditionProgress({ completed: SPACES.map((s) => s.id) });
  let peak = 0;
  for (const s of SPACES) {
    e.enter(s.index);
    e.update(0.016, s.index, s.position);
    assert.ok(e.record.colliders.length > 0);
    const spawn = s.position.clone();
    e.resolveCollision(spawn, 0.7);
    assert.ok(spawn.distanceTo(s.position) < 0.1, `${s.id} entry must be open`);
    e.record.group.traverse((o) => {
      const p = o.geometry?.attributes.position;
      if (p)
        for (let i = 0; i < p.array.length; i++)
          assert.ok(Number.isFinite(p.array[i]), s.id);
    });
    peak = Math.max(peak, scene.children.length);
    assert.equal(e.nodes.length, s.count);
  }
  assert.ok(peak < 12);
  assert.equal(SPACES.find((s) => s.id === "titanic").depth, 3810);
});
test("walls prevent body passage while cave openings remain swimmable", (t) => {
  const { e } = fixture(t);
  e.data = expeditionProgress({ completed: SPACES.map((s) => s.id) });
  e.enter(SPACES.find((s) => s.id === "caves").index);
  const inside = e.record.boxes.find(
    (b) => b.getSize(new THREE.Vector3()).y > 25,
  );
  const point = inside.getCenter(new THREE.Vector3());
  e.resolveCollision(point, 0.6);
  assert.equal(inside.containsPoint(point), false);
  for (const z of [5, -10, -30, -50]) {
    const p = e.space.position.clone().add(V(0, 0, z)),
      before = p.clone();
    e.resolveCollision(p, 0.6);
    assert.ok(p.distanceTo(before) < 0.1);
  }
});
test("spotlight follows aim, toggles cleanly and clips its visible beam at an obstruction", (t) => {
  const scene = new THREE.Scene(),
    lamp = new DiveLamp(scene);
  t.after(() => lamp.dispose());
  lamp.update(V(0, -10, 0), V(0, 0, -1), {});
  assert.equal(lamp.beam.visible, false);
  lamp.toggle();
  lamp.update(V(0, -10, 0), V(1, 0, 0), {
    findAnchor: () => ({ distance: 12 }),
  });
  assert.ok(lamp.light.intensity > 0);
  assert.equal(lamp.beam.scale.z * 65, 12);
  assert.ok(lamp.light.target.position.x > lamp.light.position.x);
  lamp.toggle();
  lamp.update(V(0, -10, 0), V(0, 0, -1), {});
  assert.equal(lamp.light.visible, false);
});
test("partial puzzles, flashlight and route completion survive saves without unlocked-space injection", () => {
  const save = validateSave({
    version: 1,
    lamp: true,
    experience: "terraces",
    expedition: {
      active: "reef",
      completed: ["city"],
      progress: { city: 3, reef: 2 },
      unlocked: 99,
    },
  });
  assert.equal(save.expedition.unlocked, 0);
  assert.equal(save.expedition.progress.reef, 2);
  assert.equal(save.lamp, true);
  assert.equal(
    expeditionProgress({ completed: ["heart"], active: "heart", unlocked: 11 })
      .active,
    "reef",
  );
});
test("final echo seals open a playable event horizon and completion persists", (t) => {
  const { e, events } = fixture(t);
  e.data = expeditionProgress({
    completed: MAIN_SPACES.slice(0, -1).map((s) => s.id),
  });
  e.enter(MAIN_SPACES.length - 1);
  assert.equal(e.interact(e.gate.position).type, "locked");
  for (const n of e.nodes) e.pulse(n.position);
  assert.equal(e.interact(e.gate.position).type, "finished");
  assert.equal(e.data.finished, true);
  assert.ok(events.some((x) => x.type === "finished"));
});

test("every terrace node and exit has a clear descending swimming corridor above the physical floor", (t) => {
  const { e } = fixture(t);
  e.data = expeditionProgress({ completed: SPACES.map((s) => s.id) });
  for (const space of MAIN_SPACES) {
    e.enter(space.index);
    let from = space.position.clone();
    for (const to of [...e.nodes.map((n) => n.position), e.gate.position]) {
      for (let i = 0; i <= 100; i++) {
        const point = from.clone().lerp(to, i / 100),
          before = point.clone();
        e.resolveCollision(point, 0.75);
        assert.ok(
          point.distanceTo(before) < 0.01,
          `${space.id}: collision at ${before.toArray()}`,
        );
        assert.ok(
          before.y > e.floorHeight(before.x, before.z, -12000) + 0.6,
          `${space.id}: floor clearance`,
        );
      }
      from = to.clone();
    }
  }
});
test("terrace floors descend regularly and saved visibility settings are clamped", () => {
  for (let i = 0; i < 5; i++)
    assert.equal(terraceFloor(terraceNode(i).z), -7 - i * 18);
  const save = validateSave({
    version: 1,
    settings: { uvStrength: 20, turbo: false, vision: "spectral" },
  });
  assert.equal(save.settings.uvStrength, 1);
  assert.equal(save.settings.turbo, false);
  assert.equal(save.settings.vision, "spectral");
});

test("original ocean has no expedition terrain and classic trench keeps earlier flat layouts and dolphin", (t) => {
  const oceanWorld = { shelves: [], findAnchor: () => null },
    classicWorld = { shelves: [], findAnchor: () => null };
  const ocean = new Expedition(new THREE.Scene(), oceanWorld, {
      mode: "ocean",
    }),
    classic = new Expedition(new THREE.Scene(), classicWorld, {
      mode: "trench",
    });
  t.after(() => {
    ocean.dispose();
    classic.dispose();
  });
  assert.equal(oceanWorld.expedition, null);
  assert.equal(oceanWorld.shelves.length, 0);
  assert.equal(ocean.enter(0), false);
  assert.equal(ocean.floorHeight(0, 0, -25), -25);
  assert.equal(classicWorld.shelves.length, 12);
  assert.equal(classic.spaces[0].id, "city");
  assert.equal(classic.spaces[1].depth, 90);
  assert.equal(classic.spaces[2].id, "canyon");
  classic.enter(1);
  assert.ok(classic.companion);
  assert.equal(classic.record.guide, undefined);
  assert.equal(classic.nodes.length, 5);
  assert.ok(
    classic.nodes.every(
      (n) => Math.abs(n.position.y - classic.space.position.y) < 5,
    ),
  );
  classic.enter(3);
  assert.equal(classic.nodes.length, 3);
  assert.equal(classic.floorHeight(340, -800, -900), -900);
  classic.enter(11);
  assert.equal(classic.gate.position.y, classic.space.position.y);
});
