# Shared emulator framework — first draft

## Visual language

Every project uses a quiet dark shell, one restrained cyan focus/active color,
a thin framed black display, readable system text, and the same button shapes.
Keep Back in the upper right in both orientations. Keep the game title on the left.
Coin, Start, Pause and More are machine actions below the header; show only actions
the game supports. Sound, reset, ROM selection and diagnostics belong in More.
Keep keyboard bindings visible in help, not permanently across the playfield.

The display gets all remaining space after navigation and controls. Fit the entire
physical display without stretching or cropping. Preserve the framebuffer and its
machine-specific rotation. Do not infer physical aspect from framebuffer dimensions:
Galaga's rotated 288×224 buffer differs from Pole Position's 256×224 display.
Raster displays use pixelated rendering; vector projects should override it to auto.
Scaling can be fractional to maximize size; an optional integer-scale mode may
letterbox more and must never overflow on small viewports.

Portrait places touch controls below the display. Short landscape screens place
actions left and touch controls right, leaving the middle to the display.
Never cover the game with navigation or controls. Safe-area padding applies in
both orientations. Fullscreen targets the complete shell, including its controls.
Use dynamic viewport units and resize observation so orientation changes and
browser chrome changes refit the image. Preserve access to Back in fullscreen.

## Small, explicit structure

- Machine/chip/audio modules own emulation only.
- Each game owns a small adapter: load/start/pause/reset and input mapping.
- Shared shell owns navigation, display geometry, control presentation, and status.
- Existing control IDs and machine semantics stay intact during migration.

The initial implementation is `arcade/shared/emulator-shell.css` plus
`emulator-shell.mjs`. `preview.html` is a layout diagnostic, not an emulator.
Import `observeDisplay(stage, canvas, {width, height, rotation})` after the canvas
exists and call its returned cleanup function before replacing the display.
Input adapters must release held input on pointer cancellation, lost capture,
window blur and page hiding. The shell does not install synthetic key handlers.

## GitHub and CodePen

Use GitHub as the reviewed shared source. CodePen remains a development surface,
but edits there must be imported and compared before a new export replaces them.
This is a proposed sync contract, not an implemented sync service.

A per-project mapping should record: GitHub entrypoint, Pen ID, physical aspect,
rotation, expected CodePen version, and last synchronized Git commit/content hashes.
Known mapping: Galaga → ZYeQvmw. Obtain the other Pen IDs before syncing them.

For each reconciliation:
1. Read the current GitHub commit and saved CodePen version/files.
2. Compare both sides against the last synchronized snapshot.
3. If only one side changed, propagate its changes after validation.
4. If both changed, reconcile the differences; never overwrite by timestamp.
5. Generate CodePen entry files and resolve module/assets URLs to an immutable
   Git commit. Preserve Pen compiler, external dependency and document settings.
6. Write with expected_version_id. On conflict, reread; never force a stale update.
7. Inspect the resulting build, verify playable output, and record both revisions.

Classic Pens are readable but the repository's v2 MCP cannot write them through
its file workflow. Detect Pen type before choosing a publishing path.
Never put an API key in generated files, browser code, manifests or GitHub.

## Migration and validation

Apply the shell to Pole Position and Galaga first, then migrate Pac-Man,
Ms. Pac-Man, Scramble, Bosconian, Time Pilot, Dig Dug, Battlezone, Star Trek and
the Apple II with their distinct inputs intact. The current draft adds a shared
foundation only; no live game has been migrated or CodePen synchronized.

Before each migration is considered complete, verify: desktop keyboard; phone
portrait/landscape; rotation during play; narrow and short viewports; notches;
fullscreen; sound unlock; canvas aspect/orientation; simultaneous touch actions;
input release after leaving the page; and both the GitHub and CodePen builds.
Minimum geometry checks: 320×568, 390×844, 844×390, 1024×768 and 1440×900.
Browser visual/touch verification remains required before rollout.
