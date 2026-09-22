# Shared Namco customs

`namco.js` contains the existing Bosconian implementations of Namco 06XX, 51XX, 52XX, 54XX and Fujitsu MB88xx/MB8841/42/43/44. Bosconian and Pole Position import the same module. Extraction preserves class bodies, static constants, and API behavior.

Clock defaults and the 52XX sample-address decoder retain Bosconian behavior. Other boards must supply their own clocks, input callbacks, reset topology, sample decoding and analog circuits. Pole Position's wiring is documented in `../arcade/pole-position/ALIGNMENT.md`.
