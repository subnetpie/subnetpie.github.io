// IIgs SmartPort insertion boot policy.
// A first bootable hard disk inserted into an otherwise empty machine should
// behave like powering on with that disk attached: select it and cold-reset so
// ROM 03 performs a fresh slot scan. Hot insertion into a machine that already
// has media mounted must not unexpectedly reboot it.

export function hasMountedMedia(board) {
  if (!board) return false;
  if (board.memory?.floppy35Drives?.some?.(drive => !!drive?.media)) return true;
  if (board.floppy525?._disks?.some?.(disk => !!disk?.medium)) return true;
  if (board.prodosBlock?.drives?.some?.(disk => !!disk?.image)) return true;
  return false;
}

export function coldBootSmartPort(board, drive = 0, selectBoot = null) {
  const disk = board?.prodosBlock?.drives?.[drive];
  if (!board?.iigsEnabled || !disk?.image) return false;

  const target = `s7d${drive + 1}`;
  if (typeof selectBoot === 'function') selectBoot(target);

  // A cold reset is required: ROM 03 only repeats its slot scan on a cold
  // start. Media survives Motherboard.reset(true).
  board.reset(true);

  // Some reset wrappers restore configuration defaults after the device reset;
  // reassert the selected physical boot unit before execution resumes.
  if (typeof selectBoot === 'function') selectBoot(target);
  return true;
}

export function autoBootFirstSmartPortInsert(board, drive, machineWasEmpty, selectBoot = null) {
  if (!machineWasEmpty || drive !== 0) return false;
  return coldBootSmartPort(board, drive, selectBoot);
}
