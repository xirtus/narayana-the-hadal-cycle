import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
const cached = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const b = await chromium.launch({
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
const p = await b.newPage({ viewport: { width: 1512, height: 982 } }),
  errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("fonts.google"))
    errors.push(m.text());
});
const state = () => p.evaluate(() => window.narayana.state);
const key = async (k, ms = 80) => {
  await p.keyboard.down(k);
  await p.waitForTimeout(ms);
  await p.keyboard.up(k);
};
async function change(id) {
  await p
    .getByRole("button", { name: "Choose ocean experience", exact: true })
    .click();
  await Promise.all([
    p.waitForEvent("domcontentloaded"),
    p.locator(`[data-experience="${id}"]`).click(),
  ]);
  await p.waitForFunction((id) => window.narayana?.state.experience === id, id);
  await p.getByRole("button", { name: "Enter the ocean" }).click();
  await p.waitForTimeout(1800);
  assert.equal((await state()).experience, id);
}
try {
  await p.goto(process.env.GAME_URL || "http://localhost:5177/", {
    waitUntil: "networkidle",
  });
  await p.getByRole("button", { name: "Enter the ocean" }).click();
  await p.waitForTimeout(1800);
  assert.equal((await state()).experience, "ocean");
  assert.equal((await state()).expedition.active, undefined);
  await p.screenshot({ path: "artifacts/experience-original-ocean.png" });
  await key("m");
  assert.equal(await p.locator("[data-travel]").count(), 7);
  await p.locator('[data-travel="1"]').click();
  await p.waitForTimeout(2100);
  assert.equal((await state()).chapter, 1);
  const oceanPosition = (await state()).position;
  await p.screenshot({ path: "artifacts/experience-original-canyon.png" });
  await change("trench");
  assert.equal((await state()).expedition.active, "canyon");
  assert.equal((await state()).expedition.terrace, null);
  assert.equal((await state()).expedition.nodes.length, 5);
  await key("m");
  assert.equal(await p.locator("[data-space]").count(), 12);
  assert.equal(await p.locator("[data-space][disabled]").count(), 0);
  await p.locator('[data-space="1"]').click();
  await p.waitForTimeout(3200);
  assert.equal((await state()).expedition.active, "reef");
  assert.ok(Math.abs((await state()).depth - 90) < 4);
  const trenchPosition = (await state()).position;
  await p.screenshot({
    path: "artifacts/experience-original-dolphin-passage.png",
  });
  await change("terraces");
  assert.equal((await state()).expedition.active, "reef");
  assert.equal((await state()).expedition.terrace, "The nursery");
  const nodes = (await state()).expedition.nodes;
  assert.ok(nodes[4].position[1] < nodes[0].position[1] - 70);
  await key("w", 2300);
  await key("v");
  await key("y");
  const terracePosition = (await state()).position;
  await p.screenshot({ path: "artifacts/experience-terraced-descent.png" });
  await change("ocean");
  assert.equal((await state()).chapter, 1);
  assert.equal((await state()).expedition.active, undefined);
  assert.ok(
    Math.hypot(
      ...(await state()).position.map((v, i) => v - oceanPosition[i]),
    ) < 6,
  );
  assert.equal((await state()).perception, "spectral");
  assert.equal((await state()).turbo, false);
  await change("trench");
  assert.equal((await state()).expedition.active, "reef");
  assert.ok(
    Math.hypot(
      ...(await state()).position.map((v, i) => v - trenchPosition[i]),
    ) < 6,
  );
  await change("terraces");
  assert.ok(
    Math.hypot(
      ...(await state()).position.map((v, i) => v - terracePosition[i]),
    ) < 6,
  );
  const slots = await p.evaluate(
    () => JSON.parse(localStorage.getItem("narayana.hadal.v1")).journeys,
  );
  assert.deepEqual(Object.keys(slots).sort(), ["ocean", "terraces", "trench"]);
  await p.setViewportSize({ width: 390, height: 844 });
  await p
    .getByRole("button", { name: "Choose ocean experience", exact: true })
    .click();
  await p.screenshot({ path: "artifacts/experience-selector-mobile.png" });
  assert.equal(await p.locator("[data-experience]").count(), 3);
  assert.deepEqual(errors, []);
  console.log(
    "PASS original ocean + all seven-zone atlas, preserved trench/dolphin layout, separate terraced route, round-trip saved positions and shared preferences, mobile selector",
  );
} finally {
  await b.close();
}
