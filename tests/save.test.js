import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSave,
  INITIAL_SAVE,
  SaveSystem,
} from "../src/core/SaveSystem.js";

test("missing, incompatible or malformed saves recover into an independent playable state", () => {
  for (const input of [null, undefined, {}, { version: 9 }])
    assert.deepEqual(validateSave(input), INITIAL_SAVE);
  const a = validateSave(null);
  a.discovered.push("fish");
  assert.equal(INITIAL_SAVE.discovered.length, 0);
  const s = validateSave({
    version: 1,
    position: [NaN, Infinity, 0],
    species: "shark",
    discovered: "bad",
    sanctuaries: null,
    memories: -5,
    settings: { quality: "impossible" },
  });
  assert.deepEqual(s.position, [0, -12, 0]);
  assert.equal(s.species, "squid");
  assert.deepEqual(s.discovered, []);
  assert.equal(s.memories, 0);
  assert.equal(s.settings.quality, "high");
});
test("saved biological and spiritual progress survives validation with finite world limits", () => {
  const s = validateSave({
    version: 1,
    started: true,
    position: [1, -650, -800],
    species: "octopus",
    incarnation: 3,
    memories: 17,
    discovered: ["seal"],
    sanctuaries: ["sanctuary"],
    objectiveStep: 2,
    ending: "balance",
    settings: { sound: false },
  });
  assert.deepEqual(s.position, [1, -650, -800]);
  assert.equal(s.species, "octopus");
  assert.equal(s.memories, 17);
  assert.equal(s.settings.sound, false);
  assert.equal(s.started, true);
  assert.equal(s.ending, "balance");
  const clamped = validateSave({ version: 1, position: [1e20, 1e20, -1e20] });
  assert.deepEqual(clamped.position, [10000, -0.7, -10000]);
});

test("experience saves preserve independent locations and progression across round trips", () => {
  const before = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
  };
  try {
    const save = new SaveSystem();
    assert.equal(save.data.experience, "ocean");
    save.save({
      started: true,
      position: [10, -650, -800],
      hunts: 7,
      memories: 12,
    });
    save.selectExperience("terraces");
    assert.equal(save.data.hunts, 0);
    save.save({
      started: true,
      position: [340, -70, -140],
      hunts: 2,
      expedition: {
        active: "reef",
        completed: ["reef"],
        progress: { reef: 5 },
      },
    });
    save.selectExperience("trench");
    assert.equal(save.data.expedition.active, "canyon");
    assert.equal(save.data.hunts, 0);
    save.save({ position: [-340, -360, -330], memories: 3 });
    save.selectExperience("ocean");
    assert.deepEqual(save.data.position, [10, -650, -800]);
    assert.equal(save.data.hunts, 7);
    assert.equal(save.data.memories, 12);
    save.selectExperience("terraces");
    assert.equal(save.data.hunts, 2);
    assert.ok(save.data.expedition.completed.includes("reef"));
    const reload = new SaveSystem();
    assert.equal(reload.data.experience, "terraces");
    reload.selectExperience("trench");
    assert.equal(reload.data.memories, 3);
    assert.deepEqual(reload.data.position, [-340, -360, -330]);
    assert.equal(reload.selectExperience("invalid"), false);
  } finally {
    globalThis.localStorage = before;
  }
});
test("older open-ocean, original expedition and terrace saves migrate to the matching experience", () => {
  assert.equal(
    validateSave({ version: 1, position: [0, -600, -700] }).experience,
    "ocean",
  );
  const old = validateSave({
    version: 1,
    expedition: { active: "city", completed: ["city"], progress: { reef: 2 } },
  });
  assert.equal(old.experience, "trench");
  assert.equal(old.expedition.active, "city");
  assert.equal(old.expedition.progress.reef, 2);
  assert.equal(
    validateSave({
      version: 1,
      expedition: { routeVersion: 2, active: "reef" },
    }).experience,
    "terraces",
  );
});
