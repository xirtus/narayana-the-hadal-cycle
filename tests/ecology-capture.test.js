import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Ecosystem } from "../src/ecology/Ecosystem.js";

const mouth = new THREE.Vector3(0, -12, -1);
const forward = new THREE.Vector3(0, 0, -1);
function setup(t) {
  const scene = new THREE.Scene(),
    ecosystem = new Ecosystem(scene);
  t.after(() => ecosystem.dispose());
  for (const school of ecosystem.schools) school.alive.fill(false);
  const school = ecosystem.schools.find((s) => s.species === "anchovy");
  school.alive[0] = true;
  school.positions[0].copy(mouth).addScaledVector(forward, 2.7);
  return { scene, ecosystem, school };
}

test("hunting selects a real live prey inside mouth reach with generous lateral aim", (t) => {
  const { ecosystem, school } = setup(t);
  const prey = ecosystem.acquirePrey(mouth, forward);
  assert.equal(
    prey.position,
    school.positions[0],
    "target follows the moving fish",
  );
  assert.equal(prey.distance, 2.7);
  school.positions[0].copy(mouth).add(new THREE.Vector3(2.5, 0, -0.3));
  assert.equal(ecosystem.acquirePrey(mouth, forward).id, prey.id);
  school.positions[0].copy(mouth).addScaledVector(forward, 3.21);
  assert.equal(ecosystem.acquirePrey(mouth, forward), null);
  assert.ok(ecosystem.acquirePrey(mouth, forward, { range: 12 }));
  school.positions[0].copy(mouth).addScaledVector(forward, -0.3);
  assert.equal(ecosystem.acquirePrey(mouth, forward), null);
});

test("capture reserves exactly one fish and renders its matching independent body", (t) => {
  const { scene, ecosystem, school } = setup(t);
  const candidate = ecosystem.acquirePrey(mouth, forward);
  const held = ecosystem.capturePrey(candidate);
  assert.equal(held.group.parent, scene);
  assert.equal(held.active, true);
  assert.equal(school.alive[0], false);
  assert.equal(school.reserved.size, 1);
  assert.equal(ecosystem.capturePrey(candidate), null);
  assert.equal(ecosystem.acquirePrey(mouth, forward), null);
  assert.equal(
    ecosystem.hunt(mouth, forward),
    null,
    "legacy hunting cannot steal reserved prey",
  );
  const matrix = new THREE.Matrix4();
  school.mesh.getMatrixAt(0, matrix);
  assert.equal(new THREE.Vector3().setFromMatrixScale(matrix).lengthSq(), 0);
  assert.notEqual(held.group.children[0].geometry, school.mesh.geometry);
  assert.deepEqual(
    held.group.children[0].geometry.attributes.position.array,
    school.mesh.geometry.attributes.position.array,
  );
  assert.equal(held.group.scale.x, school.scales[0]);
  assert.deepEqual(held.position.toArray(), candidate.position.toArray());
  held.position.x += 1;
  assert.notEqual(
    held.position.x,
    candidate.position.x,
    "held fish has detached from its source instance",
  );
});

test("release restores source once; stale candidates cannot recapture it and consumption rewards once", (t) => {
  const { ecosystem, school } = setup(t);
  const candidate = ecosystem.acquirePrey(mouth, forward),
    held = ecosystem.capturePrey(candidate);
  const releasedAt = mouth.clone().addScaledVector(forward, 2);
  assert.equal(ecosystem.releasePrey(held, releasedAt), true);
  assert.equal(ecosystem.releasePrey(held, releasedAt), false);
  assert.equal(ecosystem.consumePrey(held), null);
  assert.equal(held.group.parent, null);
  assert.equal(school.alive[0], true);
  assert.equal(school.reserved.size, 0);
  assert.equal(ecosystem.capturePrey(candidate), null);
  assert.deepEqual(school.positions[0].toArray(), releasedAt.toArray());
  const caughtAgain = ecosystem.capturePrey(
    ecosystem.acquirePrey(mouth, forward),
  );
  let disposals = 0;
  caughtAgain.group.children[0].geometry.addEventListener(
    "dispose",
    () => disposals++,
  );
  const reward = ecosystem.consumePrey(caughtAgain);
  assert.ok(reward.energy > 0);
  assert.equal(caughtAgain.active, false);
  assert.equal(ecosystem.consumePrey(caughtAgain), null);
  assert.equal(ecosystem.releasePrey(caughtAgain, releasedAt), false);
  assert.equal(school.alive[0], false);
  assert.equal(disposals, 1);
});

