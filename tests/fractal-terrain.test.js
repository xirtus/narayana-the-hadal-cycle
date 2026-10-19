import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SPACES } from "../src/expedition/Spaces.js";
import {
  buildFractalTerrain,
  fractalHeight,
  routeFloor,
  TERRAIN_RADIUS,
} from "../src/expedition/FractalTerrain.js";
import { disposeSpace } from "../src/expedition/SpaceGeometry.js";
const space = SPACES.find((s) => s.id === "canyon");
const sample = (x, z) => {
  const h = fractalHeight(space, x, z);
  return h
    ? THREE.MathUtils.lerp(space.position.y - 200, h.height, h.blend)
    : space.position.y - 200;
};
test("fractal landscape is deterministic, feathered at its outer boundary and preserves the swimming corridor", () => {
  const x = space.position.x,
    z = space.position.z;
  for (let dz = -270; dz <= 10; dz += 4) {
    const h = fractalHeight(space, x, z + dz);
    assert.ok(Math.abs(h.height - space.position.y - routeFloor(dz)) < 0.13);
  }
  assert.equal(fractalHeight({ ...space, terraced: false }, x, z), null);
  assert.equal(fractalHeight(space, x + TERRAIN_RADIUS, z), null);
  assert.ok(fractalHeight(space, x + TERRAIN_RADIUS - 0.1, z).blend < 0.00001);
  const heights = [];
  for (let dx = 50; dx < 650; dx += 13) {
    const h = fractalHeight(space, x + dx, z - 100);
    assert.deepEqual(h, fractalHeight(space, x + dx, z - 100));
    assert.ok(Number.isFinite(h.height));
    heights.push(h.height);
  }
  assert.ok(
    Math.max(...heights) - Math.min(...heights) > 50,
    "banks must have varied mountainous relief",
  );
});
test("triangulated terrain tiles share edges, match the physical height sampler and support raycast contacts", () => {
  const terrain = buildFractalTerrain(space, sample);
  terrain.group.updateMatrixWorld(true);
  try {
    assert.equal(terrain.meshes.length, 64);
    const edges = new Map();
    let shared = 0;
    for (const mesh of terrain.meshes) {
      const p = mesh.geometry.attributes.position,
        n = mesh.geometry.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        assert.ok(Number.isFinite(y));
        assert.ok(Number.isFinite(n.getY(i)));
        assert.ok(
          Math.abs(
            y +
              space.position.y -
              sample(x + space.position.x, z + space.position.z),
          ) < 0.001,
        );
        if (x % 256 === 0 || (z + 120) % 256 === 0) {
          const key = `${x},${z}`;
          if (edges.has(key)) {
            assert.ok(Math.abs(edges.get(key) - y) < 0.001);
            shared++;
          } else edges.set(key, y);
        }
      }
    }
    assert.ok(
      shared > 1000,
      "fine and coarse tiles must meet without open edges",
    );
    const ray = new THREE.Raycaster();
    for (const z of [-25, -67, -109, -151, -193, -235]) {
      ray.set(new THREE.Vector3(0, 20, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(terrain.meshes, false)[0];
      assert.ok(hit);
      assert.ok(Math.abs(hit.point.y - routeFloor(z)) < 1);
    }
  } finally {
    disposeSpace(terrain);
  }
});
