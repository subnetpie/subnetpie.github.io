// IIgs physical-storage boot policy.
//
// Media insertion/ejection is a hot-swap operation and must not reset the
// machine. Booting is explicit: select the requested physical device, perform
// a cold reset so ROM 03 repeats its startup scan, then reapply the selected
// drive because controller reset can restore its default unit.

export function hasMountedMedia(board) {
  if (!board) return false;
  if (board.memory?.floppy35Drives?.some?.(drive => !!drive?.media)) return true;
  if (board.floppy525?._disks?.some?.(disk => !!disk?.medium)) return true;
  if (board.prodosBlock?.drives?.some?.(disk => !!disk?.image)) return true;
  return false;
}

export function bootTargetMounted(board, target) {
  if (!board?.iigsEnabled || typeof target !== 'string') return false;
  const match = /^s([567])d([1-4])$/.exec(target);
  if (!match) return false;

  const slot = Number(match[1]);
  const drive = Number(match[2]) - 1;
  if (slot === 5)
    return drive < 2 && !!board.memory?.floppy35Drives?.[drive]?.media;
  if (slot === 6)
    return drive < 2 && !!board.floppy525?._disks?.[drive]?.medium;
  return !!board.prodosBlock?.drives?.[drive]?.image;
}

export function coldBootStorage(board, target, selectBoot = null) {
  if (!bootTargetMounted(board, target)) return false;

  if (typeof selectBoot === 'function') selectBoot(target);

  // ROM 03 only performs a fresh startup-device scan on a cold start. Mounted
  // media survives Motherboard.reset(true), exactly like disks left in drives.
  board.reset(true);

  // Drive-select state is controller state and can be reset to drive 1. Apply
  // the requested physical target again before the next emulation slice.
  if (typeof selectBoot === 'function') selectBoot(target);
  return true;
}

// Compatibility helper for callers that still describe a Slot-7 boot by drive.
export function coldBootSmartPort(board, drive = 0, selectBoot = null) {
  if (!Number.isInteger(drive) || drive < 0 || drive > 3) return false;
  return coldBootStorage(board, `s7d${drive + 1}`, selectBoot);
}
