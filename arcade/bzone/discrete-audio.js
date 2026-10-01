// SPDX-License-Identifier: BSD-3-Clause
// MAME 0.289 bzone_a.cpp circuit port, default R11 adjustment = 40% (49 kohm).
// Original copyright: Couriersud; discrete primitives: K.Wilkins, Derrick Renaud.
const parallel=(a,b)=>1/(1/a+1/b);
const exp=(dt,rc)=>1-Math.exp(-dt/rc);
class NoiseEnvelope {
 constructor(dt,c) {
  this.cap=0;this.out=0;this.drop=23270/23540;
  this.charge=exp(dt,270*c);this.discharge=exp(dt,23270*c);
  this.both=exp(dt,parallel(270,23270)*c);this.filter=exp(dt,330000*4.7e-9);
  this.gain=[1+330000/43000,1+330000/(parallel(270,33000)+10000)];
 }
 step(gate,noise,loud) {
  if(gate)this.cap+=((noise?5*this.drop:5)-this.cap)*(noise?this.both:this.charge);
  else if(noise)this.cap-=this.cap*this.discharge;
  const v=noise?Math.min(20.5,this.cap*this.drop/23*this.gain[loud]):0;
  this.out+=(v-this.out)*this.filter;
  return this.out;
 }
}
export class BattlezoneDiscrete {
 constructor(sampleRate) {
  this.dt=1/sampleRate;this.latch=0;
  this.noiseReg=0;this.noisePhase=0;this.noise31=0;this.noise34=0;this.nand=0;
  this.shell=new NoiseEnvelope(this.dt,4.7e-6);this.explosion=new NoiseEnvelope(this.dt,10e-6);
  this.cv=0;this.cap=0;this.ff=1;this.vco=0;
  this.count4=0;this.count6=0;this.counterClock=0;this.engine=0;this.coupling=0;
  this.cvSlow=exp(this.dt,100000*10e-6);this.cvFast=exp(this.dt,parallel(100000,22000)*10e-6);
  this.engineAlpha=exp(this.dt,8250*.47e-6);this.outputAlpha=exp(this.dt,100000*.1e-6);
  this.chargeRC=149000*15e-9;this.dischargeRC=49000*15e-9;
  this.chargeAlpha=exp(this.dt,this.chargeRC);this.dischargeAlpha=exp(this.dt,this.dischargeRC);
  this.mixR=1/(1/100000+1/100000+1/41250+1/330000+1/22000);
 }
 oscillator() {
  if(this.cv<.25)return this.vco;
  const threshold=this.cv,trigger=threshold/2;
  let ff=this.ff,v=this.cap,dt=this.dt,changes=0,updated=false;
  if(v>=threshold){ff=0;changes++;}else if(v<=trigger){ff=1;changes++;}
  do {
   let next;
   if(ff) {
    next=v+(5-v)*(updated?exp(dt,this.chargeRC):this.chargeAlpha);dt=0;
    if(next>=threshold){dt=this.chargeRC*Math.log(1/(1-(next-threshold)/(5-v)));next=threshold;ff=0;changes++;updated=true;}
   } else {
    next=v-v*(updated?exp(dt,this.dischargeRC):this.dischargeAlpha);dt=0;
    if(next<=trigger){if(next<trigger)dt=this.dischargeRC*Math.log(1/(1-(trigger-next)/v));next=trigger;ff=1;changes++;updated=true;}
   }
   v=next;
  }while(dt>0);
  this.cap=v;
  this.vco=changes>=2?1-this.ff:ff;
  this.ff=ff;return this.vco;
 }
 step(pokeyVoltage=0) {
  const d=this.latch;
  this.noisePhase+=6000*this.dt;
  const oldBit=this.noiseReg>>>15&1,oldNand=this.nand;
  while(this.noisePhase>=1) {
   this.noisePhase-=1;
   this.noiseReg=((this.noiseReg<<1)|(1^((this.noiseReg>>>3^this.noiseReg>>>14)&1)))&65535;
  }
  if(!oldBit&&(this.noiseReg&32768))this.noise31^=1;
  this.nand=(this.noiseReg&0x7800)===0x7800?0:1;
  if(!oldNand&&this.nand)this.noise34^=1;
  // MAME 0.289 deliberately wires BOTH loud/soft filter inputs to D1, not D3.
  const shell=this.shell.step(d&4,this.noise31,(d>>>1)&1);
  const explosion=this.explosion.step(d&1,this.noise34,(d>>>1)&1);
  const r=(d&16)?parallel(1270,4700):4700;
  const diff=5*r/(1000+r)-this.cv;
  this.cv+=diff*(diff>.5?this.cvFast:this.cvSlow);
  const clock=this.oscillator();
  if(!(d&128))this.count4=this.count6=0;
  else {
   if(!this.counterClock&&clock) {
   this.count4++;if(this.count4>15)this.count4=4;
   this.count6++;if(this.count6>15)this.count6=6;
   }
   this.counterClock=clock;
  }
  const taps=(this.count4>7)+(this.count4===15)+(this.count6>7)+(this.count6===15);
  this.engine+=(taps/4-this.engine)*this.engineAlpha;
  if(!(d&32))return 0; // mixer capacitor holds charge while disabled
  const mix=(shell/100000+explosion/100000+this.engine*3.4/41250+pokeyVoltage/330000)*this.mixR;
  this.coupling+=(mix-this.coupling)*this.outputAlpha;
  return (mix-this.coupling)*48000/32768;
 }
}
