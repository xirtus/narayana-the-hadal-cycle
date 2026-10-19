import * as THREE from "three";
import { terrainContains } from "../expedition/FractalTerrain.js";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";
import {
  waterlitMaterial,
  makeSurface,
  makeSunRays,
  makeAtmosphere,
} from "../ocean/OceanMaterials.js";
import { MarineSnow } from "../ocean/MarineSnow.js";

import { DEPTH_LEVELS, depthLevelAt, lightingAtDepth } from "./DepthLevels.js";
import {
  describeHabitats,
  buildHabitat,
  disposeHabitat,
} from "./DepthHabitats.js";
const BIOMES = DEPTH_LEVELS;
const tmp = new THREE.Object3D();
function randomGenerator(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise(x, z) {
  return (
    Math.sin(x * 0.082) * Math.cos(z * 0.071) * 1.4 +
    Math.sin(x * 0.21 + z * 0.11) * 0.55 +
    Math.cos(z * 0.33 - x * 0.27) * 0.18
  );
}

function ribbon(length, width, bend, phase) {
  const p = [],
    uv = [],
    idx = [];
  for (let j = 0; j <= 12; j++) {
    const t = j / 12,
      w = Math.pow(Math.sin(Math.PI * t), 0.72) * width;
    for (const side of [-1, 1]) {
      p.push(
        t * length,
        Math.sin(t * Math.PI) * bend + Math.sin(t * 9 + phase) * 0.09 * t,
        -t * t * 0.7 + side * w + Math.sin(t * 11 + phase) * 0.11 * t,
      );
      uv.push(t, (side + 1) * 0.5);
    }
    if (j < 12) {
      const a = j * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function kelpGeometry(seed) {
  const rng = randomGenerator(seed),
    height = 23 + rng() * 6,
    parts = [];
  const pointAt = (y) => {
    const top = Math.max(0, (y / height - 0.65) / 0.35);
    return new THREE.Vector3(
      Math.sin(y * 0.19) * 0.8 + top * top * 3.4,
      y - top * top * 1.1,
      Math.sin(y * 0.16 + seed) * 0.7 + top * top * 0.9,
    );
  };
  const path = [];
  for (let j = 0; j <= 20; j++) {
    path.push(pointAt((j / 20) * height));
  }
  parts.push(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(path),
      40,
      0.052,
      5,
      false,
    ),
  );
  for (let j = 0; j < 43; j++) {
    const y = 0.7 + (j / 43) * (height - 0.8),
      center = pointAt(y);
    const leaf = ribbon(
      1.15 + rng() * 2.35,
      0.16 + rng() * 0.2,
      0.1 + rng() * 0.5,
      rng() * 6,
    );
    leaf.rotateY(j * 2.4 + rng() * 0.7);
    leaf.rotateZ(0.04 + rng() * 0.15);
    leaf.translate(center.x, center.y, center.z);
    parts.push(leaf);
    if (j % 2 === 0) {
      const bladder = new THREE.SphereGeometry(0.075, 5, 4);
      bladder.scale(1, 1.55, 1);
      bladder.translate(center.x + 0.08, center.y, center.z);
      parts.push(bladder);
    }
  }
  // Giant kelp sends multiple fronds up from a common holdfast; upper fronds
  // recline under the surface to form a loose, overlapping floating canopy.
  for (let branch = 0; branch < 2; branch++) {
    const angle = branch * 2.7 + seed,
      start = height * (0.3 + branch * 0.18),
      center = pointAt(start),
      length = height - start - 1.3;
    const branchPoints = [];
    for (let j = 0; j <= 14; j++) {
      const t = j / 14,
        reach = t * t * (3.2 + branch);
      branchPoints.push(
        new THREE.Vector3(
          center.x + Math.cos(angle) * reach,
          center.y + t * length - t * t * 1.8,
          center.z + Math.sin(angle) * reach,
        ),
      );
    }
    const curve = new THREE.CatmullRomCurve3(branchPoints);
    parts.push(new THREE.TubeGeometry(curve, 25, 0.031, 5, false));
    for (let j = 0; j < 24; j++) {
      const t = (j + 0.4) / 24,
        point = curve.getPoint(t),
        leaf = ribbon(
          1.1 + rng() * 1.9,
          0.16 + rng() * 0.17,
          0.2 + rng() * 0.3,
          rng() * 6,
        );
      leaf.rotateY(angle + j * 2.4);
      leaf.rotateZ(-0.04 + rng() * 0.18);
      leaf.translate(point.x, point.y, point.z);
      parts.push(leaf);
    }
  }
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged;
}

export class OceanWorld {
  constructor(scene, { quality = "high", seed = 41 } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.seed = seed;
    this.clock = { value: 0 };
    this.biome = BIOMES[0];
    this.depth = 12;
    this.rng = randomGenerator(seed);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.shallow = new THREE.Group();
    this.group.add(this.shallow);
    this.landmarks = [];
    this.shelves = [];
    this.cells = new Map();
    this.obstacles = [];
    this.disposables = new Set();
    this.shallowColliders = [];
    this.raycaster = new THREE.Raycaster();
    this.collisionDirection = new THREE.Vector3();
    scene.background = new THREE.Color(this.biome.color);
    scene.fog = new THREE.FogExp2(this.biome.color, this.biome.fog);
    this.hemi = new THREE.HemisphereLight(0xb8e9d3, 0x203f3d, 2.15);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffedc2, 3.1);
    this.sun.position.set(-35, 75, 25);
    this.group.add(this.sun);
    this.fill = new THREE.DirectionalLight(0x53aecd, 0.75);
    this.fill.position.set(30, -5, -30);
    this.group.add(this.fill);
    this.divelight = new THREE.PointLight(0x65dbd8, 0, 100, 1.1);
    this.group.add(this.divelight);
    this.sand = waterlitMaterial({ color: 0x9a9b70 }, this.clock);
    this.rock = waterlitMaterial({ color: 0x727b65 }, this.clock, {
      rock: true,
    });
    this.deepRock = waterlitMaterial({ color: 0x41494c }, this.clock, {
      rock: true,
    });
    this.kelpMaterial = waterlitMaterial(
      {
        color: 0x7c8535,
        side: THREE.DoubleSide,
        roughness: 0.65,
        metalness: 0.02,
      },
      this.clock,
      { sway: true },
    );
    this.surface = makeSurface(this.clock);
    this.rays = makeSunRays(this.clock);
    this.atmosphere = makeAtmosphere(scene.fog.color);
    this.group.add(this.surface, this.rays, this.atmosphere);
    this.snow = new MarineSnow(scene, this.clock);
    this.makeShallowTerrain();
    this.makeKelp();
    this.makeBenthos();
    this.makeLandmarks();
    this.makeIsland();
    this.makeDeepLandmarks();
    this.makeDepthLevels();
    this.setQuality(quality);
  }

  getFloorHeight(x, z) {
    const descent = Math.max(0, -z - 48);
    const center = -26 - Math.pow(descent, 1.11) * 0.78;
    const canyonBank =
      descent > 12 ? Math.min(45, Math.pow(Math.abs(x) / 25, 1.7) * 16) : 0;
    let floor = Math.max(-11015, center + canyonBank + noise(x, z));
    for (const shelf of this.shelves) {
      const distance = Math.hypot(x - shelf.x, z - shelf.z);
      if (distance < shelf.radius) {
        const blend =
          1 - THREE.MathUtils.smoothstep(distance, shelf.inner, shelf.radius);
        floor = THREE.MathUtils.lerp(
          floor,
          shelf.floor + noise(x, z) * 0.1,
          blend,
        );
      }
    }
    return this.expedition?.floorHeight(x, z, floor) ?? floor;
  }

  makeShallowTerrain() {
    const geometry = new THREE.PlaneGeometry(560, 600, 150, 165);
    geometry.rotateX(-Math.PI / 2);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i) - 120;
      p.setXYZ(i, x, this.getFloorHeight(x, z), z);
    }
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(geometry, this.sand);
    terrain.userData.baseOceanTerrain = true;
    this.shallow.add(terrain);
    this.shallowColliders.push(terrain);
    const rawRocks = new THREE.DodecahedronGeometry(1, 3),
      pos = rawRocks.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i),
        r = 1 + noise(x * 13, z * 11 + y * 8) * 0.12;
      pos.setXYZ(i, x * r, y * r, z * r);
    }
    rawRocks.deleteAttribute("normal");
    rawRocks.deleteAttribute("uv");
    const rocks = mergeVertices(rawRocks, 1e-5);
    rawRocks.dispose();
    rocks.computeVertexNormals();
    this.rockGeometry = rocks;
    const rockField = new THREE.InstancedMesh(rocks, this.rock, 280);
    for (let i = 0; i < 280; i++) {
      let x = (this.rng() - 0.5) * 240,
        z = (this.rng() - 0.65) * 250;
      if (i < 14) {
        x = (i % 2 ? 1 : -1) * (13 + this.rng() * 20);
        z = 12 - i * 8;
      }
      const size = 0.6 + Math.pow(this.rng(), 2) * 7;
      tmp.position.set(x, this.getFloorHeight(x, z) - size * 0.22, z);
      tmp.rotation.set(this.rng(), this.rng() * 6, this.rng());
      tmp.scale.set(
        size * (1 + this.rng()),
        size * (0.6 + this.rng() * 0.5),
        size,
      );
      tmp.updateMatrix();
      rockField.setMatrixAt(i, tmp.matrix);
      rockField.setColorAt(
        i,
        new THREE.Color().setHSL(
          0.12 + this.rng() * 0.07,
          0.12 + this.rng() * 0.16,
          0.31 + this.rng() * 0.19,
        ),
      );
      if (i < 80)
        this.obstacles.push({
          position: tmp.position.clone(),
          radius: size * 0.75,
        });
    }
    rockField.instanceMatrix.needsUpdate = true;
    this.shallow.add(rockField);
    this.shallowColliders.push(rockField);
    this.kelpMeshes = [];
  }

  makeKelp() {
    for (let variety = 0; variety < 4; variety++) {
      const mesh = new THREE.InstancedMesh(
        kelpGeometry(72 + variety),
        this.kelpMaterial,
        28,
      );
      for (let i = 0; i < 28; i++) {
        let x = (this.rng() - 0.5) * 155,
          z = (this.rng() - 0.72) * 150;
        if (Math.abs(x) < 9 && z > -60) x += (x >= 0 ? 1 : -1) * 12;
        const floor = this.getFloorHeight(x, z),
          h = Math.min(1.25, (-floor - 0.5) / 27);
        tmp.position.set(x, floor, z);
        tmp.rotation.set(0, this.rng() * 6, 0);
        tmp.scale.set(0.8 + this.rng() * 0.45, h, 0.8 + this.rng() * 0.45);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
        mesh.setColorAt(
          i,
          new THREE.Color().setHSL(
            0.17 + this.rng() * 0.035,
            0.38 + this.rng() * 0.18,
            0.4 + this.rng() * 0.16,
          ),
        );
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      this.shallow.add(mesh);
      this.kelpMeshes.push(mesh);
    }
  }

  makeBenthos() {
    // California's rocky reef: eelgrass, strawberry anemones, purple urchins and ochre stars.
    const grassGeometry = ribbon(1.4, 0.075, 0.65, 1);
    grassGeometry.rotateZ(Math.PI / 2);
    const grassMat = waterlitMaterial(
      { color: 0x647947, side: THREE.DoubleSide },
      this.clock,
      { sway: true },
    );
    const grass = new THREE.InstancedMesh(grassGeometry, grassMat, 3400);
    for (let i = 0; i < 3400; i++) {
      const x = (this.rng() - 0.5) * 150,
        z = (this.rng() - 0.65) * 170,
        s = 0.35 + this.rng() * 1.1;
      tmp.position.set(x, this.getFloorHeight(x, z), z);
      tmp.rotation.set(this.rng() * 0.3, this.rng() * 6, this.rng() * 0.2);
      tmp.scale.set(s, s, s);
      tmp.updateMatrix();
      grass.setMatrixAt(i, tmp.matrix);
    }
    this.grass = grass;
    this.shallow.add(grass);
    const anemoneParts = [new THREE.SphereGeometry(0.15, 8, 6)];
    anemoneParts[0].scale(1, 0.45, 1);
    for (let j = 0; j < 16; j++) {
      const a = (j / 16) * Math.PI * 2,
        curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(Math.cos(a) * 0.06, 0.04, Math.sin(a) * 0.06),
          new THREE.Vector3(Math.cos(a) * 0.14, 0.23, Math.sin(a) * 0.14),
          new THREE.Vector3(
            Math.cos(a) * 0.24,
            0.25 + Math.sin(a * 3) * 0.025,
            Math.sin(a) * 0.24,
          ),
        ]);
      anemoneParts.push(new THREE.TubeGeometry(curve, 5, 0.015, 4, false));
    }
    const anemoneGeometry = mergeGeometries(anemoneParts);
    anemoneParts.forEach((g) => g.dispose());
    const anemones = new THREE.InstancedMesh(
      anemoneGeometry,
      waterlitMaterial({ color: 0xad645a, roughness: 0.72 }, this.clock, {
        sway: true,
      }),
      260,
    );
    for (let i = 0; i < 260; i++) {
      const x = (this.rng() - 0.5) * 85,
        z = (this.rng() - 0.6) * 110,
        s = 0.7 + this.rng() * 1.3;
      tmp.position.set(x, this.getFloorHeight(x, z) + 0.07, z);
      tmp.rotation.set(0, this.rng() * 6, 0);
      tmp.scale.set(s, s, s);
      tmp.updateMatrix();
      anemones.setMatrixAt(i, tmp.matrix);
      anemones.setColorAt(
        i,
        new THREE.Color().setHSL(
          0.01 + this.rng() * 0.13,
          0.4,
          0.4 + this.rng() * 0.2,
        ),
      );
    }
    this.shallow.add(anemones);
    const urchinParts = [new THREE.SphereGeometry(0.19, 8, 6)];
    for (let j = 0; j < 38; j++) {
      const a = j * 2.39996,
        y = j / 38,
        r = Math.sqrt(1 - y * y),
        v = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const needle = new THREE.ConeGeometry(0.018, 0.24, 3);
      needle.translate(0, 0.24, 0);
      needle.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          v,
        ),
      );
      urchinParts.push(needle);
    }
    const urchinGeometry = mergeGeometries(urchinParts);
    urchinParts.forEach((g) => g.dispose());
    const urchins = new THREE.InstancedMesh(
      urchinGeometry,
      new THREE.MeshStandardMaterial({ color: 0x463549, roughness: 0.8 }),
      140,
    );
    for (let i = 0; i < 140; i++) {
      const x = (this.rng() - 0.5) * 100,
        z = (this.rng() - 0.6) * 130;
      tmp.position.set(x, this.getFloorHeight(x, z) + 0.13, z);
      tmp.rotation.set(0, this.rng() * 6, 0);
      tmp.scale.setScalar(0.65 + this.rng() * 0.7);
      tmp.updateMatrix();
      urchins.setMatrixAt(i, tmp.matrix);
    }
    this.shallow.add(urchins);
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2,
        r = i % 2 ? 0.12 : 0.48;
      const x = Math.cos(a) * r,
        y = Math.sin(a) * r;
      i ? starShape.lineTo(x, y) : starShape.moveTo(x, y);
    }
    starShape.closePath();
    const starGeo = new THREE.ExtrudeGeometry(starShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.05,
      bevelSegments: 2,
      steps: 1,
    });
    starGeo.rotateX(-Math.PI / 2);
    const stars = new THREE.InstancedMesh(
      starGeo,
      waterlitMaterial({ color: 0xb37637 }, this.clock),
      65,
    );
    for (let i = 0; i < 65; i++) {
      const x = (this.rng() - 0.5) * 65,
        z = (this.rng() - 0.6) * 90;
      tmp.position.set(x, this.getFloorHeight(x, z) + 0.08, z);
      tmp.rotation.set(0, this.rng() * 6, 0);
      tmp.scale.setScalar(0.65 + this.rng() * 0.8);
      tmp.updateMatrix();
      stars.setMatrixAt(i, tmp.matrix);
    }
    this.shallow.add(stars);
  }

  makeLandmarks() {
    const sites = [
      [
        "sanctuary",
        "The first memory",
        new THREE.Vector3(-12, -20, -34),
        "sanctuary",
      ],
      ["canyon", "The blue descent", new THREE.Vector3(0, -66, -90), "current"],
      [
        "research",
        "The lost observatory",
        new THREE.Vector3(9, -370, -289.2),
        "research",
      ],
      [
        "whalefall",
        "A gift to the deep",
        new THREE.Vector3(-16, -4160, -2313.7),
        "whalefall",
      ],
      [
        "naga",
        "The sleeping nāga",
        new THREE.Vector3(0, -8070, -4175.2),
        "sanctuary",
      ],
      [
        "gate",
        "The wheel beneath the world",
        new THREE.Vector3(0, -10860, -5445.1),
        "gate",
      ],
    ];
    for (const [id, name, position, type] of sites) {
      this.landmarks.push({ id, name, position, type, activated: false });
    }
    for (const landmark of this.landmarks.slice(2)) {
      const offset = { research: 4, whalefall: 1, naga: 9, gate: 16 }[
        landmark.id
      ];
      landmark.position.y =
        this.getFloorHeight(landmark.position.x, landmark.position.z) + offset;
    }
    for (const landmark of this.landmarks.slice(2)) {
      const offset = { research: 4, whalefall: 1, naga: 9, gate: 16 }[
        landmark.id
      ];
      this.shelves.push({
        x: landmark.position.x,
        z: landmark.position.z,
        floor: landmark.position.y - offset,
        inner: landmark.id === "gate" ? 32 : 24,
        radius: landmark.id === "gate" ? 76 : 60,
      });
    }
    const shrine = new THREE.Group();
    shrine.position.set(-12, this.getFloorHeight(-12, -34) + 0.4, -34);
    const stone = new THREE.MeshStandardMaterial({
      color: 0x626e60,
      roughness: 0.82,
    });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2,
        m = new THREE.Mesh(this.rockGeometry, stone);
      m.position.set(Math.cos(a) * 2, 0.5, Math.sin(a) * 2);
      m.scale.set(0.55, 0.85, 0.7);
      shrine.add(m);
    }
    const shell = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.37, 0.08, 80, 8, 2, 3),
      new THREE.MeshStandardMaterial({
        color: 0xc7d2ab,
        emissive: 0x75bfa0,
        emissiveIntensity: 0.8,
        roughness: 0.35,
      }),
    );
    shell.position.y = 1.4;
    shrine.add(shell);
    this.memoryShell = shell;
    this.shallow.add(shrine);
    this.landmarks[0].position.copy(shrine.position).y += 1.4;
    const light = new THREE.PointLight(0x86eed3, 4, 8, 2);
    light.position.y = 1.7;
    shrine.add(light);
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(5.2, 0.055, 5, 100, Math.PI * 1.45),
      new THREE.MeshBasicMaterial({
        color: 0x65b8c0,
        transparent: true,
        opacity: 0.26,
      }),
    );
    arc.position.copy(this.landmarks[1].position);
    arc.rotation.x = 0.25;
    this.shallow.add(arc);
  }

  makeIsland() {
    const island = new THREE.Mesh(
      new THREE.ConeGeometry(34, 63, 18, 8),
      this.deepRock,
    );
    island.position.set(-130, -12, 95);
    const p = island.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      p.setXYZ(
        i,
        x + noise(x, y) * 1.5,
        y + noise(x, z),
        z + noise(y, z) * 1.5,
      );
    }
    island.geometry.computeVertexNormals();
    this.shallow.add(island);
  }

  makeDeepLandmarks() {
    this.deepLandmarks = new THREE.Group();
    this.group.add(this.deepLandmarks);
    this.authoredSites = [];
    const metal = new THREE.MeshStandardMaterial({
      color: 0x777e72,
      metalness: 0.6,
      roughness: 0.7,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x38464a,
      metalness: 0.55,
      roughness: 0.7,
    });
    const glow = new THREE.MeshStandardMaterial({
      color: 0x69b7af,
      emissive: 0x399e94,
      emissiveIntensity: 1.5,
      roughness: 0.4,
    });
    const bone = new THREE.MeshStandardMaterial({
      color: 0x9c9c81,
      roughness: 0.93,
    });
    for (const landmark of this.landmarks.slice(2)) {
      const site = new THREE.Group();
      site.position.copy(landmark.position);
      this.deepLandmarks.add(site);
      this.authoredSites.push(site);
      if (landmark.type === "research") {
        // A small deep-ocean observatory: pressure sphere, bent cage, instruments and umbilical.
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(2.25, 24, 20),
          metal,
        );
        sphere.position.y = 1;
        site.add(sphere);
        const viewport = new THREE.Mesh(
          new THREE.SphereGeometry(0.85, 20, 14),
          new THREE.MeshPhysicalMaterial({
            color: 0x1e7482,
            metalness: 0.6,
            roughness: 0.16,
            emissive: 0x14566c,
            emissiveIntensity: 0.4,
          }),
        );
        viewport.position.set(0, 1, 1.97);
        viewport.scale.z = 0.34;
        site.add(viewport);
        for (const x of [-3.2, 3.2])
          for (const z of [-3.2, 3.2]) {
            const leg = new THREE.Mesh(
              new THREE.CylinderGeometry(0.09, 0.12, 8, 8),
              darkMetal,
            );
            leg.position.set(x, -0.5, z);
            leg.rotation.z = x * 0.025;
            site.add(leg);
          }
        for (const y of [-3, 4]) {
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(6.5, 0.15, 6.5),
            darkMetal,
          );
          bar.position.y = y;
          site.add(bar);
        }
        for (let i = 0; i < 3; i++) {
          const module = new THREE.Mesh(
            new THREE.CylinderGeometry(0.38, 0.38, 2, 12),
            metal,
          );
          module.position.set(-2.7 + i * 0.65, 1, -2.4);
          site.add(module);
        }
        const antenna = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.06, 7, 6),
          metal,
        );
        antenna.position.y = 7;
        site.add(antenna);
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 10, 8),
          glow,
        );
        beacon.position.y = 10.5;
        site.add(beacon);
        const cable = new THREE.CatmullRomCurve3([
          new THREE.Vector3(1, -3, -2),
          new THREE.Vector3(8, -6, -7),
          new THREE.Vector3(13, -5, -20),
          new THREE.Vector3(25, -8, -35),
        ]);
        site.add(
          new THREE.Mesh(
            new THREE.TubeGeometry(cable, 30, 0.045, 5, false),
            darkMetal,
          ),
        );
      } else if (landmark.type === "whalefall") {
        for (let j = 0; j < 26; j++) {
          const vertebra = new THREE.Mesh(
            new THREE.SphereGeometry(0.36 - j * 0.007, 8, 6),
            bone,
          );
          vertebra.scale.set(1, 0.8, 1.2);
          vertebra.position.set(Math.sin(j * 0.14) * 0.4, -1, j * 0.55 - 7);
          site.add(vertebra);
          if (j > 4 && j < 19)
            for (const side of [-1, 1]) {
              const size = 2.8 * Math.sin(((j - 2) / 20) * Math.PI);
              const curve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(0, -1, j * 0.55 - 7),
                new THREE.Vector3(side * size, -0.6, j * 0.55 - 7.1),
                new THREE.Vector3(side * size * 1.18, 1.1, j * 0.55 - 7.2),
                new THREE.Vector3(side * size * 0.8, 1.8, j * 0.55 - 7.3),
              ]);
              site.add(
                new THREE.Mesh(
                  new THREE.TubeGeometry(curve, 12, 0.09, 6, false),
                  bone,
                ),
              );
            }
        }
        const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), bone);
        skull.scale.set(1.4, 0.7, 2.7);
        skull.position.set(0, -1, -9.4);
        site.add(skull);
        for (const side of [-1, 1]) {
          const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.3, 6, 7), bone);
          jaw.rotation.x = Math.PI / 2;
          jaw.rotation.z = side * 0.12;
          jaw.position.set(side * 0.85, -1.5, -11.6);
          site.add(jaw);
        }
      } else {
        const isGate = landmark.type === "gate",
          radius = isGate ? 21 : 11;
        const stone = new THREE.MeshStandardMaterial({
          color: 0x4b5861,
          roughness: 0.77,
          metalness: 0.16,
        });
        for (let i = 0; i < 3; i++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(
              radius - i * 2.1,
              i === 0 ? 0.8 : 0.12,
              10,
              120,
            ),
            i === 0 ? stone : glow,
          );
          ring.position.y = radius * 0.4;
          ring.rotation.y = i * 0.09;
          site.add(ring);
        }
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2,
            block = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.9), stone);
          block.position.set(
            Math.cos(a) * radius,
            Math.sin(a) * radius + radius * 0.4,
            0,
          );
          block.rotation.z = a;
          site.add(block);
          const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), glow);
          rune.position.copy(block.position);
          rune.position.z = 0.65;
          site.add(rune);
        }
        const serpentPath = [];
        for (let i = 0; i < 100; i++) {
          const a = (i / 99) * Math.PI * 2.3;
          serpentPath.push(
            new THREE.Vector3(
              Math.cos(a) * (radius + 3),
              Math.sin(a) * (radius + 3) + radius * 0.4,
              Math.sin(a * 2) * 2 - 2,
            ),
          );
        }
        site.add(
          new THREE.Mesh(
            new THREE.TubeGeometry(
              new THREE.CatmullRomCurve3(serpentPath),
              140,
              0.7,
              10,
              false,
            ),
            stone,
          ),
        );
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(1.25, 16, 10),
          stone,
        );
        head.position.copy(serpentPath.at(-1));
        head.scale.set(1, 0.7, 1.7);
        site.add(head);
        const plinth = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 0.7, radius * 0.85, 2, 16),
          stone,
        );
        plinth.position.y = -radius * 0.7;
        site.add(plinth);
        const light = new THREE.PointLight(
          isGate ? 0xa28ef4 : 0x6adecd,
          50,
          100,
          1.4,
        );
        light.position.set(0, radius * 0.4, 4);
        site.add(light);
        if (isGate) {
          const portal = new THREE.Mesh(
            new THREE.CircleGeometry(radius - 5, 100),
            new THREE.ShaderMaterial({
              side: THREE.DoubleSide,
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              uniforms: { time: this.clock },
              vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
              fragmentShader: `uniform float time;varying vec2 vUv;void main(){vec2 p=vUv-.5;float r=length(p)*2.,a=atan(p.y,p.x);float lines=pow(abs(sin(a*8.+r*18.-time*.3)),18.)*.25;float swirl=sin(r*35.-time*.5+a*3.)*.05;float alpha=(lines+swirl+.025)*smoothstep(1.,.4,r);gl_FragColor=vec4(.25,.55,.8,max(0.,alpha));}`,
            }),
          );
          portal.position.y = radius * 0.4;
          site.add(portal);
        }
      }
    }
  }

  makeDepthLevels() {
    const landmark = (id) =>
      this.landmarks.find((site) => site.id === id).position;
    this.levelEntries = [
      new THREE.Vector3(0, -18, 0),
      landmark("research")
        .clone()
        .add(new THREE.Vector3(1, 5, 26)),
      new THREE.Vector3(0, -2400, -1435),
      landmark("whalefall")
        .clone()
        .add(new THREE.Vector3(0, 7, 23)),
      new THREE.Vector3(-2, -6535, -3460),
      landmark("naga")
        .clone()
        .add(new THREE.Vector3(0, 3, 23)),
      landmark("gate")
        .clone()
        .add(new THREE.Vector3(0, 1, 24)),
    ];
    this.habitats = describeHabitats(this.levelEntries, (x, z) =>
      this.getFloorHeight(x, z),
    );
    for (const habitat of this.habitats)
      this.shelves.push({
        x: habitat.position.x,
        z: habitat.position.z,
        floor: habitat.position.y,
        inner: 15,
        radius: 24,
      });
    // Shallow terrain predates the authored shelves; refresh its actual mesh.
    const shallowTerrain = this.shallowColliders[0].geometry;
    const vertices = shallowTerrain.attributes.position;
    for (let i = 0; i < vertices.count; i++)
      vertices.setY(i, this.getFloorHeight(vertices.getX(i), vertices.getZ(i)));
    vertices.needsUpdate = true;
    shallowTerrain.computeVertexNormals();
    this.habitatCells = new Map();
    this.perception = "natural";
    this.levelCurrents = this.levelEntries.slice(0, 6).map((entry, level) => {
      const z = level === 0 ? -48 : entry.z - (level === 2 ? 16 : 26),
        x = entry.x;
      const position = new THREE.Vector3(x, this.getFloorHeight(x, z) + 8, z);
      const mesh = new THREE.Group();
      mesh.position.copy(position);
      const material = new THREE.MeshBasicMaterial({
        color: DEPTH_LEVELS[level + 1].palette.accent,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      });
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(3.2 - i * 0.15, 0.026, 5, 64),
          material,
        );
        ring.position.z = -i * 1.5;
        mesh.add(ring);
      }
      const particles = new THREE.BufferGeometry(),
        data = [];
      for (let i = 0; i < 40; i++) {
        const a = i * 2.4;
        data.push(Math.cos(a) * 2.8, Math.sin(a) * 2.8, -i * 0.15);
      }
      particles.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(data, 3),
      );
      mesh.add(
        new THREE.Points(
          particles,
          new THREE.PointsMaterial({
            color: DEPTH_LEVELS[level + 1].palette.accent,
            size: 0.095,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
          }),
        ),
      );
      mesh.visible = false;
      this.group.add(mesh);
      return {
        level,
        nextLevel: level + 1,
        position,
        name: `Current to ${DEPTH_LEVELS[level + 1].name}`,
        destination: this.levelEntries[level + 1].clone(),
        mesh,
      };
    });
  }

  setPerception(mode) {
    this.perception = mode === "spectral" ? "spectral" : "natural";
    for (const group of this.habitatCells.values()) this.applyPerception(group);
  }

  applyPerception(group) {
    group.traverse((object) => {
      const material = object.material;
      if (material?.userData.spectral)
        material.emissiveIntensity =
          this.perception === "spectral" ? 1.45 : 0.55;
      if (material?.userData.thermal)
        material.emissiveIntensity =
          this.perception === "spectral"
            ? 2
            : (material.userData.naturalIntensity ?? 0.025);
    });
  }

  updateHabitats(position, time) {
    for (const habitat of this.habitats) {
      const distance = position.distanceTo(habitat.position);
      if (distance < 210 && !this.habitatCells.has(habitat.id)) {
        const group = buildHabitat(habitat, this);
        this.applyPerception(group);
        this.group.add(group);
        this.habitatCells.set(habitat.id, group);
      } else if (distance > 260 && this.habitatCells.has(habitat.id)) {
        disposeHabitat(this.habitatCells.get(habitat.id));
        this.habitatCells.delete(habitat.id);
      }
    }
    for (const group of this.habitatCells.values())
      for (const animation of group.userData.animated)
        animation.mesh.scale.x = animation.mesh.scale.z =
          1 + Math.sin(time * 1.4 + animation.phase) * 0.07;
    for (const current of this.levelCurrents) {
      current.mesh.visible =
        position.distanceToSquared(current.position) < 180 * 180;
      current.mesh.rotation.z = Math.sin(time * 0.25) * 0.06;
      current.mesh.children[0].material.opacity =
        0.36 + Math.sin(time * 1.5) * 0.12;
    }
  }

  makeDeepCell(cx, cz, level) {
    const key = `${cx}:${cz}:${level}`,
      group = new THREE.Group(),
      rng = randomGenerator(this.seed + cx * 7789 + cz * 437 + level * 9137);
    group.userData.colliders = [];
    group.userData.obstacles = [];
    const centerX = cx * 160,
      centerZ = cz * 160,
      base = -level * 140 - 65;
    const geometry = new THREE.PlaneGeometry(160, 160, 25, 25);
    geometry.rotateX(-Math.PI / 2);
    const p = geometry.attributes.position;
    const localFloor = (x, z) => this.getFloorHeight(x, z);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + centerX,
        z = p.getZ(i) + centerZ;
      p.setXYZ(i, x, localFloor(x, z), z);
    }
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(geometry, this.deepRock);
    terrain.userData.baseOceanTerrain = true;
    terrain.userData.tileCenter = new THREE.Vector2(centerX, centerZ);
    terrain.visible = !terrainContains(
      this.expedition?.record?.mountains ? this.expedition.space : null,
      centerX,
      centerZ,
      160,
    );
    group.add(terrain);
    group.userData.colliders.push(terrain);
    const stones = new THREE.InstancedMesh(
      this.rockGeometry,
      this.deepRock,
      36,
    );
    let rockCount = 0;
    for (let i = 0; i < 36; i++) {
      const x = centerX + (rng() - 0.5) * 150,
        z = centerZ + (rng() - 0.5) * 150,
        y = localFloor(x, z),
        s = 2 + rng() * 7;
      const protectedRoute =
        terrainContains(this.expedition?.space, x, z) ||
        (this.expedition?.space &&
          Math.hypot(
            x - this.expedition.space.position.x,
            z -
              this.expedition.space.position.z +
              (this.expedition.space.terraced ? 120 : 25),
          ) <
            (this.expedition.space.terraced ? 220 : 110) + s) ||
        Math.abs(x) < 12 + s ||
        this.habitats.some(
          (habitat) =>
            Math.hypot(x - habitat.position.x, z - habitat.position.z) < 24 + s,
        ) ||
        this.landmarks.some(
          (site) =>
            Math.hypot(x - site.position.x, z - site.position.z) <
            (site.id === "gate" ? 35 : 22) + s,
        );
      if (protectedRoute) continue;
      tmp.position.set(x, y - s * 0.2, z);
      tmp.rotation.set(rng(), rng() * 6, rng());
      tmp.scale.set(s, s * (0.5 + rng() * 0.9), s);
      tmp.updateMatrix();
      stones.setMatrixAt(rockCount++, tmp.matrix);
      group.userData.obstacles.push({
        position: tmp.position.clone(),
        radius: s * 1.1,
      });
    }
    stones.count = rockCount;
    stones.instanceMatrix.needsUpdate = true;
    group.add(stones);
    group.userData.colliders.push(stones);
    if (level * 140 > 3800 && Math.abs(cx + cz) % 3 === 0)
      this.decorateDeep(
        group,
        centerX,
        localFloor(centerX, centerZ),
        centerZ,
        rng,
        level,
        localFloor,
      );
    this.group.add(group);
    this.cells.set(key, group);
    return key;
  }

  updateTerrainVisibility() {
    const space = this.expedition?.record?.mountains
      ? this.expedition.space
      : null;
    const mountainMaterial = this.expedition?.record?.mountains?.material;
    if (mountainMaterial)
      mountainMaterial.emissiveIntensity =
        this.perception === "spectral"
          ? 0.25 + (this.uvStrength ?? 0.65) * 0.75
          : 0.15;
    const shallow = this.shallowColliders[0];
    if (shallow?.userData.baseOceanTerrain) shallow.visible = !space;
    for (const cell of this.cells.values())
      for (const mesh of cell.userData.colliders) {
        if (!mesh.userData.baseOceanTerrain) continue;
        const p = mesh.userData.tileCenter;
        mesh.visible = !terrainContains(space, p.x, p.y, 160);
      }
  }
  collisionSurfaces() {
    const surfaces = this.shallow.visible ? [...this.shallowColliders] : [];
    for (const cell of this.cells.values())
      surfaces.push(...cell.userData.colliders);
    for (const habitat of this.habitatCells.values())
      surfaces.push(...habitat.userData.colliders);
    surfaces.push(...(this.expedition?.colliders || []));
    const active = surfaces.filter(
      (s) => !s.userData.baseOceanTerrain || s.visible,
    );
    for (const surface of active) surface.updateWorldMatrix(true, false);
    return active;
  }

  findAnchor(position, direction, maxDistance = 5) {
    if (direction.lengthSq() < 1e-8) return null;
    this.raycaster.set(
      position,
      this.collisionDirection.copy(direction).normalize(),
    );
    this.raycaster.near = 0.025;
    this.raycaster.far = maxDistance;
    const hit = this.raycaster.intersectObjects(
      this.collisionSurfaces(),
      false,
    )[0];
    if (!hit) return null;
    const normal = hit.face.normal.clone(),
      matrix = hit.object.matrixWorld.clone();
    if (hit.instanceId !== undefined) {
      const instance = new THREE.Matrix4();
      hit.object.getMatrixAt(hit.instanceId, instance);
      matrix.multiply(instance);
    }
    normal.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix));
    return {
      point: hit.point,
      normal,
      distance: hit.distance,
      object: hit.object,
      instanceId: hit.instanceId,
    };
  }

  avoidCamera(targetPosition, desiredPosition, clearance = 0.7) {
    const direction = this.collisionDirection.subVectors(
        desiredPosition,
        targetPosition,
      ),
      distance = direction.length();
    if (distance < 0.05) return desiredPosition;
    direction.multiplyScalar(1 / distance);
    this.raycaster.set(targetPosition, direction);
    this.raycaster.near = 0.08;
    this.raycaster.far = distance + clearance;
    const surfaces = this.collisionSurfaces(),
      hit = this.raycaster.intersectObjects(surfaces, false)[0];
    if (hit)
      desiredPosition
        .copy(targetPosition)
        .addScaledVector(
          direction,
          Math.max(0.12, Math.min(distance, hit.distance - clearance)),
        );
    // The analytic height catches grazing intersections and sub-grid terrain
    // between mesh samples without raising the camera across a steep canyon.
    const correctedDistance = desiredPosition.distanceTo(targetPosition),
      sample = new THREE.Vector3();
    for (let i = 1; i <= 12; i++) {
      sample
        .copy(targetPosition)
        .addScaledVector(direction, (correctedDistance * i) / 12);
      if (sample.y < this.getFloorHeight(sample.x, sample.z) + clearance) {
        desiredPosition
          .copy(targetPosition)
          .addScaledVector(
            direction,
            Math.max(0.12, (correctedDistance * (i - 1)) / 12),
          );
        break;
      }
    }
    return desiredPosition;
  }

  decorateDeep(group, x, y, z, rng, level, floor) {
    const depth = level * 140;
    const glow = new THREE.MeshStandardMaterial({
      color: depth > 8000 ? 0x715e73 : 0x547581,
      emissive: depth > 8000 ? 0x673487 : 0x1f5864,
      emissiveIntensity: 0.5,
      roughness: 0.65,
    });
    if (depth > 8000) {
      const ruin = new THREE.Group();
      ruin.position.set(x, y + 4, z - 20);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2,
          pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1.45, 10 + rng() * 10, 6),
            this.deepRock,
          );
        pillar.position.set(Math.cos(a) * 17, 3, Math.sin(a) * 17);
        pillar.rotation.z = (rng() - 0.5) * 0.14;
        ruin.add(pillar);
        const crown = new THREE.Mesh(
          new THREE.TorusGeometry(1.2, 0.1, 5, 20),
          glow,
        );
        crown.rotation.x = Math.PI / 2;
        crown.position.copy(pillar.position);
        crown.position.y += 5;
        ruin.add(crown);
      }
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(depth > 10500 ? 15 : 8, 0.55, 8, 90),
        glow,
      );
      ring.position.y = 7;
      ruin.add(ring);
      const inner = new THREE.Mesh(
        new THREE.TorusGeometry(depth > 10500 ? 12 : 6, 0.12, 5, 90),
        glow,
      );
      inner.position.y = 7;
      inner.rotation.y = 0.15;
      ruin.add(inner);
      group.add(ruin);
    }
    for (let i = 0; i < 7; i++) {
      const px = x + (rng() - 0.5) * 110,
        pz = z + (rng() - 0.5) * 110,
        height = 3 + rng() * 10,
        py = floor(px, pz);
      const vent = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 1.3, height, 7, 5),
        this.deepRock,
      );
      vent.position.set(px, py + height / 2, pz);
      group.add(vent);
      const lip = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.1, 5, 12),
        glow,
      );
      lip.rotation.x = Math.PI / 2;
      lip.position.set(px, py + height, pz);
      group.add(lip);
      if (i < 2) {
        const light = new THREE.PointLight(
          depth > 10500 ? 0xeb552a : 0x397cac,
          depth > 10500 ? 22 : 10,
          45,
          1.3,
        );
        light.position.set(px, py + height + 1, pz);
        group.add(light);
      }
    }
    const wormGeo = new THREE.CylinderGeometry(0.045, 0.075, 1.6, 5);
    wormGeo.translate(0, 0.8, 0);
    const worms = new THREE.InstancedMesh(wormGeo, glow, 130);
    for (let i = 0; i < 130; i++) {
      const px = x + (rng() - 0.5) * 75,
        pz = z + (rng() - 0.5) * 75;
      tmp.position.set(px, floor(px, pz), pz);
      tmp.rotation.set(rng() * 0.4, 0, rng() * 0.4);
      tmp.scale.setScalar(0.5 + rng());
      tmp.updateMatrix();
      worms.setMatrixAt(i, tmp.matrix);
    }
    group.add(worms);
    if (depth > 10500) {
      const lava = new THREE.Mesh(
        new THREE.PlaneGeometry(65, 2),
        new THREE.MeshBasicMaterial({
          color: 0xe35324,
          transparent: true,
          opacity: 0.65,
        }),
      );
      lava.rotation.x = -Math.PI / 2;
      lava.rotation.z = 0.4;
      lava.position.set(x, y + 0.1, z);
      group.add(lava);
    } else {
      const brine = new THREE.Mesh(
        new THREE.CircleGeometry(14, 48),
        new THREE.MeshStandardMaterial({
          color: 0x497680,
          metalness: 0.8,
          roughness: 0.15,
          transparent: true,
          opacity: 0.7,
        }),
      );
      brine.rotation.x = -Math.PI / 2;
      brine.position.set(x + 20, y + 0.12, z + 10);
      group.add(brine);
    }
  }

  getCurrent(position, time, target = new THREE.Vector3()) {
    const depth = Math.max(0, -position.y),
      inCanyon =
        Math.max(0, 1 - Math.abs(position.x) / 35) *
        THREE.MathUtils.smoothstep(-position.z, 55, 110);
    target
      .set(
        Math.sin(position.z * 0.019 + time * 0.12) * 0.22,
        Math.sin(position.x * 0.015 + time * 0.1) * 0.09 - inCanyon * 0.11,
        Math.cos(position.x * 0.02 + time * 0.08) * 0.15 - inCanyon * 0.25,
      )
      .multiplyScalar(depth > 500 ? 1.6 : 1);
    return this.expedition?.currentForce(position, time, target) || target;
  }

  resolveCollision(position, radius = 0.5) {
    const naturalFloor = this.getFloorHeight(position.x, position.z);
    if (position.y > naturalFloor - 10)
      position.y = Math.max(position.y, naturalFloor + radius);
    position.y = Math.min(1.2, Math.max(-11000, position.y));
    const obstacles =
      position.y > -180
        ? this.obstacles
        : [...this.cells.values()].flatMap((cell) => cell.userData.obstacles);
    const habitatObstacles = [...this.habitatCells.values()].flatMap(
      (group) => group.userData.obstacles,
    );
    for (const o of [...obstacles, ...habitatObstacles]) {
      const distance = position.distanceTo(o.position),
        r = o.radius + radius;
      if (distance < r) {
        if (distance > 0.001)
          position.addScaledVector(
            new THREE.Vector3().subVectors(position, o.position),
            (r - distance) / distance,
          );
        else position.y += r;
      }
    }
    position.y = Math.max(
      position.y,
      this.getFloorHeight(position.x, position.z) + radius,
    );
    this.expedition?.resolveCollision(position, radius);
    return position;
  }

  update(dt, time, position, camera) {
    this.updateTerrainVisibility();
    this.clock.value = time;
    this.depth = Math.max(0, -position.y);
    const next = depthLevelAt(this.depth),
      optics = lightingAtDepth(this.depth);
    this.biome = next;
    const blend = 1 - Math.exp(-dt * 1.5),
      color = new THREE.Color().setRGB(...optics.water, THREE.SRGBColorSpace);
    this.scene.background.lerp(color, blend);
    this.scene.fog.color.copy(this.scene.background);
    this.scene.fog.density = THREE.MathUtils.lerp(
      this.scene.fog.density,
      optics.fog *
        (this.perception === "spectral"
          ? 0.7 - (this.uvStrength ?? 0.65) * 0.35
          : 1),
      blend,
    );
    this.surface.material.uniforms.waterFog.value.copy(this.scene.fog.color);
    this.atmosphere.position.copy(camera?.position || position);
    this.atmosphere.material.uniforms.waterFog.value.copy(this.scene.fog.color);
    const sunlight = optics.sunlight;
    this.hemi.color.set(this.depth > 180 ? 0x88a1ca : 0xb8e9d3);
    this.hemi.intensity = THREE.MathUtils.lerp(
      this.hemi.intensity,
      optics.ambient,
      blend,
    );
    this.sun.intensity = THREE.MathUtils.lerp(
      this.sun.intensity,
      3.5 * sunlight,
      blend,
    );
    this.fill.intensity = THREE.MathUtils.lerp(
      this.fill.intensity,
      optics.fill,
      blend,
    );
    this.divelight.position.copy(position).add(new THREE.Vector3(0, 2, 1));
    this.divelight.intensity = THREE.MathUtils.lerp(
      this.divelight.intensity,
      optics.diveLight,
      blend,
    );
    this.shallow.visible = this.depth <= 180;
    this.surface.visible = this.depth < 250;
    this.rays.visible = this.depth < 160;
    for (const site of this.authoredSites)
      site.visible = site.position.distanceToSquared(position) < 850 * 850;
    this.snow.update(position, this.depth);
    this.updateHabitats(position, time);
    this.memoryShell.rotation.y = time * 0.16;
    this.memoryShell.position.y = 1.4 + Math.sin(time * 0.7) * 0.1;
    if (this.depth > 180) {
      const cx = Math.round(position.x / 160),
        cz = Math.round(position.z / 160),
        level = Math.floor(this.depth / 140);
      const active = new Set();
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cx + dx}:${cz + dz}:${level}`;
          active.add(key);
          if (!this.cells.has(key)) this.makeDeepCell(cx + dx, cz + dz, level);
        }
      for (const [key, g] of this.cells)
        if (!active.has(key)) {
          this.disposeCell(g);
          this.cells.delete(key);
        }
    } else if (this.cells.size) {
      for (const g of this.cells.values()) this.disposeCell(g);
      this.cells.clear();
    }
  }

  setQuality(quality) {
    this.quality = quality;
    this.snow.setQuality(quality);
    this.grass.count =
      quality === "low" ? 1000 : quality === "medium" ? 2200 : 3400;
    for (const kelp of this.kelpMeshes)
      kelp.count = quality === "low" ? 16 : quality === "medium" ? 22 : 28;
    this.rays.children.forEach(
      (ray, i) => (ray.visible = quality !== "low" || i < 7),
    );
  }
  disposeCell(group) {
    group.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry !== this.rockGeometry) o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials)
          if (m !== this.deepRock && m !== this.rock && m !== this.sand)
            m.dispose();
      }
    });
    group.removeFromParent();
  }
  dispose() {
    this.snow.dispose();
    for (const habitat of this.habitatCells.values()) disposeHabitat(habitat);
    this.habitatCells.clear();
    const geo = new Set(),
      mat = new Set();
    this.group.traverse((o) => {
      if (o.geometry) geo.add(o.geometry);
      if (o.material)
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          mat.add(m),
        );
    });
    geo.forEach((g) => g.dispose());
    mat.forEach((m) => m.dispose());
    this.group.removeFromParent();
    this.cells.clear();
  }
}
