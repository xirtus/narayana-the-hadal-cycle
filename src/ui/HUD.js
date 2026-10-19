import { EXPERIENCES } from "../core/SaveSystem.js";
import { DEPTH_LEVELS } from "../world/DepthLevels.js";
import { SPECIES } from "../ecology/species.js";

export const CHAPTERS = [
  {
    name: "The kelp cathedral",
    region: "MONTEREY BAY",
    zone: "Sunlight",
    depth: 18,
    tag: "I",
    color: "#adc88f",
    text: "Where sunlight becomes a forest. Follow the silver shoals through the giant kelp, and listen for the call beneath the reef.",
  },
  {
    name: "The blue between",
    region: "MONTEREY CANYON",
    zone: "Twilight",
    depth: 360,
    tag: "II",
    color: "#77b8cb",
    text: "The last blue light gives way to living constellations. A lost research beacon listens to something beneath the canyon.",
  },
  {
    name: "A thousand little stars",
    region: "THE MIDNIGHT OCEAN",
    zone: "Midnight",
    depth: 2400,
    tag: "III",
    color: "#a1a4e1",
    text: "Marine snow falls through a world without sunrise. The pressure carries an ancient memory. Follow it.",
  },
  {
    name: "The quiet after giants",
    region: "THE ABYSSAL PLAIN",
    zone: "Abyssal",
    depth: 4150,
    tag: "IV",
    color: "#9acdc6",
    text: "A fallen whale becomes a universe. Between glass sponges and patient scavengers, the stone begins to remember.",
  },
  {
    name: "A rhythm in the stone",
    region: "THE HADAL GATES",
    zone: "Hadal",
    depth: 6540,
    tag: "V",
    color: "#c1ab88",
    text: "The world moves to a slow, immense rhythm. Preservation and dissolution are two currents of the same ocean.",
  },
  {
    name: "The dreaming serpent",
    region: "MARIANA LABYRINTH",
    zone: "Labyrinth",
    depth: 8060,
    tag: "VI",
    color: "#b0a1d1",
    text: "Beyond the familiar Pacific, biology and myth entwine. The Nāga keeps a memory older than this stone.",
  },
  {
    name: "Where the ocean ends",
    region: "CHALLENGER DEEP",
    zone: "Challenger",
    depth: 10845,
    tag: "VII",
    color: "#d8b16e",
    text: "The deepest gate is listening. Carry the memories of a living ocean into the mechanism, and choose what follows.",
  },
];
const icons = {
  lotus:
    '<path d="M12 3C5 10 5 15 12 19C19 15 19 10 12 3Z"/><path d="M7 9L3 7C2 15 7 19 12 21C17 19 22 15 21 7L17 9"/>',
  sound:
    '<path d="M11 5L6 9H3V15H6L11 19Z"/><path d="M15 8Q20 12 15 16M18 4Q26 12 18 20"/>',
  book: '<path d="M12 6C8 3 5 4 2 5V20C6 18 9 19 12 21C15 19 18 18 22 20V5C19 4 16 3 12 6Z"/><path d="M12 6V21"/>',
  pause: '<path d="M8 5V19M16 5V19"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M16 8L14 14L8 16L10 10Z"/>',
  arrow: '<path d="M12 3V21M6 15L12 21L18 15"/>',
  close: '<path d="M6 6L18 18M18 6L6 18"/>',
  squid:
    '<path d="M12 2C4 11 6 14 10 15L8 22M12 15V23M14 15L16 22M7 9L3 13M17 9L21 13C18 9 16 5 12 2"/>',
  pulse:
    '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 1V4M12 20V23M1 12H4M20 12H23"/>',
  ink: '<path d="M12 2C10 7 5 11 5 15A7 7 0 0 0 19 15C19 11 14 7 12 2Z"/><path d="M8 15Q8 18 11 19"/>',
  jet: '<path d="M3 8H12M1 12H10M3 16H12M13 4L22 12L13 20"/>',
  eye: '<path d="M2 12Q12 0 22 12Q12 24 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  grab: '<path d="M4 7C1 17 6 22 12 21C20 20 23 11 18 7C14 3 11 9 14 12M9 3C5 7 6 12 9 14"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.lotus}</svg>`;
export class HUD {
  constructor(game) {
    this.game = game;
    this.activePanel = null;
    this.toastTimer = 0;
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || !this.activePanel) return;
      const elements = [
        ...document.querySelectorAll(
          "#panel button,#panel a,#panel input,#panel select",
        ),
      ].filter((el) => !el.disabled && el.getClientRects().length);
      const first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    });
    document.querySelector("#app").innerHTML = `
      <div class="vignette"></div><div class="grain"></div>
      <header class="topbar">
        <a class="wordmark" href="#" aria-label="Narayana home">${icon("lotus")}<span>NARAYANA<small>THE HADAL CYCLE</small></span></a>
        <div class="compass"><span>W</span><i></i><i></i><span id="heading">N</span><i></i><i></i><span>E</span><b>◇</b></div>
        <nav aria-label="Game menus"><button data-panel="experiences" class="icon-button" aria-label="Choose ocean experience" title="Choose experience">◇</button><button id="lamp-button" class="icon-button lamp-button" data-key="KeyP" aria-label="Toggle dive flashlight" aria-pressed="false" title="Dive flashlight · P">☀<kbd>P</kbd></button><button id="sound-button" class="icon-button" aria-label="Toggle sound" title="Sound">${icon("sound")}</button><button data-panel="journal" class="icon-button" aria-label="Field journal" title="Field journal · J">${icon("book")}</button><button data-panel="atlas" class="icon-button" aria-label="Depth atlas" title="Depth atlas · M">${icon("compass")}</button><span class="nav-line"></span><button data-panel="pause" class="icon-button" aria-label="Pause game" title="Pause · Esc">${icon("pause")}</button></nav>
      </header>
      <div class="location"><span class="live-dot"></span><span id="region">MONTEREY BAY, CALIFORNIA</span><span class="coordinates">36°36′ N &nbsp; 121°54′ W</span></div>
      <aside class="mission hidden" id="mission"><span class="eyebrow">THE FIRST CURRENT</span><div id="objective">Listen to the forest</div><p id="objective-hint">Release a Narayana pulse with E.</p><div class="objective-progress"><i id="objective-fill"></i></div></aside>
      <section class="intro" id="intro">
        <div class="eyebrow"><span class="fine-line"></span> AN UNDERWATER ODYSSEY</div>
        <h1>The ocean<br>remembers.</h1>
        <p>One small life. An infinite world below.<br>Become the current, and follow it home.</p>
        <button class="enter-button" id="enter">Enter the ocean <span>↗</span></button>
        <button class="experience-entry" data-panel="experiences">${EXPERIENCES.find((e) => e.id === game.experience).name} · Change experience ↗</button><div class="intro-foot">HEADPHONES RECOMMENDED <span>·</span> TAKE YOUR TIME</div>
      </section>
      <div class="level-ribbon" id="level-ribbon"><div><span id="level-count">LEVEL 01 / 07</span><span id="light-state">SUNLIT KELP</span></div><div class="level-steps">${Array.from({ length: 7 }, (_, i) => `<i data-level="${i}" class="${i === 0 ? "active" : ""}"></i>`).join("")}</div></div>
      <div class="hunt-controls hidden" id="hunt-controls"><button class="attack-button" data-key="KeyX" aria-label="Attack with feeding tentacles" title="X or left-click · Hold to hunt repeatedly"><span class="attack-symbol">${icon("grab")}</span><span>Attack<small>X / LEFT CLICK</small></span></button><label class="uv-control" title="UV vision brightness · [ / ]">UV gain<input id="uv-strength" aria-label="UV vision brightness" type="range" min="0" max="1" step=".05" value="${this.game.settings.uvStrength}"></label><div class="hunt-readout"><span id="hunt-state">TENTACLES READY</span><strong id="hunt-target">Approach a small fish</strong><div class="hunt-phases"><i data-hunt-phase="strike">GRAB</i><i data-hunt-phase="retract">PULL</i><i data-hunt-phase="feed">BITE</i></div></div><button class="spectral-button" data-key="KeyV" aria-label="Toggle UV squid vision" title="V · Toggle UV vision · [ / ] adjusts brightness">${icon("eye")}<span>UV vision</span><kbd>V</kbd></button></div>
      <div class="current-readout hidden" id="current-readout"><span class="eyebrow">NEXT DEPTH LEVEL</span><strong id="current-name"></strong><span id="current-distance"></span></div>
      <div class="level-arrival" id="level-arrival"><span class="eyebrow" id="arrival-number"></span><strong id="arrival-name"></strong><small id="arrival-light"></small></div>
      <div class="reticle hidden" id="reticle"><i></i><i></i></div>
      <div class="context-prompt hidden" id="context-prompt"></div>
      <div class="specimen" id="specimen"><div class="specimen-mark">${icon("squid")}</div><div><span class="eyebrow">YOUR INCARNATION</span><strong id="species-name">California market squid</strong><em id="scientific-name">Doryteuthis opalescens</em></div><span class="specimen-index">01</span></div>
      <div class="chapter-caption"><div class="eyebrow" id="chapter-number">CHAPTER I &nbsp; / &nbsp; THE SUNLIGHT ZONE</div><h2 id="chapter-title">The kelp cathedral</h2><div class="chapter-note"><span class="fine-line"></span><span id="chapter-note">There is a whole universe beneath the surface.</span></div></div>
      <aside class="depth-display"><div class="eyebrow">DEPTH BELOW THE SURFACE</div><div class="depth-number"><span id="depth">012</span><span class="unit">m</span></div><div class="depth-ticks"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="water-data"><span><b id="temperature">13.2</b> °C</span><span><b id="pressure">2.2</b> bar</span><span id="zone-label">SUNLIGHT</span></div></aside>
      <footer class="bottom-bar"><div class="vitality"><div class="vitality-symbol">${icon("lotus")}</div><div><div class="vitality-label"><span id="movement-mode">DRIFTING</span><span id="vitality-value">100</span></div><div class="meter"><i id="stamina-meter"></i></div><div class="incarnation">INCARNATION <span id="incarnation">01</span><span class="memory-dot">·</span><span id="memory-count">0</span> MEMORIES</div></div></div>
      <div class="action-dock"><button data-key="KeyW" title="WASD to swim · Space to rise · C to descend"><span class="key">W A S D</span><span>Swim</span></button><button data-key="ShiftLeft">${icon("jet")}<span>Jet</span><kbd>⇧</kbd></button><button id="turbo-button" data-key="KeyY" aria-label="Toggle turbo jet mode" aria-pressed="true"><span>Turbo ON</span><kbd>Y</kbd></button><button data-key="KeyE">${icon("pulse")}<span>Pulse</span><kbd>E</kbd></button><button data-key="KeyQ">${icon("ink")}<span>Ink</span><kbd>Q</kbd></button><button data-key="KeyR">${icon("eye")}<span>Camouflage</span><kbd>R</kbd></button><button data-key="KeyG">${icon("grab")}<span>Anchor</span><kbd>G</kbd></button></div>
      <button class="help-button" data-panel="controls"><span>?</span><span>CONTROLS</span></button></footer>
      <div class="toast" id="toast" role="status"><span class="toast-icon">${icon("pulse")}</span><div><span class="eyebrow" id="toast-label">DISCOVERY</span><span id="toast-text"></span></div></div>
      <div class="transition" id="transition"><span class="eyebrow" id="transition-label">THE OCEAN REMEMBERS</span><h2 id="transition-title"></h2><p id="transition-text"></p></div>
      <div class="panel-backdrop hidden" id="panel-backdrop"><section class="panel" id="panel" role="dialog" aria-modal="true" aria-label="Game menu"><button class="panel-close icon-button" id="panel-close" aria-label="Close menu">${icon("close")}</button><div id="panel-content"></div></section></div>
      <section class="combat-panel hidden" id="combat-panel" aria-label="Enemy encounter"><div class="combat-heading"><span id="combat-label">ROUTE ENCOUNTER</span><span id="combat-route"></span></div><strong id="enemy-name"></strong><div class="enemy-health"><i id="enemy-health"></i></div><span id="enemy-intent"></span><div class="combo-line"><strong id="combo-count"></strong><span id="combo-move"></span></div><div class="combo-timer"><i id="combo-timer"></i></div></section>
      <div class="battle-actions hidden" id="battle-actions"><button data-key="KeyZ" aria-label="Jet evade">Evade <kbd>Z</kbd><small id="evade-ready">READY</small></button><button data-key="KeyB" aria-label="Arm sweep">Sweep <kbd>B</kbd><small id="sweep-ready">READY</small></button><button data-key="KeyL" aria-label="Focus enemy">Focus <kbd>L</kbd></button><button data-key="KeyQ" aria-label="Combat ink cloud">Ink <kbd>Q</kbd></button></div>
      <div class="habitat-readout hidden" id="habitat-readout"><span class="eyebrow">LIVING SANCTUARY</span><strong id="habitat-name"></strong><span id="habitat-hint"></span><div><button data-key="KeyE">Restore <kbd>E</kbd></button><button data-key="KeyH">Observe <kbd>H</kbd></button></div><div class="observation-progress"><i id="observation-progress"></i></div></div>
      <div class="mobile-controls"><button data-hold="KeyW" aria-label="Swim forward">↑</button><button data-hold="Space" aria-label="Ascend">＋</button><button data-hold="KeyC" aria-label="Descend">−</button></div>
      <div class="loading" id="loading"><div class="loading-mark">${icon("lotus")}</div><span>NARAYANA</span><p>Gathering the ocean…</p></div>`;
    document
      .querySelector("#enter")
      .addEventListener("click", () => game.start());
    document.querySelector(".wordmark").addEventListener("click", (e) => {
      e.preventDefault();
      this.openPanel("pause");
    });
    document.querySelector("#sound-button").addEventListener("click", () => {
      game.toggleSound();
      this.updateSound();
    });
    document
      .querySelectorAll("[data-panel]")
      .forEach((b) =>
        b.addEventListener("click", () => this.openPanel(b.dataset.panel)),
      );
    document
      .querySelector("#panel-close")
      .addEventListener("click", () => this.closePanel());
    document.querySelector("#panel-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "panel-backdrop") this.closePanel();
    });
    document.querySelectorAll("[data-key]").forEach((b) =>
      b.addEventListener("click", () => {
        if (!game.started) game.start();
        if (b.dataset.key === "KeyW") {
          this.openPanel("controls");
          return;
        }
        game.input.pressed.add(b.dataset.key);
      }),
    );
    document
      .getElementById("uv-strength")
      .addEventListener("input", (e) =>
        game.adjustVision(Number(e.target.value)),
      );
    const jetButton = document.querySelector('[data-key="ShiftLeft"]');
    jetButton.addEventListener("pointerdown", (e) => {
      if (!game.started) game.start();
      e.preventDefault();
      jetButton.setPointerCapture(e.pointerId);
      game.input.keys.add("ShiftLeft");
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      jetButton.addEventListener(event, () =>
        game.input.keys.delete("ShiftLeft"),
      );
    const attackButton = document.querySelector(".attack-button");
    attackButton.addEventListener("pointerdown", (e) => {
      if (!game.started) game.start();
      attackButton.setPointerCapture(e.pointerId);
      game.input.keys.add("KeyX");
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      attackButton.addEventListener(event, () =>
        game.input.keys.delete("KeyX"),
      );
    document.querySelectorAll("[data-hold]").forEach((b) => {
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        game.input.keys.add(b.dataset.hold);
      });
      for (const event of ["pointerup", "pointercancel"])
        b.addEventListener(event, () => game.input.keys.delete(b.dataset.hold));
    });
    this.els = Object.fromEntries(
      [
        "depth",
        "temperature",
        "pressure",
        "zone-label",
        "stamina-meter",
        "movement-mode",
        "vitality-value",
        "incarnation",
        "memory-count",
        "heading",
      ].map((id) => [id, document.getElementById(id)]),
    );
  }
  ready() {
    document.getElementById("loading").classList.add("loaded");
    this.updateSound();
  }
  begin() {
    document.getElementById("intro").classList.add("departed");
    document.getElementById("mission").classList.remove("hidden");
    document.getElementById("reticle").classList.remove("hidden");
    document.getElementById("hunt-controls").classList.remove("hidden");
    document.body.classList.add("playing");
  }
  updateSound() {
    const b = document.getElementById("sound-button");
    b.classList.toggle("muted", !this.game.audio.enabled);
    b.setAttribute(
      "aria-label",
      this.game.audio.enabled ? "Mute sound" : "Enable sound",
    );
  }
  update(dt) {
    const g = this.game,
      d = Math.max(0, -g.player.position.y);
    this.els.depth.textContent = Math.floor(d).toString().padStart(3, "0");
    this.els.temperature.textContent = Math.max(
      1.4,
      13.2 - 10.6 * (1 - Math.exp(-d / 700)),
    ).toFixed(1);
    this.els.pressure.textContent = (1 + d * 0.1006).toFixed(1);
    this.els["zone-label"].textContent =
      CHAPTERS[g.chapterIndex].zone.toUpperCase();
    this.els["stamina-meter"].style.width =
      `${Math.round(g.player.stamina * 100)}%`;
    this.els["vitality-value"].textContent = Math.round(g.health * 100);
    this.els["movement-mode"].textContent = g.ride
      ? "RIDING"
      : g.player.camouflage
        ? "CAMOUFLAGED"
        : g.player.mode === "anchored"
          ? "ANCHORED"
          : g.player.mode === "crawling"
            ? "CRAWLING"
            : g.player.jetAmount > 0.3
              ? "MANTLE JET"
              : g.player.velocity.length() > 0.4
                ? "FIN CRUISING"
                : "DRIFTING";
    this.els.incarnation.textContent = String(g.save.data.incarnation).padStart(
      2,
      "0",
    );
    this.els["memory-count"].textContent = g.save.data.memories;
    const angle = ((((g.input.yaw * 180) / Math.PI) % 360) + 360) % 360;
    this.els.heading.textContent = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
      Math.round(angle / 45) % 8
    ];
    this.updateHunt();
    this.updateCombat();
    const turbo = document.getElementById("turbo-button");
    turbo.classList.toggle("active", g.player.turboMode);
    turbo.setAttribute("aria-pressed", String(g.player.turboMode));
    turbo.querySelector("span").textContent = g.player.turboMode
      ? "Turbo ON"
      : "Precision";
    document
      .getElementById("lamp-button")
      .classList.toggle("active", g.lamp.enabled);
    document
      .getElementById("lamp-button")
      .setAttribute("aria-pressed", String(g.lamp.enabled));
    document.getElementById("light-state").textContent =
      g.perception === "spectral"
        ? `UV VISION · ${Math.round(g.settings.uvStrength * 100)}%`
        : [
            "AMBER / GREEN",
            "BLUE / VIOLET",
            "BIOLUMINESCENCE",
            "LIVING CYAN",
            "NEAR-TOTAL DARKNESS",
            "VIOLET / TURQUOISE",
            "VOLCANIC GLOW",
          ][g.chapterIndex];
    document
      .querySelector(".spectral-button")
      .classList.toggle("active", g.perception === "spectral");
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0)
        document.getElementById("toast").classList.remove("visible");
    }
  }
  chapter(index) {
    const space = this.game.expedition?.space;
    const c = space
      ? {
          ...CHAPTERS[index],
          name: space.name,
          region: space.biome,
          text: space.hint,
        }
      : CHAPTERS[index];
    const level = DEPTH_LEVELS[index];
    document.getElementById("level-count").textContent =
      `LEVEL ${String(index + 1).padStart(2, "0")} / 07`;
    document.querySelectorAll("[data-level]").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.level) === index);
      el.classList.toggle("passed", Number(el.dataset.level) < index);
    });
    document.querySelector(".coordinates").style.display =
      index > 1 ? "none" : "";
    if (this.game.started && !this.game.traveling) {
      document.getElementById("arrival-number").textContent =
        `LEVEL ${index + 1} · ${c.region}`;
      document.getElementById("arrival-name").textContent = c.name;
      document.getElementById("arrival-light").textContent =
        level.lightDescription;
      const arrival = document.getElementById("level-arrival");
      arrival.classList.add("visible");
      clearTimeout(this.arrivalTimer);
      this.arrivalTimer = setTimeout(
        () => arrival.classList.remove("visible"),
        4400,
      );
    }
    document.getElementById("chapter-title").textContent = c.name;
    document.getElementById("chapter-number").textContent =
      `CHAPTER ${c.tag}  /  THE ${c.zone.toUpperCase()} ZONE`;
    document.getElementById("chapter-note").textContent =
      index === 0
        ? "There is a whole universe beneath the surface."
        : c.text.split(". ")[0] + ".";
    document.getElementById("region").textContent =
      index === 0 ? "MONTEREY BAY, CALIFORNIA" : c.region;
    document.documentElement.style.setProperty("--accent", c.color);
  }
  updateHunt() {
    const hunt = this.game.hunting.status,
      phase = hunt.phase;
    const names = {
      idle: "TENTACLES READY",
      windup: "SIGHTING PREY",
      strike: "TENTACLES EXTENDING",
      retract: "PULLING PREY TO MOUTH",
      feed: "ARMS HOLD · BEAK BITES",
      recover: "ARMS RELEASING",
    };
    document.getElementById("hunt-state").textContent = names[phase];
    document.getElementById("hunt-target").textContent = hunt.target
      ? `${hunt.target}${hunt.distance !== null ? " · " + hunt.distance.toFixed(1) + " m" : ""}`
      : `Reach ${hunt.reach.toFixed(1)} m · aim toward small fish`;
    document
      .querySelector(".attack-button")
      .classList.toggle("ready", hunt.ready && !this.game.hunting.active);
    document
      .querySelector(".hunt-readout")
      .classList.toggle("in-range", hunt.ready);
    document
      .querySelectorAll("[data-hunt-phase]")
      .forEach((el) =>
        el.classList.toggle("active", el.dataset.huntPhase === phase),
      );
  }
  updateCombat() {
    const g = this.game,
      c = g.combat.status,
      e = c.target;
    const visible =
      g.started &&
      !!e &&
      e.distance < 65 &&
      (c.locked || e.distance < 30 || e.state !== "patrol");
    document
      .getElementById("combat-panel")
      .classList.toggle("hidden", !visible);
    document
      .getElementById("battle-actions")
      .classList.toggle("hidden", !g.started);
    document.body.classList.toggle(
      "in-combat",
      visible && e.state !== "patrol",
    );
    document.getElementById("combat-route").textContent =
      `${c.total - c.remaining} / ${c.total} CLEARED`;
    document.getElementById("combat-label").textContent = e?.mythic
      ? "ASURIC ENCOUNTER"
      : "ROUTE ENCOUNTER";
    if (e) {
      document.getElementById("enemy-name").textContent =
        `${c.locked ? "◇ " : ""}${e.name} · ${Math.round(e.distance)} m`;
      document.getElementById("enemy-health").style.width =
        `${(100 * e.hp) / e.maxHp}%`;
      document.getElementById("enemy-intent").textContent =
        {
          patrol: "Patrolling · L focuses · quiet fins can slip past",
          approach: "Closing in · prepare to evade",
          windup: "ATTACK INCOMING · Z EVADE / Q INK",
          lunge: "LUNGE · EVADE SIDEWAYS",
          sonar: "PRESSURE WAVE · TIME YOUR EVADE",
          recover: "OPENING · CHAIN YOUR ATTACKS",
          stunned: "STAGGERED · CLOSE IN AND ATTACK",
        }[e.state] || "";
      document
        .getElementById("combat-panel")
        .classList.toggle(
          "danger",
          ["windup", "lunge", "sonar"].includes(e.state),
        );
    }
    document.getElementById("combo-count").textContent = c.streak
      ? `${c.streak} HITS`
      : "X → X → X";
    document.getElementById("combo-move").textContent =
      c.move || "Lash → Crosscut → Beak rush";
    document.getElementById("combo-timer").style.width =
      `${Math.min(100, (c.chainTime / 1.6) * 100)}%`;
    document.getElementById("evade-ready").textContent =
      c.dodgeCooldown > 0 ? `${c.dodgeCooldown.toFixed(1)}s` : "READY";
    document.getElementById("sweep-ready").textContent =
      c.sweepCooldown > 0 ? `${c.sweepCooldown.toFixed(1)}s` : "READY";
    if (c.active || (e && e.distance < 6)) {
      document.getElementById("hunt-state").textContent = c.active
        ? `COMBO ${c.chain} / 3`
        : "ENEMY IN REACH";
      document.getElementById("hunt-target").textContent = c.active
        ? c.move
        : e.name;
    }
    const r = g.restoration.status,
      show = g.started && r.name && r.distance < 85 && !g.combat.nearby;
    document
      .getElementById("habitat-readout")
      .classList.toggle("hidden", !show);
    document.body.classList.toggle("at-habitat", show && r.distance < 18);
    if (show) {
      document.getElementById("habitat-name").textContent = r.name;
      const p = r.position,
        dx = p[0] - g.player.position.x,
        dz = p[2] - g.player.position.z;
      const angle = Math.atan2(dx, -dz) - g.input.yaw,
        turn = Math.atan2(Math.sin(angle), Math.cos(angle));
      const arrow = Math.abs(turn) < 0.4 ? "↑" : turn > 0 ? "→" : "←";
      document.getElementById("habitat-hint").textContent = r.meditating
        ? "Resting in the current · move to leave"
        : r.distance > 14
          ? `${arrow} ${Math.round(r.distance)} m · follow the living beacon`
          : r.restored
            ? "Life restored · H observes and replenishes you"
            : "Pulse E to awaken this habitat";
      document.getElementById("observation-progress").style.width =
        `${r.progress * 100}%`;
    }
  }
  expeditionStatus() {
    const g = this.game,
      s = g.expedition.status;
    if (!s.active) return;
    this.objective(
      s.complete
        ? s.name
        : `${s.terrace || s.name} · ${s.progress + 1}/${s.total}`,
      s.hint,
      s.progress / s.total,
    );
    const target = s.target;
    if (!target) return;
    const d = Math.hypot(
      ...target.map((v, i) => v - g.player.position.toArray()[i]),
    );
    const angle =
      Math.atan2(
        target[0] - g.player.position.x,
        -(target[2] - g.player.position.z),
      ) - g.input.yaw;
    const turn = Math.atan2(Math.sin(angle), Math.cos(angle)),
      arrow = Math.abs(turn) < 0.35 ? "↑" : turn > 0 ? "→" : "←";
    document.getElementById("current-readout").classList.remove("hidden");
    document.getElementById("current-name").textContent = s.complete
      ? s.next || "The event horizon"
      : `${s.task === "current" ? "CURRENT" : "ECHO"} ${s.progress + 1} / ${s.total}`;
    document.getElementById("current-distance").textContent =
      `${arrow} ${Math.round(d)} m · ${s.complete ? "F enters the passage" : s.task === "current" ? "Swim through the ring" : "E answers nearby"}`;
    document.getElementById("level-count").textContent = s.bonus
      ? "BONUS · CITY PROTOTYPE"
      : `${g.experience === "trench" ? "REGION" : "DESCENT"} ${String(s.index + 1).padStart(2, "0")} / ${g.expedition.mainSpaces.length}`;
    document.getElementById("region").textContent = s.biome.toUpperCase();
    document.querySelector(".coordinates").style.display = "none";
    if (g.hunting.active || g.combat.active || g.combat.nearby)
      this.context("");
    else if (d < 9)
      this.context(
        s.complete
          ? "F · Enter the open current"
          : s.task === "current"
            ? "Follow the blue squid into the next current"
            : `E · ${s.task === "rescue" ? "Free the trapped shoal" : s.task === "survey" ? "Record the memorial beacon" : "Sound the echo seal"}`,
      );
    else
      this.context(
        g.expedition.space.zone > 0 && !g.lamp.enabled
          ? "V · UV vision · [ / ] brightness · P flashlight"
          : "",
      );
  }
  current(current) {
    const el = document.getElementById("current-readout");
    el.classList.toggle("hidden", !current || !this.game.started);
    if (!current) return;
    document.getElementById("current-name").textContent =
      `${String(current.nextLevel + 1).padStart(2, "0")} · ${CHAPTERS[current.nextLevel].name}`;
    const delta = current.position.clone().sub(this.game.player.position),
      bearing = Math.atan2(delta.x, -delta.z) - this.game.input.yaw,
      turn = Math.atan2(Math.sin(bearing), Math.cos(bearing)),
      arrow =
        Math.abs(turn) < 0.35
          ? "↑"
          : turn > 0
            ? turn > 2.4
              ? "↘"
              : "→"
            : turn < -2.4
              ? "↙"
              : "←";
    const vertical =
      Math.abs(delta.y) > 5
        ? `${delta.y < 0 ? "Dive" : "Rise"} ${Math.round(Math.abs(delta.y))} m`
        : "Same depth";
    document.getElementById("current-distance").textContent =
      `${arrow} ${Math.round(delta.length())} m · ${vertical} · F nearby`;
  }
  species(value) {
    document.getElementById("species-name").textContent =
      value === "octopus" ? "Giant Pacific octopus" : "California market squid";
    document.getElementById("scientific-name").textContent =
      value === "octopus" ? "Enteroctopus dofleini" : "Doryteuthis opalescens";
  }
  objective(title, hint, progress) {
    document.getElementById("objective").textContent = title;
    document.getElementById("objective-hint").textContent = hint;
    document.getElementById("objective-fill").style.width =
      `${progress * 100}%`;
  }
  toast(text, label = "THE OCEAN WHISPERS") {
    document.getElementById("toast-text").textContent = text;
    document.getElementById("toast-label").textContent = label;
    document.getElementById("toast").classList.add("visible");
    this.toastTimer = 5;
  }
  context(text) {
    const el = document.getElementById("context-prompt");
    el.textContent = text;
    el.classList.toggle("hidden", !text);
  }
  transition(title, text, label = "THE OCEAN REMEMBERS") {
    document.getElementById("transition-title").textContent = title;
    document.getElementById("transition-text").textContent = text;
    document.getElementById("transition-label").textContent = label;
    document.getElementById("transition").classList.add("visible");
    setTimeout(
      () => document.getElementById("transition").classList.remove("visible"),
      2800,
    );
  }
  openPanel(type) {
    this.activePanel = type;
    this.game.paused = true;
    this.game.input.enabled = false;
    this.game.input.release();
    document.getElementById("panel-backdrop").classList.remove("hidden");
    const content = document.getElementById("panel-content"),
      g = this.game;
    if (type === "pause")
      content.innerHTML = `<div class="eyebrow">A MOMENT IN THE CURRENT</div><h2>The ocean can wait.</h2><p class="panel-intro">Your memories travel with you.</p><div class="menu-actions"><button id="resume" class="primary-button">Return to the ocean <span>↗</span></button><button data-menu="experiences">Choose an ocean experience <span>◇</span></button><button data-menu="atlas">Explore the depth atlas <span>↓</span></button><button data-menu="journal">Open field journal <span>↗</span></button><button data-menu="settings">Ocean & accessibility <span>↗</span></button><button data-menu="controls">Learn your body <span>↗</span></button><button id="save-game">Save this incarnation <span>◇</span></button></div><p class="menu-foot">${g.save.data.discovered.length} species encountered · ${Math.round(g.save.data.maxDepth).toLocaleString()} m deepest memory</p>`;
    if (type === "controls")
      content.innerHTML = `<div class="eyebrow">INHABIT THE ANIMAL</div><h2>Become the current.</h2><p class="panel-intro">Hold Shift for sustained turbo jet travel; release to brake. Y switches to precise mantle bursts. V toggles UV squid vision; [ / ] or the UV slider adjusts brightness. Aim near a small fish until its marker turns green. X or left-click grabs small prey. Against route enemies, chain three attacks: tentacle lash → crosscut → beak rush. Shift + attack adds a jet ram; ink sets up an ambush. Z evades committed attacks and opens a counter window. Restore habitats with E and observe their returning wildlife with H.</p><div class="controls-grid">${[
        ["W A S D", "Directional fin swimming"],
        ["MOUSE", "Look · click the ocean to capture"],
        ["↑ ↓ ← →", "Keyboard steering"],
        ["SHIFT", "Hold for turbo jets; release to brake"],
        ["Y", "Switch turbo / precise mantle jets"],
        ["[ / ]", "Adjust UV vision brightness"],
        ["SPACE / C", "Ascend / descend"],
        ["E", "Narayana pulse · discover life"],
        ["Q", "Release a drifting ink cloud"],
        ["R", "Change chromatophore camouflage"],
        ["G / RIGHT CLICK", "Anchor arms · crawl near the reef"],
        ["X / LEFT CLICK", "Attack · hold to repeat · grab → pull → bite"],
        ["Z", "Jet evade · A + Z evades left · counter after a near miss"],
        ["B", "Eight-arm sweep · stagger nearby enemies"],
        ["L", "Focus / release a route enemy"],
        ["H", "Observe restored habitat · move to leave"],
        ["F", "Sanctuary · instrument · creature ride · next level"],
        ["P", "Dive flashlight · focused beam · no battery limit"],
        ["V", "Spectral sense · fluorescence and thermal colour"],
        ["T", "Embody squid / octopus"],
        ["J / M", "Field journal / depth atlas"],
        ["ESC", "Pause & release the mouse"],
      ]
        .map(([a, b]) => `<div><kbd>${a}</kbd><span>${b}</span></div>`)
        .join(
          "",
        )}</div><p class="menu-foot">CONTROLLER: left stick swim · right stick look · A/B rise/dive · RT jet · LT attack · X ink · Y pulse · LB camouflage · RB interact · L3 evade · R3 focus · D-pad up sweep / down observe · Menu pause.<br>TOUCH: drag the ocean to look; hold Attack to hunt. Use the swim, rise and dive buttons.</p>`;
    if (type === "settings")
      content.innerHTML = `<div class="eyebrow">MAKE YOURSELF AT HOME</div><h2>Your ocean.</h2><div class="settings-list"><label>Water & wildlife detail<select id="quality">${["low", "medium", "high", "ultra"].map((v) => `<option ${g.settings.quality === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>Ocean soundscape<input id="sound-setting" type="checkbox" ${g.audio.enabled ? "checked" : ""}></label><label>Sound volume<input id="volume" type="range" min="0" max="1" step=".05" value="${g.audio.volume}"></label><label>Look sensitivity<input id="sensitivity" type="range" min=".3" max="2" step=".1" value="${g.settings.sensitivity}"></label><label>Reduce camera movement<input id="reduce-motion" type="checkbox" ${g.settings.reduceMotion ? "checked" : ""}></label><label>Incarnation<select id="species-select"><option value="squid" ${g.player.species === "squid" ? "selected" : ""}>California market squid</option><option value="octopus" ${g.player.species === "octopus" ? "selected" : ""}>Giant Pacific octopus</option></select></label></div><p class="menu-foot">Settings and memories are saved on this device. The game uses procedural assets and runs locally.</p>`;
    if (type === "experiences")
      content.innerHTML = `<div class="eyebrow">THREE OCEANS TO RETURN TO</div><h2>Choose your experience.</h2><p class="panel-intro">The original worlds are preserved. Each journey keeps its own location, discoveries and progression. Turbo, UV vision and your preferences are available across all three.</p><div class="experience-list">${EXPERIENCES.map((e) => `<button class="atlas-card ${g.experience === e.id ? "current" : ""}" data-experience="${e.id}"><div><span class="eyebrow">${g.experience === e.id ? "CURRENT JOURNEY" : g.save.data.journeys[e.id] ? "SAVED JOURNEY" : "EXPLORE"}</span><strong>${e.name}</strong><small>${e.description}</small></div><span>↗</span></button>`).join("")}</div>`;
    if (type === "atlas") {
      if (g.experience === "ocean")
        content.innerHTML = `<div class="eyebrow">ORIGINAL OPEN OCEAN · SEVEN DEPTH ZONES</div><h2>The ocean is yours.</h2><p class="panel-intro">Free exploration of the original world, including Monterey Canyon, deep habitats and the Nāga realm.</p><button class="experience-entry" data-menu="experiences">Switch experience ↗</button><div class="atlas-list">${DEPTH_LEVELS.map((l) => `<button class="atlas-card" data-travel="${l.index}"><span class="chapter-roman">${l.index + 1}</span><div><strong>${l.name}</strong><small>${l.landmarkDescription}</small></div><span>${l.min.toLocaleString()} m ↗</span></button>`).join("")}</div>`;
      else
        content.innerHTML = `<div class="eyebrow">${g.experience === "trench" ? "ORIGINAL TRENCH · PRESERVED REGIONS" : "TERRACED DESCENT · A SEPARATE JOURNEY"}</div><h2>${g.experience === "trench" ? "Return to the earlier depths." : "Follow the living ledges."}</h2><p class="panel-intro">${g.experience === "trench" ? "The earlier chamber layouts, dolphin course, caves, temples and wrecks are preserved here. Visit any region." : "Rescue shoals, answer echoes and ride currents to open the next descent. The city is an optional bonus."}</p><button class="experience-entry" data-menu="experiences">Switch experience ↗</button><div class="atlas-list">${g.expedition.spaces
          .map((s) => {
            const open = g.expedition.canEnter(s.index),
              done = g.expedition.data.completed.includes(s.id);
            return `<button class="atlas-card ${s.id === g.expedition.space?.id ? "current" : ""} ${open ? "" : "locked"}" data-space="${s.index}" ${open ? "" : "disabled"}><span class="chapter-roman">${String(s.index + 1).padStart(2, "0")}</span><div><span class="eyebrow">${s.bonus ? "OPTIONAL BONUS" : done ? "RESTORED" : open ? "OPEN" : "LOCKED"} · ${s.biome}</span><strong>${s.name}</strong><small>${open ? s.hint : `Complete ${g.expedition.spaces[s.index - 1].name} to enter.`}</small></div><span class="atlas-depth">${s.depth.toLocaleString()} m ↗</span></button>`;
          })
          .join("")}</div>`;
    }
    if (type === "journal") {
      const entries = Array.isArray(SPECIES) ? SPECIES : Object.values(SPECIES);
      content.innerHTML = `<div class="eyebrow">THE LIVING ARCHIVE</div><h2>Every life, a universe.</h2><p class="panel-intro">${g.save.data.combatVictories.length} route enemies overcome · ${g.save.data.restored.length}/14 habitats restored · best chain ${g.save.data.bestCombo}. ${g.save.data.discovered.length} wildlife discoveries carried between incarnations. Release a pulse near wildlife to record a memory.</p><div class="journal-grid">${entries
        .map((s) => {
          const seen = g.save.data.discovered.includes(s.id);
          return `<article class="journal-entry ${seen ? "seen" : ""}"><span class="eyebrow">${seen ? "OBSERVED" : "YET TO BE ENCOUNTERED"} · ${s.zone || "PACIFIC"}</span><h3>${s.name}</h3><em>${s.scientific || s.scientificName || ""}</em><p>${seen ? s.description : "A life waiting in the water. Approach quietly and listen."}</p><span class="journal-depth">${Array.isArray(s.depth) ? s.depth.join("–") + " m" : s.depth || ""}</span></article>`;
        })
        .join(
          "",
        )}</div><p class="menu-foot">Natural history informed by <a href="https://www.mbari.org/education/animals-of-the-deep/" target="_blank" rel="noreferrer">MBARI</a> and the <a href="https://www.montereybayaquarium.org/animals" target="_blank" rel="noreferrer">Monterey Bay Aquarium</a>. Sacred and mythic beings are identified separately from real species.</p>`;
    }
    if (type === "ending")
      content.innerHTML = `<div class="eyebrow">THE HADAL CYCLE</div><h2>What shall the ocean remember?</h2><p class="panel-intro">The machine demands a world that will never change. Narayana and Shiva offer something more difficult: a living balance.</p><div class="ending-options"><button data-ending="preserve"><strong>Preserve</strong><span>Let the memories of these lives become the seed of the next ocean.</span></button><button data-ending="transform"><strong>Transform</strong><span>Release the fixed world. Allow unfamiliar life to take its place.</span></button><button data-ending="balance"><strong>Return the cycle</strong><span>Unbind the machine. Creation and dissolution move together again.</span></button></div>`;
    content
      .querySelectorAll("[data-experience]")
      .forEach(
        (b) => (b.onclick = () => g.switchExperience(b.dataset.experience)),
      );
    content
      .querySelectorAll("[data-menu]")
      .forEach((b) => (b.onclick = () => this.openPanel(b.dataset.menu)));
    content
      .querySelector("#resume")
      ?.addEventListener("click", () => this.closePanel());
    content.querySelector("#save-game")?.addEventListener("click", () => {
      g.persist();
      this.toast(
        g.save.available
          ? "Your incarnation is saved."
          : "This browser could not store the save.",
        "MEMORY",
      );
      this.closePanel();
    });
    content.querySelectorAll("[data-space]").forEach((b) => {
      b.onclick = () => {
        if (g.expedition.canEnter(Number(b.dataset.space))) {
          this.closePanel();
          g.travelSpace(Number(b.dataset.space));
        }
      };
    });
    content.querySelectorAll("[data-travel]").forEach(
      (b) =>
        (b.onclick = () => {
          this.closePanel();
          g.travel(Number(b.dataset.travel));
        }),
    );
    content.querySelectorAll("[data-ending]").forEach(
      (b) =>
        (b.onclick = () => {
          this.closePanel();
          g.finish(b.dataset.ending);
        }),
    );
    const listen = (id, event, fn) =>
      content.querySelector("#" + id)?.addEventListener(event, fn);
    listen("quality", "change", (e) => g.setQuality(e.target.value));
    listen("sound-setting", "change", (e) => {
      g.audio.setEnabled(e.target.checked);
      g.settings.sound = e.target.checked;
      this.updateSound();
      g.persist();
    });
    listen("volume", "input", (e) => {
      g.audio.setVolume(Number(e.target.value));
      g.settings.volume = g.audio.volume;
      g.persist();
    });
    listen("sensitivity", "input", (e) => {
      g.settings.sensitivity = Number(e.target.value);
      g.input.sensitivity = 0.0018 * g.settings.sensitivity;
      g.persist();
    });
    listen("reduce-motion", "change", (e) => {
      g.settings.reduceMotion = e.target.checked;
      g.persist();
    });
    listen("species-select", "change", (e) => g.changeSpecies(e.target.value));
    document.getElementById("panel-close").focus();
  }
  closePanel() {
    this.activePanel = null;
    document.getElementById("panel-backdrop").classList.add("hidden");
    this.game.paused = false;
    this.game.input.enabled = this.game.started;
    this.game.input.clear();
  }
}
