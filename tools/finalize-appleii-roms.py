from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
APPLE = ROOT / "computer" / "appleii"


def replace(rel, old, new):
    path = ROOT / rel
    text = path.read_text()
    if old not in text:
        raise RuntimeError(f"missing expected text in {rel}: {old!r}")
    path.write_text(text.replace(old, new))


font_old = 'import {rom_342_0265_a} from "https://subnetpie.github.io/computer/appleii/rom/342-0265-a.js";'
font_new = '''import {loadRom} from "./rom_loader.js?v=20261017-raw-rom2";
const rom_342_0265_a = await loadRom(new URL("./roms/Apple2e_Enhanced_Video.rom", import.meta.url), 0x1000);'''
replace("computer/appleii/display_text.js", font_old, font_new)
replace("computer/appleii/display_text_80.js", font_old, font_new)

mb_old = '''import {rom_342_0304_cd} from "https://subnetpie.github.io/computer/appleii/rom/342-0304-cd.js";
import {rom_342_0303_ef} from "https://subnetpie.github.io/computer/appleii/rom/342-0303-ef.js";'''
mb_new = '''import {loadRom} from "./rom_loader.js?v=20261017-raw-rom2";
const rom_342_0304_cd = await loadRom(new URL("./roms/Apple_IIe/Apple IIe CD Enhanced - 342-0304-A - 2764.bin", import.meta.url), 0x2000);
const rom_342_0303_ef = await loadRom(new URL("./roms/Apple_IIe/Apple IIe EF Enhanced - 342-0303-A - 2764.bin", import.meta.url), 0x2000);'''
replace("computer/appleii/motherboard.js", mb_old, mb_new)

disk_old = 'import {disk16_p5_rom_341_0027} from "https://subnetpie.github.io/computer/appleii/rom/disk16-p5_341-0027.js";'
disk_new = '''import {loadRom} from "./rom_loader.js?v=20261017-raw-rom2";
const disk16_p5_rom_341_0027 = await loadRom(new URL("./roms/disk2_16sec.fw", import.meta.url), 0x100);'''
replace("computer/appleii/floppy525.js", disk_old, disk_new)
replace("computer/appleii/FloppyWoz525.js", disk_old, disk_new)
replace(
    "computer/appleii/floppy525.js",
    '//import {disk16_p6_rom_341_0028} from "https://subnetpie.github.io/computer/appleii/rom/disk16-p6_341-0028.js";\n',
    "",
)

replace(
    "computer/appleii/script.js",
    'fetch("rom/341-0728"),\n    fetch("rom/341-0748")',
    'fetch("roms/Apple_IIgs/Apple%20IIGS%20ROM%203%20Banks%20FC-FD%20-%20341-0728.bin"),\n    fetch("roms/Apple_IIgs/Apple%20IIGS%20ROM%203%20Banks%20FF-FE%20-%20341-0748.bin")',
)

replace(
    "computer/appleii/test-support/headless.mjs",
    "new URL('../rom/341-0728',import.meta.url)",
    "new URL('../roms/Apple_IIgs/Apple IIGS ROM 3 Banks FC-FD - 341-0728.bin',import.meta.url)",
)
replace(
    "computer/appleii/test-support/headless.mjs",
    "new URL('../rom/341-0748',import.meta.url)",
    "new URL('../roms/Apple_IIgs/Apple IIGS ROM 3 Banks FF-FE - 341-0748.bin',import.meta.url)",
)

woz = APPLE / "woz.test.mjs"
text = woz.read_text()
old = '''import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

// Resolve the browser's absolute module URL locally for the headless test.
const source = await readFile(new URL('./FloppyWoz525.js', import.meta.url), 'utf8');
const romURL = new URL('./rom/disk16-p5_341-0027.js', import.meta.url).href;
const {Floppy525} = await import('data:text/javascript;base64,' + Buffer.from(
  source.replace('https://subnetpie.github.io/computer/appleii/rom/disk16-p5_341-0027.js', romURL)
).toString('base64'));
const {W65C02S} = await import('./w65c02s.js');
const {Memory} = await import('./memory.js');
const {rom_342_0304_cd} = await import('./rom/342-0304-cd.js');
const {rom_342_0303_ef} = await import('./rom/342-0303-ef.js');
'''
new = '''import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadRom} from './rom_loader.js';

const {Floppy525} = await import('./FloppyWoz525.js');
const {W65C02S} = await import('./w65c02s.js');
const {Memory} = await import('./memory.js');
const rom_342_0304_cd = await loadRom(new URL('./roms/Apple_IIe/Apple IIe CD Enhanced - 342-0304-A - 2764.bin', import.meta.url), 0x2000);
const rom_342_0303_ef = await loadRom(new URL('./roms/Apple_IIe/Apple IIe EF Enhanced - 342-0303-A - 2764.bin', import.meta.url), 0x2000);
'''
if old not in text:
    raise RuntimeError("missing expected WOZ test bootstrap")
woz.write_text(text.replace(old, new))

legacy = APPLE / "rom"
if legacy.exists():
    shutil.rmtree(legacy)

bad = []
for pattern in ("*.js", "*.mjs"):
    for path in APPLE.rglob(pattern):
        text = path.read_text(errors="ignore")
        if "computer/appleii/rom/" in text or '"./rom/' in text or "'./rom/" in text or '"../rom/' in text or "'../rom/" in text:
            bad.append(str(path.relative_to(ROOT)))
if bad:
    raise RuntimeError("legacy ROM references remain: " + ", ".join(sorted(bad)))

print("Apple II ROM migration rewrites complete")
