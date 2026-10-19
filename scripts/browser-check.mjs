import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";

const cached = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    process.platform === "darwin"
      ? "--use-angle=metal"
      : "--use-angle=swiftshader",
  ],
});
await mkdir("artifacts", { recursive: true });
const page = await browser.newPage({
  viewport: { width: 1512, height: 982 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("fonts.google"))
    errors.push(m.text());
});
const state = () => page.evaluate(() => window.narayana?.state);
const key = async (k, ms = 80) => {
  await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  await page.keyboard.up(k);
};
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5177/", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => window.narayana?.state);
  await page.getByRole("button", { name: "Enter the ocean" }).click();
  await page.waitForTimeout(400);
  console.log("Initial prey:", (await state()).hunting);
  await page.screenshot({ path: "artifacts/hunt-01-ready.png" });
  // Normal swim controls close the final metre if currents carried the player away.
  for (let i = 0; i < 30 && !(await state()).hunting.ready; i++)
    await key("w", 100);
  assert.ok(
    (await state()).hunting.ready,
    "there must be reachable prey and a green target",
  );
  await page
    .getByRole("button", { name: "Attack with feeding tentacles" })
    .click();
  const phases = new Set();
  let pulled = false,
    biting = false;
  for (let i = 0; i < 45; i++) {
    const s = await state();
    phases.add(s.hunting.phase);
    if (s.hunting.phase === "retract" && !pulled) {
      assert.ok(s.heldPrey);
      await page.screenshot({ path: "artifacts/hunt-02-reeling.png" });
      pulled = true;
    }
    if (s.hunting.phase === "feed" && !biting) {
      assert.ok(s.heldPrey);
      await page.screenshot({ path: "artifacts/hunt-03-beak.png" });
      biting = true;
    }
    await page.waitForTimeout(55);
  }
  assert.ok(
    phases.has("strike") && phases.has("retract") && phases.has("feed"),
    "hunt must show actual distinct phases",
  );
  assert.ok(
    (await state()).huntCount >= 1,
    "beak feeding should reward exactly a consumed prey",
  );
  console.log("PASS attack:", [...phases], (await state()).huntCount);
  const firstCount = (await state()).huntCount;
  await key("x", 4200);
  assert.ok(
    (await state()).huntCount > firstCount,
    "holding X should hunt additional real fish",
  );
  await key("t");
  assert.equal((await state()).species, "octopus");
  assert.equal((await state()).heldPrey, null);
  await key("x", 2000);
  assert.equal((await state()).arms, 8);
  await key("t");

  const before = (await state()).position;
  await key("w", 2200);
  const cruising = await state();
  assert.ok(
    Math.hypot(...cruising.position.map((v, i) => v - before[i])) > 9,
    "cruise must be substantially faster",
  );
  await page.keyboard.down("w");
  await key("Shift", 1800);
  await page.keyboard.up("w");
  const jet = await state();
  assert.ok(
    Math.hypot(...jet.velocity) > 8,
    "mantle jet must exceed cruise speed",
  );
  console.log("PASS repeated attacks, octopus anatomy and faster swimming");
  await key("v");
  assert.equal((await state()).perception, "spectral");
  await key("v");
  assert.equal((await state()).perception, "natural");
  await key("m");
  await page.locator('[data-travel="0"]').click();
  await page.waitForTimeout(4200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/hunt-04-mobile.png" });
  assert.ok(
    await page
      .getByRole("button", { name: "Attack with feeding tentacles" })
      .isVisible(),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const huntCount = (await state()).huntCount;
  await key("Escape");
  await page.getByRole("button", { name: "Save this incarnation" }).click();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Enter the ocean" }).click();
  await page.waitForTimeout(500);
  assert.equal(
    (await state()).huntCount,
    huntCount,
    "hunting progress survives reload",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: faster swimming, visible attack, grab/pull/bite, spectral toggle and mobile attack control.",
  );
} finally {
  if (errors.length) console.error(errors);
  await browser.close();
}
