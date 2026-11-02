// Raw ROM loader shared by browser runtime and Node test harnesses.
// ROM bytes live under ./roms/; JavaScript modules must not embed ROM data.
export async function loadRom(url, expectedSize) {
  const target = url instanceof URL ? url : new URL(url, import.meta.url);
  let bytes;

  if (target.protocol === "file:") {
    const {readFile} = await import("node:fs/promises");
    bytes = new Uint8Array(await readFile(target));
  } else {
    const response = await fetch(target);
    if (!response.ok) throw new Error(`ROM load failed: ${target} (${response.status})`);
    bytes = new Uint8Array(await response.arrayBuffer());
  }

  if (expectedSize != null && bytes.length !== expectedSize)
    throw new Error(`ROM size mismatch for ${target}: expected ${expectedSize}, got ${bytes.length}`);
  return bytes;
}
