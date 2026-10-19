import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Cephalopod } from "./Cephalopod.js";

const world = {
  getFloorHeight: () => -40,
  getCurrent: (p, t, out) => out.set(0.12, 0, 0),
};
function swim(player, duration, input, hz = 60, environment = world) {
  for (let i = 0; i < duration * hz; i++)
    player.update(1 / hz, i / hz, input, environment);
}

test("squid has 8 arms, 2 feeding tentacles and paired fins; form switching releases anatomy", () => {
  const scene = new THREE.Scene(),
    animal = new Cephalopod(scene);
  assert.equal(animal.arms.length, 10);
  assert.equal(animal.arms.filter((a) => a.feeding).length, 2);
  assert.equal(animal.fins.length, 2);
  animal.setSpecies("octopus");
  assert.equal(animal.arms.length, 8);
  assert.equal(animal.arms.filter((a) => a.feeding).length, 0);
  assert.equal(animal.fins.length, 0);
  animal.dispose();
  assert.equal(scene.children.length, 0);
});

test("jet charges the mantle before accelerating and spending stamina", () => {
  const animal = new Cephalopod(new THREE.Scene());
  animal.update(0.1, 0.1, { jet: true }, world);
  assert.equal(animal.jetAmount, 0);
  assert.equal(animal.stamina, 1);
  animal.update(0.1, 0.2, { jet: true }, world);
  animal.update(0.1, 0.3, { jet: true }, world);
  assert.ok(animal.velocity.z < -1);
  assert.ok(animal.stamina < 0.9);
  assert.ok(animal.jetAmount > 0);
  animal.dispose();
});

test("force integration preserves swimming direction and remains close across frame rates", () => {
  const a = new Cephalopod(new THREE.Scene()),
    b = new Cephalopod(new THREE.Scene());
  swim(a, 2, { moveZ: 1, yaw: Math.PI / 2 }, 30);
  swim(b, 2, { moveZ: 1, yaw: Math.PI / 2 }, 120);
  assert.ok(a.position.x > 4);
  assert.ok(Math.abs(a.position.z) < 0.01);
  assert.ok(a.position.distanceTo(b.position) < 0.06);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
    a.group.quaternion,
  );
  assert.ok(forward.x > 0.98);
  a.dispose();
  b.dispose();
});

test("floor, surface and all arm control points stay finite under sustained jetting", () => {
  const animal = new Cephalopod(new THREE.Scene(), {
    position: new THREE.Vector3(0, -3, 0),
  });
  const shallow = { ...world, getFloorHeight: () => -4 };
  swim(animal, 3, { ascend: 1, jet: true }, 30, shallow);
  assert.ok(animal.position.y <= -0.7);
  swim(animal, 3, { ascend: -1, jet: true }, 30, shallow);
  assert.ok(animal.position.y >= -3.4);
  for (const arm of animal.arms)
    for (const p of arm.points) assert.ok(Number.isFinite(p.x + p.y + p.z));
  assert.ok(animal.stamina >= 0 && animal.stamina <= 1);
  animal.dispose();
});

test("anchored arms exert body traction and release cleanly", () => {
  const animal = new Cephalopod(new THREE.Scene());
  animal.grapple(new THREE.Vector3(2, -13, 0));
  swim(animal, 0.5, {});
  assert.equal(animal.mode, "anchored");
  assert.ok(animal.velocity.x > 0.5);
  assert.equal(animal.arms.filter((a) => a.anchor).length, 2);
  animal.grapple(null);
  assert.equal(animal.mode, "swimming");
  assert.equal(animal.arms.filter((a) => a.anchor).length, 0);
  animal.dispose();
});

test("growth keeps world-space arm roots, lengths and suckers attached to scaled anatomy", () => {
  const animal = new Cephalopod(new THREE.Scene());
  const reference = new Cephalopod(new THREE.Scene());
  reference.update(1 / 60, 1 / 60, {}, world);
  const radiusBefore = animal._armRadius(animal.arms[0], 0.3);
  animal.group.scale.setScalar(1.55);
  animal.update(1 / 60, 1 / 60, {}, world);
  assert.ok(
    Math.abs(animal._armRadius(animal.arms[0], 0.3) / radiusBefore - 1.55) <
      1e-8,
  );
  for (const arm of animal.arms) {
    const expected = animal.group.localToWorld(arm.root.clone());
    assert.ok(arm.points[0].distanceTo(expected) < 1e-8);
    let actualLength = 0;
    for (let i = 1; i <= arm.segments; i++)
      actualLength += arm.points[i].distanceTo(arm.points[i - 1]);
    const referenceArm = reference.arms[arm.index];
    let referenceLength = 0;
    for (let i = 1; i <= arm.segments; i++)
      referenceLength += referenceArm.points[i].distanceTo(
        referenceArm.points[i - 1],
      );
    assert.ok(Math.abs(actualLength / referenceLength - 1.55) < 0.003);
  }
  animal.dispose();
  reference.dispose();
});

