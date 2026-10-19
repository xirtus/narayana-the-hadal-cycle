import { INITIAL_SAVE } from "../src/core/SaveSystem.js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
const cached = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    (existsSync(cached) ? cached : undefined),
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    process.platform === "darwin"
      ? "--use-angle=metal"
      : "--use-angle=swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("fonts.google"))
    errors.push(m.text());
});
const state = () => page.evaluate(() => window.narayana?.state);
const key = async (k, ms = 60) => {
  await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  await page.keyboard.up(k);
};
await mkdir("artifacts", { recursive: true });
await page.addInitScript(
  (save) => localStorage.setItem("narayana.hadal.v1", JSON.stringify(save)),
  {
    ...structuredClone(INITIAL_SAVE),
    position: [0, -18, 0],
    experience: "trench",
    expedition: {
      routeVersion: 2,
      active: "city",
      completed: [],
      progress: {},
    },
    settings: { ...INITIAL_SAVE.settings, turbo: false },
  },
);
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5177/", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => window.narayana?.state);
  await page.getByRole("button", { name: "Enter the ocean" }).click();
  await page.waitForTimeout(2000);
  assert.equal((await state()).enemies.length, 6);
  await page.screenshot({ path: "artifacts/combat-01-patrol.png" });
  await page.getByRole("button", { name: "Focus enemy", exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal((await state()).combat.locked, true);
  for (let i = 0; i < 65; i++) {
    const s = await state();
    if (s.combat.target.distance < 5) break;
    await key("w", 110);
  }
  console.log("Contact approach:", (await state()).combat);
  await page.keyboard.down("x");
  const moves = new Set();
  let lostHp = false;
  for (let i = 0; i < 70; i++) {
    const s = await state();
    moves.add(s.combat.move);
    if (s.enemies.some((e) => e.hp < 80)) lostHp = true;
    if (i === 8)
      await page.screenshot({ path: "artifacts/combat-02-chain.png" });
    if (s.combatVictories.length) break;
    if (s.combat.target?.distance > 5) await key("w", 100);
    await page.waitForTimeout(80);
  }
  await page.keyboard.up("x");
  assert.ok(lostHp, "actual combat hits should damage an enemy");
  assert.ok(
    (await state()).combatVictories.length > 0,
    "a route enemy should be defeated by normal attacks",
  );
  console.log("PASS chained attacks and saved defeat", [...moves]);
  await page.getByRole("button", { name: "Jet evade", exact: true }).click();
  await page.waitForTimeout(80);
  assert.ok((await state()).combat.dodgeCooldown > 0);
  await page.getByRole("button", { name: "Arm sweep", exact: true }).click();
  await page.waitForTimeout(80);
  assert.ok((await state()).combat.sweepCooldown > 0);
  await key("q");
  assert.ok((await state()).ink > 0);
  const savedVictories = (await state()).combatVictories;
  await key("m");
  await page.locator(`[data-space="${0}"]`).click();
  await page.waitForTimeout(1900);
  assert.deepEqual((await state()).combatVictories, savedVictories);
  assert.equal((await state()).enemies.length, 6 - savedVictories.length);
  // Resume a saved incarnation at a habitat to exercise restoration independently of combat.
  const habitat = (await state()).habitats[0];
  const habitatSave = await page.evaluate(({ position }) => {
    const save = JSON.parse(localStorage.getItem("narayana.hadal.v1"));
    save.position = [position[0], position[1] + 4, position[2] + 3];
    save.started = true;
    return save;
  }, habitat);
  await page.addInitScript(
    (save) => localStorage.setItem("narayana.hadal.v1", JSON.stringify(save)),
    habitatSave,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Enter the ocean" }).click();
  await page.waitForTimeout(1300);
  await key("e");
  await page.waitForTimeout(150);
  assert.equal((await state()).restored.length, 1);
  await page.getByRole("button", { name: "Observe H", exact: true }).click();
  await page.waitForTimeout(300);
  assert.ok((await state()).restoration.meditating);
  await page.screenshot({ path: "artifacts/combat-04-restoration.png" });
  await page.waitForTimeout(6000);
  assert.equal((await state()).observed.length, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  for (const name of [
    "Jet evade",
    "Arm sweep",
    "Focus enemy",
    "Combat ink cloud",
  ])
    assert.ok(
      await page.getByRole("button", { name, exact: true }).isVisible(),
    );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "artifacts/combat-05-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS restoration, observation, saved patrol clears and mobile controls; no runtime errors",
  );
} finally {
  await browser.close();
}
