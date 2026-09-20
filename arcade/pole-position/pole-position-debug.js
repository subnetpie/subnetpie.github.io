/* pole-position-debug.js — the Namco Pole Position (Zilog Z8002) machine plug-in
 * for the shared emulators.org debugger.
 *
 * Reads the live core from window.EMU_BOOT (published by the boot shim in the
 * embed) and calls EmuKit.defineMachine with:
 *   - transport   (delegated to the boot loop: pause/resume, one-frame and
 *                  single-instruction step, execution breakpoints on the PC,
 *                  write watchpoints on the memory-write path, mute)
 *   - the Z8002 register file: R0..R15 (word), the PC, the FCW status word and its
 *     individual flags (C, Z, S, P/V, DA, H), disassembled with the new 'z8000'
 *     decoder
 *   - memory chips: the whole 64 KB linear space and the video framebuffer window
 *     on its own (side-effect-free reads)
 *   - an on-screen control pad for the wheel, pedals, gear shift, start and coin
 */
(function () {
  function boot() {
    var B = window.EMU_BOOT;
    if (!B || !window.EmuKit || !EmuKit.defineMachine) { setTimeout(boot, 30); return; }
    var m = B.core;

    var chips = [
      {
        id: 'mem', name: 'Z8002 #1 space (64 KB)', size: 0x10000,
        decoder: 'z8000', views: ['disasm', 'hex'],
        read: function (a) { return m.peek(a & 0xffff); },
        write: function (a, v) { m.poke(a & 0xffff, v & 0xff); }
      },
      {
        id: 'vram', name: 'Shared video RAM 8000-AFFF', size: 0x3000,
        views: ['hex', 'bits'],
        read: function (a) { return m.peek((0x8000 + a) & 0xffff) | 0; },
        write: function (a, v) { m.poke((0x8000 + a) & 0xffff, v & 0xff); }
      }
    ];

    function wreg(name, idx) {
      return { name: name, value: m.R[idx] & 0xffff, width: 16, set: function (v) { m.R[idx] = v & 0xffff; } };
    }

    EmuKit.defineMachine({
      id: 'pole-position', name: 'Namco Pole Position (Zilog Z8002 #1)',
      transport: B.transport,
      screen: { el: B.canvas, w: 256, h: 224 },
      cpu: {
        name: 'Zilog Z8002 #1', decoder: 'z8000',
        pc: function () { return m.pc & 0xffff; },
        registers: function () {
          return [
            { name: 'PC', value: m.pc & 0xffff, width: 16, set: function (v) { m.pc = v & 0xffff; } },
            wreg('R0', 0), wreg('R1', 1), wreg('R2', 2), wreg('R3', 3),
            wreg('R4', 4), wreg('R5', 5), wreg('R6', 6), wreg('R7', 7),
            wreg('R8', 8), wreg('R9', 9), wreg('R10', 10), wreg('R11', 11),
            wreg('R12', 12), wreg('R13', 13), wreg('R14', 14), wreg('R15', 15),
            { name: 'FCW', value: m.fcw() & 0xffff, width: 16, set: function (v) { m.setFcw(v & 0xffff); } },
            { name: 'C', value: m.C, group: 'flags', set: function (v) { m.C = v ? 1 : 0; } },
            { name: 'Z', value: m.Z, group: 'flags', set: function (v) { m.Z = v ? 1 : 0; } },
            { name: 'S', value: m.S, group: 'flags', set: function (v) { m.S = v ? 1 : 0; } },
            { name: 'P/V', value: m.V, group: 'flags', set: function (v) { m.V = v ? 1 : 0; } },
            { name: 'DA', value: m.D, group: 'flags', set: function (v) { m.D = v ? 1 : 0; } },
            { name: 'H', value: m.H, group: 'flags', set: function (v) { m.H = v ? 1 : 0; } }
          ];
        }
      },
      chips: chips,
      // Pole Position controls: a wheel (steer left/right), accelerator and brake
      // pedals, a two-speed gear shift, plus Start and Coin.
      input: {
        view: 'keyboard',
        colors: { case: '#22262d', key: '#14171c', keyText: '#e9ecf1', keyEdge: 'rgba(0,0,0,.6)', accent: '#d23', accentText: '#ffffff' },
        rows: [
          [{ label: 'STEER ◄', id: 'left', w: 3 }, { label: 'STEER ►', id: 'right', w: 3 }],
          [{ label: 'ACCEL', id: 'accel', cls: 'accent', w: 2 }, { label: 'BRAKE', id: 'brake', w: 2 }, { label: 'GEAR', id: 'gear', w: 2 }],
          [{ label: 'START', id: 'start', cls: 'accent', w: 3 }, { label: 'COIN', id: 'coin', w: 3 }]
        ],
        press: function (id) { B.control(id, true); },
        release: function (id) { B.control(id, false); }
      }
    });
  }
  boot();
})();