test("teleport clears contacts, jet and arm momentum and updates visible mesh immediately", () => {
  const animal = new Cephalopod(new THREE.Scene());
  animal.grapple(new THREE.Vector3(2, -13, 0));
  swim(animal, 0.5, {});
  animal.group.scale.setScalar(1.4);
  const destination = new THREE.Vector3(700, -1400, -90);
  animal.teleport(destination);
  assert.ok(animal.position.equals(destination));
  assert.equal(animal.velocity.lengthSq(), 0);
  assert.equal(animal.mode, "swimming");
  assert.equal(animal.jetAmount, 0);
  for (const arm of animal.arms) {
    assert.equal(arm.anchor, null);
    assert.ok(
      arm.points[0].distanceTo(animal.group.localToWorld(arm.root.clone())) <
        1e-8,
    );
    for (let i = 0; i <= arm.segments; i++) {
      assert.ok(arm.points[i].equals(arm.previous[i]));
      assert.ok(arm.points[i].distanceTo(destination) < 7);
    }
    assert.ok(arm.mesh.geometry.attributes.position.getX(0) > 695);
  }
  animal.dispose();
});

test("steerable funnel outlet follows growth and rotation and exhaust opposes jet thrust", () => {
  const animal = new Cephalopod(new THREE.Scene());
  animal.group.scale.setScalar(1.55);
  animal.group.quaternion.setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -Math.PI / 2,
  );
  // Charge and release a vertical burst while facing sideways, requiring real funnel steering.
  swim(animal, 0.3, { ascend: 1, jet: true, yaw: Math.PI / 2 }, 120);
  assert.ok(animal.jetAmount > 0.5);
  const outlet = animal.getJetOutlet(new THREE.Vector3());
  const direction = animal.getJetDirection(new THREE.Vector3());
  const center = animal.siphon.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(outlet.distanceTo(center) - 0.18 * 1.55) < 1e-8);
  assert.ok(outlet.clone().sub(center).normalize().dot(direction) > 0.9999);
  assert.ok(direction.dot(animal._jetDirection) < -0.995);
  const unscaled = new THREE.Vector3(0, 0.18, 0)
    .applyQuaternion(animal.siphon.quaternion)
    .add(animal.siphon.position)
    .multiplyScalar(1.55)
    .applyQuaternion(animal.group.quaternion)
    .add(animal.position);
  assert.ok(outlet.distanceTo(unscaled) < 1e-8);
  animal.dispose();
});

test("sustained swimming is fast, jetting adds a controllable burst, and resting refills stamina", () => {
  const stillWater = { getFloorHeight: () => -1000 };
  for (const species of ["squid", "octopus"]) {
    const animal = new Cephalopod(new THREE.Scene(), { species });
    swim(animal, 4, { moveZ: 1 }, 60, stillWater);
    const cruise = animal.velocity.length();
    assert.ok(cruise > (species === "squid" ? 7 : 5));
    assert.ok(cruise < (species === "squid" ? 8 : 6));
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      animal.update(1 / 60, 4 + i / 60, { moveZ: 1, jet: true }, stillWater);
      peak = Math.max(peak, animal.velocity.length());
    }
    assert.ok(peak > 13 && peak <= 16.00001);
    assert.ok(animal.stamina > 0.4 && animal.stamina < 0.9);
    swim(animal, 3, {}, 60, stillWater);
    assert.equal(animal.stamina, 1);
    assert.ok(animal.velocity.length() < 0.6);
    animal.dispose();
  }
});

test("squid clubs reach prey three metres beyond the mouth and retract to the beak", () => {
  const animal = new Cephalopod(new THREE.Scene());
  const mouth = animal.getMouthPosition();
  const prey = mouth.clone().add(new THREE.Vector3(0, 0, -3));
  animal.setHuntPose({ phase: "windup", target: prey, progress: 1 });
  animal.update(1 / 60, 0, {});
  const contracted = animal.getFeedingTipPositions();
  for (const tip of contracted) assert.ok(tip.distanceTo(mouth) < 0.8);
  animal.setHuntPose({ phase: "strike", target: prey, progress: 0.5 });
  animal.update(1 / 60, 1 / 60, {});
  for (const tip of animal.getFeedingTipPositions()) {
    assert.ok(tip.distanceTo(mouth) > 1.5 && tip.distanceTo(mouth) < 2.2);
  }
  animal.setHuntPose({ phase: "strike", target: prey, progress: 1 });
  animal.update(1 / 60, 2 / 60, {});
  for (const tip of animal.getFeedingTipPositions())
    assert.ok(tip.distanceTo(prey) < 0.07);
  // The controller moves real prey inward; both clubs must retain contact throughout.
  for (let i = 0; i <= 30; i++) {
    const progress = i / 30;
    prey
      .copy(animal.getMouthPosition())
      .add(new THREE.Vector3(0, 0, -3 + 2.7 * progress));
    animal.setHuntPose({ phase: "retract", target: prey, progress });
    animal.update(1 / 60, (3 + i) / 60, {});
    for (const tip of animal.getFeedingTipPositions())
      assert.ok(tip.distanceTo(prey) < 0.075);
  }
  animal.setHuntPose({ phase: "feed", target: prey, progress: 0 });
  animal.update(1 / 60, 1, {});
  const jawAngle = animal.beakJaws[0].rotation.x;
  for (const arm of animal.arms.slice(0, 8))
    assert.ok(
      arm.points[arm.segments].distanceTo(animal.getMouthPosition()) < 0.5,
    );
  animal.update(1 / 60, 1.1, {});
  assert.ok(Math.abs(animal.beakJaws[0].rotation.x - jawAngle) > 0.1);
  animal.teleport(new THREE.Vector3(0, -200, 0));
  assert.equal(animal._hunt.phase, "idle");
  for (const arm of animal.arms)
    assert.ok(arm.points[arm.segments].distanceTo(animal.position) < 5);
  animal.dispose();
});

