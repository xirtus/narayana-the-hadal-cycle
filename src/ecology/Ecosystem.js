import * as THREE from "three";
import { SPECIES_BY_ID } from "./species.js";
import { SchoolSystem, configureFishMaterial } from "./SchoolSystem.js";
import { scorePrey } from "./PreySelection.js";
import {
  makePinniped,
  makeOtter,
  makeShark,
  makeRay,
  makeWhale,
  makeDeepCreature,
  animateCreature,
} from "./CreatureModels.js";

function seeded(seed) {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const vec = new THREE.Vector3(),
  target = new THREE.Vector3(),
  direction = new THREE.Vector3(),
  forward = new THREE.Vector3(0, 0, -1),
  quat = new THREE.Quaternion();
const rideable = new Set([
  "seal",
  "sea-lion",
  "leopard-shark",
  "bat-ray",
  "humpback",
  "sperm-whale",
  "naga",
  "shesha",
]);
const benthic = new Set(["sea-pig", "tripod", "glass-sponge", "amphipod"]);
const predators = new Set(["seal", "sea-lion", "leopard-shark", "anglerfish"]);
const edible = new Set([
  "amphipod",
  "abyssal-amphipod",
  "snailfish",
  "anglerfish",
  "barreleye",
  "tripod",
]);

export class Ecosystem {
  constructor(scene, { seed = 41, quality = "high" } = {}) {
    this.scene = scene;
    this.seed = seed;
    this.random = seeded(seed);
    this.quality = quality;
    this.animals = [];
    this.schools = [];
    this.heldPrey = new Map();
    this.serial = 0;
    this.region = null;
    this.origin = new THREE.Vector3(0, -12, 0);
    this.playerPosition = this.origin.clone();
    this.time = 0;
    this.inkUntil = 0;
    this.threat = 0;
    this.nearestPredator = null;
    this._floorHeight = null;
    this.stream(this.origin);
  }
  setSeafloor(fn) {
    this._floorHeight = fn;
  }
  get threatLevel() {
    return this.threat;
  }
  regionAt(depth) {
    return depth < 200
      ? "forest"
      : depth < 600
        ? "twilight"
        : depth < 1000
          ? "oxygen-minimum"
          : depth < 2200
            ? "midnight"
            : depth < 4000
              ? "bathyal"
              : depth < 6000
                ? "abyssal"
                : depth < 8000
                  ? "hadal"
                  : depth < 10500
                    ? "mythic"
                    : "cosmic";
  }
  add(species, position, options = {}) {
    const habitat = SPECIES_BY_ID[species]?.depthRange;
    if (!habitat) throw new Error(`Unknown ecological species: ${species}`);
    if (
      benthic.has(species) &&
      options.benthic !== false &&
      this._floorHeight
    ) {
      const floor = this._floorHeight(position.x, position.z);
      if (Number.isFinite(floor))
        position.y = floor + (species === "tripod" ? 0.9 : 0.12);
    }
    if (-position.y < habitat[0] || -position.y > habitat[1]) return null;
    let group;
    if (species === "seal" || species === "sea-lion")
      group = makePinniped(species);
    else if (species === "otter") group = makeOtter();
    else if (species === "leopard-shark") group = makeShark();
    else if (species === "bat-ray") group = makeRay();
    else if (species === "humpback") group = makeWhale();
    else
      group = makeDeepCreature(
        species === "abyssal-amphipod" ? "amphipod" : species,
      );
    group.position.copy(position);
    group.rotation.y = this.random() * Math.PI * 2;
    group.name = SPECIES_BY_ID[species]?.name || species;
    this.scene.add(group);
    const animal = {
      id: `${species}-${this.serial++}`,
      species,
      name: group.name,
      group,
      position: group.position,
      home: position.clone(),
      phase: this.random() * Math.PI * 2,
      speed: 0.4 + this.random() * 0.7,
      velocity: new THREE.Vector3(),
      rideable: rideable.has(species),
      predator: predators.has(species),
      benthic: benthic.has(species),
      behavior: "foraging",
      threat: 0,
      health: 1,
      reserved: false,
      revision: 0,
      ...options,
    };
    // Existing fish models are authored at display scale; small prey retain a
    // believable size beside the squid, and mammals are never eligible prey.
    if (edible.has(species))
      group.scale.setScalar(species.includes("amphipod") ? 0.35 : 0.7);
    const size = new THREE.Box3()
      .setFromObject(group)
      .getSize(new THREE.Vector3());
    animal.bodyLength = Math.max(size.x, size.y, size.z);
    animal.radius = animal.bodyLength * 0.5;
    if (species === "otter") {
      animal.speed = 0.13;
      animal.home.y = -0.28;
      animal.position.y = -0.28;
    }
    if (species === "humpback" || species === "sperm-whale")
      animal.speed = 1.25;
    if (species === "leopard-shark") animal.speed = 0.83;
    if (
      species === "sea-nettle" ||
      species === "siphonophore" ||
      species === "dumbo" ||
      species === "vampire-squid"
    )
      animal.speed = 0.14;
    if (animal.benthic) animal.speed = 0.04;
    this.animals.push(animal);
    return animal;
  }
  school(species, count, position, options = {}) {
    const [min, max] = SPECIES_BY_ID[species].depthRange;
    if (-position.y < min || -position.y > max) return;
    const school = new SchoolSystem(this.scene, {
      species,
      count,
      center: position,
      random: this.random,
      ...options,
    });
    school.setQuality(this.quality);
    this.schools.push(school);
    return school;
  }
  stream(position) {
    this.clear();
    this.origin.copy(position);
    const depth = Math.max(0, -position.y);
    this.region = this.regionAt(depth);
    const at = (x, y, z) =>
      new THREE.Vector3(
        position.x + x,
        Math.min(-0.4, position.y + y),
        position.z + z,
      );
    if (this.region === "forest") {
      // Authored sightlines make the first descent immediately feel inhabited.
      const surface = depth < 65;
      if (surface) {
        this.add("otter", at(-3, 10, 7), { phase: 0.7 });
        this.add("otter", at(-4.5, 10, 8), { phase: 1.1 });
        this.add("seal", at(6, 4, 7), { phase: 1.4 });
        this.add("seal", at(-9, 2, -16), { phase: 3.2 });
        this.add("sea-lion", at(12, 6, -22), { phase: 2.8 });
        this.add("leopard-shark", at(-6, -5, -15), { phase: 2.1 });
        this.add("bat-ray", at(8, -7, 8), { phase: 0.5 });
        this.add("bat-ray", at(-13, -9, -20), { phase: 3.7 });
        this.add("humpback", at(-22, 5, 35), { phase: 1.7 });
        this.school("rockfish", 36, at(10, -7, -10));
      } else {
        this.add("seal", at(5, 4, -17));
        this.add("humpback", at(-10, 9, -43));
      }
      this.school("sardine", 330, at(-6, 1, -12));
      this.school("anchovy", 250, at(11, 4, 12));
      this.school("sardine", 240, at(-1, -3, -39));
      for (let i = 0; i < 3; i++)
        this.add("sea-nettle", at(-12 + i * 9, -1 + i * 2, -14 - i * 8));
    } else if (this.region === "twilight") {
      this.add("oarfish", at(-6, 1, -15));
      this.add("oarfish", at(12, -5, -38));
      for (let i = 0; i < 4; i++)
        this.add(
          "anglerfish",
          at(
            (this.random() - 0.5) * 29,
            (this.random() - 0.5) * 15,
            -12 - this.random() * 30,
          ),
        );
    } else if (this.region === "oxygen-minimum") {
      this.add("siphonophore", at(-5, 5, -11));
      this.add("siphonophore", at(12, 8, -35));
      this.add("oarfish", at(8, 1, -22));
      for (let i = 0; i < 3; i++) {
        this.add("vampire-squid", at(-8 + i * 7, -2 + i * 2, -9 - i * 9));
        this.add("barreleye", at(5 - i * 7, 3 - i * 3, -11 - i * 7));
      }
      this.add("anglerfish", at(-11, -5, -31));
    } else if (this.region === "midnight" || this.region === "bathyal") {
      for (let i = 0; i < 4; i++)
        this.add("dumbo", at(-10 + i * 7, -3 + i * 2, -10 - i * 7));
      if (depth < 2000) {
        this.add("sperm-whale", at(-9, 12, -46));
        for (let i = 0; i < 3; i++)
          this.add("anglerfish", at(-8 + i * 9, -1 - i * 3, -12 - i * 6));
      }
      this.add("tripod", at(-7, -13, -13));
      this.add("sea-pig", at(4, -13, -10));
      this.add("glass-sponge", at(-4, -13, -17));
    } else if (this.region === "abyssal") {
      for (let i = 0; i < 4; i++)
        this.add("dumbo", at(-10 + i * 7, -3 + i * 2, -10 - i * 7));
      for (let i = 0; i < 9; i++)
        this.add(
          i % 3 === 0 ? "glass-sponge" : i % 3 === 1 ? "sea-pig" : "tripod",
          at((this.random() - 0.5) * 29, -14, -8 - this.random() * 35),
        );
    } else if (this.region === "hadal") {
      for (let i = 0; i < 7; i++)
        this.add(
          "snailfish",
          at(
            (this.random() - 0.5) * 23,
            -4 + this.random() * 8,
            -7 - this.random() * 28,
          ),
        );
      for (let i = 0; i < 12; i++)
        this.add(
          "amphipod",
          at((this.random() - 0.5) * 21, -12, -7 - this.random() * 22),
        );
    } else {
      this.add(this.region === "mythic" ? "naga" : "shesha", at(-5, 3, -30), {
        speed: 0.42,
      });
      for (let i = 0; i < 9; i++)
        this.add(
          "amphipod",
          at((this.random() - 0.5) * 21, -12, -7 - this.random() * 22),
        );
    }
    // Local forage patches belong to the water, not the player. Their origins
    // remain fixed until the region streams, so a missed hunt can swim away.
    if (depth < 200) {
      this.school("anchovy", 22, at(0.3, -0.1, -3.6), { forage: true });
    } else if (depth < 4000) {
      this.school(
        depth < 1500 ? "lanternfish" : "bristlemouth",
        18,
        at(0.4, -0.1, -3.8),
        { forage: true },
      );
      this.school("bristlemouth", 34, at(-8, -2, -18));
    } else {
      for (let i = 0; i < 6; i++)
        this.add(
          depth < 6000 ? "abyssal-amphipod" : "amphipod",
          at(((i % 3) - 1) * 0.7, -0.3, -3.7 - i * 0.55),
          { benthic: false, speed: 0.12, phase: i * 0.4 },
        );
    }
    this.setQuality(this.quality);
  }
  update(dt, time, playerPosition, signals = {}) {
    dt = Math.min(Math.max(dt, 0), 0.05);
    this.time = time;
    this.playerPosition.copy(playerPosition);
    const depth = Math.max(0, -playerPosition.y),
      region = this.regionAt(depth);
    if (
      region !== this.region ||
      this.origin.distanceTo(playerPosition) > 125 ||
      Math.abs(playerPosition.y - this.origin.y) > 70
    )
      this.stream(playerPosition);
    if (signals.ink) this.inkUntil = time + 5;
    for (const held of this.heldPrey.values())
      if (held.active) animateCreature(held.group, time, 4);
    this.threat = 0;
    this.nearestPredator = null;
    const hunting = this.animals.filter((a) => a.predator && !a.reserved);
    for (const school of this.schools)
      school.update(
        dt,
        time,
        playerPosition,
        { ...signals, ink: time < this.inkUntil },
        hunting,
      );
    for (const a of this.animals) {
      if (a.reserved) continue;
      const phase = time * a.speed * 0.16 + a.phase,
        distance = a.position.distanceTo(playerPosition),
        s = a.species;
      const orbit =
        s === "humpback" || s === "sperm-whale"
          ? 20
          : s === "otter"
            ? 0.5
            : a.benthic
              ? 0.1
              : 6;
      target.copy(a.home);
      target.x += Math.sin(phase) * orbit;
      target.z += Math.cos(phase * 0.83) * orbit * 0.65;
      if (s === "otter") {
        target.y = -0.26 + Math.sin(time * 0.65 + a.phase) * 0.045;
        a.behavior = "resting";
      } else if (a.benthic) {
        if (this._floorHeight) {
          const floor = this._floorHeight(target.x, target.z);
          if (Number.isFinite(floor)) {
            target.y = floor + (s === "tripod" ? 0.9 : 0.12);
            a.position.y = target.y;
          }
        }
        a.behavior = s === "glass-sponge" ? "filter feeding" : "feeding";
      } else target.y += Math.sin(phase * 1.4) * 1.25;
      if (a.predator) {
        a.behavior = "foraging";
        // Marine mammals and sharks notice strong pressure disturbances. Ink interrupts pursuit.
        const agitated =
          !signals.camouflage && signals.jet > 0.22 && distance < 13;
        if (time < (a.repelledUntil || 0)) {
          vec.subVectors(a.position, playerPosition).normalize();
          target.copy(a.position).addScaledVector(vec, 8);
          a.behavior = "startled";
        } else if (time < this.inkUntil && distance < 17) {
          vec.subVectors(a.position, playerPosition).normalize();
          target.copy(a.position).addScaledVector(vec, 9);
          a.behavior = "evading ink";
        } else if (agitated) {
          target.copy(playerPosition);
          a.behavior = "investigating";
        } else if (this.schools.length && s !== "leopard-shark") {
          const school =
            this.schools[s === "sea-lion" ? 1 : 0] || this.schools[0];
          target.lerp(school.center, 0.32);
          a.behavior = "hunting fish";
          if (time - (a.lastFed || 0) > 8) {
            const catchResult = school.hunt(
              a.position,
              a.velocity.clone().normalize(),
              0.7,
            );
            if (catchResult) a.lastFed = time;
          }
        }
        a.threat =
          !signals.camouflage &&
          time >= this.inkUntil &&
          time >= (a.repelledUntil || 0)
            ? Math.max(0, 1 - distance / 9) * (signals.jet > 0.2 ? 1 : 0.32)
            : 0;
        if (a.threat > this.threat) {
          this.threat = a.threat;
          this.nearestPredator = a;
        }
      }
      direction.subVectors(target, a.position);
      const speed =
          a.speed *
          (a.behavior === "evading ink" || a.behavior === "startled"
            ? 3
            : a.behavior === "investigating"
              ? 1.8
              : 1),
        dist = direction.length();
      if (dist > 0.08) {
        direction.multiplyScalar(1 / dist);
        a.velocity.lerp(
          vec.copy(direction).multiplyScalar(Math.min(speed, dist * 0.5)),
          1 - Math.exp(-dt * 1.6),
        );
      } else a.velocity.multiplyScalar(Math.exp(-dt * 3));
      a.position.addScaledVector(a.velocity, dt);
      a.position.y = Math.min(-0.17, a.position.y);
      const [minDepth, maxDepth] = SPECIES_BY_ID[s].depthRange;
      if (a.benthic)
        a.group.visible =
          -a.position.y >= minDepth && -a.position.y <= maxDepth;
      else
        a.position.y = THREE.MathUtils.clamp(
          a.position.y,
          -maxDepth,
          -Math.max(0.17, minDepth),
        );
      if (
        a.velocity.lengthSq() > 0.0002 &&
        s !== "sea-nettle" &&
        s !== "siphonophore" &&
        !a.benthic
      ) {
        direction.copy(a.velocity).normalize();
        quat.setFromUnitVectors(forward, direction);
        a.group.quaternion.slerp(
          quat,
          1 - Math.exp(-dt * (s === "humpback" ? 1 : 2.3)),
        );
      }
      animateCreature(
        a.group,
        time + a.phase,
        a.speed * (a.behavior === "evading ink" ? 2 : 1),
      );
      if (s === "otter") {
        a.group.rotation.x = -0.12;
        a.group.rotation.z = Math.sin(time * 0.33 + a.phase) * 0.075;
      }
      if (s === "seal")
        a.group.rotation.z += Math.sin(time * 0.9 + a.phase) * 0.0008;
      if (s === "humpback" || s === "sperm-whale")
        a.group.rotation.x += Math.sin(time * 0.7 + a.phase) * 0.0003;
    }
  }
  discover(position, radius = 30) {
    const found = new Set();
    for (const animal of this.animals)
      if (
        animal.group.visible &&
        !animal.reserved &&
        animal.position.distanceToSquared(position) <= radius * radius
      )
        found.add(animal.species);
    for (const school of this.schools) {
      const id = school.discover(position, radius);
      if (id) found.add(id);
    }
    return [...found];
  }
  hunt(position, direction) {
    const nearest = [...this.schools].sort(
      (a, b) =>
        a.center.distanceToSquared(position) -
        b.center.distanceToSquared(position),
    );
    for (const school of nearest) {
      const result = school.hunt(position, direction);
      if (result) return result;
    }
    // Large mammals and rare deep animals are observations / companions, never consumable pickups.
    const prey = this.animals.find(
      (a) =>
        !a.reserved &&
        a.species === "amphipod" &&
        a.position.distanceTo(position) < 4,
    );
    if (prey) {
      prey.group.visible = false;
      this.animals.splice(this.animals.indexOf(prey), 1);
      this.disposeAnimal(prey);
      return {
        success: true,
        energy: 10,
        species: "amphipod",
        position: prey.position.clone(),
      };
    }
    return null;
  }
  getHuntCandidates(position, forward, options = {}) {
    const candidates = this.schools.flatMap((school) =>
      school.getHuntCandidates(position, forward, options),
    );
    for (const animal of this.animals) {
      if (
        animal.reserved ||
        !animal.group.visible ||
        !edible.has(animal.species) ||
        animal.bodyLength > (options.maxBodyLength ?? 1.2)
      )
        continue;
      const score = scorePrey(animal.position, position, forward, options);
      if (score)
        candidates.push({
          id: animal.id,
          name: animal.name,
          species: animal.species,
          kind: animal.species.includes("amphipod") ? "crustacean" : "fish",
          position: animal.position,
          radius: animal.radius,
          energy: animal.species.includes("amphipod") ? 10 : 24,
          source: animal,
          revision: animal.revision,
          ...score,
        });
    }
    return candidates.sort((a, b) => a.score - b.score);
  }
  acquirePrey(position, forward, options = {}) {
    return this.getHuntCandidates(position, forward, options)[0] ?? null;
  }
  capturePrey(candidate) {
    if (!candidate || this.heldPrey.has(candidate.id)) return null;
    const source = candidate.source;
    let group;
    if (source instanceof SchoolSystem) {
      const i = candidate.index;
      if (
        !this.schools.includes(source) ||
        source.disposed ||
        i >= source.count ||
        !source.alive[i] ||
        source.reserved.has(i) ||
        source.revisions[i] !== candidate.revision
      )
        return null;
      group = new THREE.Group();
      // Clone resources so a held animal survives safely until cancellation,
      // even when the source school is disposed during a depth transition.
      const material = source.mesh.material.clone();
      const tint = new THREE.Color();
      source.mesh.getColorAt(i, tint);
      material.color.multiply(tint);
      configureFishMaterial(material, source.clock, {
        held: true,
        deep:
          source.species === "lanternfish" || source.species === "bristlemouth",
      });
      group.add(new THREE.Mesh(source.mesh.geometry.clone(), material));
      group.position.copy(source.positions[i]);
      const velocity = source.velocities[i];
      if (velocity.lengthSq() > 0.0001)
        group.quaternion.setFromUnitVectors(
          forward,
          velocity.clone().normalize(),
        );
      group.scale.setScalar(source.scales[i]);
      source.alive[i] = false;
      source.reserved.add(i);
      source.revisions[i]++;
      source.render();
      this.scene.add(group);
    } else {
      if (
        !this.animals.includes(source) ||
        source.reserved ||
        !source.group.visible ||
        source.revision !== candidate.revision ||
        !edible.has(source.species) ||
        source.bodyLength > 1.2
      )
        return null;
      source.reserved = true;
      source.revision++;
      group = source.group;
    }
    const held = {
      ...candidate,
      group,
      position: group.position,
      state: "held",
      active: true,
      originalScale: group.scale.clone(),
    };
    this.heldPrey.set(held.id, held);
    return held;
  }
  releasePrey(held, position = held?.position) {
    if (!held || this.heldPrey.get(held.id) !== held || held.state !== "held")
      return false;
    const source = held.source;
    if (source instanceof SchoolSystem) {
      if (!source.disposed && this.schools.includes(source)) {
        const point = position.clone();
        point.y = THREE.MathUtils.clamp(
          point.y,
          -source.depthRange[1],
          -Math.max(0.8, source.depthRange[0]),
        );
        source.positions[held.index].copy(point);
        source.alive[held.index] = true;
        source.reserved.delete(held.index);
        source.revisions[held.index]++;
        source.render();
      }
      this.disposeHeldMesh(held);
    } else {
      source.position.copy(position);
      const [min, max] = SPECIES_BY_ID[source.species].depthRange;
      source.position.y = THREE.MathUtils.clamp(
        source.position.y,
        -max,
        -Math.max(0.17, min),
      );
      source.home.copy(source.position);
      source.group.scale.copy(held.originalScale);
      source.reserved = false;
      source.revision++;
    }
    held.state = "released";
    held.active = false;
    this.heldPrey.delete(held.id);
    return true;
  }
  consumePrey(held) {
    if (!held || this.heldPrey.get(held.id) !== held || held.state !== "held")
      return null;
    const position = held.position.clone(),
      source = held.source;
    const valid =
      source instanceof SchoolSystem
        ? !source.disposed && this.schools.includes(source)
        : this.animals.includes(source);
    if (source instanceof SchoolSystem) {
      source.reserved.delete(held.index);
      this.disposeHeldMesh(held);
    } else {
      this.animals.splice(this.animals.indexOf(source), 1);
      this.disposeAnimal(source);
    }
    held.state = valid ? "consumed" : "invalidated";
    held.active = false;
    this.heldPrey.delete(held.id);
    return valid
      ? {
          success: true,
          energy: held.energy,
          species: held.species,
          name: held.name,
          position,
        }
      : null;
  }
  disposeHeldMesh(held) {
    held.group.removeFromParent();
    held.group.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      object.material.dispose();
    });
  }
  repelThreat(position, forward, range = 4.2) {
    const nearby = this.animals
      .filter(
        (animal) =>
          animal.predator &&
          !animal.reserved &&
          animal.group.visible &&
          scorePrey(animal.position, position, forward, {
            range,
            coneCos: -0.05,
          }),
      )
      .sort(
        (a, b) =>
          a.position.distanceToSquared(position) -
          b.position.distanceToSquared(position),
      );
    const animal = nearby[0];
    if (!animal) return null;
    const away = animal.position.clone().sub(position).normalize();
    if (away.lengthSq() < 0.001) away.copy(forward).normalize();
    animal.velocity.addScaledVector(away, 3);
    animal.repelledUntil = this.time + 3.5;
    animal.behavior = "startled";
    animal.threat = 0;
    this.threat = Math.max(0, ...this.animals.map((a) => a.threat));
    return {
      success: true,
      name: animal.name,
      species: animal.species,
      position: animal.position.clone(),
      repelled: true,
    };
  }
  nearestRideable(position, maxDistance = 12) {
    let closest = null,
      dist = maxDistance;
    for (const a of this.animals) {
      if (!a.rideable) continue;
      const d = a.position.distanceTo(position);
      if (d < dist) {
        closest = a;
        dist = d;
      }
    }
    return closest;
  }
  setQuality(quality) {
    this.quality = quality;
    for (const school of this.schools) school.setQuality(quality);
  }
  disposeAnimal(animal) {
    animal.group.removeFromParent();
    animal.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (
          o.material?.type === "MeshBasicMaterial" ||
          (o.material?.transparent &&
            o.material !== undefined &&
            !["sea-nettle"].includes(animal.species))
        )
          o.material.dispose();
      }
    });
  }
  clear() {
    for (const held of this.heldPrey.values()) {
      if (held.source instanceof SchoolSystem) this.disposeHeldMesh(held);
      held.state = "invalidated";
      held.active = false;
    }
    this.heldPrey.clear();
    for (const animal of this.animals) this.disposeAnimal(animal);
    for (const school of this.schools) school.dispose();
    this.animals.length = 0;
    this.schools.length = 0;
  }
  dispose() {
    this.clear();
  }
}
