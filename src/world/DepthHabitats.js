import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DEPTH_LEVELS } from "./DepthLevels.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const types = [
  ["eelgrass", "Eelgrass nursery", "reef", "Sea-lion reef"],
  ["jellies", "The jelly curtain", "cable", "Broken cable grotto"],
  [
    "siphonophores",
    "The long colony",
    "constellation",
    "Lantern constellation",
  ],
  ["sponges", "Glass-sponge garden", "brine", "The mirror terraces"],
  ["gully", "Amphipod gully", "chimneys", "Mineral chimney garden"],
  ["spires", "The prismatic grove", "nave", "The drowned nave"],
  ["fissure", "Obsidian fissures", "cathedral", "The cathedral of silence"],
];

export function describeHabitats(entries, floor) {
  return entries.flatMap((entry, level) =>
    [0, 1].map((side) => {
      const [type, name] = types[level].slice(side * 2, side * 2 + 2);
      const x = entry.x + (side ? 38 : -34),
        z = entry.z - (side ? 19 : 6);
      return {
        id: `${DEPTH_LEVELS[level].id}-${type}`,
        name,
        type,
        level,
        position: V(x, floor(x, z), z),
      };
    }),
  );
}

/** Small authored habitats stream separately from the nine terrain tiles. */
export function buildHabitat(habitat, world) {
  const group = new THREE.Group();
  group.name = habitat.id;
  group.position.copy(habitat.position);
  group.userData.colliders = [];
  group.userData.obstacles = [];
  group.userData.animated = [];
  const level = DEPTH_LEVELS[habitat.level];
  const rock = new THREE.MeshStandardMaterial({
    color: level.palette.ground,
    roughness: 0.92,
  });
  const pale = new THREE.MeshStandardMaterial({
    color: 0xa4b2ac,
    roughness: 0.7,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: level.palette.emission,
    emissive: level.palette.emission,
    emissiveIntensity: 0.55,
    roughness: 0.45,
  });
  glow.userData.spectral = true;
  const warm = new THREE.MeshStandardMaterial({
    color: 0x3e3432,
    emissive: 0xe06732,
    emissiveIntensity: 0.025,
    roughness: 0.75,
  });
  warm.userData.thermal = true;
  const floor = (x, z) =>
    world.getFloorHeight(x + group.position.x, z + group.position.z) -
    group.position.y;
  const add = (geometry, material, x = 0, y = 0, z = 0, collider = false) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    if (collider) group.userData.colliders.push(mesh);
    return mesh;
  };
  const tube = (
    points,
    radius,
    material = glow,
    segments = 32,
    collider = false,
  ) =>
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        segments,
        radius,
        6,
        false,
      ),
      material,
      0,
      0,
      0,
      collider,
    );
  const field = (geometry, material, count, place) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count),
      dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      place(dummy, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return mesh;
  };
  const scatter = (i, radius = 15) => {
    const angle = i * 2.39996,
      r = Math.sqrt((i + 0.5) / 90) * radius;
    return [Math.cos(angle) * r, Math.sin(angle) * r];
  };
  const arch = (x, z, width, height, material = rock) => {
    const points = [];
    for (let j = 0; j <= 24; j++) {
      const a = (j / 24) * Math.PI;
      const px = x + Math.cos(a) * width;
      points.push(V(px, floor(px, z) + Math.sin(a) * height, z));
    }
    return tube(
      points,
      material === glow ? 0.035 : 0.65,
      material,
      32,
      material !== glow,
    );
  };
  if (habitat.type === "eelgrass") {
    const grass = new THREE.MeshStandardMaterial({
      color: 0x66894a,
      side: THREE.DoubleSide,
      roughness: 0.8,
    });
    const shape = new THREE.Shape();
    shape.moveTo(-0.04, 0);
    shape.quadraticCurveTo(0.3, 1, 0.09, 2);
    shape.quadraticCurveTo(0.1, 0.8, 0.04, 0);
    field(new THREE.ShapeGeometry(shape), grass, 380, (o, i) => {
      const [x, z] = scatter(i % 90, 10);
      o.position.set(x + Math.sin(i) * 0.4, floor(x, z), z);
      o.rotation.y = i * 2.4;
      o.scale.setScalar(0.5 + (i % 7) * 0.15);
    });
    field(new THREE.SphereGeometry(0.12, 6, 5), pale, 90, (o, i) => {
      const [x, z] = scatter(i, 10);
      o.position.set(x, floor(x, z) + 0.06, z);
      o.scale.set(1, 0.3, 1.5);
    });
  } else if (habitat.type === "reef" || habitat.type === "cable") {
    arch(0, 0, 8, 9);
    arch(0, -5, 6, 7);
    for (let i = 0; i < 9; i++) {
      const x = (i % 2 ? 1 : -1) * (6 + i * 0.45),
        z = -i * 0.7;
      const m = add(
        new THREE.DodecahedronGeometry(1, 1),
        rock,
        x,
        floor(x, z) + 1,
        z,
        true,
      );
      m.scale.set(2, 2 + (i % 3), 2.3);
    }
    if (habitat.type === "cable") {
      const metal = new THREE.MeshStandardMaterial({
        color: 0x474e52,
        metalness: 0.65,
        roughness: 0.7,
      });
      const points = [];
      for (let j = 0; j < 48; j++) {
        const x = Math.sin(j * 0.22) * 3,
          z = j * 0.55 - 15;
        points.push(V(x, floor(x, z) + 0.3, z));
      }
      tube(points, 0.075, metal, 64);
      const frame = add(
        new THREE.BoxGeometry(2, 1.2, 1.5),
        metal,
        -2,
        floor(-2, -4) + 0.7,
        -4,
      );
      frame.rotation.z = 0.23;
      for (let i = 0; i < 7; i++)
        add(
          new THREE.SphereGeometry(0.11, 8, 6),
          glow,
          i * 0.24 - 2.7,
          floor(-2, -4) + 1.4,
          -3.2,
        );
    } else
      field(
        new THREE.ConeGeometry(0.15, 0.5, 5),
        new THREE.MeshStandardMaterial({ color: 0xb55d50 }),
        90,
        (o, i) => {
          const [x, z] = scatter(i, 8);
          o.position.set(x, floor(x, z) + 0.2, z);
          o.rotation.z = Math.sin(i) * 0.15;
        },
      );
  } else if (
    ["jellies", "siphonophores", "constellation"].includes(habitat.type)
  ) {
    const jelly = new THREE.MeshStandardMaterial({
      color: 0x8db1d4,
      emissive: 0x437ca9,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.25,
    });
    for (let i = 0; i < (habitat.type === "siphonophores" ? 5 : 14); i++) {
      const x = Math.sin(i * 2.4) * 12,
        z = Math.cos(i * 2.4) * 8,
        y = 8 + (i % 5) * 3;
      if (habitat.type === "siphonophores") {
        const points = [];
        for (let j = 0; j < 36; j++) {
          const p = V(
            x + Math.sin(j * 0.25) * 2,
            y - j * 0.2,
            z + Math.cos(j * 0.2) * 1.5,
          );
          points.push(p);
          if (j % 2 === 0)
            add(new THREE.SphereGeometry(0.18, 8, 6), glow, ...p.toArray());
        }
        tube(points, 0.035, pale, 48);
        for (let j = 0; j < 7; j++)
          tube(
            [
              points[j * 4],
              points[j * 4].clone().add(V(1, -1.5, 0)),
              points[j * 4].clone().add(V(0.4, -4, 1)),
            ],
            0.014,
            glow,
            12,
          );
      } else if (habitat.type === "jellies") {
        const bell = add(
          new THREE.SphereGeometry(
            0.8,
            14,
            8,
            0,
            Math.PI * 2,
            0,
            Math.PI * 0.55,
          ),
          jelly,
          x,
          y,
          z,
        );
        bell.scale.y = 0.65;
        group.userData.animated.push({ mesh: bell, base: y, phase: i });
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * Math.PI * 2;
          tube(
            [
              V(x + Math.cos(a) * 0.5, y, z + Math.sin(a) * 0.5),
              V(x + 0.3 + Math.cos(a) * 0.35, y - 1.5, z),
              V(x + Math.sin(i + j) * 0.4, y - 3.2, z + 0.3),
            ],
            0.017,
            glow,
            14,
          );
        }
        const rim = add(
          new THREE.TorusGeometry(0.77, 0.022, 4, 24),
          glow,
          x,
          y - 0.06,
          z,
        );
        rim.rotation.x = Math.PI / 2;
      } else {
        for (let j = 0; j < 8; j++)
          add(
            new THREE.SphereGeometry(0.045 + (j % 3) * 0.02, 6, 5),
            glow,
            x + Math.sin(j) * 1.3,
            y + j * 0.45,
            z + Math.cos(j) * 1.3,
          );
      }
    }
  } else if (habitat.type === "sponges") {
    const sponge = new THREE.MeshStandardMaterial({
      color: 0xb7c6cc,
      emissive: 0x233d4a,
      emissiveIntensity: 0.2,
      wireframe: true,
      side: THREE.DoubleSide,
    });
    field(
      new THREE.CylinderGeometry(0.75, 0.22, 3.2, 12, 12, true),
      sponge,
      60,
      (o, i) => {
        const [x, z] = scatter(i, 18);
        o.position.set(x, floor(x, z) + 1.5, z);
        o.rotation.z = Math.sin(i) * 0.15;
        o.scale.setScalar(0.5 + (i % 5) * 0.25);
      },
    );
    field(new THREE.SphereGeometry(0.12, 7, 5), glow, 90, (o, i) => {
      const [x, z] = scatter(i, 18);
      o.position.set(x, floor(x, z) + 0.2, z);
      o.scale.set(1, 0.4, 1);
    });
  } else if (habitat.type === "brine") {
    const brine = new THREE.MeshStandardMaterial({
      color: 0x33494f,
      metalness: 0.8,
      roughness: 0.12,
      transparent: true,
      opacity: 0.7,
    });
    for (let i = 0; i < 4; i++) {
      const x = i * 5 - 8,
        z = -i * 4,
        y = floor(x, z);
      const rim = add(
        new THREE.TorusGeometry(4, 0.22, 6, 36),
        pale,
        x,
        y + 0.1,
        z,
      );
      rim.rotation.x = Math.PI / 2;
      const pool = add(
        new THREE.CircleGeometry(3.8, 40),
        brine,
        x,
        y + 0.09,
        z,
      );
      pool.rotation.x = -Math.PI / 2;
    }
  } else if (habitat.type === "gully") {
    for (let i = 0; i < 14; i++) {
      const x = (i % 2 ? 1 : -1) * 7,
        z = Math.floor(i / 2) * 2 - 6;
      const wall = add(
        new THREE.DodecahedronGeometry(1, 1),
        rock,
        x,
        floor(x, z) + 1.5,
        z,
        true,
      );
      wall.scale.set(2.4, 3 + (i % 3), 2.6);
    }
    field(new THREE.SphereGeometry(0.085, 6, 5), pale, 220, (o, i) => {
      const x = Math.sin(i * 2.4) * 4,
        z = Math.cos(i * 2.4) * 12;
      o.position.set(x, floor(x, z) + 0.13, z);
      o.scale.set(1, 0.7, 2);
      o.rotation.y = i;
    });
    field(new THREE.SphereGeometry(0.04, 5, 4), glow, 50, (o, i) => {
      const x = Math.sin(i * 2.4) * 5,
        z = Math.cos(i * 2.4) * 10;
      o.position.set(x, floor(x, z) + 0.4 + (i % 5) * 0.15, z);
    });
  } else if (habitat.type === "chimneys" || habitat.type === "fissure") {
    for (let i = 0; i < 9; i++) {
      const x = Math.sin(i * 2.4) * 9,
        z = Math.cos(i * 2.4) * 7,
        h = 2 + (i % 4) * 1.8;
      add(
        new THREE.CylinderGeometry(0.35, 1.2, h, 8, 3),
        rock,
        x,
        floor(x, z) + h / 2,
        z,
        true,
      );
      const lip = add(
        new THREE.TorusGeometry(0.35, 0.12, 6, 16),
        warm,
        x,
        floor(x, z) + h,
        z,
      );
      lip.rotation.x = Math.PI / 2;
    }
    field(
      new THREE.CylinderGeometry(0.035, 0.065, 1.2, 5),
      pale,
      90,
      (o, i) => {
        const [x, z] = scatter(i, 13);
        o.position.set(x, floor(x, z) + 0.6, z);
        o.rotation.z = Math.sin(i) * 0.18;
      },
    );
    if (habitat.type === "fissure") {
      for (let i = 0; i < 3; i++) {
        const points = [];
        for (let j = 0; j < 18; j++) {
          const x = (i - 1) * 5 + Math.sin(j * 0.8),
            z = j - 9;
          points.push(V(x, floor(x, z) + 0.1, z));
        }
        const fissure = tube(points, 0.11, warm, 32);
        fissure.material.emissiveIntensity = 0.8;
        fissure.material.userData.naturalIntensity = 0.8;
      }
    }
    const plumeGeo = new THREE.BufferGeometry(),
      positions = [];
    for (let i = 0; i < 160; i++) {
      const t = i / 160;
      positions.push(
        Math.sin(i * 2.4) * (1 + t * 3),
        6 + t * 15,
        Math.cos(i * 2.4) * (1 + t * 3),
      );
    }
    plumeGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    group.add(
      new THREE.Points(
        plumeGeo,
        new THREE.PointsMaterial({
          color: 0x63747f,
          size: 0.23,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        }),
      ),
    );
  } else if (habitat.type === "spires") {
    for (let i = 0; i < 17; i++) {
      const [x, z] = scatter(i * 4, 17),
        height = 3 + (i % 5) * 2;
      const spire = add(
        new THREE.ConeGeometry(0.8, height, 5),
        pale,
        x,
        floor(x, z) + height / 2,
        z,
        true,
      );
      spire.rotation.z = Math.sin(i) * 0.16;
      const seam = tube(
        [
          V(x - 0.25, floor(x, z), z + 0.4),
          V(x, floor(x, z) + height * 0.8, z + 0.1),
        ],
        0.04,
      );
      seam.material = glow;
    }
  } else {
    const cathedral = habitat.type === "cathedral";
    for (let i = 0; i < 5; i++) {
      const z = (i - 2) * 7;
      arch(0, z, cathedral ? 15 : 10, cathedral ? 23 : 15);
      arch(0, z, cathedral ? 14.5 : 9.5, cathedral ? 22.5 : 14.5, glow);
    }
    field(new THREE.OctahedronGeometry(0.2), glow, 70, (o, i) => {
      const [x, z] = scatter(i, 17);
      o.position.set(x, floor(x, z) + 1 + (i % 9) * 1.3, z);
      o.scale.setScalar(0.4 + (i % 3) * 0.2);
    });
  }
  // Small contact spheres follow each arch and chimney, leaving swim-through
  // openings empty while giving both arms and the mantle physical surfaces.
  for (const object of group.userData.colliders) {
    const parameters = object.geometry.parameters;
    if (parameters.path) {
      for (let i = 0; i <= 48; i++)
        group.userData.obstacles.push({
          position: parameters.path
            .getPoint(i / 48)
            .add(object.position)
            .add(group.position),
          radius: parameters.radius,
        });
    } else if (parameters.height) {
      const radius =
        Math.max(parameters.radiusTop || 0, parameters.radiusBottom || 0) * 0.8;
      const count = Math.ceil(parameters.height / Math.max(0.6, radius));
      for (let i = 0; i <= count; i++)
        group.userData.obstacles.push({
          position: V(0, (i / count - 0.5) * parameters.height, 0)
            .applyQuaternion(object.quaternion)
            .add(object.position)
            .add(group.position),
          radius,
        });
    } else {
      group.userData.obstacles.push({
        position: object.position.clone().add(group.position),
        radius:
          (parameters.radius || 1) *
          Math.max(object.scale.x, object.scale.y, object.scale.z) *
          0.83,
      });
    }
  }
  // Soft, short range illumination only; emissive organisms remain small silhouettes.
  if (habitat.level > 0) {
    const light = new THREE.PointLight(level.palette.emission, 8, 32, 1.5);
    light.position.set(0, 8, 4);
    group.add(light);
  }
  // Track all owned materials, including optional ones not used by this habitat.
  group.userData.materials = [rock, pale, glow, warm];
  batchStaticHabitatMeshes(group);
  return group;
}

