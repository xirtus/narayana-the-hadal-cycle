import * as THREE from "three";
import { Cephalopod } from "../player/Cephalopod.js";
import { Expedition } from "../expedition/Expedition.js";
import { DiveLamp } from "../player/DiveLamp.js";
import { HuntSystem } from "../player/HuntSystem.js";
import { CombatSystem } from "../combat/CombatSystem.js";
import { RestorationSystem } from "../world/RestorationSystem.js";
import { WaterEffects } from "../player/WaterEffects.js";
import { OceanWorld } from "../world/OceanWorld.js";
import { Ecosystem } from "../ecology/Ecosystem.js";
import { EncounterSystem } from "../mythology/EncounterSystem.js";
import { SPECIES } from "../ecology/species.js";
import { Input } from "./Input.js";
import { SaveSystem } from "./SaveSystem.js";
import { OceanAudio } from "../audio/OceanAudio.js";
import { HUD, CHAPTERS } from "../ui/HUD.js";

const thresholds = [0, 200, 1000, 4000, 6000, 8000, 10500];
const chapterForDepth = (d) =>
  thresholds.reduce((r, t, i) => (d >= t ? i : r), 0);
export class Game {
  constructor() {
    this.save = new SaveSystem();
    this.experience = this.save.data.experience;
    this.settings = this.save.data.settings;
    if (
      !this.save.data.started &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      this.settings.reduceMotion = true;
    this.started = false;
    this.paused = false;
    this.time = 0;
    this.lastTime = 0;
    this.health = 1;
    this.chapterIndex = 0;
    this.pulseCooldown = 0;
    this.inkCooldown = 0;
    this.inkTime = 0;
    this.lastSave = 0;
    this.objectiveStep = 0;
    this.ride = null;
    this.currentSite = null;
    this.lastJet = 0;
    this.fps = 60;
    this.frameCount = 0;
    this.frameSeconds = 0;
    this.traveling = false;
    this.finished = false;
    this.scene = new THREE.Scene();
    this.canvas = document.getElementById("ocean");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.camera = new THREE.PerspectiveCamera(
      52,
      innerWidth / innerHeight,
      0.08,
      1600,
    );
    this.camera.position.set(8, -9, -12);
    this.input = new Input(this.canvas);
    this.input.sensitivity = 0.0018 * this.settings.sensitivity;
    this.audio = new OceanAudio();
    this.audio.enabled = this.settings.sound;
    this.audio.volume = this.settings.volume;
    this.world = new OceanWorld(this.scene, {
      quality: this.settings.quality,
      seed: 41 + this.save.data.incarnation,
    });
    this.expedition = new Expedition(this.scene, this.world, {
      save: this.save.data.expedition,
      mode: this.experience,
      onEvent: (event) => this.expeditionEvent(event),
    });
    this.lamp = new DiveLamp(this.scene);
    this.lamp.enabled = this.save.data.lamp;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.player = new Cephalopod(this.scene, {
      position: new THREE.Vector3(0, -12, 0),
      species: this.save.data.species,
    });
    this.ecosystem = new Ecosystem(this.scene, {
      quality: this.settings.quality,
      seed: 41 + this.save.data.incarnation,
    });
    this.ecosystem.setSeafloor?.(this.world.getFloorHeight.bind(this.world));
    this.hunting = new HuntSystem(
      this.scene,
      this.player,
      this.ecosystem,
      this.world,
      { onEvent: (event) => this.huntEvent(event) },
    );
    this.perception = this.settings.vision;
    this.player.turboMode = this.settings.turbo;
    this.world.setPerception(this.perception);
    this.world.uvStrength = this.settings.uvStrength;
    this.combat = new CombatSystem(this.scene, this.player, this.world, {
      defeated: this.save.data.combatVictories,
      onEvent: (event) => this.combatEvent(event),
    });
    this.restoration = new RestorationSystem(this.scene, this.world, {
      restored: this.save.data.restored,
      observed: this.save.data.observed,
      onEvent: (event) => this.restorationEvent(event),
    });
    this.lastHuntMessage = -10;
    this.effects = new WaterEffects(this.scene);
    this.encounters = new EncounterSystem(
      this.scene,
      this.world,
      this.ecosystem,
    );
    for (const record of [
      this.encounters.research,
      this.encounters.whale,
      this.encounters.pressure,
    ]) {
      if (record && this.save.data.encounters?.includes(record.id)) {
        record.complete = true;
        if (record.nodes) record.nodes.forEach((n) => (n.purged = true));
        if (record.points) record.progress = 3;
      }
    }
    this.cameraLight = new THREE.PointLight(0x86b8cd, 0, 100, 1.3);
    this.scene.add(this.cameraLight);
    this.heroLight = new THREE.PointLight(0xf1dfbc, 2.8, 14, 1.6);
    this.scene.add(this.heroLight);
    this.targetMarker = new THREE.Group();
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xb8e7ba,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
    });
    this.targetMarker.add(
      new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), markerMat),
    );
    this.targetMarker.visible = false;
    this.scene.add(this.targetMarker);
    this.hud = new HUD(this);
    this.hud.species(this.player.species);
    this.hud.chapter(0);
    this.cameraTarget = new THREE.Vector3();
    this.cameraDesired = new THREE.Vector3();
    this.viewDirection = new THREE.Vector3();
    this.lookAhead = new THREE.Vector3();
    this.setQuality(this.settings.quality, false);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("beforeunload", () => {
      if (this.started) this.persist();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.started && !this.paused) {
        this.hud.openPanel("pause");
        this.persist();
      }
    });
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.paused = true;
      this.hud.toast(
        "The graphics context was interrupted. Reload to resume your saved incarnation.",
        "OCEAN PAUSED",
      );
    });
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
    setTimeout(() => this.hud.ready(), 500);
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  setQuality(quality, persist = true) {
    this.settings.quality = quality;
    const scale =
      { low: 1, medium: 1.25, high: 1.65, ultra: 2 }[quality] || 1.5;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, scale));
    this.world.setQuality(quality);
    this.ecosystem.setQuality(quality);
    if (persist) this.persist();
  }
  async start() {
    if (this.started) return;
    this.started = true;
    this.paused = false;
    this.input.enabled = true;
    this.input.yaw = 0;
    this.input.pitch = -0.03;
    this.hud.begin();
    this.audio.start().catch(() => {});
    if (this.save.data.started) {
      this.player.teleport(
        new THREE.Vector3().fromArray(this.save.data.position),
      );
      this.chapterIndex = chapterForDepth(-this.player.position.y);
      this.hud.chapter(this.chapterIndex);
      this.objectiveStep = this.save.data.objectiveStep || 0;
      this.hud.toast(
        "Your last incarnation returns to the current.",
        "WELCOME BACK",
      );
    } else
      this.hud.toast(
        "WASD to swim. Space to rise, C to dive. Click the ocean to look around.",
        "BECOME THE CURRENT",
      );
    if (this.experience !== "ocean") {
      const space =
        this.expedition.spaces.find(
          (s) => s.id === this.expedition.data.active,
        ) || this.expedition.spaces[0];
      this.expedition.enter(space.index);
      if (
        !this.save.data.started ||
        this.player.position.distanceTo(space.position) >
          (space.terraced ? 1500 : 170)
      )
        this.player.teleport(space.position.clone());
    }
    this.updateObjective();
  }
  toggleSound() {
    this.audio.start().catch(() => {});
    this.audio.setEnabled(!this.audio.enabled);
    this.settings.sound = this.audio.enabled;
    this.persist();
  }
  changeSpecies(species) {
    this.hunting.cancel();
    this.combat.cancelAction();
    this.restoration.cancel();
    this.ride = null;
    this.player.setSpecies(species);
    this.save.data.species = species;
    this.hud.species(species);
    this.hud.toast(
      species === "octopus"
        ? "Eight exploring arms. Approach the reef and anchor to crawl."
        : "Eight arms. Two feeding tentacles. Let your fins carry you.",
      "A DIFFERENT BODY",
    );
    this.persist();
  }
  switchExperience(id) {
    if (id === this.experience) {
      this.hud.closePanel();
      return;
    }
    if (!["ocean", "trench", "terraces"].includes(id)) return;
    if (!this.persist() || !this.save.selectExperience(id)) {
      this.hud.toast(
        "This browser could not save your journey. Your current ocean stays open.",
        "COULD NOT SWITCH EXPERIENCE",
      );
      return;
    }
    this.switchingExperience = true;
    window.location.reload();
  }
  persist() {
    if (this.switchingExperience) return true;
    return this.save.save({
      position: this.started
        ? this.player.position.toArray()
        : this.save.data.position,
      species: this.player.species,
      settings: this.settings,
      chapter: this.chapterIndex,
      started: this.started || this.save.data.started,
      objectiveStep: this.objectiveStep,
      expedition: this.expedition.data,
      lamp: this.lamp.enabled,
      bestCombo: Math.max(this.save.data.bestCombo, this.combat?.best || 0),
    });
  }
  updateObjective() {
    if (this.chapterIndex === 0) {
      const objectives = [
        ["Listen to the forest", "Press E near marine life to remember it.", 0],
        [
          "A memory in the reef",
          "Follow the pale marker. F awakens the sanctuary.",
          0.3,
        ],
        [
          "The body remembers",
          "Try a mantle jet, camouflage, and an arm anchor.",
          0.6,
        ],
        [
          "Follow the blue descent",
          "The canyon opens to the north. M reveals the depth atlas.",
          1,
        ],
      ];
      this.hud.objective(...objectives[Math.min(this.objectiveStep, 3)]);
    } else if (this.chapterIndex === 6)
      this.hud.objective(
        "The wheel beneath the world",
        this.save.data.memories >= 7
          ? "Approach the star gate. F will answer its call."
          : `Carry seven living memories to the gate. ${this.save.data.memories}/7 remembered.`,
        Math.min(1, this.save.data.memories / 7),
      );
    else
      this.hud.objective(
        [
          "",
          "Listen beyond the sunlight",
          "Follow the falling stars",
          "A life after giants",
          "The stone is breathing",
          "The sleeping nāga",
        ][this.chapterIndex],
        [
          "",
          "Pulse near the observatory and remember the twilight life.",
          "Observe the deep hunters. Ink conceals your escape.",
          "Discover the whale fall. Every ending feeds a beginning.",
          "Find sanctuary among the hydrothermal chimneys.",
          "Camouflage is a language. Approach the ancient arch.",
        ][this.chapterIndex],
        0.15 + this.chapterIndex * 0.12,
      );
  }
  pulse() {
    if (this.pulseCooldown > 0) {
      this.hud.toast(
        "Let the water settle before listening again.",
        "PULSE RECHARGING",
      );
      return;
    }
    this.pulseCooldown = 4;
    this.effects.pulse(this.player.position);
    this.audio.pulse();
    this.expedition.pulse(this.player.position);
    this.restoration.pulse(this.player.position);
    const discoveries = this.ecosystem.discover(this.player.position, 70) || [];
    let added = 0,
      names = [];
    for (const item of discoveries) {
      const id = typeof item === "string" ? item : item.id;
      if (id && !this.save.data.discovered.includes(id)) {
        this.save.data.discovered.push(id);
        this.save.data.memories++;
        added++;
        const species = (
          Array.isArray(SPECIES) ? SPECIES : Object.values(SPECIES)
        ).find((s) => s.id === id);
        if (species) names.push(species.name);
      }
    }
    if (added) {
      this.audio.discovery();
      this.hud.toast(
        `${names.slice(0, 2).join(" · ")}${added > 2 ? ` · ${added - 2} more lives` : ""}`,
        "LIVING MEMORY RECORDED",
      );
      this.grow();
      this.persist();
    } else
      this.hud.toast(
        "Pressure echoes through the water. Follow the luminous memory marker.",
        "NARAYANA PULSE",
      );
    this.markerTime = 9;
    if (this.objectiveStep === 0) this.objectiveStep = 1;
    this.updateObjective();
  }
  ink() {
    if (this.inkCooldown > 0) {
      this.hud.toast("Your ink sac is refilling.", "INK REGENERATING");
      return;
    }
    this.inkCooldown = 9;
    this.inkTime = 10;
    this.effects.ink(this.player.position, this.player.velocity);
    this.combat.ink();
    this.audio.tone(60, 0.8, 0.2, 28);
    this.hud.toast(
      "A drifting pseudomorph distracts visual hunters.",
      "INK RELEASED",
    );
  }
  anchor() {
    if (this.player.mode === "anchored" || this.player.mode === "crawling") {
      this.player.grapple(null);
      this.hud.toast(
        "Your suckers release. The current carries you.",
        "FREE SWIMMING",
      );
      return;
    }
    const p = this.player.position,
      floor = this.world.getFloorHeight(p.x, p.z);
    this.viewDirection.set(
      Math.sin(this.input.yaw) * Math.cos(this.input.pitch),
      Math.sin(this.input.pitch),
      -Math.cos(this.input.yaw) * Math.cos(this.input.pitch),
    );
    const surface = this.world.findAnchor?.(p, this.viewDirection, 5);
    if (surface) {
      this.player.grapple(surface.point);
      this.hud.toast(
        "Your arms find the stone. The body pulls against its suckers.",
        "SURFACE GRIP",
      );
      this.usedAnchor = true;
      return;
    }
    if (p.y - floor < 3.5) {
      this.player.grapple(new THREE.Vector3(p.x, floor + 0.08, p.z - 0.8));
      this.hud.toast(
        "Suckers hold the reef. Swim inputs pull you along it.",
        "ARM ANCHORS ESTABLISHED",
      );
      this.usedAnchor = true;
    } else
      this.hud.toast(
        "Descend within three metres of the reef to anchor your arms.",
        "SEEK A SURFACE",
      );
  }
  forwardDirection() {
    return new THREE.Vector3(
      Math.sin(this.input.yaw) * Math.cos(this.input.pitch),
      Math.sin(this.input.pitch),
      -Math.cos(this.input.yaw) * Math.cos(this.input.pitch),
    );
  }
  attack() {
    if (this.paused || !this.started || this.traveling) return;
    this.ride = null;
    this.restoration.cancel();
    if (
      !this.hunting.active &&
      this.combat.attack(this.forwardDirection(), {
        jet:
          this.player.jetAmount > 0.2 ||
          this.input.keys.has("ShiftLeft") ||
          this.input.keys.has("ShiftRight"),
      })
    )
      return;
    this.hunting.setDirection(this.forwardDirection());
    this.hunting.attack();
  }
  evade() {
    if (!this.started || this.paused || this.traveling) return;
    if (this.combat.dodgeCooldown > 0 || this.player.stamina < 0.12) return;
    this.hunting.cancel();
    this.restoration.cancel();
    this.ride = null;
    this.combat.dodge(
      this.forwardDirection(),
      this.input.keys.has("KeyA") ? -1 : 1,
    );
  }
  sweep() {
    if (!this.started || this.paused || this.traveling) return;
    if (this.combat.sweepCooldown > 0 || this.player.stamina < 0.18) return;
    this.hunting.cancel();
    this.restoration.cancel();
    this.ride = null;
    this.combat.sweep();
  }
  combatEvent(event) {
    if (event.type === "damage") {
      this.health = Math.max(0, this.health - event.damage);
      this.restoration.cancel();
      this.audio.tone(48, 0.2, 0.12, 28);
      this.hud.toast(
        `${event.name} struck. Z evades; Q ink interrupts; B sweeps nearby enemies.`,
        "UNDER ATTACK",
      );
    }
    if (["hit", "swing", "sweep"].includes(event.type))
      this.audio.tone(event.type === "hit" ? 70 : 125, 0.12, 0.07, 40);
    if (event.type === "evaded")
      this.hud.toast(
        "Attack now for a stronger counterstrike.",
        "PERFECT EVADE",
      );
    if (event.type === "defeat") {
      this.save.data.combatVictories = [...this.combat.defeated];
      this.save.data.memories += event.memories;
      this.save.data.bestCombo = Math.max(
        this.save.data.bestCombo,
        this.combat.best,
      );
      this.player.stamina = Math.min(1, this.player.stamina + 0.25);
      this.health = Math.min(1, this.health + 0.12);
      this.effects.pulse(this.player.position);
      this.audio.discovery();
      this.hud.toast(
        `${event.name} ${event.kind === "drone" ? "disabled" : "driven off"}. +${event.memories} memories.${event.cleared ? " This route is clear." : ""}`,
        event.cleared ? "PASSAGE RESTORED" : "ENCOUNTER WON",
      );
      this.grow();
      this.persist();
    }
  }
  restorationEvent(event) {
    this.save.data.restored = [...this.restoration.restored];
    this.save.data.observed = [...this.restoration.observed];
    this.save.data.memories += event.memories;
    this.health = Math.min(1, this.health + 0.25);
    this.player.stamina = 1;
    this.effects.pulse(this.player.position);
    this.audio.discovery();
    this.hud.toast(
      event.type === "restore"
        ? `${event.name} awakens. A school returns. H lets you rest and observe.`
        : `A quiet moment in ${event.name}. Your mantle and vitality recover.`,
      event.type === "restore" ? "LIFE RETURNS" : "SHARED CURRENT",
    );
    this.grow();
    this.persist();
  }
  meditate() {
    if (!this.started || this.paused || this.traveling) return;
    if (!this.restoration.meditate())
      this.hud.toast(
        "Follow the habitat marker. E restores it; H observes its wildlife once the water is quiet.",
        "FIND A LIVING SANCTUARY",
      );
    else {
      this.hunting.cancel();
      this.combat.cancelAction();
      this.ride = null;
      this.player.velocity.multiplyScalar(0.1);
    }
  }
  huntEvent(event) {
    if (event.type === "attack") this.audio.tone(150, 0.18, 0.08, 85);
    if (event.type === "grab") this.audio.tone(90, 0.16, 0.13, 45);
    if (event.type === "repel") {
      this.audio.tone(85, 0.25, 0.14, 35);
      this.hud.toast(
        `${event.name} recoils from your arm strike. Use a jet or ink to escape.`,
        "PREDATOR REPELLED",
      );
    }
    if (event.type === "bite") this.audio.tone(60, 0.07, 0.045, 35);
    if (event.type === "consume") {
      this.health = Math.min(
        1,
        this.health +
          Math.min(
            0.3,
            event.energy >= 1 ? event.energy / 100 : event.energy || 0.14,
          ),
      );
      this.player.stamina = Math.min(1, this.player.stamina + 0.22);
      this.save.data.hunts = (this.save.data.hunts || 0) + 1;
      this.save.data.memories++;
      this.hud.toast(
        `${event.name || "Prey"} caught. Arms hold; the beak cuts and feeds. Mantle strength restored.`,
        "THE LIVING CYCLE",
      );
      this.grow();
      this.persist();
    }
    if (event.type === "miss" && this.time - this.lastHuntMessage > 5) {
      this.lastHuntMessage = this.time;
      this.hud.toast(
        event.nearby
          ? "Close the distance until the prey marker turns green, then attack."
          : "Aim toward small fish. X or left-click casts your feeding tentacles.",
        "HUNT · GRAB → PULL → BITE",
      );
    }
  }
  togglePerception() {
    this.perception = this.perception === "natural" ? "spectral" : "natural";
    this.world.setPerception?.(this.perception);
    this.settings.vision = this.perception;
    this.persist();
    this.hud.toast(
      this.perception === "spectral"
        ? "UV vision reveals the living ledges. Adjust brightness with [ / ] or the UV slider."
        : "Your eyes return to the ocean’s natural light.",
      this.perception === "spectral"
        ? "NARAYANA · UV VISION"
        : "NATURAL VISION",
    );
  }
  adjustVision(value) {
    this.settings.uvStrength = THREE.MathUtils.clamp(value, 0, 1);
    this.world.uvStrength = this.settings.uvStrength;
    const slider = document.getElementById("uv-strength");
    if (slider) slider.value = this.settings.uvStrength;
    this.persist();
  }
  toggleTurbo() {
    this.settings.turbo = !this.settings.turbo;
    this.player.turboMode = this.settings.turbo;
    this.hud.toast(
      this.settings.turbo
        ? "Hold Shift for sustained turbo. Release to brake; C dives, Space rises."
        : "Precise swimming and ordinary mantle bursts. Y restores turbo mode.",
      this.settings.turbo ? "TURBO JET READY · SHIFT" : "PRECISION JET",
    );
    this.persist();
  }
  toggleLamp() {
    this.lamp.toggle();
    this.hud.toast(
      this.lamp.enabled
        ? "A focused beam follows your gaze. P switches it off."
        : "Your light fades back into the ocean.",
      this.lamp.enabled ? "DIVE LIGHT ON" : "DIVE LIGHT OFF",
    );
    this.persist();
  }
  expeditionEvent(event) {
    if (event.type === "life") {
      this.hud.toast(event.message, event.title);
      return;
    }
    if (!this.hud) return;
    if (event.type === "entered") {
      this.hud.toast(event.space.hint, event.space.biome);
      return;
    }
    if (event.type === "seal") {
      this.audio.tone(220 + event.progress * 110, 0.6, 0.12, 330);
      this.hud.toast(
        `${event.progress} / ${event.space.count} · ${event.space.hint}`,
        event.space.task === "rescue"
          ? "SHOAL RELEASED"
          : event.space.task === "current"
            ? "CURRENT RIDDEN"
            : "ECHO ANSWERED",
      );
    }
    if (event.type === "opened") {
      this.save.data.memories += event.memories;
      this.audio.discovery();
      this.effects.pulse(this.player.position);
      this.hud.toast(
        event.next
          ? `${event.next.name} is now open. Follow the gate and press F.`
          : "The final current is open. Approach the event horizon.",
        "PASSAGE UNLOCKED",
      );
    }
    if (event.type === "finished") {
      this.audio.discovery();
      this.hud.transition(
        "The ocean folds into a star.",
        "Every rescued life and every remembered song crosses the horizon with you. The hollow sea begins another cycle.",
        "THE HEART OF THE HOLLOW EARTH",
      );
    }
    this.persist();
  }
  interact() {
    const passage = this.expedition.interact(this.player.position);
    if (passage) {
      if (passage.type === "travel") this.travelSpace(passage.index);
      else if (passage.type === "locked")
        this.hud.toast(passage.message, "THE PASSAGE IS LISTENING");
      return;
    }
    if (this.hunting.active || this.combat.active) return;
    const current = this.world.levelCurrents?.find(
      (c) =>
        c.level === this.chapterIndex &&
        c.position.distanceTo(this.player.position) < 10,
    );
    if (current) {
      this.travel(current.nextLevel);
      return;
    }
    if (this.ride) {
      this.ride = null;
      this.player.grapple(null);
      this.hud.toast(
        "You leave your companion with a memory of the current.",
        "RELEASED",
      );
      return;
    }
    const encounter = this.encounters.interact(this.player);
    if (encounter) {
      this.encounterEvent(encounter);
      return;
    }
    const near = this.world.landmarks
      .filter((l) => l.position.distanceTo(this.player.position) < 12)
      .sort(
        (a, b) =>
          a.position.distanceToSquared(this.player.position) -
          b.position.distanceToSquared(this.player.position),
      )[0];
    if (near) {
      if (near.type === "gate") {
        if (this.save.data.memories < 7) {
          this.hud.toast(
            "The gate asks for seven living memories. Pulse near wildlife to carry their stories.",
            "THE GATE IS LISTENING",
          );
          return;
        }
        this.hud.openPanel("ending");
        return;
      }
      if (near.type === "current") {
        this.travel(Math.min(6, this.chapterIndex + 1));
        return;
      }
      if (!this.save.data.sanctuaries.includes(near.id)) {
        this.save.data.sanctuaries.push(near.id);
        this.save.data.memories += 2;
        near.activated = true;
        this.health = 1;
        this.player.stamina = 1;
        this.checkpoint = near.position.clone().add(new THREE.Vector3(0, 3, 5));
        this.effects.pulse(near.position);
        this.audio.discovery();
        this.hud.toast(
          near.type === "sanctuary"
            ? "A place of return. This memory survives every incarnation."
            : `${near.name}. Its story becomes part of you.`,
          "SANCTUARY AWAKENED",
        );
        if (near.id === "sanctuary")
          this.objectiveStep = Math.max(2, this.objectiveStep);
        this.grow();
        this.persist();
        this.updateObjective();
      } else
        this.hud.toast(
          "The current remembers you. Your life and mantle are restored.",
          "SANCTUARY",
        );
      this.health = 1;
      this.player.stamina = 1;
      return;
    }
    const rideable = this.ecosystem.nearestRideable(this.player.position, 9);
    if (rideable) {
      this.ride = rideable;
      this.hud.toast(
        `A quiet journey beside ${rideable.name || "a fellow ocean traveller"}. F to release.`,
        "SHARED CURRENT",
      );
      return;
    }
    this.hud.toast(
      "F touches sanctuaries, instruments and travelling companions. Use X or left-click to hunt.",
      "REACH & INTERACT",
    );
  }

  encounterEvent(event) {
    if (event.message) this.hud.toast(event.message, event.label);
    if (event.damage) this.health = Math.max(0, this.health - event.damage);
    if (event.healing) this.health = Math.min(1, this.health + event.healing);
    const known =
      event.completed && this.save.data.encounters?.includes(event.completed);
    if (event.memories && !known) {
      this.save.data.memories += event.memories;
      this.audio.discovery();
      this.grow();
    }
    if (event.completed && !known) {
      this.save.data.encounters ??= [];
      this.save.data.encounters.push(event.completed);
      this.persist();
    }
  }
  grow() {
    const scale = 1 + Math.min(0.55, this.save.data.memories * 0.018);
    this.player.group.scale.setScalar(scale);
  }
  travel(index) {
    if (this.experience === "ocean") {
      const position = this.world.levelEntries[index];
      if (!position || this.traveling) return false;
      this.hunting.cancel();
      this.combat.reset();
      this.restoration.cancel();
      this.ride = null;
      this.player.teleport(position.clone());
      this.input.yaw = 0;
      this.input.pitch = 0;
      this.chapterIndex = index;
      this.hud.chapter(index);
      this.health = 1;
      this.camera.position.copy(position).add(new THREE.Vector3(0, 3, 11));
      this.updateObjective();
      this.persist();
      return true;
    }
    const space = this.expedition.spaces.find(
      (s) => s.zone === index && this.expedition.canEnter(s.index),
    );
    if (!space) {
      this.hud.toast(
        "Complete the current space to open the next part of the ocean.",
        "PASSAGE LOCKED",
      );
      return false;
    }
    return this.travelSpace(space.index);
  }
  travelSpace(index) {
    if (!this.expedition.canEnter(index)) {
      this.hud.toast(
        "Answer the echoes or finish the current course in the preceding space.",
        "PASSAGE LOCKED",
      );
      return false;
    }
    if (!this.started) this.start();
    if (this.traveling) return false;
    this.hunting.cancel();
    this.combat.reset();
    this.restoration.cancel();
    this.traveling = true;
    const s = this.expedition.spaces[index];
    this.hud.transition(
      s.name,
      s.hint,
      s.bonus
        ? `OPTIONAL BONUS · ${s.biome}`
        : `${this.experience === "trench" ? "PRESERVED REGION" : "DESCENT"} ${index + 1} / ${this.expedition.mainSpaces.length} · ${s.biome}`,
    );
    setTimeout(() => {
      this.expedition.enter(index);
      this.player.teleport(s.position.clone());
      this.ride = null;
      this.input.yaw = 0;
      this.input.pitch = 0;
      this.chapterIndex = s.zone;
      this.hud.chapter(s.zone);
      this.health = 1;
      this.player.stamina = 1;
      this.camera.position.copy(s.position).add(new THREE.Vector3(0, 3, 11));
      this.traveling = false;
      this.updateObjective();
      this.persist();
    }, 900);
    return true;
  }
  reincarnate() {
    if (this.traveling) return;
    this.traveling = true;
    this.hunting.cancel();
    this.combat.reset();
    this.restoration.cancel();
    this.save.data.incarnation++;
    this.hud.transition(
      "Nothing living is truly lost.",
      "Your body returns to the water. The impressions of this life travel onward.",
      "SAMSARA · A NEW INCARNATION",
    );
    setTimeout(() => {
      const last = this.save.data.sanctuaries.at(-1),
        site = this.world.landmarks.find((l) => l.id === last);
      const p =
        this.expedition.space?.position.clone() ||
        (site
          ? site.position.clone().add(new THREE.Vector3(0, 4, 5))
          : new THREE.Vector3(0, -12, 0));
      this.player.group.scale.setScalar(1);
      this.player.teleport(p);
      this.health = 1;
      this.player.stamina = 1;
      this.ride = null;
      this.ecosystem.dispose();
      this.ecosystem = new Ecosystem(this.scene, {
        quality: this.settings.quality,
        seed: 41 + this.save.data.incarnation,
      });
      this.ecosystem.setSeafloor?.(this.world.getFloorHeight.bind(this.world));
      this.hunting.ecosystem = this.ecosystem;
      this.encounters.ecosystem = this.ecosystem;
      this.encounters.reset();
      this.traveling = false;
      this.persist();
    }, 1400);
  }
  finish(choice) {
    this.finished = true;
    this.save.data.ending = choice;
    this.save.data.memories += 7;
    this.persist();
    this.hud.transition(
      choice === "balance"
        ? "The ocean begins again."
        : choice === "preserve"
          ? "A memory becomes a world."
          : "Let the unfamiliar bloom.",
      choice === "balance"
        ? "No life held still. No ending without a beginning. The current is free."
        : choice === "preserve"
          ? "Every life you carried becomes a seed in the waters of another age."
          : "The machine falls silent. In the dark, the first new light appears.",
      "NARAYANA · THE HADAL CYCLE",
    );
    setTimeout(() => {
      this.travel(0);
      this.save.data.incarnation++;
      this.persist();
    }, 4200);
  }
  actions() {
    if (this.input.consume("Escape")) {
      if (this.hud.activePanel) this.hud.closePanel();
      else this.hud.openPanel("pause");
    }
    if (this.input.consume("KeyJ")) {
      this.hud.activePanel === "journal"
        ? this.hud.closePanel()
        : this.hud.openPanel("journal");
    }
    if (this.input.consume("KeyM")) {
      this.hud.activePanel === "atlas"
        ? this.hud.closePanel()
        : this.hud.openPanel("atlas");
    }
    if (this.paused || !this.started) return;
    if (this.input.consume("KeyE")) this.pulse();
    if (this.input.consume("KeyQ")) this.ink();
    if (this.input.consume("KeyR")) {
      this.player.setCamouflage(!this.player.camouflage);
      this.usedCamo = true;
      this.hud.toast(
        this.player.camouflage
          ? "Chromatophores settle into the colours of the reef."
          : "Pearlescent skin returns to the light.",
        "LIVING COLOUR",
      );
    }
    if (this.input.consume("KeyG") || this.input.consume("MouseRight"))
      this.anchor();
    if (this.input.consume("KeyF")) this.interact();
    if (this.input.consume("KeyZ")) this.evade();
    if (this.input.consume("KeyB")) this.sweep();
    if (this.input.consume("KeyL")) {
      const target = this.combat.focus();
      this.hud.toast(
        target
          ? `Following ${target.name}. L releases focus.`
          : "Swim toward a patrol and press L to focus it.",
        target ? "THREAT FOCUSED" : "FREE LOOK",
      );
    }
    if (this.input.consume("KeyH")) this.meditate();
    const strike =
      this.input.consume("KeyX") || this.input.consume("MouseLeft");
    if (
      strike ||
      ((this.input.keys.has("KeyX") ||
        this.input.keys.has("MouseLeft") ||
        this.input.padAttack) &&
        !this.hunting.active &&
        !this.combat.active)
    )
      this.attack();
    if (this.input.consume("KeyP")) this.toggleLamp();
    if (this.input.consume("KeyV")) this.togglePerception();
    if (this.input.consume("KeyY")) this.toggleTurbo();
    if (this.input.consume("BracketLeft"))
      this.adjustVision(this.settings.uvStrength - 0.1);
    if (this.input.consume("BracketRight"))
      this.adjustVision(this.settings.uvStrength + 0.1);
    if (this.input.consume("KeyT"))
      this.changeSpecies(this.player.species === "squid" ? "octopus" : "squid");
  }
  tick(now) {
    requestAnimationFrame(this.tick);
    const dt = Math.min(
      0.04,
      Math.max(0.001, (now - (this.lastTime || now - 16.67)) / 1000),
    );
    this._wallDt = (now - (this.lastTime || now - 16.67)) / 1000;
    this.lastTime = now;
    this.actions();
    if (!this.paused) {
      if (this.started && !this.traveling) {
        const level = chapterForDepth(-this.player.position.y);
        this.combat.enterLevel(level, this.expedition.space);
        this.restoration.enterLevel(level);
      }
      this.time += dt;
      this.pulseCooldown = Math.max(0, this.pulseCooldown - dt);
      this.inkCooldown = Math.max(0, this.inkCooldown - dt);
      this.inkTime = Math.max(0, this.inkTime - dt);
      if (this.combat.locked && !this.traveling) {
        const delta = this.combat.locked.position
          .clone()
          .sub(this.player.position);
        const desired = Math.atan2(delta.x, -delta.z);
        const turn = Math.atan2(
          Math.sin(desired - this.input.yaw),
          Math.cos(desired - this.input.yaw),
        );
        this.input.yaw += turn * (1 - Math.exp(-dt * 5));
        this.input.pitch = THREE.MathUtils.lerp(
          this.input.pitch,
          Math.atan2(delta.y, Math.hypot(delta.x, delta.z)),
          1 - Math.exp(-dt * 5),
        );
      }
      const frame = this.input.frame(dt);
      frame.grab = false;
      frame.attack = false;
      if (this.started && !this.traveling && !this.combat.active)
        this.hunting.prepare(dt, this.forwardDirection(), this.camera);
      if (this.combat.active) this.hunting.reticle.visible = false;
      if (this.combat.active) {
        frame.moveX *= 0.45;
        frame.moveZ *= 0.45;
        frame.ascend *= 0.45;
        this.player.velocity.multiplyScalar(Math.exp(-dt * 2));
      }
      if (this.combat.dodgeTime > 0) frame.jet = false;
      if (this.restoration.meditating) {
        if (
          Math.abs(frame.moveX) +
            Math.abs(frame.moveZ) +
            Math.abs(frame.ascend) >
            0 ||
          frame.jet
        )
          this.restoration.cancel();
        else this.player.velocity.multiplyScalar(Math.exp(-dt * 8));
      }
      if (this.hunting.active) {
        frame.moveX *= 0.2;
        frame.moveZ *= 0.2;
        frame.ascend *= 0.2;
        frame.jet = false;
        this.player.velocity.multiplyScalar(Math.exp(-dt * 5));
      }
      if (!this.traveling) {
        if (this.ride) {
          const gp = this.ride.group?.position || this.ride.position;
          if (gp) {
            this.player.position.lerp(
              gp.clone().add(new THREE.Vector3(0, -0.5, 2)),
              1 - Math.exp(-dt * 4),
            );
            this.player.velocity.multiplyScalar(0.8);
          }
        }
        this.player.update(dt, this.time, frame, this.world);
      }
      this.world.update(dt, this.time, this.player.position, this.camera);
      this.ecosystem.update(dt, this.time, this.player.position, {
        camouflage: this.player.camouflage,
        jet: this.player.jetAmount,
        ink: this.inkTime > 0,
      });
      if (this.started && !this.traveling) this.hunting.update(dt, this.time);
      if (this.started && !this.traveling) {
        this.combat.update(dt, this.time, {
          forward: this.forwardDirection(),
          camera: this.camera,
          camouflage: this.player.camouflage,
          jet: this.player.jetAmount,
          allowPose: !this.hunting.active,
        });
        this.restoration.update(dt, this.time, this.player.position, {
          moving:
            Math.abs(frame.moveX) +
              Math.abs(frame.moveZ) +
              Math.abs(frame.ascend) >
            0.1,
          threat: this.combat.nearby,
          attacking: this.hunting.active || this.combat.active,
        });
      }
      if (this.started && !this.traveling)
        this.expedition.update(dt, this.time, this.player.position);
      this.effects.update(dt, this.time, this.player, this.world);
      this.audio.update(-this.player.position.y, this.time);
      if (this.started && !this.traveling) {
        const event = this.encounters.update(dt, this.time, this.player, {
          pulse: this.effects.pulses.length > 0,
          ink: this.inkTime > 0,
          camouflage: this.player.camouflage,
          jet: this.player.jetAmount,
          memories: this.save.data.memories,
        });
        if (event) this.encounterEvent(event);
        if (this.encounters.objective) {
          const o = this.encounters.objective;
          this.hud.objective(o.title, o.hint, o.progress);
          this._encounterObjective = true;
        } else if (this._encounterObjective) {
          this._encounterObjective = false;
          this.updateObjective();
        }
      }
      if (this.player.jetAmount > 0.5 && this.lastJet <= 0.5) {
        this.audio.jet();
        this.usedJet = true;
      }
      this.lastJet = this.player.jetAmount;
      if (this.started && !this.traveling) {
        const d = -this.player.position.y;
        this.save.data.maxDepth = Math.max(this.save.data.maxDepth, d);
        const ch = chapterForDepth(d);
        if (ch !== this.chapterIndex) {
          this.chapterIndex = ch;
          this.hud.chapter(ch);
          this.updateObjective();
          this.hud.toast(CHAPTERS[ch].text, CHAPTERS[ch].region);
        }
        if (
          this.objectiveStep === 2 &&
          this.usedJet &&
          this.usedCamo &&
          this.usedAnchor
        ) {
          this.objectiveStep = 3;
          this.updateObjective();
        }
        const threat = this.ecosystem.threatLevel || 0;
        if (threat > 0.5 && this.inkTime <= 0 && !this.player.camouflage)
          this.health -= dt * 0.02 * threat;
        else this.health = Math.min(1, this.health + dt * 0.002);
        if (this.health <= 0) this.reincarnate();
        if (this.time - this.lastSave > 15) {
          this.lastSave = this.time;
          this.persist();
        }
        this.navigation(dt);
      }
      this.updateCamera(dt);
      this.lamp.update(
        this.player.position,
        this.forwardDirection(),
        this.world,
        this.settings.quality,
      );
      this.heroLight.position
        .copy(this.player.position)
        .add(new THREE.Vector3(2, 2, -3));
      this.heroLight.intensity = this.chapterIndex > 1 ? 2.6 : 2.8;
      this.cameraLight.position.copy(this.camera.position);
      this.cameraLight.intensity =
        this.perception === "spectral"
          ? 35 + this.settings.uvStrength * 260
          : this.chapterIndex > 0
            ? 14
            : 0;
      this.cameraLight.distance =
        this.perception === "spectral"
          ? 80 + this.settings.uvStrength * 150
          : 100;
      this.cameraLight.color.set(
        this.perception === "spectral" ? 0x9c8aff : 0x86b8cd,
      );
      this.hud.update(dt);
    }
    this.renderer.render(this.scene, this.camera);
    this.frameCount++;
    this.frameSeconds += this._wallDt || dt;
    if (this.frameSeconds > 2) {
      this.fps = this.frameCount / this.frameSeconds;
      this.frameCount = 0;
      this.frameSeconds = 0;
    }
  }
  navigation(dt) {
    const sites = this.world.landmarks.filter(
      (l) =>
        !this.save.data.sanctuaries.includes(l.id) ||
        l.type === "gate" ||
        l.type === "current",
    );
    sites.sort(
      (a, b) =>
        a.position.distanceToSquared(this.player.position) -
        b.position.distanceToSquared(this.player.position),
    );
    const target = sites[0];
    this.markerTime = Math.max(0, (this.markerTime || 0) - dt);
    this.targetMarker.visible =
      !!target &&
      (this.markerTime > 0 || this.objectiveStep === 1) &&
      target.position.distanceTo(this.player.position) < 250;
    if (target) {
      this.targetMarker.position.copy(target.position).y +=
        2 + Math.sin(this.time) * 0.15;
      this.targetMarker.rotation.y = this.time * 0.6;
    }
    const near = this.world.landmarks.find(
      (l) => l.position.distanceTo(this.player.position) < 12,
    );
    const nextCurrent = this.world.levelCurrents?.find(
      (c) => c.level === this.chapterIndex,
    );
    this.hud.current(nextCurrent);
    if (this.expedition.space) {
      this.hud.expeditionStatus();
      return;
    }
    if (
      this.hunting.active ||
      this.combat.active ||
      this.combat.nearby ||
      this.restoration.meditating
    )
      this.hud.context("");
    else if (
      nextCurrent &&
      nextCurrent.position.distanceTo(this.player.position) < 10
    )
      this.hud.context(
        `F · Ride the current into level ${nextCurrent.nextLevel + 1}`,
      );
    else if (this.ride)
      this.hud.context("F · Release your travelling companion");
    else if (this.encounters.context)
      this.hud.context(this.encounters.context.text);
    else if (near)
      this.hud.context(
        `F · ${near.type === "gate" ? "Listen to the deepest gate" : near.type === "current" ? "Enter the deep current" : near.activated ? "Rest at" : "Remember"} ${near.type === "gate" || near.type === "current" ? "" : near.name}`,
      );
    else if (this.ecosystem.nearestRideable(this.player.position, 9))
      this.hud.context("F · Share this creature’s journey");
    else if (
      this.player.position.y -
        this.world.getFloorHeight(
          this.player.position.x,
          this.player.position.z,
        ) <
      3.5
    )
      this.hud.context(
        this.player.mode === "swimming"
          ? "G · Anchor your arms to the reef"
          : "G · Release anchors · WASD to crawl",
      );
    else this.hud.context("");
  }
  updateCamera(dt) {
    const p = this.player.position;
    if (this.restoration.meditating) {
      const a = this.settings.reduceMotion ? this.input.yaw : this.time * 0.08;
      this.cameraDesired
        .copy(p)
        .add(new THREE.Vector3(Math.sin(a) * 11, 3.5, Math.cos(a) * 11));
      this.world.avoidCamera?.(p, this.cameraDesired, 0.7);
      this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-dt * 2));
      this.camera.lookAt(p.clone().add(new THREE.Vector3(0, 1, 0)));
      return;
    }
    if (!this.started) {
      const a = this.settings.reduceMotion
        ? 0
        : Math.sin(this.time * 0.045) * 0.14;
      this.cameraDesired.set(
        p.x + 7.4 + Math.sin(a) * 3,
        p.y + 2.1 + Math.sin(this.time * 0.16) * 0.12,
        p.z - 10.7,
      );
      this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-dt * 0.8));
      this.cameraTarget.copy(p).add(new THREE.Vector3(2.8, 0.3, 1.7));
      this.camera.lookAt(this.cameraTarget);
      return;
    }
    const yaw = this.input.yaw,
      pitch = this.input.pitch,
      speed = this.player.velocity.length(),
      distance =
        this.hunting.active && !this.settings.reduceMotion
          ? 7.6
          : this.player.mode === "crawling"
            ? 7.7
            : 10 + Math.min(3, speed * 0.2);
    this.viewDirection.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    this.cameraDesired
      .copy(p)
      .addScaledVector(this.viewDirection, -distance)
      .add(
        new THREE.Vector3(
          Math.cos(yaw) *
            (this.hunting.active && !this.settings.reduceMotion ? 4.2 : 2.8),
          2.4,
          Math.sin(yaw) *
            (this.hunting.active && !this.settings.reduceMotion ? 4.2 : 2.8),
        ),
      );
    this.cameraDesired.y = Math.min(
      -0.35,
      Math.max(
        this.cameraDesired.y,
        this.world.getFloorHeight(this.cameraDesired.x, this.cameraDesired.z) +
          1,
      ),
    );
    this.world.avoidCamera?.(p, this.cameraDesired, 0.7);
    this.camera.position.lerp(
      this.cameraDesired,
      1 - Math.exp(-dt * (this.settings.reduceMotion ? 8 : 4)),
    );
    this.world.avoidCamera?.(p, this.camera.position, 0.7);
    this.lookAhead
      .copy(p)
      .addScaledVector(this.viewDirection, 3.3)
      .add(new THREE.Vector3(0, 0.7, 0));
    this.camera.lookAt(this.lookAhead);
    const fov =
      52 +
      (this.settings.reduceMotion ? 0 : Math.min(6, this.player.jetAmount * 6));
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fov, 0.08);
      this.camera.updateProjectionMatrix();
    }
  }
}