test("streaming invalidates holds and stale candidates, disposing both source and held geometry exactly once", (t) => {
  const { ecosystem, school } = setup(t);
  const candidate = ecosystem.acquirePrey(mouth, forward),
    held = ecosystem.capturePrey(candidate);
  let sourceDisposals = 0,
    heldDisposals = 0;
  school.mesh.geometry.addEventListener("dispose", () => sourceDisposals++);
  held.group.children[0].geometry.addEventListener(
    "dispose",
    () => heldDisposals++,
  );
  ecosystem.stream(new THREE.Vector3(0, -1500, 0));
  assert.equal(held.active, false);
  assert.equal(held.state, "invalidated");
  assert.equal(held.group.parent, null);
  assert.equal(ecosystem.capturePrey(candidate), null);
  assert.equal(ecosystem.consumePrey(held), null);
  assert.equal(ecosystem.releasePrey(held, mouth), false);
  assert.equal(sourceDisposals, 1);
  assert.equal(heldDisposals, 1);
});

test("small anglerfish can be held and released, while seal attacks repel without consumption", (t) => {
  const { ecosystem } = setup(t);
  ecosystem.stream(new THREE.Vector3(0, -500, 0));
  for (const school of ecosystem.schools) school.alive.fill(false);
  const fish = ecosystem.animals.find((a) => a.species === "anglerfish");
  const start = new THREE.Vector3(0, -500, 0);
  fish.position.copy(start).addScaledVector(forward, 2);
  const held = ecosystem.capturePrey(ecosystem.acquirePrey(start, forward));
  assert.equal(held.group, fish.group);
  assert.equal(fish.reserved, true);
  const frozen = fish.position.clone();
  ecosystem.update(0.05, 1, start, { jet: 1 });
  assert.deepEqual(fish.position.toArray(), frozen.toArray());
  ecosystem.releasePrey(held, start.clone().addScaledVector(forward, 2.5));
  assert.equal(fish.reserved, false);
  assert.deepEqual(fish.position.toArray(), fish.home.toArray());
  ecosystem.stream(new THREE.Vector3(0, -12, 0));
  for (const school of ecosystem.schools) school.alive.fill(false);
  const seal = ecosystem.animals.find((a) => a.species === "seal");
  seal.position.copy(mouth).addScaledVector(forward, 2);
  assert.equal(ecosystem.acquirePrey(mouth, forward), null);
  const result = ecosystem.repelThreat(mouth, forward);
  assert.equal(result.species, "seal");
  assert.equal(result.repelled, true);
  ecosystem.update(0.05, 1.05, new THREE.Vector3(0, -12, 0), { jet: 1 });
  assert.equal(seal.behavior, "startled");
  assert.equal(seal.threat, 0);
  assert.ok(ecosystem.animals.includes(seal));
});

test("natural forage is reachable on entry and does not chase the player", (t) => {
  const scene = new THREE.Scene(),
    ecosystem = new Ecosystem(scene);
  t.after(() => ecosystem.dispose());
  assert.ok(ecosystem.acquirePrey(mouth, forward));
  const school = ecosystem.schools.find((s) => s.forage);
  const origin = school.origin.clone();
  for (let i = 0; i < 120; i++)
    ecosystem.update(1 / 60, i / 60, new THREE.Vector3(35, -12, 0));
  assert.deepEqual(school.origin.toArray(), origin.toArray());
  assert.ok(school.center.distanceTo(origin) < 2);
  for (const depth of [350, 750, 1500, 3000, 4500, 5500, 7000, 9000, 10900]) {
    const start = new THREE.Vector3(0, -depth, 0);
    ecosystem.stream(start);
    assert.ok(
      ecosystem.acquirePrey(start.clone().addScaledVector(forward, 1), forward),
      `reachable forage at ${depth} m`,
    );
  }
});
