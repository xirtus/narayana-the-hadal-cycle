import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Ecosystem } from "../src/ecology/Ecosystem.js";
import { SchoolSystem } from "../src/ecology/SchoolSystem.js";
import { SPECIES, SPECIES_BY_ID } from "../src/ecology/species.js";

function fixture(t, options) {
  const scene = new THREE.Scene(),
    ecosystem = new Ecosystem(scene, options);
  t.after(() => ecosystem.dispose());
  return { scene, ecosystem };
}
function assertHabitat(animal) {
  const species = SPECIES_BY_ID[animal.species],
    depth = -animal.position.y;
  assert.ok(species, `${animal.species} has a codex entry`);
  if (animal.group.visible)
    assert.ok(
      depth >= species.depthRange[0] && depth <= species.depthRange[1],
      `${animal.species} at ${depth} m is outside ${species.depth}`,
    );
}

test("all depth regions generate finite renderable geometry and remain numerically stable", (t) => {
  const { scene, ecosystem } = fixture(t);
  const regions = new Set();
  for (const depth of [12, 300, 750, 1500, 3000, 4500, 7000, 9000, 10900]) {
    const player = new THREE.Vector3(0, -depth, 0);
    ecosystem.stream(player);
    regions.add(ecosystem.region);
    assert.ok(
      ecosystem.animals.length > 0,
      `region at ${depth} m is populated`,
    );
    for (let frame = 0; frame < 24; frame++)
      ecosystem.update(1 / 60, depth + frame / 60, player, {
        jet: frame < 12 ? 1 : 0,
      });
    for (const animal of ecosystem.animals) {
      assert.ok(animal.position.toArray().every(Number.isFinite));
      assert.ok(animal.group.quaternion.toArray().every(Number.isFinite));
      assert.equal(
        animal.position,
        animal.group.position,
        "ride position references the moving group",
      );
      assertHabitat(animal);
    }
    scene.traverse((object) => {
      if (!object.isMesh) return;
      assert.ok(object.geometry.attributes.position.count > 0);
      assert.ok(
        object.geometry.attributes.position.array.every(Number.isFinite),
      );
      assert.ok(object.geometry.attributes.normal.array.every(Number.isFinite));
      assert.equal(
        object.geometry.attributes.position.count,
        object.geometry.attributes.color?.count ??
          object.geometry.attributes.position.count,
      );
      if (object.isInstancedMesh)
        assert.ok(object.instanceMatrix.array.every(Number.isFinite));
    });
  }
  assert.equal(regions.size, 9);
});

test("species depth limits hold at habitat boundaries, including the narrow barreleye habitat", (t) => {
  const { ecosystem } = fixture(t);
  for (const depth of [
    49, 64, 199, 200, 599, 600, 699, 750, 801, 901, 999, 1000, 1999, 2001, 4701,
    5001, 5999, 6000, 7999, 8000, 10499, 10500,
  ]) {
    const player = new THREE.Vector3(0, -depth, 0);
    ecosystem.stream(player);
    ecosystem.update(0.016, depth, player);
    ecosystem.animals.forEach(assertHabitat);
    for (const school of ecosystem.schools) {
      const [min, max] = SPECIES_BY_ID[school.species].depthRange;
      assert.ok(
        school.positions.every((p) => -p.y >= min && -p.y <= max),
        `${school.species} school crossed its depth limits`,
      );
    }
    if (depth > 920)
      assert.ok(
        !ecosystem.animals.some((a) =>
          ["barreleye", "vampire-squid", "otter"].includes(a.species),
        ),
      );
    if (depth > 5000)
      assert.ok(
        !ecosystem.animals.some((a) =>
          ["tripod", "sea-pig"].includes(a.species),
        ),
      );
  }
  const required = ["id", "name", "scientific", "zone", "depth", "description"];
  for (const species of SPECIES)
    for (const property of required)
      assert.ok(
        typeof species[property] === "string" && species[property].length > 0,
        `${species.id}.${property} is missing`,
      );
  for (const id of ["naga", "shesha"])
    assert.match(
      SPECIES_BY_ID[id].scientific,
      /Mythic.*not a biological species/,
    );
});

test("hunting consumes only a real reachable fish in front and cannot consume it twice", (t) => {
  const { ecosystem } = fixture(t);
  const player = new THREE.Vector3(0, -12, 0);
  for (const school of ecosystem.schools) school.alive.fill(false);
  const school = ecosystem.schools[0];
  school.alive[0] = true;
  school.alive[1] = true;
  school.positions[0].copy(player).add(new THREE.Vector3(0, 0, -2));
  school.positions[1].copy(player).add(new THREE.Vector3(0, 0, 2));
  const forward = new THREE.Vector3(0, 0, -1);
  const catchResult = ecosystem.hunt(player, forward);
  assert.equal(catchResult.success, true);
  assert.equal(catchResult.species, school.species);
  assert.ok(catchResult.energy > 0);
  assert.equal(school.alive[0], false);
  assert.equal(school.alive[1], true);
  assert.equal(
    ecosystem.hunt(player, forward),
    null,
    "fish behind the animal cannot be caught forward",
  );
  assert.equal(ecosystem.hunt(player, forward.clone().negate()).success, true);
  assert.equal(ecosystem.hunt(player, forward), null);
  school.render();
  const matrix = new THREE.Matrix4();
  school.mesh.getMatrixAt(0, matrix);
  const scale = new THREE.Vector3();
  matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  assert.equal(
    scale.lengthSq(),
    0,
    "consumed prey is removed from the instance rendering",
  );
});

