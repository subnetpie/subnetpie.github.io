# Lamp and LED planner

The color playfield includes a searchable lamp catalog for T2 and Popeye. Enable **Select lamps on table** to pick mapped inserts or flashers without sending switch inputs. The list also includes backbox bulbs and bulbs whose artwork positions are not mapped.

Each physical controlled-lamp or flasher record has its own saved configuration. GI entries select entire strings: exact individual GI socket positions and quantities are not verified, so their overlays show approximate regions and their bulb counts must be entered manually. GI output is not provided by the emulator bridge; its lighting is an explicit preview only.

## Configuration and compatibility

- Choose a bulb color independently for each entry. T2 insert defaults come from existing Playfield metadata; these describe insert colors, not colored factory incandescent bulbs. Popeye insert colors require verification. GI uses warm white as an LED baseline. Flasher cover colors remain unverified.
- Inserts default to 6.3 V non-ghosting 1SMD; GI defaults to 6.3 V frosted 2SMD. Moderate 1SMD is also offered. Controlled-lamp sockets require verification at the machine.
- Flashers offer 12 V LED replacements in #89 bayonet or #906 wedge, with 5SMD and 8SMD choices. The super-bright 8SMD tower option is restricted to the verified #89 product base. These profiles cannot be selected for 6.3 V lighting.
- SMD counts and screen glow are not calibrated brightness measurements. Confirm voltage, socket, color, lens, dimming behavior and fit before buying.
- Choices save in this browser, separately for each game. CSV exports saved choices only; it is not a complete replacement kit. GI counts stay blank until supplied.

## Evidence

Factory tech charts supply circuit identities, GI string bases and physical flasher counts (T2: 23 bulbs; Popeye: 24). They do not establish every individual GI socket coordinate or count. T2 coil 28 is the drop-target reset; Popeye output 17 is the wheel motor and 25 is unused. None is offered as a flasher.

- [Williams Terminator 2 factory tech chart](https://www.pinballrebel.com/pinball/cards/Tech_Charts/Williams_Terminator_2_Tech_Chart.pdf)
- [Bally Popeye factory tech chart](https://www.pinballrebel.com/pinball/cards/Tech_Charts/Bally_Popeye_Tech_Chart.pdf)
- [Comet LED selection guide](https://www.cometpinball.com/pages/the-art-of-pinball-leds)
- [Comet brightness guide](https://www.cometpinball.com/pages/pinball-led-brightness-chart)
- [1SMD](https://www.cometpinball.com/products/1smd-bulbs), [2SMD](https://www.cometpinball.com/products/2smd-bulbs), [5SMD flashers](https://www.cometpinball.com/products/5smd-flashers), [8SMD flashers](https://www.cometpinball.com/products/8smd-flashers), [8SMD tower flashers](https://www.cometpinball.com/products/8smd-tower-flashers)

Validation: full npm test suite; browser checks for table selection, GI preview/counts, blue super-bright configuration, reload persistence, CSV download, game switching and mobile overflow. Source and supplier links are also available in the planner.
