import assert from 'node:assert/strict';
import {PokeyRandom} from './pokey-random.js';

// Independent bit-array transcription of MAME's polynomial wiring; compare
// every entry and the wrap boundary, for both RANDOM output modes.
for(const size of [9,17]) {
  const random=new PokeyRandom();
  random.write(8,size===9?128:0,0);
  random.write(15,3,0);
  let bits=Array(size).fill(1);
  for(let cycle=0;cycle<(1<<size);cycle++) {
    const old=bits;
    bits=old.slice(1).concat(old[0]);
    if(size===17) bits[7]=old[8]^old[13];
    else bits[8]=old[0]^old[5];
    const expected=bits.slice(size===17?8:0,size===17?16:8)
      .reduce((byte,bit,index)=>byte+(bit<<index),0);
    assert.equal(random.read(cycle),expected,`${size}-bit cycle ${cycle}`);
    assert.equal(random.read(cycle),expected,'reads alone must not clock the generator');
  }
  random.write(15,0,200000);
  assert.equal(random.read(900000),255,'SKCTL reset holds initial value');
  random.write(15,1,900000);
  const fresh=new PokeyRandom();fresh.write(8,size===9?128:0,0);fresh.write(15,1,0);
  assert.equal(random.read(900123),fresh.read(123),'resume excludes time held in reset');
}
console.log('POKEY RANDOM: both complete periods, wrapping, reset, resume, and repeated reads passed');