test("jet signals attract predators while camouflage and lingering ink suppress threats", (t) => {
  const { ecosystem } = fixture(t);
  const player = new THREE.Vector3(0, -12, 0);
  const seal = ecosystem.animals.find((a) => a.species === "seal");
  seal.position.copy(player).add(new THREE.Vector3(0, 0, -2));
  seal.home.copy(seal.position);
  ecosystem.update(0.016, 10, player, { jet: 1 });
  assert.equal(seal.behavior, "investigating");
  assert.ok(ecosystem.threatLevel > 0.5);
  assert.equal(
    ecosystem.threatLevel,
    ecosystem.threat,
    "core health integration uses the public threatLevel",
  );
  ecosystem.update(0.016, 10.1, player, { jet: 1, camouflage: true });
  assert.equal(ecosystem.threatLevel, 0);
  assert.notEqual(seal.behavior, "investigating");
  ecosystem.update(0.016, 10.2, player, { jet: 1, ink: true });
  assert.equal(seal.behavior, "evading ink");
  assert.equal(ecosystem.threatLevel, 0);
  ecosystem.update(0.016, 14, player, { jet: 1, ink: false });
  assert.equal(
    seal.behavior,
    "evading ink",
    "ink persists after its release frame",
  );
  ecosystem.update(0.016, 16, player, { jet: 1 });
  assert.equal(seal.behavior, "investigating");
  assert.ok(ecosystem.threatLevel > 0.5);
});

test("a distant jet scatters a school while a camouflaged animal does not", (t) => {
  const center = new THREE.Vector3(0, -12, 0),
    player = new THREE.Vector3(0, -12, 6);
  const make = () =>
    new SchoolSystem(new THREE.Scene(), {
      count: 8,
      center,
      random: () => 0.5,
    });
  const calm = make(),
    startled = make();
  t.after(() => {
    calm.dispose();
    startled.dispose();
  });
  calm.update(0.05, 1, player, { jet: 1, camouflage: true });
  startled.update(0.05, 1, player, { jet: 1, camouflage: false });
  const away = center.clone().sub(player).normalize();
  const difference = startled.velocities.reduce(
    (sum, v, i) => sum + v.clone().sub(calm.velocities[i]).dot(away),
    0,
  );
  assert.ok(
    difference > 0,
    "the visible mantle jet adds an outward avoidance impulse",
  );
});

test("bottom dwellers stay on terrain and become unavailable outside their depth habitat", (t) => {
  const { ecosystem } = fixture(t);
  const player = new THREE.Vector3(0, -4500, 0);
  ecosystem.setSeafloor(() => -4515);
  ecosystem.stream(player);
  ecosystem.update(0.016, 1, player);
  const bottom = ecosystem.animals.filter((a) => a.benthic);
  assert.ok(bottom.length > 0);
  for (const animal of bottom)
    assert.ok(
      Math.abs(
        animal.position.y -
          (-4515 + (animal.species === "tripod" ? 0.9 : 0.12)),
      ) < 0.001,
    );
  ecosystem.setSeafloor(() => -5500);
  ecosystem.update(0.016, 2, player);
  assert.ok(
    bottom
      .filter((a) => a.species === "tripod" || a.species === "sea-pig")
      .every((a) => !a.group.visible),
  );
  assert.ok(
    bottom
      .filter((a) => a.species === "glass-sponge")
      .every((a) => a.group.visible),
  );
  assert.ok(
    !ecosystem
      .discover(new THREE.Vector3(0, -5500, 0), 100)
      .some((id) => id === "tripod" || id === "sea-pig"),
  );
});

test("ride selection respects range and quality changes population without adding scene objects", (t) => {
  const { scene, ecosystem } = fixture(t);
  const ray = ecosystem.animals.find((a) => a.species === "bat-ray");
  assert.equal(ecosystem.nearestRideable(ray.position, 0.01), ray);
  assert.equal(
    ecosystem.nearestRideable(new THREE.Vector3(10000, 0, 0), 12),
    null,
  );
  const objects = scene.children.length,
    full = ecosystem.schools.reduce((total, school) => total + school.count, 0);
  ecosystem.setQuality("low");
  const reduced = ecosystem.schools.reduce(
    (total, school) => total + school.count,
    0,
  );
  assert.ok(reduced < full * 0.5 && reduced > 0);
  assert.equal(scene.children.length, objects);
  ecosystem.setQuality("ultra");
  assert.equal(
    ecosystem.schools.reduce((total, school) => total + school.count, 0),
    full,
  );
});

test("streaming releases old geometries; final disposal preserves objects owned by other systems", (t) => {
  const { scene, ecosystem } = fixture(t);
  const unrelated = new THREE.Group();
  scene.add(unrelated);
  const geometries = new Set();
  let disposed = 0;
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
  });
  for (const geometry of geometries)
    geometry.addEventListener("dispose", () => disposed++);
  const oldGroups = ecosystem.animals.map((a) => a.group);
  ecosystem.stream(new THREE.Vector3(0, -7000, 0));
  assert.equal(disposed, geometries.size);
  assert.ok(oldGroups.every((group) => group.parent === null));
  ecosystem.dispose();
  assert.deepEqual(scene.children, [unrelated]);
  assert.equal(ecosystem.animals.length, 0);
  assert.equal(ecosystem.schools.length, 0);
  ecosystem.dispose();
  assert.deepEqual(scene.children, [unrelated], "disposal is idempotent");
});
