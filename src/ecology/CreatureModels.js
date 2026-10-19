import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const skin = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.39,
  metalness: 0.09,
});
const soft = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.66,
  metalness: 0,
});
const luminous = new THREE.MeshStandardMaterial({
  vertexColors: true,
  emissive: 0x4dcac5,
  emissiveIntensity: 0.55,
  roughness: 0.3,
});
const jelly = new THREE.MeshPhysicalMaterial({
  color: 0xd69966,
  transparent: true,
  opacity: 0.45,
  roughness: 0.18,
  metalness: 0,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const black = new THREE.Color(0x071413);
const colors = new Map();
function color(hex) {
  if (!colors.has(hex)) colors.set(hex, new THREE.Color(hex));
  return colors.get(hex);
}
function tint(geometry, hex) {
  const p = geometry.attributes.position,
    c = new Float32Array(p.count * 3),
    base = color(hex);
  for (let i = 0; i < p.count; i++) base.toArray(c, i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return geometry;
}
function sphere(x, y, z, sx, sy, sz, hex, rough = 0) {
  const g = new THREE.SphereGeometry(1, 18, 12),
    p = g.attributes.position;
  if (rough)
    for (let i = 0; i < p.count; i++) {
      const d =
        1 + rough * Math.sin(p.getX(i) * 83 + p.getY(i) * 67 + p.getZ(i) * 103);
      p.setXYZ(i, p.getX(i) * d, p.getY(i) * d, p.getZ(i) * d);
    }
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return tint(g, hex);
}
function tube(points, radius, hex, segments = 20) {
  return tint(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
      segments,
      radius,
      5,
      false,
    ),
    hex,
  );
}
function mergeParts(parts) {
  const ready = parts.map((p) => {
    p.deleteAttribute("uv");
    return p.index ? p.toNonIndexed() : p;
  });
  const geometry = mergeGeometries(ready, false);
  new Set([...parts, ...ready]).forEach((p) => p.dispose());
  return geometry;
}
function combine(parts, material = skin) {
  const mesh = new THREE.Mesh(mergeParts(parts), material);
  mesh.castShadow = false;
  return mesh;
}

// A longitudinal surface, built from an anatomical body profile. Head faces local -Z.
function body(profile, upper, lower, pattern = "plain", sides = 28) {
  const positions = [],
    normals = [],
    cs = [],
    indices = [],
    u = color(upper),
    l = color(lower),
    tmp = new THREE.Color();
  for (let j = 0; j < profile.length; j++) {
    const [z, rx, ry, cy = 0] = profile[j];
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2,
        x = Math.cos(a) * rx,
        y = Math.sin(a) * ry;
      positions.push(x, y + cy, z);
      normals.push(Math.cos(a), Math.sin(a), 0);
      tmp.copy(l).lerp(u, THREE.MathUtils.smoothstep(Math.sin(a), -0.3, 0.52));
      let spot = 1;
      if (pattern === "seal")
        spot =
          0.83 + 0.17 * Math.sin(x * 55 + z * 13) * Math.sin(y * 33 + z * 22);
      if (pattern === "leopard")
        spot =
          Math.sin(z * 10 + Math.sin(a * 5) * 0.8) > 0.25 && Math.sin(a) > 0.1
            ? 0.3
            : 1;
      if (pattern === "fur")
        spot = 0.84 + 0.16 * Math.sin(x * 167 + y * 113 + z * 87);
      if (pattern === "scales")
        spot = 0.87 + 0.13 * Math.sin(z * 55 + Math.floor(a * 24) * 1.5);
      tmp.multiplyScalar(spot);
      cs.push(tmp.r, tmp.g, tmp.b);
      if (j < profile.length - 1 && i < sides) {
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
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cs, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function fin(points, hex, vertical = false) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) shape.lineTo(...points[i]);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape, 10),
    p = g.attributes.position;
  if (!vertical)
    for (let i = 0; i < p.count; i++)
      p.setXYZ(i, p.getX(i), Math.sin(p.getX(i) * 2) * 0.025, p.getY(i));
  else for (let i = 0; i < p.count; i++) p.setXYZ(i, 0, p.getX(i), p.getY(i));
  g.computeVertexNormals();
  return tint(g, hex);
}
const finMat = skin.clone();
finMat.side = THREE.DoubleSide;
function eyes(parts, x, y, z, r = 0.055, iris = 0x987e48) {
  for (const side of [-1, 1]) {
    parts.push(sphere(side * x, y, z, r * 0.53, r, r, iris));
    parts.push(
      sphere(
        side * (x + r * 0.4),
        y,
        z - 0.009,
        r * 0.18,
        r * 0.72,
        r * 0.72,
        0x030b0d,
      ),
    );
    parts.push(
      sphere(
        side * (x + r * 0.51),
        y + r * 0.25,
        z - r * 0.18,
        r * 0.07,
        r * 0.14,
        r * 0.16,
        0xe0eee1,
      ),
    );
  }
}
function articulatedFin(group, points, hex, pos, kind, vertical = false) {
  const m = new THREE.Mesh(fin(points, hex, vertical), finMat);
  m.position.set(...pos);
  m.userData.kind = kind;
  group.add(m);
  return m;
}
function whiskers(parts, z, y, width, scale = 1) {
  for (const side of [-1, 1])
    for (let i = 0; i < 5; i++)
      parts.push(
        tube(
          [
            [side * width, y + (i - 2) * 0.019, z],
            [side * (width + 0.14 * scale), y + (i - 2) * 0.033, z - 0.04],
            [
              side * (width + 0.31 * scale),
              y + (i - 2) * 0.052,
              z + 0.02 + i * 0.016,
            ],
          ],
          0.0025 * scale,
          0xbbba9d,
          5,
        ),
      );
}

export function makePinniped(kind = "seal") {
  const group = new THREE.Group(),
    seaLion = kind === "sea-lion",
    parts = [];
  const upper = seaLion ? 0x695643 : 0x737c73,
    lower = seaLion ? 0x9b8e71 : 0xbbc2aa;
  parts.push(
    body(
      [
        [-1.35, 0.015, 0.035, 0.12],
        [-1.28, 0.17, 0.12, 0.12],
        [-1.1, 0.29, 0.24, 0.12],
        [-0.87, 0.3, 0.31, 0.07],
        [-0.63, 0.32, 0.38, 0.015],
        [-0.3, 0.4, 0.45, 0],
        [0.1, 0.43, 0.44, 0],
        [0.5, 0.35, 0.37, 0],
        [0.9, 0.21, 0.23, -0.035],
        [1.17, 0.09, 0.1, -0.04],
        [1.3, 0.025, 0.035, -0.03],
      ],
      upper,
      lower,
      seaLion ? "plain" : "seal",
    ),
  );
  parts.push(sphere(0, 0.15, -1.32, 0.12, 0.072, 0.09, 0x262b25));
  eyes(parts, 0.235, 0.22, -1.12, 0.049, 0x443d29);
  whiskers(parts, -1.3, 0.065, 0.13, 1);
  if (seaLion)
    for (const s of [-1, 1])
      parts.push(sphere(s * 0.29, 0.21, -0.83, 0.054, 0.082, 0.03, upper));
  group.add(combine(parts));
  for (const s of [-1, 1]) {
    articulatedFin(
      group,
      [
        [0, -0.12],
        [s * 0.2, -0.19],
        [s * (seaLion ? 0.85 : 0.48), 0.15],
        [s * (seaLion ? 0.79 : 0.43), 0.36],
        [s * 0.17, 0.28],
      ],
      upper,
      [s * 0.29, -0.14, -0.35],
      "fore",
    );
    articulatedFin(
      group,
      [
        [0, -0.1],
        [s * 0.15, 0.025],
        [s * 0.37, 0.4],
        [s * 0.27, 0.47],
        [s * 0.045, 0.38],
      ],
      upper,
      [s * 0.04, -0.04, 1.16],
      "rear",
    );
  }
  group.userData.animation = seaLion ? "sea-lion" : "seal";
  return group;
}

export function makeOtter() {
  const g = new THREE.Group(),
    p = [],
    fur = 0x514134,
    light = 0xaea58b;
  p.push(
    body(
      [
        [-0.75, 0.03, 0.045],
        [-0.65, 0.17, 0.16],
        [-0.45, 0.2, 0.23],
        [-0.15, 0.3, 0.27],
        [0.15, 0.29, 0.27],
        [0.45, 0.23, 0.19],
        [0.61, 0.12, 0.1],
        [0.7, 0.025, 0.03],
      ],
      fur,
      0x7b6850,
      "fur",
    ),
  );
  p.push(sphere(0, 0.16, -0.64, 0.22, 0.215, 0.22, light, 0.018));
  p.push(sphere(-0.074, 0.115, -0.827, 0.08, 0.056, 0.045, 0xb8b096));
  p.push(sphere(0.074, 0.115, -0.827, 0.08, 0.056, 0.045, 0xb8b096));
  p.push(sphere(0, 0.15, -0.875, 0.058, 0.038, 0.026, 0x191d17));
  eyes(p, 0.155, 0.242, -0.744, 0.026, 0x2a2419);
  whiskers(p, -0.862, 0.106, 0.075, 0.8);
  for (const s of [-1, 1]) {
    p.push(sphere(s * 0.18, 0.22, -0.57, 0.055, 0.071, 0.043, 0x675641));
    // Small forepaws lie folded above the belly; broad webbed hind feet paddle independently.
    p.push(sphere(s * 0.18, 0.235, -0.2, 0.074, 0.09, 0.13, fur, 0.02));
    p.push(sphere(s * 0.108, 0.302, -0.31, 0.064, 0.046, 0.086, 0x3b3229));
    articulatedFin(
      g,
      [
        [0, 0],
        [s * 0.07, -0.05],
        [s * 0.24, 0.06],
        [s * 0.28, 0.24],
        [s * 0.1, 0.29],
        [0, 0.11],
      ],
      fur,
      [s * 0.13, -0.04, 0.55],
      "rear",
    );
  }
  p.push(
    tube(
      [
        [0, -0.02, 0.55],
        [0, -0.05, 0.8],
        [0.04, -0.09, 0.99],
        [0.07, -0.09, 1.07],
      ],
      0.046,
      fur,
    ),
  );
  // Fine irregular guard-hair silhouette, merged into the body draw call.
  for (let i = 0; i < 72; i++) {
    const a = i * 2.399,
      z = -0.45 + ((i % 17) / 17) * 0.98,
      x = Math.cos(a) * 0.27,
      y = Math.sin(a) * 0.25;
    p.push(
      tube(
        [
          [x, y, z],
          [x * 1.07, y * 1.07, z + 0.02],
        ],
        0.0025,
        0x74604a,
        1,
      ),
    );
  }
  g.add(combine(p, soft));
  g.userData.animation = "otter";
  return g;
}

export function makeShark(kind = "leopard") {
  const g = new THREE.Group(),
    p = [];
  p.push(
    body(
      [
        [-1.7, 0.015, 0.015],
        [-1.55, 0.16, 0.08],
        [-1.25, 0.26, 0.18],
        [-0.85, 0.32, 0.25],
        [-0.3, 0.31, 0.25],
        [0.3, 0.25, 0.22],
        [0.9, 0.16, 0.15],
        [1.45, 0.066, 0.08],
        [1.7, 0.035, 0.055],
      ],
      kind === "leopard" ? 0x9d9981 : 0x3b525b,
      kind === "leopard" ? 0xd5d2b5 : 0xc2cec8,
      kind === "leopard" ? "leopard" : "plain",
    ),
  );
  eyes(p, 0.236, 0.055, -1.26, 0.037);
  for (const s of [-1, 1])
    for (let i = 0; i < 5; i++)
      p.push(
        tube(
          [
            [s * (0.3 - i * 0.004), 0.12, -0.76 + i * 0.061],
            [s * (0.32 - i * 0.002), -0.025, -0.74 + i * 0.061],
            [s * 0.27, -0.11, -0.72 + i * 0.061],
          ],
          0.006,
          0x565648,
          5,
        ),
      );
  g.add(combine(p));
  articulatedFin(
    g,
    [
      [0, -0.37],
      [0.06, -0.27],
      [0.59, 0.06],
      [0.46, 0.19],
      [0, 0.17],
    ],
    0x777865,
    [0, 0.2, -0.1],
    "dorsal",
    true,
  );
  articulatedFin(
    g,
    [
      [0, -0.12],
      [0.26, 0.04],
      [0, 0.24],
    ],
    0x777865,
    [0, 0.13, 0.96],
    "dorsal",
    true,
  );
  for (const s of [-1, 1])
    articulatedFin(
      g,
      [
        [0, -0.15],
        [s * 0.11, -0.2],
        [s * 0.86, 0.41],
        [s * 0.57, 0.42],
        [s * 0.07, 0.15],
      ],
      0x9a977e,
      [s * 0.2, -0.13, -0.48],
      "pectoral",
    );
  articulatedFin(
    g,
    [
      [0, -0.1],
      [0.64, 0.45],
      [0.72, 0.83],
      [0.37, 0.64],
      [0.07, 0.34],
      [-0.27, 0.6],
      [-0.38, 0.59],
      [-0.12, 0.18],
    ],
    0x92917b,
    [0, 0, 1.61],
    "tail",
    true,
  );
  g.userData.animation = "fish";
  return g;
}

export function makeRay() {
  const g = new THREE.Group(),
    p = [];
  p.push(
    body(
      [
        [-0.62, 0.055, 0.045],
        [-0.52, 0.22, 0.1],
        [-0.3, 0.35, 0.16],
        [0.1, 0.38, 0.15],
        [0.37, 0.16, 0.09],
        [0.5, 0.04, 0.035],
      ],
      0x424d47,
      0xb4baa5,
    ),
  );
  eyes(p, 0.19, 0.126, -0.39, 0.031);
  p.push(
    tube(
      [
        [0, 0, 0.4],
        [0, -0.015, 0.95],
        [0.03, -0.025, 1.5],
        [0.11, -0.01, 2.3],
      ],
      0.018,
      0x454e46,
    ),
  );
  g.add(combine(p));
  for (const s of [-1, 1])
    articulatedFin(
      g,
      [
        [0, -0.51],
        [s * 0.37, -0.46],
        [s * 1.28, -0.06],
        [s * 1.45, 0.13],
        [s * 1.18, 0.36],
        [s * 0.46, 0.46],
        [0, 0.3],
      ],
      0x657069,
      [s * 0.14, 0, 0],
      "wing",
    );
  g.userData.animation = "ray";
  return g;
}

export function makeWhale(sperm = false) {
  const g = new THREE.Group(),
    p = [];
  const profile = sperm
    ? [
        [-4.7, 0.45, 0.86, 0.3],
        [-4.55, 1.05, 1.15, 0.3],
        [-3.6, 1.2, 1.22, 0.3],
        [-2, 1.12, 1.2, 0.15],
        [0, 0.95, 1.05],
        [2, 0.68, 0.72],
        [3.8, 0.3, 0.36],
        [5, 0.13, 0.17],
      ]
    : [
        [-4.5, 0.04, 0.04],
        [-4.22, 0.48, 0.45],
        [-3.4, 0.99, 0.8],
        [-2.2, 1.05, 1.05],
        [-0.5, 0.96, 0.98],
        [1.3, 0.78, 0.82],
        [2.8, 0.47, 0.53],
        [4, 0.19, 0.22],
        [4.5, 0.11, 0.14],
      ];
  p.push(body(profile, 0x364e52, sperm ? 0x76847d : 0x9faba1));
  eyes(p, sperm ? 1.11 : 0.91, -0.13, sperm ? -2.5 : -3, 0.07, 0x5b5540);
  if (!sperm) {
    for (let i = -4; i <= 4; i++)
      p.push(
        tube(
          [
            [i * 0.09, -0.34, -4.16],
            [i * 0.19, -0.84, -3.4],
            [i * 0.19, -1.03, -2.2],
            [i * 0.13, -0.93, -0.8],
          ],
          0.014,
          0x677e7c,
          15,
        ),
      );
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      p.push(
        sphere(
          Math.cos(a) * 0.67,
          Math.sin(a) * 0.36,
          -3.88,
          0.07,
          0.063,
          0.072,
          0x728780,
        ),
      );
    }
  }
  g.add(combine(p));
  for (const s of [-1, 1]) {
    articulatedFin(
      g,
      [
        [0, -0.4],
        [s * 0.24, -0.54],
        [s * (sperm ? 1.3 : 2.85), 0.25],
        [s * (sperm ? 1.4 : 3.1), 0.75],
        [s * (sperm ? 0.7 : 2.15), 0.84],
        [s * 0.27, 0.31],
      ],
      sperm ? 0x647670 : 0xc3ccba,
      [s * 0.85, -0.4, -1.7],
      "pectoral",
    );
    articulatedFin(
      g,
      [
        [0, -0.19],
        [s * 0.7, -0.24],
        [s * 1.8, -0.65],
        [s * 2.02, -0.42],
        [s * 1.4, 0.33],
        [s * 0.33, 0.51],
        [0, 0.34],
      ],
      0x4d6768,
      [0, 0, sperm ? 4.9 : 4.43],
      "fluke",
    );
  }
  articulatedFin(
    g,
    [
      [0, -0.4],
      [0.45, 0.15],
      [0.28, 0.5],
      [0, 0.5],
    ],
    0x435d5d,
    [0, 0.66, 1.6],
    "dorsal",
    true,
  );
  g.userData.animation = "whale";
  return g;
}

export function makeFishGeometry(kind = "sardine") {
  const wide = kind === "rockfish",
    deep = kind === "lanternfish" || kind === "bristlemouth",
    parts = [];
  parts.push(
    body(
      [
        [-0.53, 0.012, 0.016],
        [-0.42, 0.075, 0.083],
        [-0.2, wide ? 0.14 : 0.09, wide ? 0.21 : 0.13],
        [0.07, wide ? 0.13 : 0.08, wide ? 0.19 : 0.115],
        [0.32, 0.035, 0.045],
        [0.42, 0.014, 0.023],
      ],
      wide ? 0x777956 : deep ? 0x152935 : 0x467f83,
      wide ? 0xaca67c : deep ? 0x394a59 : 0xc5d4bf,
      "scales",
      12,
    ),
  );
  parts.push(
    fin(
      [
        [0, 0.31],
        [0.17, 0.57],
        [0.045, 0.5],
        [0, 0.46],
        [-0.045, 0.5],
        [-0.17, 0.57],
      ],
      wide ? 0x848354 : 0x7daca5,
      true,
    ),
  );
  const dorsal = fin(
    [
      [0, -0.2],
      [wide ? 0.19 : 0.1, -0.08],
      [0.05, 0.19],
      [0, 0.25],
    ],
    wide ? 0x82875a : 0x829f8d,
    true,
  );
  dorsal.translate(0, wide ? 0.15 : 0.1, 0);
  parts.push(dorsal);
  eyes(parts, wide ? 0.096 : 0.068, 0.038, -0.39, 0.024, 0xcfb765);
  if (deep) {
    for (const part of parts)
      part.setAttribute(
        "preyLight",
        new THREE.Float32BufferAttribute(
          new Float32Array(part.attributes.position.count),
          1,
        ),
      );
    for (const side of [-1, 1])
      for (let i = 0; i < 8; i++) {
        const z = -0.29 + i * 0.078,
          radius = 0.058 * (1 - Math.max(0, z) * 1.6);
        const light = sphere(
          side * radius,
          -0.085 + Math.max(0, z) * 0.15,
          z,
          0.012,
          0.013,
          0.017,
          0x8adeeb,
        );
        light.setAttribute(
          "preyLight",
          new THREE.Float32BufferAttribute(
            new Float32Array(light.attributes.position.count).fill(1),
            1,
          ),
        );
        parts.push(light);
      }
  }
  return mergeParts(parts);
}

export function makeJelly() {
  const g = new THREE.Group(),
    bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
      jelly,
    );
  g.add(bell);
  const parts = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2,
      pts = [];
    for (let j = 0; j < 14; j++) {
      const q = j / 13;
      pts.push([
        Math.cos(a) * (0.5 + q * 0.14) + Math.sin(q * 8 + a) * q * 0.13,
        -0.1 - q * (1.3 + (i % 3) * 0.45),
        Math.sin(a) * (0.5 + q * 0.14) + Math.cos(q * 8 + a) * q * 0.13,
      ]);
    }
    parts.push(tube(pts, 0.008, 0xc5a37c));
  }
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI * 0.5,
      pts = [];
    for (let j = 0; j < 15; j++) {
      const q = j / 14;
      pts.push([
        Math.cos(a + q * 5) * (0.08 + q * 0.17),
        -0.1 - q * 1.35,
        Math.sin(a + q * 5) * (0.08 + q * 0.17),
      ]);
    }
    parts.push(tube(pts, 0.045, 0xcda574));
  }
  const arms = combine(parts, soft);
  g.add(arms);
  g.userData.animation = "jelly";
  return g;
}

