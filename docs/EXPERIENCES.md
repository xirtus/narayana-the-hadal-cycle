# Three preserved experiences

The user requested that each iteration remain playable instead of replacing the previous world. The title screen, diamond button in the top bar, pause menu and atlas link all expose the experience selector.

| Experience | Preserved world | Atlas |
|---|---|---|
| Original open ocean | Original OceanWorld terrain, Monterey kelp, seven depth zones, fourteen authored habitats, sanctuaries and original encounters. No expedition shelf or terrace overlay. | All seven original zones; Monterey Canyon is the second zone. |
| Original trench | CLASSIC_SPACES with the earlier depths, flat shelves, 3-seal missions, 5-ring courses, dolphin companion, caves, city, temples and wrecks. | All twelve earlier regions are freely available. New profiles start in the canyon. |
| Terraced descent | Separate SPACES route and Terraces geometry, six descending landings, five tasks, blue squid, additional wildlife and optional city. | Eleven sequential descents and bonus city. |

`SpaceGeometry.js` still builds the earlier region geometry. `Terraces.js` builds the separate third experience. `OceanWorld.js` retains the original world. Turbo, hunting, combat, UV gain and the flashlight remain available across experiences.

Saved journeys contain separate positions, discoveries, memories, captures, victories, restored habitats, story state and expedition progress. Settings are shared. Changing experiences saves the outgoing journey, loads the destination and reloads the scene to prevent terrain or wildlife from one experience leaking into another.

Existing saves without an experience tag migrate by their existing data: no expedition becomes Original open ocean; earlier expedition data becomes Original trench; terrace routeVersion 2 becomes Terraced descent. Raw earlier city progress is preserved in its classic slot rather than being reinterpreted as the new route.

`archives/terraced-descent-2026-09-09.tar.gz` is a source snapshot taken immediately before this separation. It includes source, docs, package manifests, Vite configuration and the entry HTML. It is an archive of that iteration, not a claim that a historical backup existed before this work. Live original world and classic geometry remain in the main source tree.
