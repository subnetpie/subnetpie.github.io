import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Mockingboard} from './mockingboard.js';

test('debug SC01 CB1 completion edge',()=>{
 let clock=0,line=false;const reads=[],writes=[];
 const m=new Mockingboard({add_read_hook:f=>reads.push(f),add_write_hook:f=>writes.push(f)},{clock:()=>clock,irq:s=>line=s});
 const read=a=>reads[0](a), write=(a,v)=>writes[0](a,v), v=m.via[0];
 write(0xc402,0xff);
 write(0xc40e,0x90);
 write(0xc40c,0xf0);
 write(0xc400,0xa0);
 write(0xc40c,0xd0);
 console.log('STROBE',JSON.stringify({pcr:v.r[12],ier:v.r[14],ifr:v.r[13],cb1:v.cb1Level,cb2:v.cb2Level,ar:m.speech.arState,commit:m.speech.commitClock,end:m.speech.endClock}));
 clock=100;m.sync(clock);
 console.log('COMMIT',JSON.stringify({pcr:v.r[12],ier:v.r[14],ifr:v.r[13],cb1:v.cb1Level,ar:m.speech.arState,commit:m.speech.commitClock,end:m.speech.endClock,start:m.speech.sampleStart,sampleEnd:m.speech.sampleEnd}));
 clock=300000;m.sync(clock);
 console.log('END',JSON.stringify({pcr:v.r[12],ier:v.r[14],ifr:v.r[13],cb1:v.cb1Level,ar:m.speech.arState,commit:m.speech.commitClock,end:m.speech.endClock,line}));
 assert.equal(m.speech.arState,true);
 assert.equal(v.r[13]&0x10,0x10);
 assert.equal(line,true);
});
