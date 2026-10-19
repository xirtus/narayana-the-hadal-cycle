import * as THREE from "three";
const route = [
  [
    "city",
    "The drowned metropolis",
    "Flooded avenues",
    18,
    0,
    "rescue",
    "Free three trapped shoals with E.",
    "diver",
    "diver",
    "shark",
    "diver",
    "diver",
    "shark",
  ],
  [
    "reef",
    "The dolphin passage",
    "Kelp & coral terraces",
    90,
    340,
    "current",
    "Follow the dolphin through the current rings.",
    "diver",
    "shark",
    "diver",
    "shark",
  ],
  [
    "canyon",
    "The vertical blue",
    "Cliffs & acceleration currents",
    360,
    -340,
    "current",
    "Ride each luminous current ring in order.",
    "drone",
    "shark",
    "whale",
    "drone",
    "shark",
  ],
  [
    "wrecks",
    "The ship graveyard",
    "Broken freighters & cable forests",
    850,
    340,
    "echo",
    "Find the three echo seals among the wrecks.",
    "drone",
    "shark",
    "drone",
    "shark",
    "whale",
  ],
  [
    "caves",
    "The singing caverns",
    "Basalt tunnels & luminous life",
    1800,
    -340,
    "echo",
    "Answer the numbered crystals with E.",
    "drone",
    "shark",
    "drone",
    "whale",
  ],
  [
    "atlantis",
    "The tidal temple",
    "Atlantean courtyards & aqueducts",
    2800,
    340,
    "echo",
    "Sound the three temple resonators.",
    "drone",
    "shark",
    "whale",
    "drone",
  ],
  [
    "titanic",
    "Titanic · the silent Atlantic",
    "12,500 feet beneath the surface",
    3810,
    -340,
    "survey",
    "Survey three memorial beacons with E.",
    "drone",
    "drone",
    "shark",
    "whale",
  ],
  [
    "gardens",
    "The abyss in bloom",
    "Glass sponges & whale-fall oases",
    4300,
    340,
    "rescue",
    "Release the life caught in dormant machines.",
    "drone",
    "shark",
    "whale",
    "drone",
    "shark",
  ],
  [
    "vents",
    "The earth is breathing",
    "Black smokers & mineral chimneys",
    6600,
    -340,
    "current",
    "Follow the rising currents between the chimneys.",
    "drone",
    "shark",
    "drone",
    "whale",
    "shark",
  ],
  [
    "naga",
    "The cathedral of tides",
    "Nāga halls & violet gardens",
    8500,
    340,
    "echo",
    "Awaken the three moonstone resonators.",
    "drone",
    "shark",
    "whale",
    "drone",
    "shark",
  ],
  [
    "hollow",
    "The inner ocean",
    "A mythic sea inside the earth",
    10840,
    -340,
    "current",
    "Follow the inward current through the luminous arches.",
    "drone",
    "shark",
    "whale",
    "shark",
  ],
  [
    "heart",
    "The heart of the hollow earth",
    "The black hole beyond the sea",
    10900,
    400,
    "echo",
    "Harmonize the final seals, then enter the event horizon.",
    "drone",
    "shark",
    "whale",
    "drone",
  ],
];
// Preserve the earlier expedition as its own playable experience.
export const CLASSIC_SPACES = route.map(
  ([id, name, biome, rawDepth, x, task, hint, ...kinds], index) => {
    const depth = id === "heart" ? 10940 : rawDepth;
    return {
      id,
      index,
      name,
      biome,
      depth,
      position: new THREE.Vector3(
        x,
        -depth,
        index === 0
          ? 0
          : -48 - Math.pow((depth + 8 - 26 + 45) / 0.78, 1 / 1.11),
      ),
      zone: [0, 200, 1000, 4000, 6000, 8000, 10500].reduce(
        (n, d, i) => (depth >= d ? i : n),
        0,
      ),
      task,
      hint,
      count: task === "current" ? 5 : 3,
      kinds,
      bonus: false,
      terraced: false,
      mythic: index >= 9,
    };
  },
);
route.push(route.shift()); // The city is a preserved optional destination, never a progression gate.
route[0][1] = "The living reef";
route[0][3] = 35;
route[0][6] =
  "Follow the blue squid down five living terraces. Ride their currents to open the next descent.";
export const SPACES = route.map(
  ([id, name, biome, depth, x, task, hint, ...kinds], index) => {
    const z =
      id === "city"
        ? 0
        : -48 - Math.pow((depth + 8 - 26 + 45) / 0.78, 1 / 1.11);
    const position = new THREE.Vector3(x, -depth, z);
    const zone = [0, 200, 1000, 4000, 6000, 8000, 10500].reduce(
      (n, d, i) => (depth >= d ? i : n),
      0,
    );
    return {
      id,
      index,
      name,
      biome,
      depth,
      position,
      zone,
      task,
      hint: id === "city" ? hint : hint.replace(/three/g, "five"),
      bonus: id === "city",
      terraced: id !== "city",
      mythic: ["naga", "hollow", "heart"].includes(id),
      count: id === "city" ? 3 : 5,
      kinds,
    };
  },
);
export const MAIN_SPACES = SPACES.filter((s) => !s.bonus);
export function expeditionProgress(value = {}, mode = "terraces") {
  const spaces = mode === "trench" ? CLASSIC_SPACES : SPACES;
  const mainSpaces = mode === "trench" ? CLASSIC_SPACES : MAIN_SPACES;
  const completed = new Set(
    (Array.isArray(value.completed) ? value.completed : []).filter((id) =>
      spaces.some((s) => s.id === id),
    ),
  );
  // Unlocks are a contiguous route, never inferred from depth or an edited atlas target.
  let unlocked = 0;
  while (
    unlocked < mainSpaces.length - 1 &&
    completed.has(mainSpaces[unlocked].id)
  )
    unlocked++;
  const progress = {};
  for (const s of spaces)
    progress[s.id] = completed.has(s.id)
      ? s.count
      : Math.min(
          s.count,
          Math.max(0, Math.floor(Number(value.progress?.[s.id]) || 0)),
        );
  const active = spaces.some(
    (s) =>
      s.id === value.active &&
      (mode === "trench" ||
        s.index <= unlocked ||
        (s.bonus && value.routeVersion === 2)),
  )
    ? value.active
    : mode === "trench"
      ? "canyon"
      : "reef";
  return {
    routeVersion: 2,
    completed: [...completed],
    progress,
    unlocked,
    active,
    finished: !!value.finished && completed.has("heart"),
  };
}
