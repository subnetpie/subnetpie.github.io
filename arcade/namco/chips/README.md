# Shared Namco customs

The Namco custom-device implementations are split into individual modules in this directory, including Namco 06XX, 50XX, 51XX, 53XX, and the Fujitsu MB88xx/MB8841/42/43/44 MCU family. Audio devices (Namco 52XX, 54XX, and WSG) live in `../audio/`. Active emulators import the specific modules they use directly.

Clock defaults and the 52XX sample-address decoder retain Bosconian behavior. Other boards must supply their own clocks, input callbacks, reset topology, sample decoding and analog circuits. Pole Position's wiring is documented in `../polepos/ALIGNMENT.md`.
