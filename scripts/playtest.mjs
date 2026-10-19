import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    process.platform === "darwin"
      ? "--use-angle=metal"
      : "--use-angle=swiftshader",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1512, height: 982 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("fonts.googleapis"))
    errors.push(m.text());
});
const state = () => page.evaluate(() => window.narayana.state);
const key = async (code, ms = 100) => {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
};
const swimTo = async (target, radius = 3.5) => {
  for (let step = 0; step < 130; step++) {
    const p = (await state()).position;
    if (Math.hypot(...p.map((v, i) => v - target[i])) < radius) return;
    const held = [];
    if (Math.abs(p[0] - target[0]) > 1) held.push(p[0] > target[0] ? "a" : "d");
    if (Math.abs(p[2] - target[2]) > 1) held.push(p[2] > target[2] ? "w" : "s");
    if (Math.abs(p[1] - target[1]) > 1)
      held.push(p[1] > target[1] ? "c" : "Space");
    for (const k of held) await page.keyboard.down(k);
    await page.waitForTimeout(220);
    for (const k of held) await page.keyboard.up(k);
  }
  throw new Error("Could not reach target " + target);
};
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5177/", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => window.narayana?.state.fps > 0);
  await page.waitForTimeout(2500);
  assert.equal((await state()).arms, 10);
  await page.screenshot({ path: "artifacts/01-opening.png" });
  await page.getByRole("button", { name: "Enter the ocean" }).click();
  await page.waitForTimeout(2000);
  await key("e");
  await page.waitForTimeout(300);
  assert.ok(
    (await state()).memories > 0,
    "sonar must discover actual wildlife",
  );
  await key("q");
  assert.ok((await state()).ink > 0, "ink cloud must exist");
  await key("r");
  assert.equal((await state()).camouflage, true);
  const beforeJet = await state();
  await page.keyboard.down("w");
  await key("Shift", 1200);
  await page.keyboard.up("w");
  assert.ok(
    (await state()).position[2] < beforeJet.position[2] - 1,
    "jet must propel animal",
  );
  await key("t");
  assert.equal((await state()).species, "octopus");
  assert.equal((await state()).arms, 8);
  await key("c", 9000);
  await key("g");
  await page.waitForTimeout(500);
  assert.ok(
    ["anchored", "crawling"].includes((await state()).mode),
    "arms should anchor near floor",
  );
  const crawl = await state();
  await key("w", 1800);
  assert.ok(
    (await state()).position[2] < crawl.position[2] - 0.3,
    "planted arms should crawl",
  );
  await page.screenshot({ path: "artifacts/03-octopus-crawling.png" });
  await key("g");
  await key("t");
  await key("r");
  await key("Space", 2200);
  await page.screenshot({ path: "artifacts/02-swimming.png" });
  // Reach the first sanctuary using normal swim inputs and the visible mission bearing.
  for (let step = 0; step < 65; step++) {
    const p = (await state()).position,
      target = [-12, -23.34, -34];
    if (Math.hypot(...p.map((v, i) => v - target[i])) < 8) break;
    const held = [];
    if (Math.abs(p[0] - target[0]) > 1.2)
      held.push(p[0] > target[0] ? "a" : "d");
    if (Math.abs(p[2] - target[2]) > 1.2)
      held.push(p[2] > target[2] ? "w" : "s");
    if (Math.abs(p[1] - target[1]) > 1.3)
      held.push(p[1] > target[1] ? "c" : "Space");
    for (const k of held) await page.keyboard.down(k);
    await page.waitForTimeout(300);
    for (const k of held) await page.keyboard.up(k);
  }
  await key("f");
  await page.waitForTimeout(300);
  console.log("PASS: surface controls, anatomy, crawling and sanctuary.");
  for (let chapter = 1; chapter <= 6; chapter++) {
    await key("m");
    await page.locator(`[data-travel="${chapter}"]`).click();
    await page.waitForTimeout(3700);
    const s = await state();
    assert.equal(s.chapter, chapter, `atlas must reach chapter ${chapter}`);
    assert.ok(s.position.every(Number.isFinite));
    await key("e");
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `artifacts/depth-${chapter}.png` });
    console.log(
      `PASS: chapter ${chapter}, depth ${Math.round((await state()).depth)} m, ${(await state()).fps} FPS.`,
    );
    if (chapter === 1) {
      for (const node of (await state()).encounterTargets) {
        await swimTo(node.position);
        await key("f");
        await page.waitForTimeout(300);
      }
      assert.ok(
        (await state()).encounters.includes("observatory"),
        "all three sensors restore observatory",
      );
    }
    if (chapter === 3) {
      const site = (await state()).landmarks.find((l) => l.id === "whalefall");
      const skull = [
        site.position[0],
        site.position[1] - 0.25,
        site.position[2] - 9.4,
      ];
      await swimTo(skull, 4.5);
      await key("r");
      await key("e");
      await page.waitForTimeout(150);
      await key("f");
      await page.waitForTimeout(200);
      assert.ok(
        (await state()).encounters.includes("whale-fall"),
        "quiet pulse and skull interaction complete whale fall",
      );
      await key("r");
    }
  }
  await key("j");
  await page.getByRole("dialog").waitFor();
  assert.ok((await page.locator(".journal-entry.seen").count()) > 0);
  await page.screenshot({ path: "artifacts/04-field-journal.png" });
  await page.getByRole("button", { name: "Close menu" }).click();
  await key("Escape");
  await page.getByRole("button", { name: "Ocean & accessibility" }).click();
  await page.locator("#quality").selectOption("low");
  await page.locator("#species-select").selectOption("octopus");
  await page.locator("#reduce-motion").check();
  await page.getByRole("button", { name: "Close menu" }).click();
  await key("Escape");
  await page.getByRole("button", { name: "Save this incarnation" }).click();
  const saved = await state();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Enter the ocean" }).click();
  await page.waitForTimeout(2000);
  const restored = await state();
  assert.equal(restored.species, "octopus");
  assert.equal(restored.memories, saved.memories);
  assert.equal(restored.chapter, saved.chapter);
  await page.setViewportSize({ width: 390, height: 844 });
  await key("m");
  await page.screenshot({ path: "artifacts/05-mobile-atlas.png" });
  await page.getByRole("button", { name: "Close menu" }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "mobile should not overflow horizontally",
  );
  const gate = (await state()).landmarks.find((l) => l.id === "gate");
  await swimTo(gate.position, 9);
  await key("f");
  await page.getByRole("button", { name: /Return the cycle/ }).click();
  await page.waitForTimeout(8000);
  assert.equal((await state()).ending, "balance");
  assert.equal((await state()).chapter, 0);
  console.log("PASS: observatory, whale-fall ritual, and final cycle choice.");
  assert.deepEqual(errors, [], "browser must have no runtime or shader errors");
  console.log(
    "PASS: movement, jet, ink, camouflage, squid/octopus anatomy, crawling, sonar, seven biomes, journal, settings, save/reload and mobile layout.",
  );
} finally {
  if (errors.length) console.error("Browser errors:", errors);
  await browser.close();
}
