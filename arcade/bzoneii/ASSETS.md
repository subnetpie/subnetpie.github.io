# Battlezone II asset provenance

Colors are presentation metadata alongside the original display-list bytes.
No screen position, bounding box, intensity, or address hash selects a color.
Unclassified vectors, text, and assets without a custom color remain green.

## Revision and references

The repository program/vector ROMs match the SHA-1 values in
[MAME 0.289 bzone.cpp](https://github.com/mamedev/mame/blob/mame0289/src/mame/atari/bzone.cpp).
The supplied MAME0289-galaga.zip contains Galaga/Namco sources, not Battlezone.
Battlezone's `$2000–2fff` vector RAM, `$3000–3fff` vector ROM, and monochrome
AVG behavior were checked against that driver and
[avgdvg.cpp](https://github.com/mamedev/mame/blob/mame0289/src/devices/video/avgdvg.cpp).
This change does not alter AVG arithmetic, intensity, clipping, or CPU timing.

Object identities and instruction addresses were traced using the revision 2
[disassembly](https://6502disassembly.com/va-battlezone/Battlezone.html), checked
against the repository ROM bytes and Atari's preserved
[BZONE.MAC](https://github.com/historicalsource/battlezone/blob/master/BZONE.MAC) and
[BZMTNS.MAC](https://github.com/historicalsource/battlezone/blob/master/BZMTNS.MAC).
The complete program/vector ROM fingerprint is checked at startup; an unknown
revision disables all semantic hooks and renders green.

## Asset index

All addresses below are 6502 byte addresses, except the vector tuple's AVG PC
(subtract `$2000` from a vector memory address to obtain that PC).

| Asset | Origin | Color |
| --- | --- | --- |
| Obstacles | Visible-record types `$00,01,0c,0f`: narrow pyramid, tall box, wide pyramid, short box | Orange |
| Mountains, including volcano outline | `DrawBackSeg` `$58a7`, segment `(A & 14) / 2`, calls selected from `$3006–3015` | Purple |
| Moon | Embedded asset `$3054–30c3` within segment 0; Atari source marks its outline and details through END OF MOON | Blue |
| Crosshair | Call site `$50ff`, selecting `$34cc` or `$3500` | Red |
| Volcano particles | Call site `$589e`, particle slot saved in `$08`, lifetime record `$034d + slot` | Red, maximum display intensity (15) |
| Tanks/treads/radar parts | Types `$02,04–0b,0d,21` | Green |
| Projectile/explosion | Types `$03,0e` | Green |
| Missile | Type `$16` | Green |
| Logo | Types `$17,1e,1f` | Blue |
| Saucer | Type `$20` | Green |
| Debris | Other defined types in `$10–1d`, plus `$24–2b` | Green |
| HUD radar | `DrawRadar` `$6ae9`: compass/vision marks, sweep, enemy blip | Red |
| Score label and digits | Text `$18`, RAM `$b8–b9`; scope `$6d59–6d6b` | Red |
| High-score label and digits | Text `$0e`, RAM `$0300–0301`; scope `$6d6c–6d8d` | Orange |
| ENEMY IN RANGE | Text `$10` through `$6c98` | Light orange |
| ENEMY TO LEFT / RIGHT / REAR | Text prefix `$00` + suffix `$02` / `$04` / `$06` | Light orange |
| Horizon, other text, unknown | No explicit asset color | Green |

## Data flow

The main loop reads the interleaved visible-object type table at `$0270 + X`,
with X from zero page `$10`. After transforming vertices, it calls `$5c5c`
with the type in A. `AssetTrace.beforeStep` snapshots the record address,
slot, type, and shape pointer from `$7472 + 2*type`. Each draw invocation has
a distinct ID; the slot is a visible-list slot, not a permanent world ID.
CPU return address and stack pointer delimit the scope, including through
interruptions and the game's RTS-based shape-command dispatch.

The HUD radar uses a separate `hudRadar` scope at `$6ae9`, distinct from the
enemy tank's type `$0d` radar part. Its nested text call at `$6c98` temporarily
uses its own text asset scope so ENEMY IN RANGE does not inherit radar tags.

Writes to vector RAM capture the active origin in a parallel byte array.
The `$02/03` command pointer and shared writers at `$7a6e` and `$7aab` can
therefore serve every object without losing their caller's identity. Untagged
writes explicitly clear metadata, and both display-list buffers retain their
own tags until overwritten. Metadata never enters emulated RAM.

AVG instruction fetch selects the RAM tag. VJSR carries it into ROM and a
parallel four-entry stack restores the caller on VRTS. The same primitive
can thus serve different objects. The moon is an explicitly documented
embedded subasset of a tagged landscape call; it is not inferred from where
its vectors land on screen.

Vectors are `[x1,y1,x2,y2,intensity,clip,color,avgInstructionPC,origin]`.
`origin` is null or contains `{id,asset,cpuPC,...}` plus the record/type/shape,
landscape segment, or particle record as appropriate. The renderer reads
only the supplied color. `battlezone.debugObjectColors=true` logs asset counts.

The renderer draws four additive layers, from a faint broad halo to a narrow
bright core, in each asset's color. All halos precede the cores. Point vectors
use concentric disks so volcano sparks also glow. Visible volcano particles
use maximum display intensity for core opacity and every layer's width,
remaining bright until the ROM stops emitting them. Original AVG intensity
and geometry remain unchanged.

## Validation

Run `node arcade/bzoneii/assets.test.mjs` from the repository root.
The 2,400-frame headless run covers attract mode, coin/start input, rotation,
and firing. It observes every requested asset and compares CPU PC/cycles,
all RAM, and every vector's geometry/intensity/clipping with tracing disabled.
It also checks recycled RAM tags, unsupported ROMs, stack-gated scope returns,
and differently colored callers sharing the same nested ROM primitive.
Syntax checks: `node --check arcade/bzoneii/script.js` and
`node --check arcade/bzoneii/assets.js`. This is not a full browser/audio or
cycle-by-cycle MAME conformance test.

## POKEY random register

`pokey-random.js` implements `$182a` RANDOM from MAME 0.289
`src/devices/sound/pokey.cpp` (poly_init_9_17, RANDOM_C, SKCTL_C).
Both polynomial phases advance from emulated CPU cycles, matching the shared
MASTER_CLOCK / 8 clock specified in `bzone_a.cpp`. AUDCTL bit 7 selects the
9-bit sequence; otherwise RANDOM reads bits 8–15 of the 17-bit sequence.
SKCTL low bits hold/reset the generator. The sequence is independent of audio
callbacks and wall-clock time. Timing is at the existing CPU core's instruction
boundaries, not individual bus accesses.

Previously RANDOM incorrectly read the audio register array's zero byte. This
made five volcano slots spawn together with only two distinct trajectories.
The runtime regression now requires at least four distinct simultaneous spark
positions (five observed), with the camera directed at the volcano in the last
400 frames. `node arcade/bzoneii/pokey-random.test.mjs` compares both complete
polynomial periods against independent bit-array wiring and checks reset,
resume, wraparound, and repeated reads at the same emulated time.
