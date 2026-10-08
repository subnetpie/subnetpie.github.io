/*
BSD 3-Clause License
Copyright (c) Dan Boris, Mirko Buffoni, Aaron Giles, Couriersud. All rights reserved.
Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
// DEVELOPMENT ONLY: not imported by the current Star Trek diagnostic page.
// Reset-state assignments derive from uploaded MAME 0.289 mcs48.cpp.
// Reset-line scheduling remains UNVERIFIED against MAME diexec.cpp.
// Reference blob retrieved: 9a349d12bcdc7041328323a8b04406a4206386fa.
// Connector did not expose that blob's text; do not claim framework equivalence.
// Policy: assertion holds execution; release applies reset state.
// Held step() returns an adapter time quantum, not a reset instruction cost.
export function installResetProcessing(cpu,{initiallyHeld=false,ea=1}={}) {
 if(!cpu.interruptProcessingInstalled)throw Error('Install interrupt processing first');
 if(cpu.resetProcessingInstalled)throw Error('Reset processing already installed');
 cpu.ea=ea?1:0;cpu.inReset=!!initiallyHeld;
 cpu.reset=function(){
  this.pc=0;this.psw&=0xc0;this.f1=false;this.a11=0;
  this.tirqEnabled=false;this.xirqEnabled=false;this.timecountEnabled=0;
  this.timerFlag=false;this.sts=0;this.flagsEnabled=false;this.dmaEnabled=false;
  this.irqInProgress=false;this.timerOverflow=false;
  this.dbbo=255;
  this.io.busDrive?.(255,this.ea?255:0);
  this.p1=255;this.p2=255;
  this.io.portWrite?.(1,this.p1);this.io.portWrite?.(2,this.p2);
  this.io.t0Clock?.(0);
  // Preserve A, RAM, timer, prescaler, T1 history, external IRQ and cycles.
 };
 cpu.setReset=function(asserted){
  const next=!!asserted;
  if(next===this.inReset)return;
  const was=this.inReset;this.inReset=next;
  if(was&&!next)this.reset();
 };
 cpu.advanceHeld=function(machineCycles){
  if(!this.inReset)throw Error('advanceHeld requires asserted reset');
  if(!Number.isSafeInteger(machineCycles)||machineCycles<1)throw Error('Positive machine-cycle budget required');
  this.cycles+=machineCycles;return machineCycles;
 };
 const runningStep=cpu.step.bind(cpu);
 const runningIRQ=cpu.check_irqs.bind(cpu);
 const runningBurn=cpu.burn_cycles.bind(cpu);
 cpu.step=function(){return this.inReset?this.advanceHeld(1):runningStep();};
 cpu.check_irqs=function(){return this.inReset?0:runningIRQ();};
 cpu.burn_cycles=function(count){
  if(this.inReset)throw Error('Do not burn CPU cycles during reset; advance held scheduler time instead');
  return runningBurn(count);
 };
 cpu.resetProcessingInstalled=true;cpu.reset();return cpu;
}
