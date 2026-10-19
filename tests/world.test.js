import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { OceanWorld } from "../src/world/OceanWorld.js";
import {
  DEPTH_LEVELS,
  depthLevelAt,
  lightingAtDepth,
} from "../src/world/DepthLevels.js";

test("streamed ocean preserves navigable terrain, physical anchors and camera clearance", async (t) => {
  // The sequential cases share one expensive kelp/reef fixture and exercise
  // the same streaming lifecycle that a continuous descent uses in the game.
  const scene = new THREE.Scene();
  const unrelated = new THREE.Group();
  scene.add(unrelated);
  const world = new OceanWorld(scene, { seed: 41 });
  let disposed = false;
  t.after(() => {
    if (!disposed) world.dispose();
  });

  const enter = (position) => world.update(1 / 60, 1, position);
  const aboveSite = (site) =>
    new THREE.Vector3(
      site.position.x,
      world.getFloorHeight(site.position.x, site.position.z) + 8,
      site.position.z,
    );

  await t.test(
    "every benthic landmark has a flat shelf matching its rendered surface",
    () => {
      for (const site of world.landmarks.slice(2)) {
        const position = aboveSite(site);
        const floor = world.getFloorHeight(position.x, position.z);
        enter(position);
        const anchor = world.findAnchor(
          position,
          new THREE.Vector3(0, -1, 0),
          15,
        );
        assert.ok(
          anchor,
          `${site.id}: the visible floor is reachable by a surface ray`,
        );
        assert.ok(
          Math.abs(anchor.point.y - floor) < 0.15,
          `${site.id}: physical and rendered floor agree`,
        );
        assert.ok(
          anchor.normal.y > 0.95,
          `${site.id}: the shelf is approximately horizontal`,
        );
        for (const [dx, dz] of [
          [10, 0],
          [-10, 0],
          [0, 10],
          [0, -10],
        ]) {
          assert.ok(
            Math.abs(
              world.getFloorHeight(position.x + dx, position.z + dz) - floor,
            ) < 0.4,
            `${site.id}: the camera approach stays on the shelf`,
          );
        }
      }
    },
  );

  await t.test(
    "camera obstruction checks preserve line of sight and floor clearance",
    () => {
      for (const site of world.landmarks.slice(2)) {
        const target = aboveSite(site);
        enter(target);
        const desired = target.clone().add(new THREE.Vector3(0, -20, 0));
        assert.equal(
          world.avoidCamera(target, desired),
          desired,
          "the supplied vector is corrected in place",
        );
        assert.ok(
          desired.y > world.getFloorHeight(desired.x, desired.z) + 0.4,
          `${site.id}: the corrected camera remains above terrain`,
        );
        const direction = desired.clone().sub(target);
        const hit = world.findAnchor(target, direction, direction.length());
        assert.equal(
          hit,
          null,
          `${site.id}: no surface lies between animal and camera`,
        );
        for (let i = 1; i <= 20; i++) {
          const sample = target.clone().lerp(desired, i / 20);
          assert.ok(
            sample.y > world.getFloorHeight(sample.x, sample.z) + 0.4,
            `${site.id}: the entire camera segment clears the shelf`,
          );
        }
        const clear = target.clone().add(new THREE.Vector3(5, 3, 9));
        const expected = clear.clone();
        world.avoidCamera(target, clear);
        assert.ok(
          clear.distanceTo(expected) < 1e-6,
          `${site.id}: a clear camera approach is unchanged`,
        );
      }
    },
  );

  await t.test(
    "grappling and camera checks hit actual instanced rock geometry",
    () => {
      const site = world.landmarks.find(
        (landmark) => landmark.id === "whalefall",
      );
      enter(aboveSite(site));
      const rock = [...world.cells.values()].flatMap(
        (cell) => cell.userData.obstacles,
      )[0];
      assert.ok(rock, "the streamed region includes physical rocks");
      const origin = rock.position.clone().add(new THREE.Vector3(0, 30, 0));
      const anchor = world.findAnchor(origin, new THREE.Vector3(0, -1, 0), 50);
      assert.ok(
        anchor?.object.isInstancedMesh,
        "the contact comes from the real rock instance",
      );
      assert.ok(Number.isInteger(anchor.instanceId));
      assert.ok(
        Math.abs(anchor.normal.length() - 1) < 1e-6,
        "instance transformation preserves a unit contact normal",
      );
      assert.ok(
        anchor.normal.y > 0,
        "the upper rock surface normal faces the approaching animal",
      );
      const camera = rock.position.clone();
      world.avoidCamera(origin, camera);
      assert.ok(
        camera.y > anchor.point.y + 0.65,
        "the camera stops before entering the rock",
      );
      assert.equal(
        world.findAnchor(
          origin,
          camera.clone().sub(origin),
          camera.distanceTo(origin),
        ),
        null,
        "the corrected camera has an unobstructed line of sight",
      );
      assert.equal(
        world.findAnchor(origin, new THREE.Vector3(), 50),
        null,
        "an undefined aim cannot create an anchor",
      );
      assert.equal(
        world.findAnchor(origin, new THREE.Vector3(0, -1, 0), 0.1),
        null,
        "anchors respect reach distance",
      );
    },
  );

  await t.test(
    "deep body collision recovers from terrain penetration and respects clear approaches",
    () => {
      for (const site of world.landmarks.slice(2)) {
        const position = aboveSite(site);
        enter(position);
        const floor = world.getFloorHeight(position.x, position.z);
        position.y = floor - 2;
        world.resolveCollision(position, 0.5);
        assert.ok(
          position.y >= floor + 0.49,
          `${site.id}: the body cannot remain under the floor`,
        );
        assert.ok(position.toArray().every(Number.isFinite));
        const clear = aboveSite(site);
        const before = clear.clone();
        world.resolveCollision(clear, 0.5);
        assert.ok(
          clear.distanceTo(before) < 1e-6,
          `${site.id}: the rock exclusion leaves a clear arrival`,
        );
      }
    },
  );

  await t.test(
    "streaming stays bounded and releases replaced terrain through repeated depth changes",
    () => {
      const depths = [12, 370, 1500, 4160, 7000, 8070, 10860, 600, 12];
      for (const depth of depths) {
        const oldCells = [...world.cells.values()];
        const oldTerrain = oldCells[0]?.userData.colliders[0].geometry;
        let released = 0;
        oldTerrain?.addEventListener("dispose", () => released++);
        const z =
          depth < 100 ? 0 : -48 - Math.pow((depth + 22 - 26) / 0.78, 1 / 1.11);
        enter(new THREE.Vector3(0, -depth, z));
        assert.equal(
          world.cells.size,
          depth > 180 ? 9 : 0,
          `${depth} m: only the surrounding nine cells remain`,
        );
        assert.ok(
          oldCells.every((cell) => cell.parent === null),
          `${depth} m: old cells are detached`,
        );
        if (oldTerrain)
          assert.equal(
            released,
            1,
            `${depth} m: replaced terrain releases its GPU geometry`,
          );
        assert.ok(
          world.collisionSurfaces().every((surface) => surface.parent !== null),
          "collision queries exclude retired cells",
        );
      }
    },
  );

  await t.test(
    "seven depth levels have reachable current exits and fourteen streamed authored habitats",
    () => {
      assert.equal(world.habitats.length, 14);
      assert.equal(world.levelCurrents.length, 6);
      for (const current of world.levelCurrents) {
        assert.equal(current.nextLevel, current.level + 1);
        assert.ok(
          current.position.distanceTo(world.levelEntries[current.level]) < 60,
          `level ${current.level}: current is within a short swim`,
        );
        assert.ok(
          Math.abs(
            current.position.y -
              world.getFloorHeight(current.position.x, current.position.z) -
              8,
          ) < 1e-6,
        );
      }
      for (let level = 0; level < 7; level++) {
        const habitats = world.habitats.filter((h) => h.level === level);
        assert.equal(habitats.length, 2);
        enter(world.levelEntries[level]);
        assert.equal(
          world.habitatCells.size,
          2,
          "only the two nearby authored habitats are resident",
        );
        for (const habitat of habitats) {
          const group = world.habitatCells.get(habitat.id);
          assert.ok(
            group && group.children.length >= 2,
            `${habitat.id}: authored geometry loads`,
          );
          assert.ok(
            world.levelEntries[level].distanceTo(habitat.position) < 65,
            "side habitats are discoverable from arrival",
          );
        }
        assert.equal(
          world.cells.size,
          level === 0 ? 0 : 9,
          "terrain streaming remains bounded",
        );
      }
      world.setPerception("spectral");
      let warm;
      for (const group of world.habitatCells.values())
        group.traverse((o) => {
          if (o.material?.userData.thermal) warm = o.material;
        });
      assert.equal(
        warm.emissiveIntensity,
        2,
        "spectral mode translates nearby vent heat",
      );
      world.setPerception("natural");
      assert.ok(
        warm.emissiveIntensity < 1,
        "natural mode restores subdued vent emission",
      );
      const old = [...world.habitatCells.values()];
      enter(world.levelEntries[0]);
      assert.ok(
        old.every((group) => group.parent === null),
        "distant habitat geometry is released",
      );
    },
  );

  await t.test(
    "disposal releases world assets and leaves other scene systems intact",
    () => {
      enter(aboveSite(world.landmarks.at(-1)));
      const geometries = new Set();
      const materials = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material)
          (Array.isArray(object.material)
            ? object.material
            : [object.material]
          ).forEach((material) => materials.add(material));
      });
      const releasedGeometry = new Set();
      const releasedMaterials = new Set();
      geometries.forEach((geometry) =>
        geometry.addEventListener("dispose", () =>
          releasedGeometry.add(geometry),
        ),
      );
      materials.forEach((material) =>
        material.addEventListener("dispose", () =>
          releasedMaterials.add(material),
        ),
      );
      world.dispose();
      disposed = true;
      assert.equal(
        releasedGeometry.size,
        geometries.size,
        "all owned geometries receive disposal",
      );
      assert.equal(
        releasedMaterials.size,
        materials.size,
        "all owned materials receive disposal",
      );
      assert.equal(world.cells.size, 0);
      assert.deepEqual(scene.children, [unrelated]);
    },
  );
});

test("depth optics transition continuously and sunlight ends before midnight", () => {
  for (const level of DEPTH_LEVELS) {
    assert.equal(depthLevelAt(level.min).index, level.index);
    if (!level.index) continue;
    const before = lightingAtDepth(level.min - 0.001),
      after = lightingAtDepth(level.min + 0.001);
    before.water.forEach((v, i) =>
      assert.ok(
        Math.abs(v - after.water[i]) < 1e-5,
        "no abrupt color step at a level border",
      ),
    );
    assert.ok(Math.abs(before.fog - after.fog) < 1e-5);
    assert.ok(Math.abs(before.ambient - after.ambient) < 1e-5);
  }
  assert.equal(lightingAtDepth(1000).sunlight, 0);
  assert.equal(lightingAtDepth(11000).sunlight, 0);
  const twilight = lightingAtDepth(200);
  assert.ok(twilight.redTransmission < twilight.greenTransmission);
  assert.ok(twilight.greenTransmission < twilight.blueTransmission);
  assert.ok(lightingAtDepth(0).ambient > lightingAtDepth(200).ambient);
  assert.ok(lightingAtDepth(200).ambient > lightingAtDepth(4000).ambient);
});
