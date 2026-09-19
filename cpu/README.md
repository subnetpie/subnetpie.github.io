# Shared Z80

All five active Z80 games import `Z80` from `/cpu/z80.js`:
Galaga, Bosconian, Scramble, Pac-Man, and Ms. Pac-Man.
The old archived `arcade/galaga/Old/cpu.js` is not an active game dependency.
Apple II and NES use different CPU architectures and are unchanged.

## Reference and scope

The foundation is the repository's Galaga Z80 implementation. Reset,
interrupt acceptance, interrupt refresh increments, IM2 vector addressing,
LD A,I/R interrupt parity handling, and MAME-style IM0 board vectors were
aligned with these **MAME 0.289** references:

- https://github.com/mamedev/mame/blob/mame0289/src/devices/cpu/z80/z80.cpp
- https://github.com/mamedev/mame/blob/mame0289/src/devices/cpu/z80/z80.lst

This is a JavaScript instruction-level adaptation, not MAME's generated
T-state execution engine or a claim of complete opcode/undocumented-flag
conformance. It does not implement bus-level WAIT/BUSREQ timing or a daisy-chain
controller. `addStall()` supplies instruction-boundary idle cycles. A reset-held
`step()` returns four idle cycles to keep host scheduling loops progressing.
MAME's reset leaves IM and general registers untouched; startup initializes
state separately. Total cycle counts remain monotonic across reset.

## Import and bus

```js
import { Z80 } from '../../cpu/z80.js';
const cpu = new Z80(readMemory, writeMemory, readPort, writePort);
const elapsed = cpu.step(); // T states consumed
```

Load each game's entry script using `<script type="module" src="./script.js">`.
Callbacks may also be assigned as `memRead`, `memWrite`, `ioRead`, `ioWrite`.
Use `setInstructionReaders(opcodeRead, operandRead)` for separate instruction
fetch views; never replace `fetchOpcode()` with an address-taking callback.

## Interrupts

- `setIrqLine(true, vector)` asserts a level until the board clears it.
- `requestIrq(vector)` holds one request until CPU acknowledgment, even if IFF1
  is disabled when requested. `irq()` is a compatibility alias for this form.
- `clearIrq()` clears both the line and held request.
- `onIrqAcknowledge(cpu)` can return a vector; otherwise `vectorLatch` is used.
- IM0 follows MAME 0.289's board-vector forms: zero/NOP, RST opcode, EI, or
  packed `0xCDxxxx` / `0xC3xxxx` CALL/JP. Other vectors throw explicitly.
- `setNmiLine()` detects a new assertion edge; `pulseNmi()` asserts and releases
  it. Releasing the line does not discard a latched edge. No in-service lockout.
- `clearNmi()` cancels pending NMI and releases its line for a board reset.
- `onReti(cpu)` lets a board supply interrupt-controller notification.

Galaga uses a level IRQ. Scramble sound and the existing Bosconian/Pac-Man
integrations use held requests. Device addresses, IRQ masks, clocks, ROMs,
video, and audio remain in the individual game modules.

## Validation

Run from the repository root:

```sh
node --test cpu/z80.test.mjs
node --experimental-vm-modules cpu/projects.test.cjs
```

Tests cover reset, fetch hooks/wrapping, refresh, EI/DI delay, IRQ line/held
requests, IM0/IM1/IM2, NMI nesting and RETN, HALT, LD A,I parity, idle cycles,
repeated prefixes, and module wiring. The opcode-family sweep checks positive
finite timings and absence of missing method calls, not full instruction
semantics. During migration, all five game modules were also loaded in a Node
VM with mocked browser APIs and ran against their repository ROMs. These are
headless smoke tests, not visual or audio gameplay certification.
