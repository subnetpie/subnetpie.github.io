// 2IMG/2MG container parser. Returns a view of the declared media data.
// Format fields follow CiderPress II's Apple II Universal Disk Image notes.
export function parse2MG(input) {
  const src = input instanceof Uint8Array ? input
    : input instanceof ArrayBuffer ? new Uint8Array(input)
    : null;
  if (!src) throw new TypeError('2MG input must be an ArrayBuffer or Uint8Array');
  if (src.byteLength < 0x30) throw new Error('2MG header is truncated');
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  if (view.getUint32(0, false) !== 0x32494d47)
    throw new Error('2MG signature is not 2IMG');
  const headerLength = view.getUint16(0x08, true);
  const version = view.getUint16(0x0a, true);
  const format = view.getUint32(0x0c, true);
  const flags = view.getUint32(0x10, true);
  const blocks = view.getUint32(0x14, true);
  const offset = view.getUint32(0x18, true);
  let length = view.getUint32(0x1c, true);
  if (headerLength < 0x30 || headerLength > src.byteLength)
    throw new Error('2MG header length is invalid');
  // Older writers use version 0 with the same header layout. CiderPress
  // accepts both 0 and 1; future versions still require explicit support.
  if (version > 1) throw new Error(`Unsupported 2MG version ${version} (supported: 0 and 1)`);
  if (format > 2) throw new Error('Unsupported 2MG data format');
  if (format === 1 && length === 0 && blocks) length = blocks * 512;
  if (!length || offset < headerLength || offset > src.byteLength ||
      length > src.byteLength - offset)
    throw new Error('2MG data range is invalid');
  if (format === 1 && (length % 512 || (blocks && blocks * 512 !== length)))
    throw new Error('2MG ProDOS block count disagrees with data length');
  return {
    format,
    kind: ['dos-order', 'prodos-order', 'nibble'][format],
    data: src.subarray(offset, offset + length),
    blocks: format === 1 ? length / 512 : undefined,
    writeProtected: !!(flags & 0x80000000),
    volume: flags & 0x100 ? flags & 0xff : 254,
  };
}
