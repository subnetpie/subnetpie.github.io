# SSI-263 phoneme recordings

Recordings by **Chris Foxwell**, distributed in AppleWin's
[source/SSI263Phonemes.h](https://github.com/AppleWin/AppleWin/blob/master/source/SSI263Phonemes.h).
Downloaded 2026-10-04. AppleWin is GPL version 2 or later; see
AppleWin-LICENSE.txt. The original 62 offset/length pairs and all 156,566
signed 16-bit PCM values are preserved. Storage was converted to gzip/base64
in `ssi263-phonemes.js`; playback data remains 22050 Hz mono.

AppleWin copyrights: Michael O'Brien (1994–1996), Oliver Schmidt (1999–2001),
Tom Charlesworth (2002–2005), Tom Charlesworth, Michael Pohoreski and Nick
Westgate (2006–2024). See its SSI263.cpp for the documented hardware handshake.

Phoneme 0 is silence; phoneme 1 uses phoneme 2 because the original recording
set has no separate phoneme 1. This is also AppleWin's mapping.

Original SSI263Phonemes.h SHA-256: b4955d4d80fc7dbc2aea6cfc8943d36af141f735bb1ecb7bbdbe7659a6142bba
