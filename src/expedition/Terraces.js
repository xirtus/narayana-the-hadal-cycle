import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  makeFishGeometry,
  FISH_MATERIAL,
  makeWhale,
  animateCreature,
} from "../ecology/CreatureModels.js";
import { buildSpace, animateSpace } from "./SpaceGeometry.js";
import {
  routeFloor,
  fractalHeight,
  buildFractalTerrain,
} from "./FractalTerrain.js";
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const TERRACE_NAMES = [
  "The nursery",
  "The feeding shelf",
  "The sheltering arch",
  "The migration balcony",
  "The lantern garden",
];
export function terraceNode(index) {
  return V(Math.sin(index * 1.7) * 12, -index * 18, -25 - index * 42);
}
export const terraceFloor = routeFloor;
export const terraceHeight = fractalHeight;
export function buildTerraces(space, world = null) {
  const group = new THREE.Group();
  group.position.copy(space.position);
  group.name = `Living terraces · ${space.id}`;
  const colliders = [],
    boxes = [],
    batches = new Map(),
    glowMaterials = [];
  const shallow = space.depth < 250,
    deep = space.depth > 1400;
  const material = (color, emissive = 0) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.86,
      emissive,
      emissiveIntensity: emissive ? 0.5 : 0,
    });
  const rock = material(shallow ? 0x657b70 : 0x364754),
    sediment = material(shallow ? 0xa0a588 : 0x4d5662);
  sediment.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 sandP;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nsandP=position;",
      );
    shader.fragmentShader =
      "varying vec3 sandP;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float ripple=sin(sandP.z*4.+sin(sandP.x*.5)*1.5);
      float grain=fract(sin(dot(floor(sandP.xz*50.),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb*=.83+.065*ripple+.10*grain;`,
      );
  };
  rock.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 terraceP;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nterraceP=position;",
      );
    shader.fragmentShader =
      "varying vec3 terraceP;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float strata=sin(terraceP.y*3.+sin(terraceP.z*.31)*.6);
      float mottling=sin(terraceP.x*1.2+sin(terraceP.z*.7))*sin(terraceP.y*2.4);
      diffuseColor.rgb*=.8+.13*strata+.12*mottling;`,
      );
  };
  const kelp = material(0x57753e),
    coral = material(deep ? 0x8f72bc : 0xb27855, deep ? 0x46378a : 0);
  const living = material(
    deep ? 0x70d9de : 0x7caaa2,
    deep ? 0x2996b6 : 0x173329,
  );
  kelp.side = THREE.DoubleSide;
  glowMaterials.push(living, coral);
  function add(geo, mat, p = V(), scale = V(1, 1, 1), solid = false) {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(p);
    m.scale.copy(scale);
    m.updateMatrix();
    if (solid) {
      group.add(m);
      m.visible = false;
      colliders.push(m);
      boxes.push(new THREE.Box3().setFromObject(m).translate(space.position));
    }
    const g = geo.clone().applyMatrix4(m.matrix);
    g.deleteAttribute("uv");
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push(g);
    if (!solid) geo.dispose();
  }
  const sample = world?.getFloorHeight
    ? world.getFloorHeight.bind(world)
    : (x, z) => fractalHeight(space, x, z)?.height ?? space.position.y - 150;
  const mountains = buildFractalTerrain(space, sample);
  group.add(mountains.group);
  colliders.push(...mountains.meshes);
  for (let tier = 0; tier < 6; tier++) {
    const z = -25 - tier * 42,
      y = -7 - tier * 18;
    // Small-scale ecology on every landing; never only distant silhouettes.
    for (let n = 0; n < 46; n++) {
      const a = n * 2.399,
        r = 8 + (n % 9) * 2.8,
        x = Math.cos(a) * r,
        pz = z + Math.sin(a) * 12,
        py = terraceFloor(pz);
      if (shallow) {
        const h = 3 + (n % 8);
        for (let branch = 0; branch < 3; branch++) {
          const curve = new THREE.CatmullRomCurve3([
            V(x, py, pz),
            V(x + 0.7, py + h * 0.5, pz + 0.4),
            V(x + Math.sin(n + branch) * 1.6, py + h, pz + 1),
          ]);
          add(new THREE.TubeGeometry(curve, 14, 0.045, 6, false), kelp);
          for (let leaf = 1; leaf < 5; leaf++) {
            const blade = new THREE.PlaneGeometry(1, 1, 3, 14),
              vertices = blade.attributes.position;
            for (let k = 0; k < vertices.count; k++) {
              const t = vertices.getY(k) + 0.5,
                w = Math.sin(Math.PI * t) * 0.48;
              vertices.setXYZ(
                k,
                x + Math.sin(n + branch) * t * 1.5 + vertices.getX(k) * w,
                py + (h * leaf) / 5 + t * 1.6,
                pz + 0.4 + Math.sin(t * 3 + n) * 0.5 + t * 0.8,
              );
            }
            blade.computeVertexNormals();
            add(blade, kelp);
          }
        }
      } else {
        // Distinct benthic silhouettes: feathered sea pens, branching fans,
        // perforated glass vases and fine tube-worm colonies.
        const height = 1.2 + (n % 5) * 0.38;
        if (n % 4 === 0) {
          const profile = [
            new THREE.Vector2(0.1, 0),
            new THREE.Vector2(0.2, height * 0.2),
            new THREE.Vector2(0.42, height * 0.6),
            new THREE.Vector2(0.33, height),
            new THREE.Vector2(0.28, height),
            new THREE.Vector2(0.35, height * 0.6),
            new THREE.Vector2(0.08, height * 0.1),
          ];
          add(new THREE.LatheGeometry(profile, 18), coral, V(x, py, pz));
          for (let band = 0; band < 7; band++)
            add(
              new THREE.TorusGeometry(
                0.16 + Math.sin((band / 7) * Math.PI) * 0.2,
                0.018,
                4,
                18,
              ),
              living,
              V(x, py + (band * height) / 7, pz),
              V(1, 0.7, 1),
            );
        } else if (n % 4 === 1 || n % 4 === 2) {
          const spine = new THREE.CatmullRomCurve3([
            V(x, py, pz),
            V(x + 0.15, py + height * 0.5, pz),
            V(x + 0.35, py + height, pz + 0.15),
          ]);
          add(new THREE.TubeGeometry(spine, 10, 0.045, 5, false), coral);
          for (let feather = 0; feather < 10; feather++)
            for (const side of [-1, 1]) {
              const t = feather / 10,
                width = Math.sin(t * Math.PI) * 0.7 + 0.12;
              const branch = new THREE.CatmullRomCurve3([
                V(x + t * 0.3, py + height * t, pz),
                V(
                  x + side * width * 0.6 + t * 0.3,
                  py + height * t + 0.15,
                  pz + 0.05,
                ),
                V(x + side * width + t * 0.3, py + height * t + 0.3, pz + 0.12),
              ]);
              add(
                new THREE.TubeGeometry(branch, 5, 0.025, 4, false),
                n % 4 === 1 ? living : coral,
              );
            }
        } else {
          for (let stalk = 0; stalk < 8; stalk++) {
            const sx = x + Math.sin(stalk * 2.4) * 0.5,
              sz = pz + Math.cos(stalk * 2.4) * 0.5,
              h = 0.6 + stalk * 0.13;
            add(
              new THREE.CylinderGeometry(0.045, 0.07, h, 6),
              coral,
              V(sx, py + h * 0.5, sz),
            );
            add(
              new THREE.SphereGeometry(1, 8, 5),
              living,
              V(sx, py + h, sz),
              V(0.15, 0.25, 0.15),
            );
          }
        }
      }
      if (n % 3 === 0) {
        // Eight legs and two raised claws distinguish small benthic crabs.
        add(
          new THREE.SphereGeometry(1, 8, 5),
          coral,
          V(x, py + 0.22, pz),
          V(0.38, 0.16, 0.25),
        );
        for (let leg = 0; leg < 8; leg++) {
          const side = leg % 2 ? -1 : 1,
            dz = (Math.floor(leg / 2) - 1.5) * 0.16;
          const curve = new THREE.CatmullRomCurve3([
            V(x + side * 0.2, py + 0.2, pz + dz),
            V(x + side * 0.45, py + 0.26, pz + dz * 1.2),
            V(x + side * 0.62, py + 0.025, pz + dz * 1.7),
          ]);
          add(new THREE.TubeGeometry(curve, 4, 0.025, 4, false), coral);
        }
        for (const side of [-1, 1])
          add(
            new THREE.SphereGeometry(1, 6, 4),
            coral,
            V(x + side * 0.28, py + 0.34, pz - 0.4),
            V(0.12, 0.18, 0.08),
          );
      }
    }
    // A safe arch offers a recognizable shelter partway down each staircase.
    if (tier === 2) {
      for (const side of [-1, 1])
        add(
          new THREE.CylinderGeometry(2, 3, 11, 8),
          rock,
          V(side * 18, y + 5, z),
          V(1, 1, 1),
          true,
        );
      const curve = new THREE.CatmullRomCurve3(
        Array.from({ length: 17 }, (_, i) =>
          V(
            Math.cos((i / 16) * Math.PI) * 18,
            y + 11 + Math.sin((i / 16) * Math.PI) * 8,
            z,
          ),
        ),
      );
      add(new THREE.TubeGeometry(curve, 24, 2, 7, false), rock);
    }
    if (deep) {
      const light = new THREE.PointLight(
        space.depth > 8000 ? 0x9477fa : 0x57bdbb,
        38,
        52,
        1.2,
      );
      light.position.set(0, y + 5, z);
      group.add(light);
    }
  }
  // Continuous, subtle plankton threads join the landings instead of floating arrows.
  const positions = [];
  for (let i = 0; i < 900; i++) {
    const z = 15 - (i / 900) * 267;
    positions.push(
      Math.sin(z * 0.035) * 12 + Math.sin(i * 2.399) * 7,
      terraceFloor(z) + 7 + Math.sin(i * 1.7) * 3,
      z,
    );
  }
  const plankton = new THREE.Points(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    ),
    new THREE.PointsMaterial({
      color: deep ? 0x86a9ff : 0x8bcdb8,
      size: 0.1,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  );
  group.add(plankton);
  const school = new THREE.InstancedMesh(
    makeFishGeometry(shallow ? "sardine" : "lanternfish"),
    FISH_MATERIAL.clone(),
    360,
  );
  school.frustumCulled = false;
  group.add(school);
  for (const [mat, parts] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.receiveShadow = true;
    group.add(mesh);
    parts.forEach((g) => g.dispose());
  }
  // Existing wrecks and temples survive as side discoveries at the bottom landing.
  let landmark = null;
  if (!["reef", "canyon", "gardens"].includes(space.id)) {
    const pos = space.position
      .clone()
      .add(space.id === "heart" ? V(0, -70, -205) : V(110, -90, -220));
    landmark = buildSpace({ ...space, position: pos, embeddedTerrain: true });
    landmark.group.position.sub(space.position);
    group.add(landmark.group);
    colliders.push(...landmark.colliders);
    boxes.push(...landmark.boxes);
  }
  const guide = blueSquid();
  group.add(guide);
  const whale = makeWhale(space.depth > 1000);
  whale.traverse((o) => {
    if (o.material) o.material = o.material.clone();
  });
  group.add(whale);
  const dummy = new THREE.Object3D();
  group.updateMatrixWorld(true);
  return {
    group,
    colliders,
    boxes,
    animated: [],
    landmark,
    mountains,
    school,
    guide,
    whale,
    glowMaterials,
    dummy,
    space,
    bounds: new THREE.Box3().setFromObject(group),
  };
}
function blueSquid() {
  const g = new THREE.Group(),
    m = new THREE.MeshStandardMaterial({
      color: 0x418ba3,
      emissive: 0x176da5,
      emissiveIntensity: 0.55,
      roughness: 0.35,
    });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), m);
  body.scale.set(0.4, 0.4, 1.35);
  g.add(body);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), m);
    fin.position.set(side * 0.38, 0, 0.7);
    fin.scale.set(0.55, 0.05, 0.55);
    g.add(fin);
  }
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI * 0.2,
      r = i < 8 ? 0.28 : 0.35,
      length = i < 8 ? 1.3 : 2.4;
    const curve = new THREE.CatmullRomCurve3([
      V(Math.cos(a) * r, Math.sin(a) * r, -0.9),
      V(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5, -1.5),
      V(Math.cos(a) * 0.18, Math.sin(a) * 0.18, -1.1 - length),
    ]);
    g.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 10, i < 8 ? 0.055 : 0.035, 5, false),
        m,
      ),
    );
  }
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x020c18,
    roughness: 0.12,
  });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), eyeMat);
    eye.position.set(side * 0.37, 0, -0.8);
    g.add(eye);
  }
  g.scale.setScalar(1.25);
  return g;
}
export function animateTerraces(r, time, player, next) {
  if (r.landmark) animateSpace(r.landmark, time);
  const local = player.clone().sub(r.space.position),
    dest = next.clone().sub(r.space.position);
  // Stay visible ahead of the player, then wait over the next activity.
  const direction = dest.clone().sub(local),
    distance = direction.length();
  const gp = local
    .clone()
    .addScaledVector(direction.normalize(), Math.min(14, distance))
    .add(V(Math.sin(time * 0.7), 2 + Math.sin(time), 0));
  r.guide.position.lerp(gp, 0.035);
  r.guide.lookAt(r.group.localToWorld(dest.clone()));
  r.guide.rotateY(Math.PI);
  r.guide.children[1].rotation.z = Math.sin(time * 5) * 0.2;
  r.guide.children[2].rotation.z = -Math.sin(time * 5) * 0.2;
  const eventPhase = (time % 42) / 42,
    migrating = eventPhase < 0.38;
  for (let i = 0; i < r.school.count; i++) {
    const tier = Math.floor(i / 60),
      a = i * 2.399 + time * 0.23,
      z = -25 - tier * 42;
    const drift = migrating ? Math.sin(time * 0.2 + tier) * 7 : 0;
    r.dummy.position.set(
      Math.cos(a) * (8 + (i % 6)) + drift,
      -tier * 18 + 2 + Math.sin(a * 1.7) * 2,
      z + Math.sin(a) * 9,
    );
    r.dummy.rotation.set(Math.cos(a) * 0.08, -a, 0);
    r.dummy.scale.setScalar(0.6 + (i % 3) * 0.15);
    r.dummy.updateMatrix();
    r.school.setMatrixAt(i, r.dummy.matrix);
  }
  r.school.instanceMatrix.needsUpdate = true;
  // A periodic whale crossing passes over the player's current terrace.
  const crossing = ((time % 52) / 52) * 150 - 75;
  r.whale.position.set(crossing, local.y + 22, local.z - 38);
  r.whale.rotation.y = -Math.PI / 2;
  animateCreature(r.whale, time, 0.7);
}