/** Retain moving bells and physical surfaces; batch decorative strands and
 * photophores without changing their material identity or local pose. */
function batchStaticHabitatMeshes(group) {
  const excluded = new Set([
    ...group.userData.colliders,
    ...group.userData.animated.map((animation) => animation.mesh),
  ]);
  const batches = new Map();
  for (const object of group.children) {
    if (
      !object.isMesh ||
      object.isInstancedMesh ||
      excluded.has(object) ||
      Array.isArray(object.material) ||
      Object.keys(object.userData).length ||
      object.children.length ||
      !object.visible
    )
      continue;
    // Geometry attribute layouts must match; material identity preserves all
    // spectral/thermal flags, transparency, intensity and shader settings.
    const layout = Object.entries(object.geometry.attributes)
      .map(
        ([name, attribute]) =>
          `${name}:${attribute.itemSize}:${attribute.normalized}`,
      )
      .sort()
      .join(",");
    const key = `${object.material.uuid}:${!!object.geometry.index}:${layout}:${object.renderOrder}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(object);
  }
  const retiredGeometry = new Set();
  for (const objects of batches.values()) {
    if (objects.length < 2) continue;
    const parts = objects.map((object) => {
      object.updateMatrix();
      return object.geometry.clone().applyMatrix4(object.matrix);
    });
    const geometry = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, objects[0].material);
    mesh.name = `${group.name}-static-batch`;
    mesh.renderOrder = objects[0].renderOrder;
    group.add(mesh);
    for (const object of objects) {
      retiredGeometry.add(object.geometry);
      object.removeFromParent();
    }
  }
  // A future shared geometry may still belong to an animated or physical mesh.
  group.traverse((object) => retiredGeometry.delete(object.geometry));
  retiredGeometry.forEach((geometry) => geometry.dispose());
}

export function disposeHabitat(group) {
  const geometries = new Set(),
    materials = new Set(group.userData.materials);
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  group.removeFromParent();
}
