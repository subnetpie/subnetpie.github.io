// 65C816 ADC/SBC result and N/V/Z/C flags, following MAME 0.289 g65816op.ipp.
const N = 0x80, V = 0x40, D = 0x08, Z = 0x02, C = 0x01;

function arithmetic(accumulator, operand, status, bits, subtract) {
  if (bits !== 8 && bits !== 16) throw new RangeError('bits must be 8 or 16');
  const mask = bits === 8 ? 0xff : 0xffff;
  const sign = bits === 8 ? 0x80 : 0x8000;
  const a = accumulator & mask;
  const b = operand & mask;
  const inputCarry = status & C ? 1 : 0;
  let result, overflow;

  if (!(status & D)) {
    result = subtract ? a + (b ^ mask) + inputCarry : a + b + inputCarry;
    overflow = subtract
      ? ((a ^ b) & (a ^ result) & sign) !== 0
      : ((~(a ^ b)) & (a ^ result) & sign) !== 0;
  } else {
    const rhs = subtract ? b ^ mask : b;
    let carry = inputCarry;
    result = 0;
    for (let shift = 0; shift < bits; shift += 4) {
      const lowerMask = (1 << shift) - 1;
      result = (a & (0x0f << shift)) + (rhs & (0x0f << shift))
        + (carry << shift) + (result & lowerMask);
      if (shift === bits - 4)
        overflow = ((~(a ^ rhs)) & (a ^ result) & sign) !== 0;
      const boundary = (1 << (shift + 4)) - 1;
      if (subtract) {
        if (result <= boundary) result -= 0x06 << shift;
      } else if (result > ((0x09 << shift) | lowerMask)) {
        result += 0x06 << shift;
      }
      carry = result > boundary ? 1 : 0;
    }
  }

  const value = result & mask;
  const flags = (status & ~(N | V | Z | C))
    | (value & sign ? N : 0)
    | (overflow ? V : 0)
    | (value === 0 ? Z : 0)
    | (result > mask ? C : 0);
  return {value, status: flags};
}

export function adc816(accumulator, operand, status, bits) {
  return arithmetic(accumulator, operand, status, bits, false);
}

export function sbc816(accumulator, operand, status, bits) {
  return arithmetic(accumulator, operand, status, bits, true);
}