test("octopus captures with ordinary arms and growth transforms mouth and hunt reach", () => {
  const animal = new Cephalopod(new THREE.Scene(), { species: "octopus" });
  assert.equal(animal.getHuntReach(), 2.3);
  animal.group.scale.setScalar(1.55);
  animal.group.quaternion.setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -Math.PI / 2,
  );
  animal.update(1 / 60, 0, { yaw: Math.PI / 2 });
  assert.ok(Math.abs(animal.getHuntReach() - 2.3 * 1.55) < 1e-8);
  const mouth = animal.getMouthPosition();
  const expectedMouth = animal.group.localToWorld(
    new THREE.Vector3(0, 0, -1.06),
  );
  assert.ok(mouth.distanceTo(expectedMouth) < 1e-8);
  const prey = mouth.clone().add(new THREE.Vector3(3, 0, 0));
  animal.setHuntPose({ phase: "strike", target: prey, progress: 1 });
  animal.update(1 / 60, 1 / 60, { yaw: Math.PI / 2 });
  assert.equal(animal.arms.length, 8);
  assert.equal(animal.arms.filter((arm) => arm.feeding).length, 0);
  for (const tip of animal.getFeedingTipPositions())
    assert.ok(tip.distanceTo(prey) < 0.11);
  animal.setSpecies("squid");
  assert.equal(animal._hunt.phase, "idle");
  assert.equal(animal.arms.filter((arm) => arm.feeding).length, 2);
  animal.dispose();
});

test("refreshing a moving capture keeps rendered clubs attached at 25 Hz without advancing body physics", () => {
  const animal = new Cephalopod(new THREE.Scene());
  const prey = animal.getMouthPosition().add(new THREE.Vector3(0, 0, -3));
  animal.refreshHuntPose({ phase: "strike", target: prey, progress: 1 }, 0);
  for (let i = 0; i <= 15; i++) {
    const progress = i / 15,
      time = i / 25;
    animal.setHuntPose({ phase: "retract", target: prey, progress });
    animal.update(1 / 25, time, { moveZ: 0.2 });
    prey
      .copy(animal.getMouthPosition())
      .add(new THREE.Vector3(0, 0, -3 + 2.8 * progress));
    const position = animal.position.clone(),
      velocity = animal.velocity.clone();
    animal.refreshHuntPose({ phase: "retract", target: prey, progress }, time);
    assert.ok(animal.position.equals(position));
    assert.ok(animal.velocity.equals(velocity));
    for (const arm of animal.arms.filter((a) => a.feeding)) {
      assert.ok(arm.points[arm.segments].distanceTo(prey) < 0.1);
      assert.ok(arm.renderPoints[arm.renderSegments].distanceTo(prey) < 0.1);
      const attribute = arm.mesh.geometry.attributes.position;
      const tip = new THREE.Vector3().fromBufferAttribute(
        attribute,
        arm.renderSegments * arm.sides,
      );
      assert.ok(tip.distanceTo(prey) < 0.1);
    }
  }
  animal.dispose();
});

test("turbo sustains travel speed, turns under thrust and brakes safely back to precise swimming", () => {
  const water = {
    getFloorHeight: () => -1000,
    getCurrent: (p, t, v) => v.set(0, 0, 0),
  };
  const a = new Cephalopod(new THREE.Scene());
  a.turboMode = true;
  swim(a, 8, { moveZ: 1, jet: true }, 60, water);
  assert.ok(a.velocity.length() > 45 && a.velocity.length() <= 48.001);
  assert.ok(
    a.stamina > 0.5,
    "travel jets must not decay into the old slow stamina cycle",
  );
  swim(a, 0.6, { moveZ: 1, jet: true, yaw: Math.PI / 2 }, 60, water);
  assert.ok(
    a.velocity.x > 35 && Math.abs(a.velocity.z) < 3,
    "turbo remains steerable",
  );
  swim(a, 0.6, {}, 60, water);
  assert.ok(a.velocity.length() < 10, "releasing jets brakes for hunting");
  swim(a, 2, {}, 60, water);
  assert.ok(a.velocity.length() < 2);
  a.setSpecies("octopus");
  swim(a, 3, { moveZ: 1, jet: true }, 30, water);
  assert.ok(a.velocity.length() > 37 && a.velocity.length() <= 40.001);
  a.dispose();
});
