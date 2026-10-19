import { expeditionProgress } from "../expedition/Spaces.js";
const KEY = "narayana.hadal.v1";
export const INITIAL_SAVE = {
  version: 1,
  experience: "ocean",
  journeys: {},
  incarnation: 1,
  memories: 0,
  hunts: 0,
  combatVictories: [],
  bestCombo: 0,
  restored: [],
  observed: [],
  expedition: expeditionProgress(),
  lamp: false,
  discovered: [],
  sanctuaries: [],
  encounters: [],
  chapter: 0,
  maxDepth: 0,
  objectiveStep: 0,
  started: false,
  species: "squid",
  position: [0, -12, 0],
  settings: {
    quality: "high",
    sound: true,
    volume: 0.45,
    sensitivity: 1,
    reduceMotion: false,
    turbo: true,
    uvStrength: 0.65,
    vision: "natural",
  },
};
export const EXPERIENCES = [
  {
    id: "ocean",
    name: "Original open ocean",
    description:
      "The original Monterey Bay world, seven depth zones, sanctuaries and free exploration.",
  },
  {
    id: "trench",
    name: "Original trench",
    description:
      "The earlier trench, dolphin passage, caves, temples, wrecks and city. Every preserved region is available.",
  },
  {
    id: "terraces",
    name: "Terraced descent",
    description:
      "A separate journey down living ledges, guided by the blue squid. The city remains an optional bonus.",
  },
];
export function journeySnapshot(value) {
  const result = structuredClone(value);
  delete result.journeys;
  delete result.settings;
  return result;
}
export function validateSave(value, withJourneys = true) {
  if (!value || value.version !== 1) return structuredClone(INITIAL_SAVE);
  const s = { ...structuredClone(INITIAL_SAVE), ...value };
  s.experience = EXPERIENCES.some((e) => e.id === value.experience)
    ? value.experience
    : value.expedition?.routeVersion === 2
      ? "terraces"
      : value.expedition
        ? "trench"
        : "ocean";
  s.expedition = expeditionProgress(value.expedition || {}, s.experience);
  s.lamp = !!value.lamp;
  for (const k of [
    "discovered",
    "sanctuaries",
    "encounters",
    "combatVictories",
    "restored",
    "observed",
  ])
    s[k] = Array.isArray(s[k])
      ? [...new Set(s[k].filter((x) => typeof x === "string"))]
      : [];
  if (
    !Array.isArray(s.position) ||
    s.position.length !== 3 ||
    !s.position.every(Number.isFinite)
  )
    s.position = [0, -12, 0];
  s.position = [
    Math.max(-10000, Math.min(10000, s.position[0])),
    Math.max(-11000, Math.min(-0.7, s.position[1])),
    Math.max(-10000, Math.min(10000, s.position[2])),
  ];
  for (const k of [
    "incarnation",
    "memories",
    "hunts",
    "bestCombo",
    "chapter",
    "maxDepth",
    "objectiveStep",
  ])
    s[k] = Number.isFinite(s[k]) ? Math.max(0, s[k]) : INITIAL_SAVE[k];
  s.species = s.species === "octopus" ? "octopus" : "squid";
  s.settings = { ...INITIAL_SAVE.settings, ...s.settings };
  if (!["low", "medium", "high", "ultra"].includes(s.settings.quality))
    s.settings.quality = "high";
  s.settings.turbo = s.settings.turbo !== false;
  s.settings.uvStrength = Number.isFinite(s.settings.uvStrength)
    ? Math.max(0, Math.min(1, s.settings.uvStrength))
    : 0.65;
  s.settings.vision = s.settings.vision === "spectral" ? "spectral" : "natural";
  s.settings.volume = Number.isFinite(s.settings.volume)
    ? Math.max(0, Math.min(1, s.settings.volume))
    : 0.45;
  s.settings.sensitivity = Number.isFinite(s.settings.sensitivity)
    ? Math.max(0.3, Math.min(2, s.settings.sensitivity))
    : 1;
  s.journeys = {};
  if (withJourneys)
    for (const { id } of EXPERIENCES) {
      const slot = value.journeys?.[id];
      if (slot && typeof slot === "object")
        s.journeys[id] = journeySnapshot(
          validateSave({ ...slot, version: 1, experience: id }, false),
        );
    }
  return s;
}
export class SaveSystem {
  constructor() {
    this.available = true;
    this.data = this.load();
  }
  load() {
    try {
      return validateSave(JSON.parse(localStorage.getItem(KEY)));
    } catch {
      return structuredClone(INITIAL_SAVE);
    }
  }
  selectExperience(id) {
    if (!EXPERIENCES.some((e) => e.id === id)) return false;
    const previous = this.data,
      journeys = {
        ...previous.journeys,
        [previous.experience]: journeySnapshot(previous),
      };
    const destination = journeys[id] || {
      ...structuredClone(INITIAL_SAVE),
      experience: id,
      expedition: expeditionProgress({}, id),
    };
    const saved = this.save({
      ...destination,
      experience: id,
      journeys,
      settings: previous.settings,
    });
    if (!saved) this.data = previous;
    return saved;
  }
  save(patch = {}) {
    this.data = validateSave({ ...this.data, ...patch });
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }
}
