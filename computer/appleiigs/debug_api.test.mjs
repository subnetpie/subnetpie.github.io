import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMachine} from './test-support/headless.mjs';
import {createDebugAPI} from './debug_api.js';
test('debug inspection has no I/O side effects and execution is gated and bounded',async()=>{
 const {board}=createMachine();let control=false,running=true;
 const api=createDebugAPI({board,screen:{width:640,height:400,toDataURL:()=> 'data:image/png;base64,YQ=='},pause:()=>{running=false;},resume:()=>{running=true;},isRunning:()=>running,render(){},canControl:()=>control});
 board.memory.slowE1[0xc010]=42;board.memory.read=()=>{throw Error('Bus read must not occur during inspection');};
 assert.deepEqual((await api.execute('read_memory',{region:'e1',offset:0xc010,length:1})).bytes,[42]);
 await assert.rejects(api.execute('step'),/Enable/);await assert.rejects(api.execute('read_memory',{region:'e1',offset:65535,length:2}),/exceeds/);
 control=true;let steps=0;board.clock=n=>{assert.equal(n,1);steps++;board.cycles++;};
 const result=await api.execute('capture_trace',{count:3});assert.equal(result.completed,3);assert.equal(result.trace.length,3);assert.equal(steps,3);assert.equal(running,false);
 await api.execute('resume');assert.equal(running,true);assert.equal((await api.execute('capture_screen')).data,'YQ==');
 await assert.rejects(api.execute('step',{count:1001}),/integer/);
});
test('real CPU stepping advances master clock and video peripheral time',async()=>{
 const {board}=createMachine();board.memory.ram.set([0xea,0xea,0xea],0x200);board.cpu.register.pc=0x200;
 const before=board.cycles,beam=board.video_iigs.scanCycleAccum;
 const api=createDebugAPI({board,screen:{},pause(){},resume(){},isRunning:()=>false,render(){},canControl:()=>true});
 const result=await api.execute('step',{count:3});assert.equal(result.completed,3);assert.equal(board.cpu.register.pc,0x203);assert.ok(board.cycles>before);assert.ok(board.video_iigs.scanCycleAccum>beam);
});
