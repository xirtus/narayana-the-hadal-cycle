import "./style.css";
import { Game } from "./core/Game.js";

try {
  const game = new Game();
  // Read-only telemetry makes real browser playtests and performance checks reproducible.
  window.narayana = {
    get state() {
      return {
        started: game.started,
        experience: game.experience,
        paused: game.paused,
        expedition: game.expedition.status,
        lamp: {
          enabled: game.lamp.enabled,
          intensity: game.lamp.light.intensity,
          position: game.lamp.light.position.toArray(),
          target: game.lamp.light.target.position.toArray(),
          beamLength: game.lamp.beam.scale.z * 65,
        },
        depth: -game.player.position.y,
        position: game.player.position.toArray(),
        yaw: game.input.yaw,
        pitch: game.input.pitch,
        velocity: game.player.velocity.toArray(),
        species: game.player.species,
        arms: game.player.arms.length,
        stamina: game.player.stamina,
        turbo: game.player.turboMode,
        uvStrength: game.settings.uvStrength,
        mode: game.player.mode,
        hunting: game.hunting.status,
        combat: game.combat.status,
        enemies: game.combat.enemies.map((e) => ({
          id: e.id,
          kind: e.kind,
          name: e.name,
          position: e.position.toArray(),
          hp: e.hp,
          state: e.state,
          mythic: e.mythic,
        })),
        projectiles: game.combat.projectiles.length,
        combatVictories: [...game.save.data.combatVictories],
        restored: [...game.save.data.restored],
        observed: [...game.save.data.observed],
        restoration: game.restoration.status,
        huntCount: game.save.data.hunts || 0,
        mouth: game.player.getMouthPosition().toArray(),
        prey: game.hunting.preview
          ? {
              id: game.hunting.preview.id,
              position: game.hunting.preview.position.toArray(),
              name: game.hunting.preview.name,
            }
          : null,
        heldPrey: game.hunting.held
          ? {
              position: game.hunting.held.group.position.toArray(),
              scale: game.hunting.held.group.scale.toArray(),
            }
          : null,
        feedingTips: game.player
          .getFeedingTipPositions()
          .map((p) => p.toArray()),
        perception: game.perception,
        habitats: game.world.habitats
          ?.filter((h) => h.level === game.chapterIndex)
          .map((h) => ({ name: h.name, position: h.position.toArray() })),
        currents: game.world.levelCurrents?.map((c) => ({
          level: c.level,
          nextLevel: c.nextLevel,
          position: c.position.toArray(),
        })),
        camouflage: game.player.camouflage,
        memories: game.save.data.memories,
        discovered: [...game.save.data.discovered],
        chapter: game.chapterIndex,
        ink: game.effects.inkClouds.length,
        pulses: game.effects.pulses.length,
        fps: Math.round(game.fps),
        drawCalls: game.renderer.info.render.calls,
        triangles: game.renderer.info.render.triangles,
        geometries: game.renderer.info.memory.geometries,
        animals: game.ecosystem.animals?.length,
        renderer: "WebGL2",
        sanctuaries: [...game.save.data.sanctuaries],
        encounters: [...game.save.data.encounters],
        health: game.health,
        incarnation: game.save.data.incarnation,
        ending: game.save.data.ending,
        landmarks: game.world.landmarks.map((l) => ({
          id: l.id,
          name: l.name,
          position: l.position.toArray(),
        })),
        encounterTargets: game.encounters.research?.nodes.map((n) => ({
          position: n.position.toArray(),
          purged: n.purged,
        })),
        floor: game.world.getFloorHeight(
          game.player.position.x,
          game.player.position.z,
        ),
      };
    },
  };
} catch (error) {
  console.error("The ocean could not initialize:", error);
  document.getElementById("app").innerHTML =
    '<div class="loading"><div class="eyebrow">NARAYANA</div><h1>The ocean could not open.</h1><p>This experience needs WebGL 2. Enable hardware acceleration and reload.</p><button class="enter-button" onclick="location.reload()">Try again ↗</button></div>';
}