export function makeDeepCreature(kind) {
  if (kind === "sperm-whale") return makeWhale(true);
  if (kind === "sea-nettle") return makeJelly();
  const g = new THREE.Group(),
    p = [];
  if (kind === "dumbo" || kind === "vampire-squid") {
    const c = kind === "dumbo" ? 0xc4a1ac : 0x622e3b;
    p.push(sphere(0, 0.11, -0.23, 0.3, 0.36, 0.41, c));
    eyes(p, 0.255, 0.035, -0.41, 0.081, 0x64878b);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI * 0.25,
        pts = [];
      for (let j = 0; j < 9; j++) {
        const q = j / 8;
        pts.push([
          Math.cos(a) * (0.17 + q * 0.37),
          -0.12 - q * 0.5,
          Math.sin(a) * (0.17 + q * 0.37) + 0.1 + q * 0.13,
        ]);
      }
      p.push(tube(pts, 0.041, c, 15));
      const a2 = a + Math.PI * 0.25;
      const v = [
        Math.cos(a) * 0.16,
        -0.11,
        Math.sin(a) * 0.16 + 0.1,
        Math.cos(a) * 0.52,
        -0.59,
        Math.sin(a) * 0.52 + 0.2,
        Math.cos(a2) * 0.52,
        -0.59,
        Math.sin(a2) * 0.52 + 0.2,
        Math.cos(a2) * 0.16,
        -0.11,
        Math.sin(a2) * 0.16 + 0.1,
      ];
      const web = new THREE.BufferGeometry();
      web.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      web.setIndex([0, 1, 2, 0, 2, 3]);
      web.computeVertexNormals();
      p.push(tint(web, c));
    }
    if (kind === "vampire-squid")
      for (const s of [-1, 1])
        p.push(
          tube(
            [
              [s * 0.15, -0.13, 0.12],
              [s * 0.45, -0.42, 0.3],
              [s * 0.62, -1.3, 0.45],
              [s * 0.52, -1.9, 0.7],
            ],
            0.004,
            0xbb9692,
          ),
        );
    for (const s of [-1, 1])
      articulatedFin(
        g,
        [
          [0, -0.14],
          [s * 0.22, -0.26],
          [s * 0.42, -0.16],
          [s * 0.41, 0.06],
          [s * 0.18, 0.16],
          [0, 0.08],
        ],
        c,
        [s * 0.19, 0.18, -0.26],
        "wing",
      );
    g.userData.animation = "dumbo";
  } else if (kind === "siphonophore") {
    for (let i = 0; i < 28; i++) {
      const y = -i * 0.17,
        x = Math.sin(i * 0.18) * 0.2;
      p.push(sphere(x, y, 0, 0.085, 0.13, 0.08, 0x769eaa));
      if (i > 5)
        p.push(
          tube(
            [
              [x, y, 0],
              [x + 0.4, y - 0.4, 0.07],
              [x + 0.65, y - 0.9, 0.15],
              [x + 0.8, y - 1.2, 0.27],
            ],
            0.006,
            0x82bab0,
            8,
          ),
        );
    }
    g.userData.animation = "jelly";
  } else if (kind === "oarfish" || kind === "naga" || kind === "shesha") {
    const myth = kind !== "oarfish",
      len = myth ? 18 : 5;
    const pts = [];
    for (let i = 0; i < 45; i++) {
      const t = i / 44;
      pts.push([
        Math.sin(t * Math.PI * 3) * t * (myth ? 2 : 0.25),
        Math.sin(t * 5) * 0.2,
        t * len,
      ]);
    }
    if (myth) p.push(tube(pts, 0.33, 0x488d86, 90));
    else {
      const profile = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        profile.push([
          t * len,
          0.038 * (1 - t * 0.91),
          0.21 * (1 - t * 0.76),
          Math.sin(t * 5) * 0.2,
        ]);
      }
      const ribbon = body(profile, 0xa7b3ad, 0xd4d4c0, "scales", 12),
        rp = ribbon.attributes.position;
      for (let i = 0; i < rp.count; i++) {
        const t = rp.getZ(i) / len;
        rp.setX(i, rp.getX(i) + Math.sin(t * Math.PI * 3) * t * 0.25);
      }
      ribbon.computeVertexNormals();
      p.push(ribbon);
      const vertices = [],
        indices = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40,
          x = Math.sin(t * Math.PI * 3) * t * 0.25,
          y = Math.sin(t * 5) * 0.2 + 0.21 * (1 - t * 0.76);
        vertices.push(x, y, t * len, x, y + 0.11 * (1 - t * 0.5), t * len);
        if (i < 40) {
          const k = i * 2;
          indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const crest = new THREE.BufferGeometry();
      crest.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      crest.setIndex(indices);
      crest.computeVertexNormals();
      p.push(tint(crest, 0xa9474f));
      for (let i = 0; i < 3; i++)
        p.push(
          tube(
            [
              [0, 0.15, -0.16 + i * 0.035],
              [0, 0.5 + i * 0.1, -0.19 + i * 0.07],
              [0, 0.59 + i * 0.12, -0.06 + i * 0.13],
            ],
            0.009,
            0xc26057,
            9,
          ),
        );
    }
    p.push(
      sphere(
        0,
        0,
        -0.17,
        myth ? 0.46 : 0.13,
        myth ? 0.29 : 0.2,
        myth ? 0.65 : 0.31,
        myth ? 0x70b8a4 : 0xb9beb1,
      ),
    );
    eyes(
      p,
      myth ? 0.35 : 0.12,
      0.08,
      -0.24,
      myth ? 0.085 : 0.031,
      myth ? 0xc5d690 : 0x443428,
    );
    if (myth)
      for (let i = 0; i < 35; i++) {
        const t = i / 35,
          z = t * len,
          x = Math.sin(t * Math.PI * 3) * t * 2;
        p.push(
          tube(
            [
              [x, 0.12, z],
              [x, 0.6, z + 0.06],
            ],
            0.027,
            0x68c9bb,
            2,
          ),
        );
      }
    g.userData.animation = "eel";
  } else if (kind === "glass-sponge") {
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        pts = [];
      for (let j = 0; j < 15; j++) {
        const t = j / 14,
          r = 0.15 + t * 0.4;
        pts.push([
          Math.cos(a + t * 0.5) * r,
          t * 1.7,
          Math.sin(a + t * 0.5) * r,
        ]);
      }
      p.push(tube(pts, 0.013, 0xa2bab5));
    }
    for (let j = 1; j < 12; j++) {
      const y = (j / 12) * 1.7,
        r = 0.15 + (j / 12) * 0.4,
        pts = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
      }
      p.push(tube(pts, 0.009, 0xb4c6b8));
    }
    g.userData.animation = "static";
  } else if (kind === "sea-pig" || kind === "amphipod") {
    const pig = kind === "sea-pig",
      c = pig ? 0xd1a4ac : 0xc9b4a1;
    p.push(sphere(0, 0.13, 0, 0.21, 0.2, 0.39, c));
    for (const s of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const z = (i - 2) * 0.12;
        p.push(
          tube(
            [
              [s * 0.14, 0.15, z],
              [s * 0.26, -0.04, z + 0.03],
              [s * 0.22, -0.12, z + 0.06],
            ],
            0.019,
            c,
            7,
          ),
        );
      }
    if (pig)
      for (const s of [-1, 1])
        p.push(
          tube(
            [
              [s * 0.12, 0.21, -0.2],
              [s * 0.17, 0.43, -0.31],
              [s * 0.19, 0.45, -0.39],
            ],
            0.018,
            c,
          ),
        );
    else
      for (const s of [-1, 1])
        p.push(
          tube(
            [
              [s * 0.1, 0.23, -0.27],
              [s * 0.2, 0.28, -0.49],
              [s * 0.25, 0.27, -0.65],
            ],
            0.007,
            c,
          ),
        );
    g.userData.animation = "benthic";
  } else if (kind === "anglerfish") {
    p.push(sphere(0, 0, 0, 0.32, 0.34, 0.43, 0x393c3c));
    p.push(sphere(0, -0.08, -0.355, 0.235, 0.205, 0.037, 0x050d10));
    for (let i = 0; i < 11; i++) {
      const a = (i / 10) * Math.PI;
      for (const s of [-1, 1])
        p.push(
          tube(
            [
              [Math.cos(a) * 0.2, Math.sin(a) * 0.16 * s - 0.07, -0.39],
              [Math.cos(a) * 0.16, Math.sin(a) * 0.08 * s - 0.07, -0.43],
            ],
            0.006,
            0xb9b797,
            2,
          ),
        );
    }
    eyes(p, 0.224, 0.145, -0.27, 0.045);
    p.push(
      tube(
        [
          [0, 0.24, -0.16],
          [0, 0.58, -0.23],
          [0, 0.67, -0.5],
          [0, 0.52, -0.64],
        ],
        0.013,
        0x77786e,
      ),
    );
    const lure = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xa8f3dc }),
    );
    lure.position.set(0, 0.52, -0.64);
    g.add(lure);
    articulatedFin(
      g,
      [
        [0, 0],
        [0.16, 0.2],
        [0, 0.15],
        [-0.16, 0.2],
      ],
      0x777e75,
      [0, 0, 0.39],
      "tail",
      true,
    );
    g.userData.animation = "fish";
  } else {
    // Barreleye, tripod and hadal snailfish have distinct silhouettes and diagnostic structures.
    const snail = kind === "snailfish",
      barreleye = kind === "barreleye",
      c = snail ? 0xc3b2b3 : 0x698582;
    p.push(
      body(
        [
          [-0.48, 0.018, 0.02],
          [-0.34, 0.17, 0.18],
          [-0.05, 0.16, 0.21],
          [0.22, 0.1, 0.13],
          [0.58, 0.025, 0.035],
          [0.72, 0.007, 0.018],
        ],
        c,
        snail ? 0xd3c3bd : 0xa2b3a5,
      ),
    );
    if (barreleye) {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 20, 14),
        new THREE.MeshPhysicalMaterial({
          color: 0x85cfc2,
          transparent: true,
          opacity: 0.27,
          roughness: 0.06,
          depthWrite: false,
        }),
      );
      dome.position.set(0, 0.16, -0.28);
      g.add(dome);
      for (const s of [-1, 1]) {
        p.push(sphere(s * 0.073, 0.2, -0.29, 0.058, 0.11, 0.058, 0x719e48));
        p.push(sphere(s * 0.073, 0.288, -0.3, 0.042, 0.012, 0.039, 0x263c21));
      }
    } else eyes(p, 0.14, 0.075, -0.28, 0.028, 0x525650);
    for (const s of [-1, 1])
      articulatedFin(
        g,
        [
          [0, -0.11],
          [s * 0.32, 0.06],
          [s * 0.23, 0.19],
          [0, 0.1],
        ],
        c,
        [s * 0.12, -0.035, -0.08],
        "pectoral",
      );
    if (kind === "tripod")
      for (const pnt of [
        [-0.45, -0.84, -0.03],
        [0.45, -0.84, -0.03],
        [0, -0.84, 0.8],
      ])
        p.push(
          tube([[0, -0.06, pnt[2] > 0.5 ? 0.6 : 0], pnt], 0.009, 0xa2aca0, 4),
        );
    articulatedFin(
      g,
      [
        [0, 0],
        [0.1, 0.15],
        [0, 0.12],
        [-0.1, 0.15],
      ],
      c,
      [0, 0, 0.65],
      "tail",
      true,
    );
    g.userData.animation = kind === "tripod" ? "static" : "fish";
  }
  if (p.length)
    g.add(
      combine(
        p,
        kind === "naga" || kind === "shesha" || kind === "siphonophore"
          ? luminous
          : finMat,
      ),
    );
  return g;
}

export function animateCreature(group, time, speed = 1) {
  const mode = group.userData.animation,
    phase = time * speed;
  for (const child of group.children) {
    const k = child.userData.kind;
    if (!k) continue;
    if (k === "fore") child.rotation.z = Math.sin(phase * 2.2) * 0.3;
    if (k === "rear") child.rotation.y = Math.sin(phase * 2.8) * 0.25;
    if (k === "wing")
      child.rotation.z =
        Math.sin(phase * 1.5) * 0.3 * Math.sign(child.position.x || 1);
    if (k === "pectoral") child.rotation.z = Math.sin(phase * 1.4) * 0.13;
    if (k === "tail") child.rotation.y = Math.sin(phase * 3.7) * 0.32;
    if (k === "fluke") child.rotation.x = Math.sin(phase * 1.3) * 0.22;
  }
  if (mode === "jelly") {
    group.scale.y = 1 + Math.sin(phase * 1.6) * 0.06;
    group.rotation.z = Math.sin(phase * 0.4) * 0.08;
  }
  if (mode === "dumbo") group.rotation.z = Math.sin(phase * 0.8) * 0.09;
}

export const FISH_MATERIAL = finMat;
