import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { SPACES } from "../src/expedition/Spaces.js";
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
const errors = [];
try {
  for (const id of ["canyon", "gardens", "naga"]) {
    const space = SPACES.find((s) => s.id === id),
      page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("fonts.google"))
        errors.push(m.text());
    });
    await page.addInitScript(
      (save) => { if (!localStorage.getItem("narayana.hadal.v1")) localStorage.setItem("narayana.hadal.v1", JSON.stringify(save)); },
      {
        version: 1,
        experience: "terraces",
        started: true,
        position: space.position
          .clone()
          .add({ x: 50, y: 105, z: 105 })
          .toArray(),
        expedition: {
          routeVersion: 2,
          active: id,
          completed: SPACES.map((s) => s.id),
        },
        settings: { vision: "natural", uvStrength: 0.8, reduceMotion: true },
      },
    );
    await page.goto(process.env.GAME_URL || "http://localhost:5177/", {
      waitUntil: "networkidle",
    });
    await page.getByRole("button", { name: "Enter the ocean" }).click();
    await page.waitForTimeout(1500);
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(340);
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.down("ArrowDown");
    await page.waitForTimeout(920);
    await page.keyboard.up("ArrowDown");
    await page.waitForTimeout(3200);
    await page.screenshot({
      path: `artifacts/fractal-${id}-distant-natural.png`,
    });
    await page.keyboard.press("v");
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `artifacts/fractal-${id}-distant-uv.png` });
    let state = await page.evaluate(() => window.narayana.state);
    assert.equal(state.expedition.active, id);
    assert.ok(state.position.every(Number.isFinite));
    console.log(
      id,
      JSON.stringify({
        fps: state.fps,
        drawCalls: state.drawCalls,
        triangles: state.triangles,
        position: state.position,
      }),
    );
    // Swim outward at turbo speed: distant terrain must continue beyond the authored terrace footprint.
    await page.keyboard.down("d");
    await page.keyboard.down("Shift");
    await page.waitForTimeout(3000);
    await page.keyboard.up("Shift");
    await page.keyboard.up("d");
    await page.waitForTimeout(700);
    state = await page.evaluate(() => window.narayana.state);
    assert.ok(Number.isFinite(state.floor));
    assert.ok(state.depth > 0);
    await page.screenshot({ path: `artifacts/fractal-${id}-outer-ridges.png` });
    const beforeResume = state.position;
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save this incarnation" }).click();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Enter the ocean" }).click();
    await page.waitForTimeout(1600);
    const resumed = await page.evaluate(() => window.narayana.state);
    assert.ok(
      Math.hypot(...resumed.position.map((v, i) => v - beforeResume[i])) < 8,
      "outer-ridge position must survive reloading",
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS distant mountain views, UV silhouettes and swimming beyond the former level footprint",
  );
} finally {
  await browser.close();
}
