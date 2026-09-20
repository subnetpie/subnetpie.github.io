# Namco Audio Architecture Plan

MAME 0.289 is the authoritative behavioral reference. Browser and iOS support begins only after the emulated-machine audio boundary.

## Design rule

**If MAME has it, reproduce it on the machine side. If Safari/iPhone requires it, put it on the browser side.**

The machine-side audio implementation must remain deterministic and usable without DOM, AudioContext, AudioWorklet, or other browser APIs.

## Target architecture

```text
MAME 0.289 machine behavior
        |
        +-- NamcoWSG 3-voice
        |     write(offset, data)
        |     soundEnable(state)
        |     renderMono(buffer)
        |
        +-- NamcoWSG 8-voice / 4-output (Pole Position)
        |     write(offset, data)
        |     soundEnable(state)
        |     renderOutputs([out0, out1, out2, out3])
        |
        +-- Namco52XX
        |       |
        |       +-- onDacWrite(value, masterTick)
        |               |
        |               +-- shared Namco52xxDac
        |
        +-- Namco54XX
                |
                +-- onChannelData(channel, value, masterTick)
                        |
                        +-- shared Namco54xxDac

WSG PCM + 52XX DAC PCM + 54XX DAC PCM
        |
        +-- machine-specific MAME routing / gain / discrete analog model
        |
        +-- deterministic mixed PCM
                        |
================ browser boundary ================
                        |
                        +-- EmulatorAudioWorklet
                                |
                                +-- AudioContext
                                +-- iOS user-gesture unlock
                                +-- suspend / resume
                                +-- PCM buffering
                                +-- browser sample-rate conversion
                                |
                                +-- speakers
```

## Shared device layer

Keep one `NamcoWSG` implementation with MAME-defined variants rather than separate browser-oriented sound implementations.

The 3-voice variant is used by Pac-Man/Ms. Pac-Man and the relevant Galaga/Bosconian hardware. The Pole Position variant provides eight voices and four hardware outputs.

`Namco52XX` and `Namco54XX` remain MCU/device models. Their callbacks carry machine-time output changes into shared DAC models. The DAC models must be derived from MAME 0.289 behavior and circuitry rather than copied from whichever existing game implementation happens to work.

## Routing and mixing

Shared DAC/device code does not imply one universal analog circuit. Each machine retains its MAME-defined routing, gains, filtering/discrete network, and output selection.

A shared mixer may provide infrastructure for deterministic PCM accumulation, but machine-specific MAME configuration controls the actual signal path.

## Browser boundary

`EmulatorAudioWorklet` is hardware-agnostic. It must not implement Namco registers, MCU behavior, WSG synthesis, DAC resistor networks, or arcade-machine timing.

Its responsibilities are browser delivery only: AudioContext creation, iOS/Safari gesture unlock, suspend/resume, bounded PCM buffering, browser-rate conversion, and final playback.

## Validation

Before declaring the shared audio layer complete:

- validate WSG register, phase/counter, clock and output behavior against MAME 0.289;
- validate 52XX DAC conversion against MAME 0.289;
- validate all three 54XX DAC channels and analog/discrete behavior against MAME 0.289;
- preserve machine timestamps across 52XX/54XX output changes;
- preserve each game's MAME routing rather than normalizing all games to one mix;
- verify machine-side audio can run headlessly without browser APIs;
- verify iOS audio unlock and lifecycle behavior only in the browser layer.

Pac-Man and Ms. Pac-Man are the first confirmed consumers of the separated machine-WSG / browser-PCM architecture.
