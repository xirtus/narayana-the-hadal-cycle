import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const clamp = THREE.MathUtils.clamp;
const V = () => new THREE.Vector3();

function skinMaterial(uniforms) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe6a58d,
    roughness: 0.34,
    metalness: 0.04,
    clearcoat: 0.72,
    clearcoatRoughness: 0.18,
    iridescence: 0.48,
    iridescenceIOR: 1.32,
    iridescenceThicknessRange: [160, 380],
    sheen: 0.42,
    sheenColor: new THREE.Color(0xd9ebdb),
    sheenRoughness: 0.35,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vSkinPoint;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvSkinPoint = position;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vSkinPoint;
      uniform float skinTime;
      uniform float skinExcitation;
      uniform float skinCamouflage;
      float chromHash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec3 cells = vSkinPoint * 46.0;
      vec3 cell = floor(cells);
      vec3 f = fract(cells) - 0.5;
      float h = chromHash(cell);
      float spread = 0.16 + 0.14 * skinExcitation + 0.1 * skinCamouflage;
      float chromatophore = 1.0 - smoothstep(spread, spread + 0.065, length(f.xy + vec2(h - 0.5, chromHash(cell + 7.0) - 0.5) * 0.45));
      chromatophore *= smoothstep(0.13, 0.30, h);
      float marbling = 0.5 + 0.5 * sin(vSkinPoint.z * 9.0 + sin(vSkinPoint.x * 17.0) * 2.0 + skinTime * 0.18);
      vec3 pearl = mix(vec3(0.94,0.72,0.57), vec3(0.78,0.91,0.82), 0.18 + 0.15 * marbling);
      vec3 pigment = mix(vec3(0.46,0.11,0.055), vec3(0.28,0.32,0.19), skinCamouflage);
      pearl = mix(pearl, vec3(0.48,0.52,0.30), skinCamouflage * (0.24 + 0.38 * marbling));
      diffuseColor.rgb *= mix(pearl, pigment, chromatophore * (0.57 + skinExcitation * 0.28));
    `,
    );
  };
  material.customProgramCacheKey = () => "narayana-chromatophore-v2";
  return material;
}

function mantleGeometry(octopus) {
  const points = octopus
    ? [
        [0.13, -0.6],
        [0.39, -0.47],
        [0.62, -0.1],
        [0.73, 0.3],
        [0.68, 0.69],
        [0.5, 1.0],
        [0.18, 1.18],
        [0, 1.2],
      ]
    : [
        [0.35, -0.69],
        [0.38, -0.56],
        [0.405, -0.18],
        [0.41, 0.35],
        [0.39, 0.98],
        [0.33, 1.61],
        [0.245, 2.14],
        [0.14, 2.6],
        [0.035, 2.92],
        [0, 3.04],
      ];
  const curve = new THREE.SplineCurve(
    points.map((p) => new THREE.Vector2(...p)),
  );
  const geometry = new THREE.LatheGeometry(curve.getPoints(64), 56);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function makeFin(side, material) {
  const nx = 20,
    nz = 30;
  const positions = [],
    uvs = [],
    indices = [];
  for (let j = 0; j <= nz; j++) {
    const t = j / nz;
    const z = 0.92 + t * 2.12;
    const root = 0.395 * Math.pow(1 - t, 0.74);
    const span = Math.pow(Math.sin(Math.PI * t), 1.25) * 0.64;
    for (let i = 0; i <= nx; i++) {
      const s = i / nx;
      positions.push(side * (root + span * s), 0, z);
      uvs.push(s, t);
      if (i < nx && j < nz) {
        const a = j * (nx + 1) + i;
        indices.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.base = Float32Array.from(positions);
  return mesh;
}

/** A force-driven animal. Arms are simulated in world space so contacts remain fixed. */
export class Cephalopod {
  constructor(
    scene,
    { position = new THREE.Vector3(0, -12, 0), species = "squid" } = {},
  ) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "Narayana — living cephalopod";
    this.group.position.copy(position);
    this.position = this.group.position;
    this.velocity = V();
    this.stamina = 1;
    this.jetAmount = 0;
    this.turboMode = false;
    this.camouflage = false;
    this.mode = "swimming";
    this.species = species;
    this.skinUniforms = {
      skinTime: { value: 0 },
      skinExcitation: { value: 0 },
      skinCamouflage: { value: 0 },
    };
    this.skin = skinMaterial(this.skinUniforms);
    this.finMaterial = this.skin.clone();
    this.finMaterial.onBeforeCompile = this.skin.onBeforeCompile;
    this.finMaterial.customProgramCacheKey = this.skin.customProgramCacheKey;
    this.finMaterial.side = THREE.DoubleSide;
    this.finMaterial.roughness = 0.45;
    this.finMaterial.transparent = true;
    this.finMaterial.opacity = 0.84;
    this.suckerMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf2cdac,
      roughness: 0.45,
      clearcoat: 0.28,
    });
    this.eyeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xc8d7c4,
      roughness: 0.16,
      metalness: 0.32,
      clearcoat: 1,
      iridescence: 0.8,
    });
    this.pupilMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x020607,
      roughness: 0.11,
      clearcoat: 1,
    });
    this.armGroup = new THREE.Group();
    this.armGroup.name = "World-space muscular arm simulation";
    this.scene.add(this.group, this.armGroup);
    this._force = V();
    this._current = V();
    this._forward = V();
    this._right = V();
    this._targetQuat = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, "YXZ");
    this._scratch = Array.from({ length: 12 }, V);
    this._matrix = new THREE.Matrix4();
    this._dummy = new THREE.Object3D();
    this._anchor = null;
    this._interaction = null;
    this._charge = 0;
    this._cooldown = 0;
    this._jetTimer = 0;
    this._jetDirection = new THREE.Vector3(0, 0, -1);
    this._funnelRotation = new THREE.Quaternion();
    this._funnelParentRotation = new THREE.Quaternion();
    this._bodyScale = 1;
    this._moving = 0;
    this._clock = 0;
    this._lastGrab = false;
    this._lastAttack = false;
    this._hunt = { phase: "idle", target: V(), progress: 0 };
    this._huntScratch = Array.from({ length: 5 }, V);
    this._build();
  }

  _build() {
    const octopus = this.species === "octopus";
    this.mantle = new THREE.Mesh(mantleGeometry(octopus), this.skin);
    this.mantle.name = octopus
      ? "Octopus muscular mantle"
      : "Market squid tapered mantle";
    this.group.add(this.mantle);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), this.skin);
    this.head.position.set(0, 0, -0.65);
    this.head.scale.set(octopus ? 0.42 : 0.38, 0.34, 0.39);
    this.group.add(this.head);
    // The buccal mass sits at the centre of the arm crown. Two opposed chitin
    // jaws close around food while the eight arms hold it against the mouth.
    this.mouth = new THREE.Group();
    this.mouth.name = "Buccal mass and opposing chitin beak";
    this.mouth.position.set(0, 0, -1.06);
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.055, 10, 32),
      this.skin,
    );
    this.mouth.add(lip);
    const beakMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x34231b,
      roughness: 0.3,
      clearcoat: 0.55,
    });
    const jawProfile = new THREE.Shape();
    jawProfile.moveTo(0, -0.025);
    jawProfile.lineTo(0, 0.025);
    jawProfile.bezierCurveTo(0.045, 0.12, 0.19, 0.1, 0.24, -0.025);
    jawProfile.bezierCurveTo(0.18, 0.005, 0.07, 0.008, 0, -0.025);
    const jawGeometry = new THREE.ExtrudeGeometry(jawProfile, {
      depth: 0.105,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.01,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 12,
    });
    jawGeometry.rotateY(Math.PI / 2);
    jawGeometry.translate(-0.0525, 0, 0);
    this.beakJaws = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.y = side * 0.025;
      const jaw = new THREE.Mesh(jawGeometry, beakMaterial);
      jaw.scale.set(side < 0 ? 0.83 : 1, side, side < 0 ? 0.9 : 1);
      hinge.add(jaw);
      this.mouth.add(hinge);
      this.beakJaws.push(hinge);
    }
    this.group.add(this.mouth);
    // Visible collar lip separates the mantle cavity and head.
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(octopus ? 0.32 : 0.37, 0.035, 10, 48),
      this.skin,
    );
    collar.position.z = -0.6;
    this.group.add(collar);
    const siphon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.14, 0.36, 20, 1, true),
      this.skin,
    );
    siphon.rotation.x = Math.PI / 2;
    siphon.position.set(0, -0.36, -0.56);
    this.group.add(siphon);
    this.siphon = siphon;
    this.eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.34, 0.035, -0.69);
      const white = new THREE.Mesh(
        new THREE.SphereGeometry(0.232, 32, 24),
        this.eyeMaterial,
      );
      white.scale.set(0.66, 1, 1);
      eye.add(white);
      const iris = new THREE.Mesh(
        new THREE.SphereGeometry(0.181, 32, 24),
        this.eyeMaterial,
      );
      iris.position.x = side * 0.096;
      iris.scale.set(0.3, 1, 1);
      eye.add(iris);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 32, 24),
        this.pupilMaterial,
      );
      pupil.position.x = side * 0.152;
      pupil.scale.set(0.25, octopus ? 0.28 : 0.9, 1);
      eye.add(pupil);
      const glint = new THREE.Mesh(
        new THREE.SphereGeometry(0.021, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xe4fff8 }),
      );
      glint.position.set(side * 0.181, 0.065, -0.046);
      eye.add(glint);
      this.group.add(eye);
      this.eyes.push({ group: eye, pupil });
    }
    this.fins = [];
    if (!octopus)
      for (const side of [-1, 1]) {
        const fin = makeFin(side, this.finMaterial);
        this.group.add(fin);
        this.fins.push(fin);
      }
    this.arms = [];
    const count = octopus ? 8 : 10;
    for (let i = 0; i < count; i++) this.arms.push(this._makeArm(i, octopus));
    this.group.updateMatrixWorld(true);
    this._resetArms();
  }

  _makeArm(index, octopus) {
    const feeding = index >= 8;
    const angle = feeding
      ? index === 8
        ? -0.13
        : Math.PI + 0.13
      : (index / 8) * Math.PI * 2 + Math.PI / 8;
    const length = octopus
      ? 2.05 + 0.22 * Math.cos(angle)
      : feeding
        ? 3.4
        : 1.36 + 0.24 * Math.sin(angle) ** 2;
    const segments = octopus || feeding ? 24 : 19;
    const sides = 10;
    const renderSegments = segments * 3;
    const root = new THREE.Vector3(
      Math.cos(angle) * 0.245,
      Math.sin(angle) * 0.235,
      -0.88,
    );
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array((renderSegments + 1) * sides * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    geo.setAttribute(
      "normal",
      new THREE.BufferAttribute(
        new Float32Array((renderSegments + 1) * sides * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    const uv = new Float32Array((renderSegments + 1) * sides * 2),
      indices = [];
    for (let j = 0; j <= renderSegments; j++)
      for (let k = 0; k < sides; k++) {
        uv[(j * sides + k) * 2] = k / sides;
        uv[(j * sides + k) * 2 + 1] = j / renderSegments;
        if (j < renderSegments) {
          const a = j * sides + k,
            b = j * sides + ((k + 1) % sides);
          indices.push(a, b, a + sides, b, b + sides, a + sides);
        }
      }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, this.skin);
    mesh.frustumCulled = false;
    mesh.name = feeding
      ? "Retractile feeding tentacle and club"
      : `Muscular arm ${index + 1}`;
    this.armGroup.add(mesh);
    const suckerCount = feeding ? 12 : octopus ? 38 : 24;
    const suckerGeo = new THREE.TorusGeometry(1, 0.2, 6, 12);
    const suckers = new THREE.InstancedMesh(
      suckerGeo,
      this.suckerMaterial,
      suckerCount,
    );
    suckers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    suckers.frustumCulled = false;
    this.armGroup.add(suckers);
    const smoothPoints = Array.from({ length: segments + 1 }, V);
    const curve = new THREE.CatmullRomCurve3(
      smoothPoints,
      false,
      "centripetal",
    );
    return {
      index,
      angle,
      root,
      feeding,
      length,
      segments,
      renderSegments,
      sides,
      mesh,
      suckers,
      suckerCount,
      smoothPoints,
      curve,
      renderPoints: Array.from({ length: renderSegments + 1 }, V),
      points: Array.from({ length: segments + 1 }, V),
      previous: Array.from({ length: segments + 1 }, V),
      anchor: null,
      tension: 0,
      normals: Array.from({ length: renderSegments + 1 }, V),
    };
  }

  _armPose(arm, t, time, out) {
    const octopus = this.species === "octopus";
    const spread = octopus ? 0.8 : 0.27;
    const pulse = Math.sin(time * 3.1 - t * 5.5 + arm.index * 0.79);
    const flare = spread * (0.9 + 0.16 * pulse) * t;
    const curl = octopus
      ? Math.pow(t, 3) * (0.34 + 0.2 * Math.sin(time * 0.8 + arm.index))
      : Math.pow(t, 3) * 0.1;
    const streaming = this.jetAmount * 1.4;
    const extension = arm.feeding
      ? this._interaction
        ? 1
        : 0.72 + this._moving * 0.08
      : 1;
    const distal = t * arm.length * extension;
    out.set(
      arm.root.x +
        Math.cos(arm.angle) *
          (flare * arm.length + streaming * Math.sin(t * Math.PI) * 0.36),
      arm.root.y +
        Math.sin(arm.angle) * flare * arm.length +
        pulse * 0.035 * t -
        curl * 0.3,
      arm.root.z -
        distal * (octopus ? 0.65 : 0.93) +
        curl * 1.15 +
        streaming * t * t * arm.length,
    );
    // A gripping arm reaches for an actual world target; all other arms remain free.
    return out.applyMatrix4(this.group.matrixWorld);
  }

  _resetArms() {
    this.group.updateMatrixWorld(true);
    this._bodyScale =
      this.group.getWorldScale(this._scratch[11]).length() / Math.sqrt(3);
    for (const arm of this.arms)
      for (let i = 0; i <= arm.segments; i++) {
        this._armPose(arm, i / arm.segments, this._clock, arm.points[i]);
        arm.previous[i].copy(arm.points[i]);
      }
  }

  setSpecies(species) {
    if (!["squid", "octopus"].includes(species) || species === this.species)
      return;
    this._clearGeometry();
    this.setHuntPose({ phase: "idle" });
    this.species = species;
    this._anchor = null;
    this.mode = "swimming";
    this._build();
  }

  setCamouflage(value) {
    this.camouflage = Boolean(value);
  }

  /** Move between ocean regions without carrying old arm velocities or contacts. */
  teleport(position) {
    if (!position || !Number.isFinite(position.x + position.y + position.z))
      return;
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this._force.set(0, 0, 0);
    this.grapple(null);
    this.interact(null);
    this.setHuntPose({ phase: "idle" });
    this._charge = 0;
    this._cooldown = 0;
    this._jetTimer = 0;
    this.jetAmount = 0;
    this._lastGrab = false;
    this._lastAttack = false;
    this._resetArms();
    for (const arm of this.arms) this._updateArmMesh(arm);
  }

  /** World position of the narrow funnel mouth, including body growth. */
  getJetOutlet(out) {
    this.siphon.updateWorldMatrix(true, false);
    return out.set(0, 0.18, 0).applyMatrix4(this.siphon.matrixWorld);
  }

  /** Actual exhaust direction, opposite the thrust once the funnel is aimed. */
  getJetDirection(out) {
    this.siphon.updateWorldMatrix(true, false);
    return out.set(0, 1, 0).transformDirection(this.siphon.matrixWorld);
  }

  getMouthPosition(out = V()) {
    this.group.updateWorldMatrix(true, false);
    return out.copy(this.mouth.position).applyMatrix4(this.group.matrixWorld);
  }

  getHuntReach() {
    this.group.getWorldScale(this._huntScratch[4]);
    return (
      ((this.species === "octopus" ? 2.3 : 3.2) *
        this._huntScratch[4].length()) /
      Math.sqrt(3)
    );
  }

  getFeedingTipPositions() {
    const arms =
      this.species === "octopus" ? this.arms.slice(0, 2) : this.arms.slice(8);
    return arms.map((arm) => arm.points[arm.segments].clone());
  }

  /** The hunt controller supplies a moving prey position throughout the capture. */
  setHuntPose({ phase = "idle", target = null, progress = 0 } = {}) {
    const valid =
      ["windup", "strike", "retract", "feed", "sweep"].includes(phase) &&
      target &&
      Number.isFinite(target.x + target.y + target.z);
    this._hunt.phase = valid ? phase : "idle";
    this._hunt.progress = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
    if (valid) {
      this._hunt.target.copy(target);
      // Puzzle manipulation resumes after the capture; it must never pin the clubs.
      this._interaction = null;
    }
  }

  /** Keep rendered club contact exact after the controller moves held prey. */
  refreshHuntPose(pose, time = this._clock, world = {}) {
    this.setHuntPose(pose);
    this.group.updateMatrixWorld(true);
    for (const arm of this.arms) {
      if (this._simulateHuntArm(arm, time, world)) this._updateArmMesh(arm);
    }
    this._animateBeak(time);
  }

  grapple(target) {
    this._anchor = target ? target.clone() : null;
    if (!target) {
      for (const arm of this.arms) arm.anchor = null;
      this.mode = "swimming";
    }
  }

  interact(target) {
    this._interaction = target ? target.clone() : null;
    this._interactionUntil = this._clock + 2.3;
  }

  update(dt, time, input = {}, world = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Stable substeps keep contacts and water drag consistent across refresh rates.
    dt = Math.min(dt, 0.1);
    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    this._clock = time;
    this.group.updateMatrixWorld(true);
    const bodyScale =
      this.group.getWorldScale(this._scratch[11]).length() / Math.sqrt(3);
    if (Math.abs(bodyScale - this._bodyScale) > 0.00001) {
      const ratio = bodyScale / Math.max(0.001, this._bodyScale);
      for (const arm of this.arms)
        for (let i = 0; i <= arm.segments; i++) {
          arm.points[i]
            .sub(this.position)
            .multiplyScalar(ratio)
            .add(this.position);
          arm.previous[i]
            .sub(this.position)
            .multiplyScalar(ratio)
            .add(this.position);
        }
      this._bodyScale = bodyScale;
    }
    this._moving = clamp(
      Math.hypot(input.moveX || 0, input.moveZ || 0, input.ascend || 0),
      0,
      1,
    );
    if (input.grab && !this._lastGrab && !this._anchor) {
      const floor =
        world.getFloorHeight?.(this.position.x, this.position.z) ?? -1000;
      if (this.position.y - floor < 3.3)
        this.grapple(
          new THREE.Vector3(
            this.position.x,
            floor + 0.05,
            this.position.z - 0.6,
          ),
        );
    } else if (!input.grab && this._lastGrab) this.grapple(null);
    this._lastGrab = Boolean(input.grab);
    if (
      input.attack &&
      !this._lastAttack &&
      !this._interaction &&
      this._hunt.phase === "idle"
    ) {
      const yaw = input.yaw || 0,
        pitch = input.pitch || 0;
      this.interact(
        this.position
          .clone()
          .add(
            new THREE.Vector3(
              Math.sin(yaw) * Math.cos(pitch),
              Math.sin(pitch),
              -Math.cos(yaw) * Math.cos(pitch),
            ).multiplyScalar(3.2),
          ),
      );
      this._interactionUntil = time + 0.55;
    }
    this._lastAttack = Boolean(input.attack);
    if (this._interaction && time > this._interactionUntil)
      this._interaction = null;
    for (let i = 0; i < steps; i++)
      this._step(dt / steps, time - dt + (dt * (i + 1)) / steps, input, world);
    this._animate(dt, time, input);
    for (const arm of this.arms) this._updateArmMesh(arm);
  }

  _step(dt, time, input, world) {
    const yaw = input.yaw || 0,
      pitch = clamp(input.pitch || 0, -1.35, 1.35);
    this._forward.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    this._right.set(Math.cos(yaw), 0, Math.sin(yaw));
    this._current.set(0, 0, 0);
    if (world.getCurrent) {
      const current = world.getCurrent(this.position, time, this._current);
      if (current?.isVector3) this._current.copy(current);
    }
    const move = this._scratch[0]
      .copy(this._forward)
      .multiplyScalar(input.moveZ || 0)
      .addScaledVector(this._right, input.moveX || 0)
      .addScaledVector(UP, input.ascend || 0);
    if (move.lengthSq() > 1) move.normalize();
    const octopus = this.species === "octopus";
    const turbo = this.turboMode && input.jet;
    // Paired fin waves and small arm contractions provide quiet sustained thrust.
    const finBeat = 0.94 + 0.06 * Math.sin(time * 5.5);
    this._force
      .copy(move)
      .multiplyScalar(
        (this._anchor ? (octopus ? 3.3 : 5.2) : octopus ? 10 : 16) *
          finBeat *
          (this.camouflage ? 0.7 : 1),
      );
    // Coordinated arm contractions add a small real propulsive contribution.
    let armThrust = 0;
    for (let i = 0; i < 8; i++)
      armThrust += Math.max(0, Math.cos(time * 3.1 + i * 0.79)) * 0.028;
    this._force.addScaledVector(move, armThrust * (octopus ? 1.8 : 1));
    this._force.y += Math.sin(time * 1.8) * 0.025; // near-neutral buoyancy
    const relative = this._scratch[1].copy(this.velocity).sub(this._current);
    const speed = relative.length();
    this._force.addScaledVector(relative, -(0.83 + speed * 0.17));
    this._cooldown = Math.max(0, this._cooldown - dt);
    this._jetTimer = Math.max(0, this._jetTimer - dt);
    if (input.jet && this.stamina > 0.15 && this._cooldown <= 0) {
      this._charge += dt;
      this._jetDirection
        .copy(move.lengthSq() > 0.02 ? move : this._forward)
        .normalize();
      if (this._charge >= 0.19) {
        this._charge = 0;
        this._jetTimer = 0.23;
        this._cooldown = 0.54;
        this.stamina = Math.max(0, this.stamina - 0.13);
        this._jetDirection
          .copy(move.lengthSq() > 0.02 ? move : this._forward)
          .normalize();
        if (this._anchor) this.grapple(null);
      }
    } else this._charge = Math.max(0, this._charge - dt * 2);
    this.jetAmount =
      this._jetTimer > 0 ? Math.sin(Math.PI * (1 - this._jetTimer / 0.23)) : 0;
    if (this._jetTimer > 0)
      this._force.addScaledVector(
        this._jetDirection,
        (octopus ? 90 : 110) * this.jetAmount,
      );
    // Divine travel mode: sustained fast jets, with steering and active braking.
    // Ordinary biological bursts remain available by switching turbo off.
    if (turbo) {
      if (this._anchor) this.grapple(null);
      const direction = this._scratch[4]
        .copy(move.lengthSq() > 0.02 ? move : this._forward)
        .normalize();
      this._jetDirection.copy(direction);
      this._force.addScaledVector(direction, octopus ? 325 : 470);
      const lateralVelocity = this._scratch[5]
        .copy(this.velocity)
        .addScaledVector(direction, -this.velocity.dot(direction));
      this._force.addScaledVector(lateralVelocity, -6);
      this.jetAmount = Math.max(
        this.jetAmount,
        0.7 + 0.25 * Math.sin(time * 18),
      );
    } else if (speed > 16) {
      this._force.addScaledVector(relative, -5); // Release Shift to brake before a ledge or prey.
    }
    this.stamina = clamp(
      this.stamina + dt * (turbo ? 0.3 : input.jet ? 0.09 : 0.25),
      0,
      1,
    );
    if (this._anchor) {
      const distance = this.position.distanceTo(this._anchor);
      if (distance > 6.5 * this._bodyScale) this.grapple(null);
      else {
        this.mode = this._moving > 0.05 ? "crawling" : "anchored";
        for (let i = 0; i < this.arms.length; i++) {
          const arm = this.arms[i];
          if (i === 4 || i === 5 || (octopus && i === 3)) {
            if (!arm.anchor)
              arm.anchor = this._anchor
                .clone()
                .add(
                  new THREE.Vector3(
                    Math.cos(arm.angle) * 0.3,
                    0.02,
                    Math.sin(arm.angle) * 0.3,
                  ),
                );
            const pull = this._scratch[2].copy(arm.anchor).sub(this.position);
            arm.tension = Math.max(
              0,
              pull.length() - (octopus ? 1.25 : 1.08) * this._bodyScale,
            );
            if (arm.tension > 0)
              this._force.addScaledVector(
                pull.normalize(),
                Math.min(18, arm.tension * 11),
              );
            this._force.addScaledVector(this.velocity, -0.65);
            // Each arm releases independently and plants ahead in the walking cycle.
            if (this._moving > 0.05 && Math.sin(time * 4.0 + i * 2.1) > 0.85) {
              const ahead = this._scratch[3]
                .copy(this.position)
                .addScaledVector(move, 1.05);
              const h =
                world.getFloorHeight?.(ahead.x, ahead.z) ?? this._anchor.y;
              if (this.position.y - h < 3.2) {
                arm.anchor.lerp(ahead.setY(h + 0.04), 1 - Math.exp(-dt * 8));
                this._anchor.lerp(arm.anchor, 0.03);
              }
            }
          }
        }
        this._force.addScaledVector(move, octopus ? 4 : 2);
      }
    } else this.mode = "swimming";
    this.velocity.addScaledVector(this._force, dt);
    const speedLimit = turbo ? (octopus ? 40 : 48) : Math.max(16, speed);
    if (this.velocity.lengthSq() > speedLimit * speedLimit)
      this.velocity.setLength(speedLimit);
    this.position.addScaledVector(this.velocity, dt);
    const floor =
      world.getFloorHeight?.(this.position.x, this.position.z) ?? -1000;
    if (this.position.y < floor + 0.6 * this._bodyScale) {
      this.position.y = floor + 0.6 * this._bodyScale;
      this.velocity.y = Math.max(0, this.velocity.y) * 0.6;
    }
    if (this.position.y > -0.7 * this._bodyScale) {
      this.position.y = -0.7 * this._bodyScale;
      this.velocity.y = Math.min(0, this.velocity.y);
    }
    if (world.resolveCollision)
      world.resolveCollision(this.position, 0.5 * this._bodyScale);
    // Steering rolls into turns. Water and arm traction subtly influence the attitude.
    const lateral = relative.dot(this._right);
    const roll = clamp(
      -lateral * 0.042 - (input.moveX || 0) * 0.13,
      -0.34,
      0.34,
    );
    this._euler.set(pitch + Math.sin(time * 1.8) * 0.015, -yaw, roll);
    this._targetQuat.setFromEuler(this._euler);
    this.group.quaternion.slerp(
      this._targetQuat,
      1 - Math.exp(-dt * (this._anchor ? 3.2 : 4.2)),
    );
    this.group.updateMatrixWorld(true);
    for (const arm of this.arms) this._simulateArm(arm, dt, time, world);
  }

  _simulateArm(arm, dt, time, world) {
    if (this._simulateHuntArm(arm, time, world)) return;
    const points = arm.points,
      prev = arm.previous;
    const root = this._scratch[4]
      .copy(arm.root)
      .applyMatrix4(this.group.matrixWorld);
    points[0].copy(root);
    prev[0].copy(root);
    const desired = this._scratch[5],
      old = this._scratch[6],
      delta = this._scratch[7];
    const rest =
      ((this._bodyScale * arm.length) / arm.segments) *
      (arm.feeding && !this._interaction ? 0.81 : 1);
    for (let i = 1; i <= arm.segments; i++) {
      const t = i / arm.segments;
      old.copy(points[i]);
      delta
        .copy(points[i])
        .sub(prev[i])
        .multiplyScalar(Math.exp(-dt * 5.2));
      this._armPose(arm, t, time, desired);
      if (this._interaction && (arm.feeding || arm.index < 2))
        desired.lerp(this._interaction, t * t * 0.8);
      points[i].add(delta).addScaledVector(this._current, dt * 0.065);
      points[i].addScaledVector(
        desired.sub(points[i]),
        dt * dt * (arm.anchor ? 24 : 88),
      );
      prev[i].copy(old);
    }
    // Arms are muscular hydrostats: they may shorten, but cannot overextend.
    // Enforcing a minimum segment length made relaxed arms buckle into zigzags.
    // A small bending constraint preserves broad, physiological curves.
    for (let i = 1; i < arm.segments; i++) {
      desired
        .copy(points[i - 1])
        .add(points[i + 1])
        .multiplyScalar(0.5);
      points[i].lerp(desired, Math.min(0.18, dt * 12));
    }
    // Position based extension constraints preserve contact and tensile strength.
    for (let iteration = 0; iteration < 5; iteration++) {
      points[0].copy(root);
      if (arm.anchor) points[arm.segments].copy(arm.anchor);
      for (let i = 0; i < arm.segments; i++) {
        const a = points[i],
          b = points[i + 1];
        delta.copy(b).sub(a);
        const d = delta.length();
        if (d < 1e-7 || d <= rest) continue;
        const correction = (d - rest) / d;
        if (i === 0) b.addScaledVector(delta, -correction);
        else if (arm.anchor && i === arm.segments - 1)
          a.addScaledVector(delta, correction);
        else {
          a.addScaledVector(delta, correction * 0.5);
          b.addScaledVector(delta, -correction * 0.5);
        }
      }
    }
    // Floors are sampled per control point, retaining arm contact on uneven rock.
    for (let i = 1; i <= arm.segments; i++) {
      const p = points[i];
      const floor = world.getFloorHeight?.(p.x, p.z) ?? -1000;
      if (p.y < floor + 0.055) {
        p.y = floor + 0.055;
        prev[i].y = p.y;
      }
      p.y = Math.min(-0.16, p.y);
      if (
        !Number.isFinite(p.x + p.y + p.z) ||
        p.distanceToSquared(this.position) >
          100 * this._bodyScale * this._bodyScale
      ) {
        this._armPose(arm, i / arm.segments, time, p);
        prev[i].copy(p);
      }
    }
  }

  _simulateHuntArm(arm, time, world) {
    const hunt = this._hunt;
    if (hunt.phase === "idle" || arm.anchor) return false;
    const leading = this.species === "octopus" ? arm.index < 2 : arm.feeding;
    const gathering =
      hunt.phase === "feed" ||
      hunt.phase === "retract" ||
      hunt.phase === "sweep";
    if (!leading && !gathering && hunt.phase !== "windup") return false;
    const [mouth, endpoint, root, radial, natural] = this._huntScratch;
    this.getMouthPosition(mouth);
    root.copy(arm.root).applyMatrix4(this.group.matrixWorld);
    radial
      .set(Math.cos(arm.angle), Math.sin(arm.angle), 0)
      .applyQuaternion(this.group.quaternion);
    const scale = this._bodyScale;
    const progress = hunt.progress * hunt.progress * (3 - 2 * hunt.progress);
    const forward = this._forward;
    if (hunt.phase === "sweep") {
      const angle = arm.angle + progress * Math.PI * 1.6;
      radial
        .set(Math.cos(angle), Math.sin(angle), 0)
        .applyQuaternion(this.group.quaternion);
      endpoint
        .copy(mouth)
        .addScaledVector(radial, (leading ? 2.8 : 1.65) * scale)
        .addScaledVector(forward, 0.25 * scale);
    } else if (leading) {
      endpoint
        .copy(hunt.target)
        .sub(mouth)
        .clampLength(0, this.getHuntReach())
        .add(mouth);
      if (hunt.phase === "windup" || hunt.phase === "strike") {
        natural
          .copy(mouth)
          .addScaledVector(forward, 0.6 * scale)
          .addScaledVector(radial, 0.18 * scale);
        if (hunt.phase === "windup") endpoint.copy(natural);
        else endpoint.lerpVectors(natural, endpoint, progress);
      }
      // The clubs land on opposite sides of prey, leaving room for the buccal mass.
      endpoint.addScaledVector(radial, 0.065 * scale);
    } else {
      // Eight short arms form a basket, then contract in alternating pairs.
      const contraction =
        hunt.phase === "feed"
          ? Math.sin(time * 17 + (arm.index * Math.PI) / 2)
          : 0;
      endpoint
        .copy(mouth)
        .addScaledVector(forward, (0.36 + contraction * 0.045) * scale)
        .addScaledVector(radial, (0.13 + contraction * 0.025) * scale);
    }
    const blend =
      hunt.phase === "windup"
        ? progress
        : leading
          ? 1
          : hunt.phase === "retract"
            ? progress
            : 1;
    for (let i = 0; i <= arm.segments; i++) {
      const t = i / arm.segments;
      const point = arm.points[i];
      this._armPose(arm, t, time, natural);
      point.lerpVectors(root, endpoint, t);
      const arch = leading ? (hunt.phase === "strike" ? 0.13 : 0.3) : 0.48;
      point.addScaledVector(radial, Math.sin(t * Math.PI) * arch * scale);
      point.lerp(natural, 1 - blend);
      if (i > 0) {
        const floor = world.getFloorHeight?.(point.x, point.z) ?? -1000;
        point.y = Math.min(-0.16, Math.max(floor + 0.055, point.y));
      }
      arm.previous[i].copy(point);
    }
    return true;
  }

  _armRadius(arm, t) {
    if (arm.feeding) {
      const club = Math.exp(-(((t - 0.87) / 0.13) ** 2)) * 0.031;
      return (
        this._bodyScale *
        (0.03 * (1 - t) + 0.007 + club) *
        Math.min(1, (1 - t) * 22 + 0.12)
      );
    }
    return (
      this._bodyScale *
      ((this.species === "octopus" ? 0.132 : 0.084) * Math.pow(1 - t, 1.02) +
        0.004)
    );
  }

  _updateArmMesh(arm) {
    const pos = arm.mesh.geometry.attributes.position,
      normal = arm.mesh.geometry.attributes.normal;
    const tangent = this._scratch[0],
      n = this._scratch[1],
      b = this._scratch[2],
      radial = this._scratch[3];
    // Render a smooth centripetal spline through a filtered physical spine.
    // The solver retains discrete contacts; interpolation removes faceted bends.
    for (let j = 0; j <= arm.segments; j++) {
      const p = arm.smoothPoints[j].copy(arm.points[j]);
      if (j > 0 && j < arm.segments)
        p.multiplyScalar(0.5)
          .addScaledVector(arm.points[j - 1], 0.25)
          .addScaledVector(arm.points[j + 1], 0.25);
    }
    for (let j = 0; j <= arm.renderSegments; j++)
      arm.curve.getPoint(j / arm.renderSegments, arm.renderPoints[j]);
    for (let j = 0; j <= arm.renderSegments; j++) {
      const t = j / arm.renderSegments,
        p = arm.renderPoints[j];
      tangent
        .copy(arm.renderPoints[Math.min(j + 1, arm.renderSegments)])
        .sub(arm.renderPoints[Math.max(0, j - 1)])
        .normalize();
      // Parallel transport suppresses flicker and twisting in curled arms.
      if (j === 0)
        n.set(Math.cos(arm.angle), Math.sin(arm.angle), 0).applyQuaternion(
          this.group.quaternion,
        );
      else n.copy(arm.normals[j - 1]);
      n.addScaledVector(tangent, -n.dot(tangent));
      if (n.lengthSq() < 0.001) n.crossVectors(tangent, UP);
      n.normalize();
      b.crossVectors(tangent, n).normalize();
      arm.normals[j].copy(n);
      const radius = this._armRadius(arm, t);
      for (let k = 0; k < arm.sides; k++) {
        const angle = (k / arm.sides) * Math.PI * 2;
        radial
          .copy(n)
          .multiplyScalar(Math.cos(angle))
          .addScaledVector(b, Math.sin(angle));
        const idx = j * arm.sides + k;
        pos.setXYZ(
          idx,
          p.x + radial.x * radius,
          p.y + radial.y * radius,
          p.z + radial.z * radius,
        );
        normal.setXYZ(idx, radial.x, radial.y, radial.z);
      }
    }
    pos.needsUpdate = true;
    normal.needsUpdate = true;
    const dummy = this._dummy;
    for (let i = 0; i < arm.suckerCount; i++) {
      const pair = Math.floor(i / 2),
        row = i % 2 ? 1 : -1;
      const t = arm.feeding
        ? 0.72 + (pair / (arm.suckerCount / 2)) * 0.25
        : 0.11 + (pair / (arm.suckerCount / 2)) * 0.78;
      const f = t * arm.renderSegments,
        j = Math.floor(f),
        fraction = f - j;
      const p = this._scratch[4]
        .copy(arm.renderPoints[j])
        .lerp(arm.renderPoints[Math.min(j + 1, arm.renderSegments)], fraction);
      n.copy(arm.normals[j]).negate();
      tangent
        .copy(arm.renderPoints[Math.min(j + 1, arm.renderSegments)])
        .sub(arm.renderPoints[Math.max(0, j - 1)])
        .normalize();
      b.crossVectors(tangent, n).normalize();
      radial
        .copy(n)
        .multiplyScalar(0.87)
        .addScaledVector(b, row * 0.48)
        .normalize();
      const radius = this._armRadius(arm, t);
      dummy.position.copy(p).addScaledVector(radial, radius * 0.97);
      dummy.quaternion.setFromUnitVectors(Z_AXIS, radial);
      const size = radius * (arm.feeding ? 0.33 : 0.36);
      dummy.scale.set(size, size, size * 0.7);
      dummy.updateMatrix();
      arm.suckers.setMatrixAt(i, dummy.matrix);
    }
    arm.suckers.instanceMatrix.needsUpdate = true;
  }

  _animateBeak(time) {
    const feeding = this._hunt.phase === "feed";
    const open = feeding
      ? 0.12 + (0.5 + 0.5 * Math.sin(time * 22)) * 0.52
      : this._hunt.phase === "retract"
        ? 0.45
        : 0.06;
    for (let i = 0; i < this.beakJaws.length; i++)
      this.beakJaws[i].rotation.x = (i === 0 ? -1 : 1) * open;
  }

  _animate(dt, time) {
    this._animateBeak(time);
    const feeding = this._hunt.phase === "feed";
    const charge = this._charge / 0.19;
    const breath = Math.sin(time * 2.6) * 0.014;
    const dilation = 1 + breath + charge * 0.12 - this.jetAmount * 0.15;
    this.mantle.scale.set(dilation, dilation, 1 + this.jetAmount * 0.035);
    this.siphon.scale.set(
      1 + this.jetAmount * 0.3,
      1,
      1 + this.jetAmount * 0.3,
    );
    // The steerable funnel turns during mantle filling, before water is expelled.
    // Cylinder +Y is its narrow mouth. Convert desired world exhaust into body space.
    const exhaust = this._scratch[8];
    if (this._charge > 0 || this._jetTimer > 0) {
      this.group.getWorldQuaternion(this._funnelParentRotation).invert();
      exhaust
        .copy(this._jetDirection)
        .negate()
        .applyQuaternion(this._funnelParentRotation);
    } else exhaust.set(0, 0, 1);
    this._funnelRotation.setFromUnitVectors(UP, exhaust.normalize());
    this.siphon.quaternion.slerp(this._funnelRotation, 1 - Math.exp(-dt * 24));
    this.skinUniforms.skinTime.value = time;
    this.skinUniforms.skinExcitation.value = THREE.MathUtils.damp(
      this.skinUniforms.skinExcitation.value,
      this.jetAmount * 0.9 + this._moving * 0.24 + (feeding ? 0.25 : 0),
      3,
      dt,
    );
    this.skinUniforms.skinCamouflage.value = THREE.MathUtils.damp(
      this.skinUniforms.skinCamouflage.value,
      this.camouflage ? 1 : 0,
      2.4,
      dt,
    );
    for (const fin of this.fins) {
      const pos = fin.geometry.attributes.position,
        uv = fin.geometry.attributes.uv;
      const base = fin.userData.base;
      for (let i = 0; i < pos.count; i++) {
        const s = uv.getX(i),
          t = uv.getY(i);
        const wave = Math.sin(t * 10.5 - time * (4.8 + this._moving * 2.2));
        pos.setXYZ(
          i,
          base[i * 3] * (1 - this.jetAmount * s * 0.22),
          (wave * (0.065 + this._moving * 0.04) * s +
            Math.sin(t * Math.PI) * s * 0.025) *
            (1 - this.jetAmount * 0.68),
          base[i * 3 + 2],
        );
      }
      pos.needsUpdate = true;
      fin.geometry.computeVertexNormals();
    }
  }

  _clearGeometry() {
    for (const container of [this.group, this.armGroup]) {
      container.traverse((object) => {
        object.geometry?.dispose();
        if (
          object.material &&
          ![
            this.skin,
            this.finMaterial,
            this.suckerMaterial,
            this.eyeMaterial,
            this.pupilMaterial,
          ].includes(object.material)
        )
          object.material.dispose();
      });
      container.clear();
    }
  }

  dispose() {
    this.setHuntPose({ phase: "idle" });
    this._clearGeometry();
    for (const material of [
      this.skin,
      this.finMaterial,
      this.suckerMaterial,
      this.eyeMaterial,
      this.pupilMaterial,
    ])
      material.dispose();
    this.group.removeFromParent();
    this.armGroup.removeFromParent();
  }
}

export default Cephalopod;
