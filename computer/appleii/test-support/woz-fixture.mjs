export function fixture(version, track, trackId = 0) {
  const blocks = Math.ceil(track.length / 512);
  const out = Buffer.alloc(version === 1 ? 256 + (trackId + 1) * 6656 : 1536 + blocks * 512);
  out.write(`WOZ${version}`); out.set([255, 10, 13, 10], 4);
  out.write('INFO', 12); out.writeUInt32LE(60, 16);
  out[20] = version; out[21] = 1; out[22] = 1;
  out.write('TMAP', 80); out.writeUInt32LE(160, 84);
  out.fill(255, 88, 248); out[88] = trackId; out[89] = trackId;
  out.write('TRKS', 248); out.writeUInt32LE(out.length - 256, 252);
  if(version === 1) {
    const at = 256 + trackId * 6656;
    out.set(track, at);
    out.writeUInt16LE(track.length, at + 6646);
    out.writeUInt16LE(track.length * 8, at + 6648);
  } else {
    const at = 256 + trackId * 8;
    out.writeUInt16LE(3, at); out.writeUInt16LE(blocks, at + 2);
    out.writeUInt32LE(track.length * 8, at + 4);
    out.set(track, 1536);
  }
  return out;
}

