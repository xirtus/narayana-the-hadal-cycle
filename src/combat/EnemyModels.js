import * as THREE from "three";
import {
  makeShark,
  makeWhale,
  animateCreature,
} from "../ecology/CreatureModels.js";

function part(group, geometry, material, position, scale) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...position);
  if (scale) m.scale.set(...scale);
  group.add(m);
  return m;
}
export function makeEnemy(kind, mythic = false) {
  if (kind === "shark" || kind === "whale") {
    const group = kind === "shark" ? makeShark("predator") : makeWhale(true);
    // Creature factories share materials with ambient wildlife. Own clones here.
    const materials = new Map();
    group.traverse((o) => {
      if (o.material) {
        if (!materials.has(o.material))
          materials.set(o.material, o.material.clone());
        o.material = materials.get(o.material);
        if (mythic) {
          o.material.emissive.set(0x6642a5);
          o.material.emissiveIntensity = 0.3;
        }
      }
    });
    group.scale.setScalar(kind === "shark" ? 1.45 : 1.2);
    return group;
  }
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({
    color: 0x172c36,
    roughness: 0.65,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0xa7b6aa,
    metalness: 0.65,
    roughness: 0.3,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0xe7ac58,
    roughness: 0.4,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x80dfdf,
    emissive: 0x248a99,
    emissiveIntensity: 0.8,
    metalness: 0.4,
    roughness: 0.15,
  });
  const sphere = (mat, p, s) =>
    part(group, new THREE.SphereGeometry(1, 14, 10), mat, p, s);
  if (kind === "diver") {
    sphere(suit, [0, 0, 0], [0.34, 0.22, 0.64]);
    sphere(suit, [0, 0.04, -0.83], [0.23, 0.24, 0.25]);
    part(
      group,
      new THREE.BoxGeometry(0.38, 0.17, 0.12),
      glass,
      [0, 0.08, -1.03],
    );
    sphere(steel, [0, 0.3, 0.1], [0.21, 0.23, 0.55]);
    part(
      group,
      new THREE.TorusGeometry(0.22, 0.035, 6, 16),
      trim,
      [0, 0.31, 0.05],
    ).rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      sphere(suit, [side * 0.34, -0.02, -0.36], [0.13, 0.12, 0.44]);
      const leg = new THREE.Group();
      leg.position.set(side * 0.19, 0, 0.5);
      group.add(leg);
      part(
        leg,
        new THREE.CapsuleGeometry(0.12, 0.5, 3, 8),
        suit,
        [0, 0, 0.36],
      ).rotation.x = Math.PI / 2;
      part(
        leg,
        new THREE.BoxGeometry(0.26, 0.055, 0.48),
        trim,
        [0, -0.03, 0.9],
      );
      leg.userData.kick = side;
    }
    part(
      group,
      new THREE.CylinderGeometry(0.045, 0.045, 1.15, 8),
      steel,
      [0.36, -0.09, -0.84],
    ).rotation.x = Math.PI / 2;
    part(
      group,
      new THREE.BoxGeometry(0.13, 0.19, 0.22),
      suit,
      [0.36, -0.16, -0.36],
    );
    const hose = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.18, 0.25, 0.12),
      new THREE.Vector3(0.43, 0.23, -0.5),
      new THREE.Vector3(0.12, -0.09, -1),
    ]);
    part(
      group,
      new THREE.TubeGeometry(hose, 16, 0.035, 6, false),
      suit,
      [0, 0, 0],
    );
  } else {
    sphere(suit, [0, 0, 0], [0.85, 0.48, 1.05]);
    sphere(glass, [0, 0.1, -0.9], [0.54, 0.32, 0.3]);
    for (const side of [-1, 1]) {
      part(group, new THREE.CylinderGeometry(0.22, 0.22, 0.7, 12), steel, [
        side * 0.92,
        0,
        0.25,
      ]).rotation.x = Math.PI / 2;
      part(group, new THREE.TorusGeometry(0.23, 0.05, 6, 16), trim, [
        side * 0.92,
        0,
        0.63,
      ]);
      sphere(glass, [side * 0.58, -0.1, -0.8], [0.12, 0.12, 0.12]);
    }
    part(
      group,
      new THREE.CylinderGeometry(0.07, 0.07, 1.2, 8),
      steel,
      [0, -0.37, -0.65],
    ).rotation.x = Math.PI / 2;
  }
  group.userData.animation = kind;
  return group;
}
export function animateEnemy(group, time, speed) {
  animateCreature(group, time, speed);
  for (const c of group.children)
    if (c.userData.kick)
      c.rotation.x = Math.sin(time * 4 + c.userData.kick) * 0.28;
}
export function disposeEnemy(group) {
  group.removeFromParent();
  const geometries = new Set(),
    materials = new Set();
  group.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
