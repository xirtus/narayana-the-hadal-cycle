import * as THREE from "three";
import { makeFishGeometry, FISH_MATERIAL } from "./CreatureModels.js";
import { SPECIES_BY_ID } from "./species.js";
import { scorePrey } from "./PreySelection.js";

const dummy = new THREE.Object3D(),
  forward = new THREE.Vector3(0, 0, -1),
  toward = new THREE.Vector3();

export function configureFishMaterial(
  material,
  clock,
  { deep = false, held = false } = {},
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.ecologyTime = clock;
    shader.vertexShader = "uniform float ecologyTime;\n" + shader.vertexShader;
    const movement = held
      ? "sin(ecologyTime * 18.0 - position.z * 9.0) * tail * 0.11"
      : "sin(ecologyTime * 8.0 - position.z * 9.0 + instanceMatrix[3].x * 1.7) * tail * 0.065";
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\nfloat tail = smoothstep(-0.22, 0.58, position.z); transformed.x += ${movement};`,
    );
    if (deep) {
      shader.vertexShader =
        "attribute float preyLight; varying float vPreyLight;\n" +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvPreyLight = preyLight;",
      );
      shader.fragmentShader =
        "varying float vPreyLight;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.12, 0.8, 1.0) * vPreyLight * 2.0;",
      );
    }
  };
  material.customProgramCacheKey = () => `ecology-fish-v2-${held}-${deep}`;
}
export class SchoolSystem {
  constructor(
    scene,
    {
      species = "sardine",
      count = 220,
      center = new THREE.Vector3(),
      random = Math.random,
      forage = false,
    } = {},
  ) {
    this.species = species;
    this.forage = forage;
    this.disposed = false;
    this.reserved = new Set();
    this.revisions = new Uint32Array(count);
    this.capacity = count;
    this.count = count;
    this.center = center.clone();
    this.origin = center.clone();
    this.random = random;
    this.phase = random() * Math.PI * 2;
    this.depthRange = SPECIES_BY_ID[species].depthRange;
    const material = FISH_MATERIAL.clone();
    this.clock = { value: 0 };
    configureFishMaterial(material, this.clock, {
      deep: species === "lanternfish" || species === "bristlemouth",
    });
    this.mesh = new THREE.InstancedMesh(
      makeFishGeometry(species),
      material,
      count,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.positions = [];
    this.velocities = [];
    this.scales = [];
    this.alive = [];
    this.fleeTime = 0;
    const tint = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2,
        r = Math.pow(random(), 0.6) * (forage ? 1.4 : 4.7);
      this.positions.push(
        center
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(a) * r,
              (random() - 0.5) * (forage ? 0.7 : 2.9),
              Math.sin(a) * r * 1.3,
            ),
          ),
      );
      this.positions[i].y = THREE.MathUtils.clamp(
        this.positions[i].y,
        -this.depthRange[1],
        -Math.max(0.8, this.depthRange[0]),
      );
      this.velocities.push(
        new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.8),
      );
      this.scales.push(
        species === "rockfish"
          ? 0.37 + random() * 0.25
          : 0.19 + random() * 0.24,
      );
      this.alive.push(true);
      tint.setHSL(
        0.47 + random() * 0.035,
        0.08 + random() * 0.13,
        0.73 + random() * 0.24,
      );
      this.mesh.setColorAt(i, tint);
    }
    this.render();
  }
  setQuality(quality) {
    this.count = Math.floor(
      this.capacity *
        (quality === "low" ? 0.38 : quality === "medium" ? 0.65 : 1),
    );
    this.mesh.count = this.count;
  }
  update(
    dt,
    time,
    player,
    { camouflage = false, jet = 0, ink = false } = {},
    predators = [],
  ) {
    this.clock.value = time;
    this.center
      .copy(this.origin)
      .add(
        toward.set(
          Math.sin(time * 0.047 + this.phase) * (this.forage ? 1.2 : 6),
          Math.sin(time * 0.073 + this.phase) * 1.25,
          Math.cos(time * 0.04 + this.phase) * (this.forage ? 1 : 5),
        ),
      );
    const danger = !camouflage && (jet > 0.6 || ink),
      fleeR = camouflage ? 0.65 : danger ? 8 : 1.45;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const p = this.positions[i],
        v = this.velocities[i];
      let ax = 0,
        ay = 0,
        az = 0,
        n = 0,
        vx = 0,
        vy = 0,
        vz = 0,
        cx = 0,
        cy = 0,
        cz = 0;
      // Deterministic rotating neighbor samples approximate local cohesion without N² cost.
      for (let j = 1; j <= 7; j++) {
        const other = (i + j * 13 + Math.floor(time * 3)) % this.count;
        if (!this.alive[other]) continue;
        const q = this.positions[other],
          d2 = p.distanceToSquared(q);
        if (d2 > 20) continue;
        n++;
        cx += q.x;
        cy += q.y;
        cz += q.z;
        vx += this.velocities[other].x;
        vy += this.velocities[other].y;
        vz += this.velocities[other].z;
        if (d2 < 0.42) {
          const f = 0.4 / (d2 + 0.03);
          ax += (p.x - q.x) * f;
          ay += (p.y - q.y) * f;
          az += (p.z - q.z) * f;
        }
      }
      if (n) {
        ax += (cx / n - p.x) * 0.065 + (vx / n - v.x) * 0.3;
        ay += (cy / n - p.y) * 0.09 + (vy / n - v.y) * 0.3;
        az += (cz / n - p.z) * 0.065 + (vz / n - v.z) * 0.3;
      }
      const dx = this.center.x - p.x,
        dz = this.center.z - p.z;
      ax += dx * 0.12 - dz * 0.085;
      az += dz * 0.12 + dx * 0.085;
      ay += (this.center.y - p.y) * 0.35;
      let fleeing = false;
      for (let k = -1; k < predators.length; k++) {
        const q = k < 0 ? player : predators[k].position,
          r = k < 0 ? fleeR : 5.5,
          d2 = p.distanceToSquared(q);
        if (d2 < r * r) {
          const factor = (1 - Math.sqrt(d2) / r) * (k < 0 ? 7 : 5);
          ax += (p.x - q.x) * factor;
          ay += (p.y - q.y) * factor;
          az += (p.z - q.z) * factor;
          fleeing = true;
        }
      }
      v.x += ax * dt;
      v.y += ay * dt;
      v.z += az * dt;
      const len = v.length(),
        max = fleeing ? 3.4 : this.species === "rockfish" ? 0.65 : 1.55;
      if (len > max) v.multiplyScalar(max / len);
      else if (len < 0.35) v.multiplyScalar(0.35 / Math.max(0.001, len));
      p.addScaledVector(v, dt);
      p.y = THREE.MathUtils.clamp(
        p.y,
        -this.depthRange[1],
        -Math.max(0.8, this.depthRange[0]),
      );
    }
    this.render();
  }
  render() {
    for (let i = 0; i < this.count; i++) {
      dummy.position.copy(this.positions[i]);
      toward.copy(this.velocities[i]).normalize();
      if (toward.lengthSq() > 0.1)
        dummy.quaternion.setFromUnitVectors(forward, toward);
      dummy.scale.setScalar(this.alive[i] ? this.scales[i] : 0);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  getHuntCandidates(position, direction, options = {}) {
    if (this.disposed) return [];
    const candidates = [];
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.reserved.has(i)) continue;
      const score = scorePrey(this.positions[i], position, direction, options);
      if (!score) continue;
      candidates.push({
        id: `${this.mesh.uuid}:${i}`,
        name: SPECIES_BY_ID[this.species].name,
        species: this.species,
        kind: "fish",
        position: this.positions[i],
        radius: this.scales[i] * 0.55,
        energy: this.species === "rockfish" ? 22 : 14,
        source: this,
        index: i,
        revision: this.revisions[i],
        ...score,
      });
    }
    return candidates;
  }
  hunt(position, direction, radius = 5) {
    let index = -1,
      nearest = radius * radius;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const dist = this.positions[i].distanceToSquared(position);
      if (dist >= nearest) continue;
      toward.subVectors(this.positions[i], position).normalize();
      if (direction && toward.dot(direction) < 0.15) continue;
      nearest = dist;
      index = i;
    }
    if (index < 0) return null;
    this.alive[index] = false;
    this.revisions[index]++;
    return {
      success: true,
      energy: this.species === "rockfish" ? 22 : 14,
      species: this.species,
      position: this.positions[index].clone(),
    };
  }
  discover(position, radius) {
    return this.positions.some(
      (p, i) =>
        i < this.count &&
        this.alive[i] &&
        p.distanceToSquared(position) < radius * radius,
    )
      ? this.species
      : null;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.reserved.clear();
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
