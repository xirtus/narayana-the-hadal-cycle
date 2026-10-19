import * as THREE from "three";
const clamp = THREE.MathUtils.clamp,
  smooth = THREE.MathUtils.smoothstep;
export const TERRAIN_RADIUS = 1024;
function hash(x, z) {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, z) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz,
    u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u),
    THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u),
    v,
  );
}
function ridges(x, z) {
  let sum = 0,
    amplitude = 0.55,
    weight = 1;
  for (let i = 0; i < 5; i++) {
    const n = 1 - Math.abs(noise(x, z) * 2 - 1),
      r = n * n;
    sum += r * amplitude * weight;
    weight = clamp(r * 1.8, 0.2, 1);
    x = x * 2.07 + 17.2;
    z = z * 2.03 - 9.7;
    amplitude *= 0.49;
  }
  return sum;
}
export function routeFloor(z) {
  const t = clamp((-z - 35) / 42, 0, 5),
    i = Math.floor(t);
  return -7 - 18 * (i + smooth(t - i, 0, 0.55));
}
/** World-space sampler shared by terrain rendering, swimming, anchors and wildlife. */
export function fractalHeight(space, x, z) {
  const dx = x - space.position.x,
    dz = z - space.position.z;
  const extent = Math.max(Math.abs(dx), Math.abs(dz + 120));
  if (!space.terraced || extent >= TERRAIN_RADIUS) return null;
  const blend = 1 - smooth(extent, 720, TERRAIN_RADIUS);
  const warp = noise(dz * 0.004, space.index * 0.77) * 42 - 21;
  const r = ridges(
    (dx + warp) * 0.0107 + space.index * 7.7,
    dz * 0.0107 - 21.3,
  );
  const basin =
    routeFloor(dz) +
    (dz < -245 ? (dz + 245) * 0.26 : dz > 15 ? (dz - 15) * 0.16 : 0);
  const near = smooth(Math.abs(dx), 31, 100);
  const mountain = near * (20 + r * r * 275);
  const tributary = Math.pow(
    1 -
      Math.abs(
        Math.sin(dz * 0.012 + dx * 0.019 + noise(dx * 0.008, dz * 0.008) * 3),
      ),
    6,
  );
  let height = basin + mountain - tributary * near * 28;
  // Lower ridges fold into the banks of the route rather than uniform circular shelves.
  height += near * (noise(dx * 0.15, dz * 0.15) - 0.5) * 8;
  const routeMask =
    (1 - smooth(Math.abs(dx), 29, 47)) *
    (1 - smooth(dz, 15, 60)) *
    smooth(dz, -315, -270);
  height = THREE.MathUtils.lerp(
    height,
    routeFloor(dz) + (noise(dx * 0.22, dz * 0.17) - 0.5) * 0.25,
    routeMask,
  );
  // The preserved wrecks/temples sit in an eroded side basin, without a visible platform slab.
  if (!["reef", "canyon", "gardens"].includes(space.id)) {
    const heart = space.id === "heart",
      px = heart ? 0 : 110,
      pz = heart ? -230 : -245;
    const d = Math.hypot((dx - px) / 125, (dz - pz) / 145);
    const pad = (1 - smooth(d, 0.65, 1.25)) * (heart ? 1 : 1 - routeMask);
    height = THREE.MathUtils.lerp(height, heart ? -78 : -98, pad);
  }
  if (height > space.depth - 12)
    height =
      space.depth - 12 + 9 * (1 - Math.exp(-(height - space.depth + 12) / 30));
  height = Math.max(height, -11014 + space.depth);
  return { height: height + space.position.y, blend };
}
export function terrainContains(space, x, z, margin = 0) {
  return (
    !!space?.terraced &&
    Math.max(
      Math.abs(x - space.position.x),
      Math.abs(z - space.position.z + 120),
    ) <
      TERRAIN_RADIUS - margin
  );
}
/** Equal boundaries between tiles avoid cracks; detail falls off away from the swimming route. */
export function buildFractalTerrain(space, sample) {
  const group = new THREE.Group();
  group.name = "Fractal trench · continuous mountain field";
  const meshes = [];
  const shallow = space.depth < 250;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    flatShading: true,
    metalness: 0,
    emissive: shallow ? 0x17382f : 0x1c3d52,
    emissiveIntensity: 0.15,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 mountainP; varying float mountainDistance;\n" +
      shader.vertexShader
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nmountainP=position;",
        )
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nmountainDistance=length(mvPosition.xyz);",
        );
    shader.fragmentShader =
      "varying vec3 mountainP; varying float mountainDistance;\n" +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
   float strata=sin(mountainP.y*1.2+sin(mountainP.x*.12)*2.+sin(mountainP.z*.08));
   float grain=fract(sin(dot(floor(mountainP.xz*16.),vec2(12.9898,78.233)))*43758.5453);
   diffuseColor.rgb*=.88+.055*strata+.07*grain;`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          float livingFault=1.-smoothstep(.012,.065,abs(sin(mountainP.y*.035+sin(mountainP.x*.047)+sin(mountainP.z*.023)*1.5)));
          totalEmissiveRadiance*=.65+livingFault*.65;`,
        )
        .replace(
          "#include <fog_fragment>",
          `#ifdef USE_FOG
   // Long-range terrain keeps faint silhouettes while near-water visibility stays unchanged.
   float opticalRange=mix(1.,.27,smoothstep(65.,340.,mountainDistance));
   float haze=1.-exp(-fogDensity*fogDensity*mountainDistance*mountainDistance*opticalRange*opticalRange);
   gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,clamp(haze,0.,1.));
   #endif`,
        );
  };
  const sand = new THREE.Color(shallow ? 0x85917c : 0x506173),
    stone = new THREE.Color(shallow ? 0x426763 : 0x314959),
    crest = new THREE.Color(shallow ? 0x759b8c : 0x6c8295),
    c = new THREE.Color();
  // 64 tiles span >2 km. Vertices on tile boundaries always share the same 16 m grid;
  // interior detail fans toward that boundary to avoid skirts or open seams.
  const tile = 256;
  for (let iz = -4; iz < 4; iz++)
    for (let ix = -4; ix < 4; ix++) {
      const x0 = ix * tile,
        z0 = iz * tile - 120;
      const near = Math.abs(ix + 0.5) < 1.1 && Math.abs(iz + 0.5) < 1.1;
      const step = near ? 4 : 16,
        n = tile / step;
      const positions = [],
        colors = [],
        indices = [];
      const localSample = (x, z) =>
        sample(space.position.x + x, space.position.z + z) - space.position.y;
      for (let j = 0; j <= n; j++)
        for (let i = 0; i <= n; i++) {
          let x = x0 + i * step,
            z = z0 + j * step;
          // Snap only the fine boundary vertices onto the common coarse edge grid.
          if (near && (i === 0 || i === n))
            z = z0 + Math.round((j * step) / 16) * 16;
          if (near && (j === 0 || j === n))
            x = x0 + Math.round((i * step) / 16) * 16;
          const y = localSample(x, z);
          positions.push(x, y, z);
          const slope = Math.max(
            Math.abs(localSample(x + 1, z) - y),
            Math.abs(localSample(x, z + 1) - y),
          );
          c.copy(sand)
            .lerp(stone, smooth(slope, 0.12, 1.5))
            .lerp(crest, clamp((y - routeFloor(z) - 35) / 220, 0, 0.4));
          c.multiplyScalar(0.92 + noise(x * 0.08, z * 0.08) * 0.13);
          colors.push(c.r, c.g, c.b);
          if (i < n && j < n) {
            const k = j * (n + 1) + i;
            if ((i + j) % 2)
              indices.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2);
            else indices.push(k, k + n + 1, k + n + 2, k, k + n + 2, k + 1);
          }
        }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.receiveShadow = true;
      mesh.userData.fractalTerrain = true;
      group.add(mesh);
      meshes.push(mesh);
    }
  return { group, meshes, material: mat, radius: TERRAIN_RADIUS };
}
