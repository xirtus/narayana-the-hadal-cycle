import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { SPACES, MAIN_SPACES } from "../src/expedition/Spaces.js";
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
let page = await browser.newPage({ viewport: { width: 1512, height: 982 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("fonts.google"))
    errors.push(m.text());
});
const state = () => page.evaluate(() => window.narayana.state);
const key = async (k, ms = 80) => {
  await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  await page.keyboard.up(k);
};
async function swim(target, radius = 3) {
  for (let i = 0; i < 360; i++) {
    const s = await state(),
      delta = target.map((v, i) => v - s.position[i]);
    if (Math.hypot(...delta) < radius) return;
    const keys = [];
    if (Math.abs(delta[0]) > 1) keys.push(delta[0] > 0 ? "d" : "a");
    if (Math.abs(delta[1]) > 1) keys.push(delta[1] > 0 ? "Space" : "c");
    if (Math.abs(delta[2]) > 1) keys.push(delta[2] > 0 ? "s" : "w");
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(85);
    for (const k of keys) await page.keyboard.up(k);
  }
  throw Error(`Cannot reach ${target}; state ${JSON.stringify(await state())}`);
}
await page.addInitScript(() => {
  if (!localStorage.getItem("narayana.hadal.v1"))
    localStorage.setItem(
      "narayana.hadal.v1",
      JSON.stringify({ version: 1, experience: "terraces" }),
    );
});
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5177/", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "Enter the ocean" }).click();
  await page.waitForTimeout(2000);
  assert.equal((await state()).expedition.active, "reef");
  assert.equal((await state()).turbo, true);
  await page.screenshot({ path: "artifacts/terraces-01-opening.png" });
  console.log(
    "Opening",
    JSON.stringify({
      position: (await state()).position,
      fps: (await state()).fps,
      drawCalls: (await state()).drawCalls,
    }),
  );
  if (process.argv.includes("--preview")) {
    assert.deepEqual(errors, []);
    process.exitCode = 0;
  } else {
    if (!process.argv.includes("--visual-only")) {
      await key("m");
      assert.equal(
        await page.locator("[data-space][disabled]").count(),
        MAIN_SPACES.length - 1,
      );
      const city = SPACES.find((s) => s.bonus);
      assert.equal(
        await page.locator(`[data-space="${city.index}"]`).isEnabled(),
        true,
      );
      await key("Escape");
      await page.getByRole("button", { name: "Toggle turbo jet mode" }).click();
      await page.waitForTimeout(100);
      assert.equal((await state()).turbo, false);
      await key("y");
      assert.equal((await state()).turbo, true);
      await key("v");
      assert.equal((await state()).perception, "spectral");
      const slider = page.getByRole("slider", { name: "UV vision brightness" });
      await slider.fill("0.9");
      await slider.dispatchEvent("input");
      await page.waitForTimeout(100);
      assert.equal((await state()).uvStrength, 0.9);
      await key("Tab");
      await key("[");
      assert.ok(Math.abs((await state()).uvStrength - 0.8) < 0.01);
      await key("p");
      assert.ok((await state()).lamp.enabled);
      await key("p");
      await key("v");
      await key("r");
      for (let i = 0; i < 5; i++) {
        await swim((await state()).expedition.nodes[i].position, 3.4);
        await page.waitForTimeout(200);
        assert.equal((await state()).expedition.progress, i + 1);
        console.log(
          "Reached terrace",
          i + 1,
          "depth",
          Math.round((await state()).depth),
        );
      }
      assert.equal((await state()).expedition.unlocked, 1);
      await page.screenshot({ path: "artifacts/terraces-02-bottom.png" });
      await swim((await state()).expedition.gate, 6);
      await key("f");
      await page.waitForTimeout(4200);
      assert.equal((await state()).expedition.active, "canyon");
      // Measure travel speed through open water above the descending shelves.
      await page.keyboard.down("w");
      await page.keyboard.down("Shift");
      await page.waitForTimeout(1700);
      const speed = Math.hypot(...(await state()).velocity);
      for (const k of ["w", "Shift", "c"]) await page.keyboard.up(k);
      assert.ok(speed > 40, `turbo speed ${speed}`);
      console.log("Browser turbo speed", speed);
      await page.waitForTimeout(700);
      assert.ok(Math.hypot(...(await state()).velocity) < 12);
    }
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("narayana.hadal.v1")),
    );
    if (!process.argv.includes("--visual-only")) {
      assert.ok(saved.expedition.completed.includes("reef"));
      assert.equal(saved.settings.turbo, true);
      assert.equal(saved.settings.uvStrength, 0.8);
    }
    // Independently seeded completed save allows visual inspection of every destination.
    await page.close();
    page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("fonts.google"))
        errors.push(m.text());
    });
    await page.addInitScript(
      (save) => localStorage.setItem("narayana.hadal.v1", JSON.stringify(save)),
      {
        ...saved,
        version: 1,
        experience: "terraces",
        expedition: {
          routeVersion: 2,
          completed: SPACES.map((s) => s.id),
          active: "reef",
          progress: {},
        },
        position: SPACES[0].position.toArray(),
      },
    );
    await page.goto(process.env.GAME_URL || "http://localhost:5177/", {
      waitUntil: "networkidle",
    });
    await page.getByRole("button", { name: "Enter the ocean" }).click();
    await page.waitForTimeout(1800);
    assert.equal((await state()).expedition.unlocked, MAIN_SPACES.length - 1);
    for (const space of SPACES) {
      await key("m");
      await page.locator(`[data-space="${space.index}"]`).click();
      await page.waitForTimeout(3300);
      assert.equal((await state()).expedition.active, space.id);
      assert.ok((await state()).position.every(Number.isFinite));
      if (["canyon", "gardens", "naga", "heart"].includes(space.id)) {
        if ((await state()).perception === "spectral") await key("v");
        await page.waitForTimeout(700);
        await page.screenshot({
          path: `artifacts/terraces-${space.id}-natural.png`,
        });
        await key("v");
        await page.waitForTimeout(900);
        await page.screenshot({
          path: `artifacts/terraces-${space.id}-uv.png`,
        });
      }
      console.log(
        "PASS space",
        space.id,
        "fps",
        (await state()).fps,
        "draw calls",
        (await state()).drawCalls,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "artifacts/terraces-mobile.png" });
    assert.ok(
      await page
        .getByRole("button", { name: "Toggle turbo jet mode" })
        .isVisible(),
    );
    assert.ok(
      await page
        .getByRole("slider", { name: "UV vision brightness" })
        .isVisible(),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS terraces, gates, bonus city, turbo, UV controls, persistence and all space renders",
    );
  }
} finally {
  await browser.close();
}
