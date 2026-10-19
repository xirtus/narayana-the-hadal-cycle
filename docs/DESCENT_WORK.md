# Terraced descent implementation

This pass applies the central requests in `gamification.txt`: natural opening, optional city, much faster selectable jets, repeated living ledges and adjustable deep vision.

Implemented:

- Eleven main descents, plus the optional city. Existing completed-space IDs and memories survive; old mandatory city openings migrate to the reef. Bonus completion cannot unlock the main route.
- Six real landings per descent, 42 m apart and 18 m lower per step. Their floor geometry, swimming collision, arm contacts and streamed terrain use the same height function. Five ordered activities lead to the next passage.
- Broken cliff buttresses, sediment shelves, a shelter arch, kelp ribbons, glass sponges, sea pens, small crabs, plankton threads and 360 local schooling fish per active descent. Static surfaces are batched and only the active region is loaded.
- A recurring blue squid waits ahead of the player and moves toward the next activity. Periodic whale crossings and shoal movement give nearby and overhead motion; habitat messages point to these events.
- Existing wreck, cave, Titanic, temple and vent structures remain as discoveries beside the lower terrace. The black-hole finale is aligned with its final approach.
- Current flow leads toward the next landing. Course detection checks the path between simulation frames, including fast turbo crossings. Patrols are distributed across the descending ledges.
- Turbo is enabled by default and selectable with Y or the visible button. Hold Shift or the Jet button; release to brake. Squid reach 48 m/s and octopus 40 m/s. Precision mode preserves the normal short jet cycle.
- V toggles fictional UV vision. A visible slider and [ / ] adjust local illumination and optical range; natural darkness remains available. Vision, gain and turbo choice persist. P remains an independent forward spotlight.

Still separate work from the much larger design:

- Above-water tide-pool island prologue and waterfall chain; no Poseidon dependency has been added.
- Scripted shark-chase tutorial and fictional pressure escape sequence.
- Friendly naval robots with behavior distinct from hostile hunter submersibles.
- The proposed ten-region taxonomy, biological skill trees, living-language puzzles, varied ecological microquests and the full dynamic event ecosystem.
- Full production art, unique biome-specific crab species, advanced foliage animation, richer audio and the optional city's complete visual rebuild.

The present local schools and recurring guide are visual wildlife; prey capture continues to use the existing live ecosystem and real prey reservation. This is a playable route overhaul, not completion of every feature in the 1,183-line design.

## Preservation update

This route is now the **Terraced descent** experience only. It does not replace either earlier world. The Original open ocean restores the original seven-zone atlas and terrain; Original trench exposes the earlier chamber layouts and dolphin course. Each experience has an independent journey save. See `EXPERIENCES.md`.


## Fractal landscape pass

The terraced experience now uses a continuous triangulated mountain field instead of the rectangular floor and repeated cylindrical ledges. A deterministic, domain-warped ridged fractal creates branching banks, gullies and irregular peaks around the clear swimming corridor. This is fractal-inspired geology, rather than a literal Mandelbrot-set surface.

The field spans 2,048 metres in both directions, split into 64 tiles. Four-metre detail near the route transitions to sixteen-metre samples in the distance; shared boundary samples join the tiles. Rendered heights, body/arm contacts, wildlife placement and raycasts use the same terrain model. The outer field blends back into the existing ocean floor. This creates a much larger apparent environment while keeping the authored missions compact; it is not unbounded terrain streaming.

Distant rock silhouettes use gentler atmospheric attenuation than nearby objects. Fine strata, sediment variation and faint mineral fluorescence reveal relief; UV gain strengthens the mountain fluorescence. Embedded wrecks and temples occupy side basins without their old rectangular floor slabs. Coarse original terrain is hidden only where this terrain replaces it, and returns in the other experiences.

Validation includes the normal terrace route, deterministic height sampling, matching tile edges, raycast floor contacts and distant natural/UV views while swimming beyond the previous region footprint. `npm run test:landscape` captures those views.

Saved terrace positions now resume throughout the expanded surroundings (up to 1,500 m from the region entry); new journeys still begin at the first landing. The landscape browser check verifies reloading from the outer ridges.
