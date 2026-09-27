import assert from 'node:assert/strict';
import {test} from 'node:test';
import {adc816, sbc816} from './w65c816_alu.js';

for (const [name, result, expectedValue, expectedFlags] of [
  ['ADC 8-bit BCD 09+01', adc816(0x09, 0x01, 0x08, 8), 0x10, 0x08],
  ['ADC 8-bit BCD 99+01', adc816(0x99, 0x01, 0x08, 8), 0x00, 0x0b],
  ['SBC 8-bit BCD 10-01', sbc816(0x10, 0x01, 0x09, 8), 0x09, 0x09],
  ['SBC 8-bit BCD 00-01', sbc816(0x00, 0x01, 0x09, 8), 0x99, 0x88],
  ['ADC 16-bit BCD 9999+0001', adc816(0x9999, 0x0001, 0x08, 16), 0x0000, 0x0b],
  ['SBC 16-bit BCD 1000-0001', sbc816(0x1000, 0x0001, 0x09, 16), 0x0999, 0x09],
  ['ADC 8-bit binary overflow', adc816(0x7f, 0x01, 0x00, 8), 0x80, 0xc0],
  ['SBC 8-bit binary overflow', sbc816(0x80, 0x01, 0x01, 8), 0x7f, 0x41],
]) {
  test(name, () => {
    assert.equal(result.value, expectedValue);
    assert.equal(result.status & 0xcb, expectedFlags);
  });
}

test('ADC/SBC preserve non-NVZC status bits', () => {
  assert.equal(adc816(0, 0, 0x3c, 8).status & 0x3c, 0x3c);
  assert.equal(sbc816(0, 0, 0x3d, 16).status & 0x3c, 0x3c);
});

test('operand width must be 8 or 16', () => {
  assert.throws(() => adc816(0, 0, 0, 24), RangeError);
});
