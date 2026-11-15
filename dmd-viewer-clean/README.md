# Clean DMD viewer

Published at https://subnetpie.github.io/dmd-viewer-clean/ . The original viewer remains at `/dmd-viewer/`.

This fork contains only the live DMD, game selector, table lights and switch inputs, and coin-door/service switches. Press table or service switches with a pointer, Space, or Enter. Automatic trough and EOS switches are read-only. The ROM supplies live sound; its service volume switches control volume.

It shares the original viewer's WASM emulator, ROM/PAC files, table diagrams, and switch models using relative URLs. The small emulator JavaScript loader is copied into this fork so its browser threads remain inside the isolation scope. No recordings, recipes, exports, or additional media are bundled. Emulator and asset notices remain in [the original viewer](../dmd-viewer/dist/emulator/README.md).
