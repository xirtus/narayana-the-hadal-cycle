import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeFishGeometry, FISH_MATERIAL } from "../ecology/CreatureModels.js";
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Authorable geometry batches decorations but keeps collision walls independent. */
export function buildSpace(space) {
  const group = new THREE.Group();
  group.name = `Expedition · ${space.name}`;
  group.position.copy(space.position);
  const colliders = [],
    boxes = [],
    animated = [],
    batches = new Map();
  const mat = (color, extra = {}) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.78,
      ...extra,
    });
    if (!extra.emissive && !extra.metalness)
      material.onBeforeCompile = (shader) => {
        shader.vertexShader =
          "varying vec3 vExpeditionP;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvExpeditionP=(modelMatrix*vec4(position,1.)).xyz;",
        );
        shader.fragmentShader =
          "varying vec3 vExpeditionP;\nfloat expeditionGrain(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }\n" +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
        vec3 wp=vExpeditionP;
        float broad=sin(wp.x*.39+sin(wp.z*.51))*sin(wp.y*.43+wp.z*.23);
        float cracks=smoothstep(.96,1.,abs(sin(wp.y*1.4+sin(wp.x*.5)*.1)));
        float grain=expeditionGrain(floor(wp*24.));
        diffuseColor.rgb*=.73+grain*.16+broad*.11;
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.48,.58,.5),cracks*.5);
      `,
        );
      };
    return material;
  };
  const stone = mat(0x6c817d),
    pale = mat(0xb0b9a1),
    dark = mat(0x283e43),
    rust = mat(0x634432),
    steel = mat(0x52686b, { metalness: 0.45, roughness: 0.52 });
  const glow = mat(space.depth >= 8000 ? 0xaa84e0 : 0x70c5bb, {
    emissive: space.depth >= 8000 ? 0x8e54d5 : 0x419caa,
    emissiveIntensity: 0.8,
  });
  const windows = mat(0x366674, { metalness: 0.5, roughness: 0.2 });
  const sand = mat(space.id === "titanic" ? 0x4c514e : 0x7a8166);
  const bounds = new THREE.Box3();
  function add(geo, material, p = V(), rot = V(), solid = false) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(p);
    mesh.rotation.set(rot.x, rot.y, rot.z);
    mesh.updateMatrix();
    if (solid) {
      group.add(mesh);
      colliders.push(mesh);
      const b = new THREE.Box3().setFromObject(mesh);
      b.translate(space.position);
      boxes.push(b);
      // Keep exact raycast geometry; render the static surface in a material batch.
      mesh.visible = false;
    }
    const g = geo.clone().applyMatrix4(mesh.matrix);
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(g);
    if (!solid) geo.dispose();
    return mesh;
  }
  const box = (x, y, z, w, h, d, m = stone, solid = false) =>
    add(new THREE.BoxGeometry(w, h, d), m, V(x, y, z), V(), solid);
  const column = (x, y, z, r, h, m = pale) => {
    if (r > 0.5 && m !== dark) {
      box(x, y + 0.2, z, r * 2.8, 0.45, r * 2.8, m);
      box(x, y + h - 0.2, z, r * 2.7, 0.4, r * 2.7, m);
    }
    return add(
      new THREE.CylinderGeometry(r * 0.88, r, h, 12),
      m,
      V(x, y + h / 2, z),
      V(),
      true,
    );
  };
  const torus = (x, y, z, r, t, m = glow, rot = V()) =>
    add(new THREE.TorusGeometry(r, t, 6, 64), m, V(x, y, z), rot);
  const floor = new THREE.PlaneGeometry(220, 220, 40, 40);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, -8, -25);
  if (!space.embeddedTerrain) add(floor, sand, V(), V(), true);
  else floor.dispose();
  function arch(x, z, w = 9, h = 14, m = pale, y = -8) {
    column(x - w, y, z, 0.9, h, m);
    column(x + w, y, z, 0.9, h, m);
    const points = Array.from({ length: 25 }, (_, i) => {
      const a = (i / 24) * Math.PI;
      return V(x + Math.cos(a) * w, y + h + Math.sin(a) * w * 0.58, z);
    });
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        32,
        0.95,
        7,
        false,
      ),
      m,
      V(),
      V(),
      true,
    );
  }
  function cliff(x, z, height = 50, width = 17) {
    // Physical pillars with faceted faces leave a broad, open canyon down the centre.
    add(
      new THREE.CylinderGeometry(width * 0.6, width, height, 7),
      dark,
      V(x, height / 2 - 8, z),
      V(0.03, 0, x < 0 ? -0.07 : 0.07),
      true,
    );
    for (let j = 0; j < 5; j++)
      box(
        x + (x < 0 ? 1 : -1) * width * 0.55,
        (j * height) / 5 - 5,
        z,
        width * 0.5,
        1.4,
        22,
        stone,
      );
  }
  function wreck(x, z, length = 55, width = 14, titanic = false) {
    const sides = 18,
      sections = 24,
      positions = [],
      indices = [];
    for (let j = 0; j <= sections; j++) {
      const t = j / sections,
        breadth = (Math.sin(Math.PI * (0.08 + t * 0.82)) ** 0.65 * width) / 2;
      for (let i = 0; i <= sides; i++) {
        const a = Math.PI + (i / sides) * Math.PI;
        positions.push(
          x + Math.cos(a) * breadth,
          -6 + Math.sin(a) * 9,
          z + (t - 0.5) * length,
        );
        if (j < sections && i < sides) {
          const k = j * (sides + 1) + i;
          indices.push(
            k,
            k + 1,
            k + sides + 1,
            k + 1,
            k + sides + 2,
            k + sides + 1,
          );
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setIndex(indices);
    geo.computeVertexNormals();
    // The open hull and ribs are swimmable; separate side walls and decks carry collision.
    add(geo, rust, V());
    for (const side of [-1, 1]) {
      box(x + side * width * 0.45, -1, z, 1, 12, length * 0.78, rust, true);
      for (let j = 0; j < 18; j++) {
        const zz = z - length * 0.36 + j * length * 0.043;
        box(x + side * width * 0.43, 5, zz, 0.15, 2, 0.15, steel);
        add(
          new THREE.CylinderGeometry(0.1, 0.045, 0.5 + (j % 5) * 0.5, 5),
          rust,
          V(x + side * width * 0.44, 3, zz),
        );
      }
      box(x + side * width * 0.43, 6, z, 0.12, 0.12, length * 0.8, steel);
    }
    // Deck strips leave a central open companionway and visible broken deck cavities.
    for (const side of [-1, 1])
      box(
        x + side * width * 0.3,
        2,
        z,
        width * 0.29,
        0.6,
        length * 0.7,
        rust,
        true,
      );
    box(x, 6, z + length * 0.16, width * 0.7, 5, length * 0.22, steel, true);
    for (let i = 0; i < 12; i++)
      box(
        x - width * 0.28 + i * width * 0.05,
        7,
        z + length * 0.045,
        0.38,
        0.55,
        0.08,
        dark,
      );
    for (let j = 0; j < (titanic ? 3 : 1); j++) {
      const zz = z + length * 0.15 + j * 8;
      add(
        new THREE.CylinderGeometry(1.4, 1.7, 4, 14, 1, true),
        rust,
        V(x, 10, zz),
        V(0.15, 0, 0.15),
      );
    }
    add(
      new THREE.CylinderGeometry(0.2, 0.45, 16, 8),
      rust,
      V(x, 4, z - length * 0.3),
      V(0.3, 0, 0.24),
    );
    for (let i = 0; i < 35; i++) {
      const zz = z - length * 0.6 + (i % 10) * length * 0.13,
        xx = x + Math.sin(i * 2.4) * (width + 9);
      box(xx, -7, zz, 1 + (i % 4), 0.4, 1.5, rust);
    }
    if (titanic) {
      for (let i = 0; i < 4; i++)
        add(
          new THREE.CylinderGeometry(2, 2, 6, 16),
          rust,
          V(x + 20 + (i % 2) * 5, -5, z + 40 + Math.floor(i / 2) * 8),
          V(Math.PI / 2, 0, 0),
        );
      // Rusticles hang from the preserved bow rails, not intact modern funnels.
      for (let i = 0; i < 100; i++)
        add(
          new THREE.ConeGeometry(0.12, 0.8 + (i % 7) * 0.22, 5),
          rust,
          V(
            x + (i % 2 ? 1 : -1) * (width * 0.45),
            0.5,
            z - length * 0.36 + (i / 100) * length * 0.72,
          ),
          V(Math.PI, 0, 0),
        );
    }
  }
  function temple() {
    for (const z of [-26, -74]) {
      const light = new THREE.PointLight(
        space.id === "naga" ? 0xa179d0 : 0x69bac3,
        85,
        75,
        1.3,
      );
      light.position.set(0, 16, z);
      group.add(light);
    }
    add(
      new THREE.ConeGeometry(10, 16, 4),
      pale,
      V(0, 36, -83),
      V(0, Math.PI / 4, 0),
    );

    for (const side of [-1, 1]) {
      for (let j = 0; j < 9; j++)
        arch(side * 38, -85 + j * 17, 6, 13, pale, -8);
      box(side * 38, 11, -17, 15, 1.4, 145, pale, true);
    }
    for (let j = 0; j < 4; j++) {
      const y = j * 8,
        span = 48 - j * 9,
        z = -83;
      box(0, y - 6, z, span, 2, span * 0.7, pale, true);
      for (let k = 0; k < 6 - j; k++)
        for (const side of [-1, 1])
          column(
            -span * 0.38 + (k * span * 0.76) / (5 - j),
            y - 5,
            z + side * span * 0.24,
            0.75,
            7,
            pale,
          );
      box(0, y + 2, z, span * 0.95, 0.9, span * 0.67, pale, true);
    }
    torus(0, 0, -28, 20, 0.55, pale, V(Math.PI / 2, 0, 0));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (Math.abs(Math.cos(a) * 20) > 4)
        column(Math.cos(a) * 20, -8, -28 + Math.sin(a) * 20, 0.7, 12, pale);
    }
    for (let i = 0; i < 3; i++) arch(0, -5 - i * 25, 9, 13, stone);
    for (const side of [-1, 1])
      for (let i = 0; i < 7; i++)
        box(side * (30 + i * 4), -7 + i * 0.16, 5, 3, 0.7, 10, pale, true);
  }
  if (space.id === "city") {
    for (const side of [-1, 1])
      for (let j = 0; j < 5; j++) {
        const x = side * (24 + (j % 2) * 5),
          z = 15 - j * 24,
          h = 15 + (j % 3) * 5;
        box(x, h / 2 - 8, z, 16, h, 17, stone, true);
        box(x, h - 7, z, 17, 0.8, 18, pale);
        for (let floor = 0; floor < Math.floor(h / 3); floor++)
          for (let w = 0; w < 4; w++) {
            box(
              x + side * 8.04,
              -5 + floor * 3,
              z - 6 + w * 4,
              0.08,
              1.7,
              1.8,
              windows,
            );
            box(
              x - 6 + w * 4,
              -5 + floor * 3,
              z + 8.55,
              1.8,
              1.7,
              0.08,
              windows,
            );
          }
        for (let f = 0; f < 4; f++)
          box(x, -5 + f * 4, z + 8.7, 16, 0.18, 0.3, steel);
      }
    // Road paint, broken cars, tram rails and signal masts make the era readable.
    box(0, -7.85, -30, 28, 0.12, 150, dark);
    for (let j = 0; j < 25; j++)
      box(0, -7.73, 25 - j * 6, 0.16, 0.03, 2.7, pale);
    for (const side of [-1, 1])
      box(side * 5, -7.67, -30, 0.12, 0.08, 150, steel);
    for (let i = 0; i < 7; i++) {
      const x = i % 2 ? 10 : -11,
        z = 12 - i * 15;
      box(x, -6.9, z, 2.8, 1.2, 5, steel, true);
      box(x, -6, z + 0.2, 2.4, 0.85, 2.5, windows, true);
      column(x * 1.55, -8, z, 0.12, 7, steel);
      box(x * 1.55, 0, z, 0.5, 1.2, 0.5, dark);
      box(x * 1.55, -0.1, z + 0.27, 0.25, 0.25, 0.07, glow);
    }
    box(-43, -5, -51, 14, 6, 12, dark, true);
    arch(-43, -40, 6, 7, stone);
    box(0, 5, -48, 20, 1.5, 9, stone, true);
    for (const side of [-1, 1]) column(side * 9, -8, -48, 0.8, 13);
  } else if (space.id === "wrecks") {
    wreck(-28, -20, 65, 15);
    wreck(32, -47, 48, 14);
    wreck(-40, -95, 38, 12);
  } else if (space.id === "titanic") {
    wreck(-23, -22, 112, 26, true);
    wreck(45, -103, 48, 28, true);
    for (let i = 0; i < 80; i++)
      box(
        Math.sin(i * 2.4) * 70,
        -7.5,
        -120 + (i % 25) * 6,
        1 + (i % 3),
        0.25,
        1.5,
        rust,
      );
  } else if (["atlantis", "naga"].includes(space.id)) temple();
  else if (space.id === "caves") {
    // The tunnel is a real open tube; its ceiling and walls collide, both ends remain open.
    for (let j = 0; j < 8; j++) {
      const z = 12 - j * 13;
      cliff(-17, z, 32, 9);
      cliff(17, z, 32, 9);
      box(0, 22, z, 44, 7, 14, dark, true);
      for (let k = 0; k < 4; k++)
        add(
          new THREE.ConeGeometry(0.5, 2 + k, 6),
          stone,
          V(-10 + k * 7, 18, z),
          V(Math.PI, 0, 0),
        );
      arch(0, z, 12, 14, dark, -8);
    }
  } else if (["canyon", "vents", "hollow"].includes(space.id)) {
    for (let j = 0; j < 7; j++)
      for (const side of [-1, 1])
        cliff(
          side * (29 + Math.sin(j) * 6),
          25 - j * 20,
          space.id === "hollow" ? 130 : 65 + Math.sin(j) * 18,
          13,
        );
    if (space.id === "vents")
      for (let j = 0; j < 10; j++) {
        const x = j % 2 ? 18 : -18,
          z = 15 - j * 12;
        column(x, -8, z, 2, 12 + (j % 4) * 3, dark);
        torus(x, 5 + (j % 4) * 3, z, 1.8, 0.16, glow, V(Math.PI / 2, 0, 0));
        const smoke = new THREE.Points(
          new THREE.BufferGeometry().setAttribute(
            "position",
            new THREE.Float32BufferAttribute(
              Array.from({ length: 90 }, (_, i) =>
                i % 3 === 1 ? (i % 30) * 0.7 : Math.sin(i * 2.4) * 2,
              ),
              3,
            ),
          ),
          new THREE.PointsMaterial({
            color: 0x263137,
            size: 1.4,
            transparent: true,
            opacity: 0.38,
            depthWrite: false,
          }),
        );
        smoke.position.set(x, 7, z);
        group.add(smoke);
        animated.push({ mesh: smoke, kind: "smoke" });
      }
    if (space.id === "hollow")
      for (let i = 0; i < 4; i++) torus(0, 8, -i * 25, 17, 0.15, glow);
  }
  if (space.id === "heart") {
    for (let i = 0; i < 10; i++)
      arch((i % 2 ? 1 : -1) * 35, 10 - Math.floor(i / 2) * 24, 8, 30, stone);
    const black = new THREE.Mesh(
      new THREE.SphereGeometry(12, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x000002 }),
    );
    black.position.set(0, 12, -100);
    group.add(black);
    const disk = new THREE.Mesh(
      new THREE.RingGeometry(14, 30, 128, 6),
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: { time: { value: 0 } },
        vertexShader:
          "varying vec2 p; void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          "uniform float time; varying vec2 p; void main(){float r=length(p);float a=atan(p.y,p.x);float bands=.55+.45*sin(r*5.-a*3.-time*1.8);float edge=smoothstep(30.,22.,r)*smoothstep(14.,16.,r);vec3 color=mix(vec3(.28,.12,.65),vec3(1.,.6,.22),bands);gl_FragColor=vec4(color*(.7+bands),edge*.8);}",
      }),
    );
    disk.position.copy(black.position);
    disk.rotation.x = 1.12;
    group.add(disk);
    animated.push({ mesh: disk, kind: "disk" });
    for (let i = 0; i < 3; i++)
      torus(
        0,
        12,
        -100,
        13 + i * 0.35,
        0.08,
        glow,
        V(0.35 + i * 0.6, 0.3 * i, 0),
      );
    const light = new THREE.PointLight(0xc795ed, 100, 100, 1.3);
    light.position.set(0, 17, -78);
    group.add(light);
  }
  // Species-shaped schools, fans, sponges and low benthos soften architectural silhouettes.
  for (let i = 0; i < 90; i++) {
    const x = Math.sin(i * 2.399) * (25 + (i % 7) * 5),
      z = 20 - (i % 21) * 7;
    if (Math.abs(x) < 15) continue;
    if (space.depth < 250) {
      for (let branch = 0; branch < 3; branch++) {
        const points = [
          V(x, -8, z),
          V(x + 0.5, -6, z + 0.2),
          V(x + Math.sin(i + branch) * 2, -3 - branch, z + 0.7),
        ];
        add(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(points),
            8,
            0.1,
            5,
            false,
          ),
          i % 2 ? stone : glow,
        );
      }
    } else {
      add(
        new THREE.CylinderGeometry(0.25, 0.4, 1 + (i % 4) * 0.5, 7, 1, true),
        i % 4 ? stone : glow,
        V(x, -7, z),
      );
    }
  }
  const fish = new THREE.InstancedMesh(
    makeFishGeometry(space.depth < 250 ? "sardine" : "lanternfish"),
    FISH_MATERIAL.clone(),
    160,
  );
  fish.frustumCulled = false;
  group.add(fish);
  animated.push({ mesh: fish, kind: "school" });
  for (const [material, parts] of batches) {
    parts.forEach((g) => g.deleteAttribute("uv"));
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    mesh.receiveShadow = true;
    group.add(mesh);
    parts.forEach((g) => g.dispose());
  }
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  group.updateMatrixWorld(true);
  bounds.setFromObject(group);
  return { group, colliders, boxes, animated, bounds };
}
export function animateSpace(record, time) {
  const dummy = new THREE.Object3D();
  for (const a of record.animated) {
    if (a.kind === "disk") a.mesh.material.uniforms.time.value = time;
    if (a.kind === "smoke") a.mesh.rotation.y = time * 0.08;
    if (a.kind === "school") {
      for (let i = 0; i < a.mesh.count; i++) {
        const school = Math.floor(i / 40),
          phase = time * 0.16 + i * 0.55,
          r = 5 + (i % 7) * 0.5;
        dummy.position.set(
          (school % 2 ? 1 : -1) * 18 + Math.cos(phase) * r,
          3 + school * 2 + Math.sin(i * 2.4 + time) * 0.6,
          -school * 23 + Math.sin(phase) * r,
        );
        dummy.rotation.set(0, -phase, Math.sin(time + i) * 0.08);
        dummy.scale.setScalar(0.65 + (i % 3) * 0.18);
        dummy.updateMatrix();
        a.mesh.setMatrixAt(i, dummy.matrix);
      }
      a.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
export function disposeSpace(record) {
  record.group.removeFromParent();
  const gs = new Set(),
    ms = new Set();
  record.group.traverse((o) => {
    if (o.geometry) gs.add(o.geometry);
    if (o.material) ms.add(o.material);
    if (o.isLight) o.dispose?.();
  });
  gs.forEach((g) => g.dispose());
  ms.forEach((m) => m.dispose());
}
