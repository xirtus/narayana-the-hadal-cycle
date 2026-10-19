/** Narrative depth levels keep the original seven save-game zone numbers. */
export const DEPTH_LEVELS = [
  [
    "kelp",
    "Monterey kelp forest",
    "The sunlight kingdom",
    0,
    200,
    0x155d65,
    0x9cdfb9,
    0x777b58,
    0x57bea2,
    13,
    0.015,
    "Amber sunlight, dancing caustics and green water",
    "Eelgrass meadows · sea-lion reef",
  ],
  [
    "twilight",
    "Monterey Canyon",
    "The twilight descent",
    200,
    1000,
    0x09263f,
    0x819ce3,
    0x47525c,
    0x6299d0,
    7,
    0.012,
    "Blue light fades into violet animal fluorescence",
    "Jelly curtains · the broken cable grotto",
  ],
  [
    "midnight",
    "The midnight ocean",
    "Where sunlight becomes memory",
    1000,
    4000,
    0x020611,
    0x7cabeb,
    0x333f48,
    0x439dcf,
    4,
    0.014,
    "No sunlight; living blue signals punctuate black water",
    "Siphonophore gardens · lantern constellations",
  ],
  [
    "abyssal",
    "The abyssal kingdom",
    "A memory older than stone",
    4000,
    6000,
    0x030910,
    0x61c4c0,
    0x3b494c,
    0x4badae,
    2,
    0.013,
    "Blue-green bioluminescence above pale sediment",
    "Glass-sponge fields · brine terraces",
  ],
  [
    "hadal",
    "The hadal trench",
    "Below the reach of the sun",
    6000,
    8000,
    0x02030a,
    0x8e8bd0,
    0x32363f,
    0x669cc9,
    2,
    0.016,
    "Near-total darkness; tiny luminous animals reveal the walls",
    "Amphipod gullies · mineral chimneys",
  ],
  [
    "naga",
    "The Nāga realm",
    "The waters remember",
    8000,
    10500,
    0x070614,
    0xaaa0ec,
    0x454353,
    0x8863ca,
    3,
    0.012,
    "Dreamlike violet mineral fluorescence and living turquoise",
    "Prismatic spires · the drowned nave",
  ],
  [
    "challenger",
    "Challenger Deep",
    "The dream beneath the world",
    10500,
    11000,
    0x05030b,
    0xe0a394,
    0x39323d,
    0x8558ac,
    4,
    0.015,
    "Black water, violet life and warm volcanic fissures",
    "Obsidian fissures · the cathedral of silence",
  ],
].map(
  (
    [
      id,
      name,
      subtitle,
      min,
      max,
      water,
      accent,
      ground,
      emission,
      temperature,
      fog,
      lightDescription,
      landmarkDescription,
    ],
    index,
  ) =>
    Object.freeze({
      id,
      index,
      zone: index + 1,
      name,
      subtitle,
      min,
      max,
      palette: Object.freeze({ water, accent, ground, emission }),
      temperature,
      fog,
      color: water,
      lightDescription,
      landmarkDescription,
    }),
);

export function depthLevelAt(depth) {
  const safe = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  return DEPTH_LEVELS.findLast((level) => safe >= level.min) || DEPTH_LEVELS[0];
}

const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
const rgb = (hex) => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];
/** Continuous depth optics, independent of framerate and level transitions.
 * Red attenuates first. Neither UV nor infrared is a source of deep sunlight.
 * Spectral perception is a fictional translation of animal/mineral signals.
 */
export function lightingAtDepth(depth) {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  const level = depthLevelAt(d),
    next = DEPTH_LEVELS[Math.min(6, level.index + 1)];
  const blend = smooth((d - level.min) / (level.max - level.min));
  const a = rgb(level.palette.water),
    b = rgb(next.palette.water);
  const sunlight = Math.exp(-d / 90) * (1 - smooth((d - 700) / 300));
  return {
    water: a.map((v, i) => v + (b[i] - v) * blend),
    fog: level.fog + (next.fog - level.fog) * blend,
    sunlight,
    ambient: 0.035 + 2.4 * sunlight,
    fill: 0.065 + 0.8 * sunlight,
    redTransmission: Math.exp(-d / 0.6e2),
    greenTransmission: Math.exp(-d / 100),
    blueTransmission: Math.exp(-d / 180),
    diveLight: 24 * smooth((d - 100) / 160),
  };
}
