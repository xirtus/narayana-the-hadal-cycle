import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { EncounterSystem } from "../src/mythology/EncounterSystem.js";

function setup(t) {
  const scene = new THREE.Scene();
  const world = {
    landmarks: [
      { id: "research", position: new THREE.Vector3(9, -370, -290) },
      { id: "whalefall", position: new THREE.Vector3(-16, -4160, -2314) },
    ],
    getFloorHeight: (x, z) => -26 - Math.pow(Math.max(0, -z - 48), 1.11) * 0.78,
  };
  const system = new EncounterSystem(scene, world, {}),
    player = {
      position: new THREE.Vector3(0, -12, 0),
      velocity: new THREE.Vector3(),
      mode: "swimming",
      arms: [],
      interact(target) {
        this.target = target;
      },
    };
  t.after(() => system.dispose());
  return { scene, system, player };
}

test("observatory requires a pulse and three real sensor grasps; repeated completion gives no reward", (t) => {
  const { system, player } = setup(t);
  const r = system.research;
  player.position.copy(r.nodes[0].position);
  system.update(0.016, 1, player, {});
  assert.equal(system.interact(player).memories, undefined);
  assert.ok(!r.nodes[0].purged);
  system.update(0.016, 2, player, { pulse: true });
  assert.ok(r.nodes.every((n) => n.revealed));
  const results = [];
  for (const node of r.nodes) {
    player.position.copy(node.position);
    results.push(system.interact(player));
  }
  assert.ok(r.nodes.every((n) => n.purged));
  assert.equal(r.complete, true);
  assert.equal(results.filter((result) => result?.memories).length, 1);
  assert.equal(results.at(-1).memories, 3);
  assert.equal(results.at(-1).completed, "observatory");
  assert.equal(system.interact(player), null);
  assert.ok(player.target instanceof THREE.Vector3);
  system.update(0.016, 3, player, {});
  assert.equal(player.target, null, "grasp animation is released");
});

test("whale fall needs camouflage with a fresh nearby pulse before honoring its skull", (t) => {
  const { system, player } = setup(t);
  player.position.copy(system.whale.position);
  system.update(0.016, 1, player, { pulse: true });
  assert.equal(system.whale.attunedUntil, 0);
  system.update(0.016, 2, player, { pulse: true, camouflage: true });
  assert.equal(
    system.whale.attunedUntil,
    0,
    "holding a pulse is not a new pulse",
  );
  system.update(0.016, 3, player, { pulse: false, camouflage: true });
  system.update(0.016, 4, player, { pulse: true, camouflage: true });
  assert.ok(system.whale.attunedUntil > 4);
  const result = system.interact(player);
  assert.equal(result.completed, "whale-fall");
  assert.equal(result.memories, 4);
  assert.ok(result.healing > 0);
  assert.match(result.message, /Shiva/);
  assert.match(result.message, /Vishnu/);
  assert.equal(system.interact(player), null);
});

test("whale pulse attunement expires and distant pulses do not activate its ritual", (t) => {
  const { system, player } = setup(t);
  player.position.copy(system.whale.position).add(new THREE.Vector3(30, 0, 0));
  system.update(0.016, 1, player, { pulse: true, camouflage: true });
  assert.equal(system.whale.attunedUntil, 0);
  player.position.copy(system.whale.position);
  system.update(0.016, 2, player, { pulse: false });
  system.update(0.016, 3, player, { pulse: true, camouflage: true });
  system.update(0.016, 30, player, {});
  assert.equal(system.interact(player).completed, undefined);
  assert.equal(system.whale.complete, false);
});

test("seismic beats damage jets only once per beat; camouflage and tentacle anchors protect", (t) => {
  const { system, player } = setup(t);
  const p = system.pressure;
  player.position.copy(p.points[0].position);
  const events = [];
  for (let i = 0; i < 5; i++) {
    const event = system.update(0.05, i * 0.05, player, { jet: 1 });
    if (event) events.push(event);
  }
  assert.equal(events.filter((event) => event.damage).length, 1);
  for (let i = 0; i < 5; i++) {
    const event = system.update(0.05, 6 + i * 0.05, player, {
      jet: 1,
      camouflage: true,
    });
    assert.ok(!event?.damage);
  }
  player.arms = [{ anchor: new THREE.Vector3() }];
  for (let i = 0; i < 5; i++) {
    const event = system.update(0.05, 12 + i * 0.05, player, { jet: 1 });
    assert.ok(!event?.damage);
  }
});

test("pressure route requires three sequential quiet shelters and rewards the crossing once", (t) => {
  const { system, player } = setup(t);
  const p = system.pressure;
  let time = 1;
  const events = [];
  player.position.copy(p.points[2].position);
  for (let i = 0; i < 16; i++) {
    const event = system.update(0.1, (time += 0.1), player, {
      camouflage: true,
    });
    if (event) events.push(event);
  }
  assert.equal(
    p.progress,
    0,
    "skipping directly to the final shelter cannot finish the encounter",
  );
  for (const point of p.points) {
    player.position.copy(point.position);
    for (let i = 0; i < 16; i++) {
      const event = system.update(0.1, (time += 0.1), player, {
        camouflage: true,
      });
      if (event) events.push(event);
    }
  }
  assert.equal(p.complete, true);
  assert.equal(p.progress, 3);
  assert.equal(
    events.filter((event) => event.completed === "pressure-rhythm").length,
    1,
  );
  assert.equal(
    events.find((event) => event.completed === "pressure-rhythm").memories,
    3,
  );
  for (let i = 0; i < 20; i++)
    assert.ok(
      !system.update(0.1, (time += 0.1), player, { camouflage: true })
        ?.completed,
    );
});

test("reincarnation preserves completed knowledge but resets unfinished interactions", (t) => {
  const { system } = setup(t);
  system.research.complete = true;
  system.research.nodes.forEach((n) => {
    n.revealed = true;
    n.purged = true;
  });
  system.whale.attunedUntil = 400;
  system.pressure.progress = 2;
  system.pressure.hold = 0.8;
  system.reset();
  assert.equal(system.research.complete, true);
  assert.equal(system.whale.attunedUntil, 0);
  assert.equal(system.pressure.progress, 0);
  system.reset({ preserveCompleted: false });
  assert.equal(system.research.complete, false);
  assert.ok(system.research.nodes.every((n) => !n.purged && !n.revealed));
});

test("encounter geometry stays finite, stays hidden from the opening and disposes completely", (t) => {
  const { scene, system, player } = setup(t);
  system.update(0.016, 1, player, {});
  assert.equal(system.objective, null);
  assert.equal(system.context, null);
  assert.ok(system.group.children.every((group) => !group.visible));
  let draws = 0;
  const geometry = new Set();
  system.group.traverse((object) => {
    if (object.geometry) {
      draws++;
      geometry.add(object.geometry);
      assert.ok(
        object.geometry.attributes.position.array.every(Number.isFinite),
      );
    }
  });
  assert.ok(draws <= 30);
  let disposed = 0;
  for (const g of geometry) g.addEventListener("dispose", () => disposed++);
  system.dispose();
  assert.equal(disposed, geometry.size);
  assert.equal(scene.children.length, 0);
});
