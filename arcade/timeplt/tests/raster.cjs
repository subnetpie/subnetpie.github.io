const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(process.env.TIMEPLT_SOURCE || path.join(__dirname, '../script.js'), 'utf8')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*[^;]+;/, '')
  .split('const e=new TP;')[0];
const TP = vm.runInNewContext(source + '\nTP;');
function machine() {
  const e = Object.create(TP.prototype);
  Object.assign(e, {
    m: new Uint8Array(65536), im: {data: new Uint8ClampedArray(224 * 256 * 4)},
    cx: {putImageData() {}}, pal: Array.from({length: 384}, () => [0, 0, 0]),
    flip: false, video: 1, mainCycleRemainder: 0, soundCycleRemainder: 0,
    ac: {step: () => 4}, c: {step: () => 4},
    gp: (rom, code, x, y, sprite) => sprite ? 1 : 0
  });
  e.pal[129] = [255, 255, 255];
  return e;
}
function pixel(e, x, y) { return e.im.data[(y * 224 + x) * 4]; }
function cloud(e, y) {
  e.m[0xb010] = 64;
  e.m[0xb411] = 241 - y;
}

// Reuse one sprite slot 128 raster lines later, just as the game does.
// Both positions must survive in one displayed frame, including when flipped.
for (const flip of [false, true]) {
  const e = machine();
  e.flip = flip;
  e.c.step = () => { cloud(e, e.scan < 128 ? 48 : 176); return 4; };
  e.frame();
  const y = flip ? 191 : 64;
  assert.equal(pixel(e, flip ? 32 : 191, y), 255, 'first cloud position lost');
  assert.equal(pixel(e, flip ? 160 : 63, y), 255, 'second cloud position lost');
}

// Foreground tiles must still cover sprites; a disabled video latch draws none.
{
  const e = machine();
  cloud(e, 176);
  e.m[0xa000 + 22 * 32 + 8] = 0x10;
  e.pal[64] = [80, 0, 0];
  e.frame();
  assert.equal(pixel(e, 63, 64), 80);
  assert.equal(pixel(e, 63, 72), 255);
  e.video = 0;
  e.frame();
  assert.ok(e.im.data.every(v => v === 0));
}

// Instruction rounding must not accumulate an extra partial instruction per line.
{
  const e = machine();
  let cycles = 0;
  e.c.step = () => { cycles += 7; return 7; };
  for (let i = 0; i < 10; i++) e.frame();
  assert.ok(cycles >= 512000 && cycles < 512007, `cycle drift: ${cycles}`);
}
console.log('PASS: cloud multiplexing, flipped screen, tile priority, video enable, cycle carry');
