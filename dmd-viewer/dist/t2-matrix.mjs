// Transcribed from the owner's Terminator 2 switch-matrix chart.
const columns=[
 ['Right flipper','Left flipper','Start button','Plumb bob tilt','Trough left','Trough center','Trough right','Outhole'],
 ['Slam tilt','Coin door closed','Token dispenser (optional)','Always closed','Left outlane','Left return lane','Right return lane','Right outlane'],
 ['Gun loaded','Gun mark','Gun home','Grip trigger','Not used','Mid left stand-up target','Mid center stand-up target','Mid right stand-up target'],
 ['Left jet','Right jet','Bottom jet','Left slingshot','Right slingshot','Top right stand-up target','Mid right stand-up target','Bottom right stand-up target'],
 ['Left lock','Not used','Low escape route','High escape route','Top lock','Top lane left','Top lane center','Top lane right'],
 ['Left ramp entry','Left ramp made','Right ramp entry','Right ramp made','Low chase loop','High chase loop','Not used','Not used'],
 ['Target 1 high','Target 2','Target 3','Target 4','Target 5 low','Ball popper','Drop target','Shooter'],
 Array(8).fill('Not used')
];
const cabinet=['Left coin chute','Center coin chute','Right coin chute','4th coin chute','Service credits / Escape','Volume down / Down','Volume up / Up','Begin test / Enter'];
export const t2Switches=[...columns.flatMap((a,c)=>a.map((label,r)=>({number:(c+1)*10+r+1,label,column:c+1,row:r+1}))),...cabinet.map((label,r)=>({number:r+1,label,code:'D'+(r+1),row:r+1}))].map(s=>({...s,unused:s.label==='Not used',managed:[15,16,17,18,24,31,32,33,78].includes(s.number),bank:s.number>=71&&s.number<=75}));
export const t2SwitchByNumber=new Map(t2Switches.map(s=>[s.number,s]));
export class T2MatrixInputs {
 constructor({setSwitch}){this.setSwitch=setSwitch;this.now=0;this.held=new Set();this.pending=new Map();this.reset();}
 // Coil/sensor identities and angular windows follow PinMAME's t2.c.
 // Travel times are a browser mechanism approximation, not a physical calibration.
 balls(){for(let i=0;i<3;i++)this.setSwitch(15+i,i<this.trough?1:0);this.setSwitch(18,+this.outhole);this.setSwitch(78,+this.shooter);this.setSwitch(24,1);this.setSwitch(76,+this.popper);this.setSwitch(31,+this.gunLoaded);this.setSwitch(32,+(this.gunPosition>=75&&this.gunPosition<=85));this.setSwitch(33,+(this.gunPosition<=3));this.setSwitch(77,+this.dropDown);}
 reset(){this.releaseHeld();this.trough=3;this.shooter=false;this.playfield=0;this.outhole=false;this.flight=false;this.popper=false;this.gunLoaded=false;this.gunTransfer=false;this.gunFiring=false;this.gunPhase=0;this.gunPosition=0;this.gunMoving=false;this.dropDown=false;this.coils={};this.transfer=[];this.balls();this.lastEvent='Terminator 2 ready. Gun at home.';}
 later(delay,run){this.transfer.push({at:this.now+delay,run});}
 pulse(n){this.setSwitch(n,1);this.pending.set(n,this.now+120);}
 captureSkull(){
  if(this.popper||this.gunTransfer)return this.lastEvent='Ball already in the skull / gun transfer.';
  if(this.gunLoaded||this.gunFiring)throw Error('Wait for the gun to fire before sending another ball to the skull.');
  if(!this.playfield)throw Error('Start a game and launch a ball before shooting the skull.');
  this.playfield--;this.popper=true;this.popperAt=this.now;this.balls();return this.lastEvent='76 · Ball in skull popper; waiting for ROM coil 1.';
 }
 hitDrop(){if(this.dropDown)return this.captureSkull();this.dropDown=true;this.balls();return this.lastEvent='77 · Skull drop target down; ROM coil 28 resets it.';}
 gunTarget(){const p=this.gunPosition;return p>=95&&p<170?71+Math.floor((p-95)/15):null;}
 update(now,readCoil=()=>0){
  const elapsed=Math.max(0,now-this.now);this.now=now;
  this.gunMoving=!!readCoil(11);
  if(this.gunMoving){this.gunPhase=(this.gunPhase+elapsed*.06)%400;this.gunPosition=this.gunPhase<=200?this.gunPhase:400-this.gunPhase;}
  for(const n of [3,4,9,12,28]){const on=!!readCoil(n);if(on&&!this.coils[n]){
   if(n===4&&this.trough&&!this.shooter&&!this.flight){this.trough--;this.flight=true;this.later(350,()=>{this.flight=false;this.shooter=true});}
   if(n===9&&this.shooter){this.shooter=false;this.playfield++;}
   if(n===3&&this.outhole){this.outhole=false;this.trough=Math.min(3,this.trough+1);}
   if(n===12){this.dropDown=true;this.lastEvent='ROM coil 12 lowered the skull target.';}
   if(n===28){this.dropDown=false;this.lastEvent='ROM coil 28 reset the skull target.';}
  }this.coils[n]=on;}
  if(this.popper&&readCoil(1)&&now-this.popperAt>=120){this.popper=false;this.gunTransfer=true;this.lastEvent='ROM coil 1 fired: skull → gun.';this.later(500,()=>{this.gunTransfer=false;this.gunLoaded=true;this.gunLoadedAt=this.now;this.lastEvent='31 · Gun loaded. Use Grip trigger to fire.';});}
  if(this.gunLoaded&&readCoil(2)&&now-this.gunLoadedAt>=60){const target=this.gunTarget();this.gunLoaded=false;this.gunFiring=true;this.lastEvent='ROM coil 2 fired the gun'+(target?' toward target '+(target-70):' onto the playfield')+'.';this.later(250,()=>{if(target)this.pulse(target);this.gunFiring=false;this.playfield++;});}
  const due=this.transfer.filter(t=>t.at<=now);this.transfer=this.transfer.filter(t=>t.at>now);for(const t of due)t.run();
  for(const [n,end] of this.pending)if(now>=end){this.pending.delete(n);if(!this.held.has(n))this.setSwitch(n,0)}this.balls();
 }
 trigger(n,hold=false){const s=t2SwitchByNumber.get(n);if(!s||s.unused||s.managed)throw Error('This switch is unused or managed automatically by the machine.');
  if(n===76)return this.captureSkull();if(n===77)return this.hitDrop();
  if(hold){if(this.held.has(n)){this.held.delete(n);this.setSwitch(n,0)}else{this.held.add(n);this.setSwitch(n,1)}}else{this.pulse(n);if([25,28].includes(n)&&this.playfield){this.playfield--;this.later(500,()=>{this.outhole=true});}}
  return this.lastEvent=(s.code||n)+' · '+s.label;
 }
 setHeld(n,pressed){const item=t2SwitchByNumber.get(n);if(!item||item.managed||item.unused)throw Error('This input is not manually controlled.');if(n===76||n===77)return pressed?this.trigger(n):this.lastEvent;if(pressed)this.held.add(n);else this.held.delete(n);this.setSwitch(n,pressed?1:0);return this.lastEvent=(item.code||n)+' · '+item.label;}
 releaseHeld(){for(const n of new Set([...this.held,...this.pending.keys()]))this.setSwitch(n,0);this.held.clear();this.pending.clear();}
 snapshot(read){return {active:t2Switches.filter(s=>read(s.number)).map(s=>s.number),held:[...this.held],event:this.lastEvent,trough:this.trough,shooter:this.shooter,playfield:this.playfield,gun:{loaded:this.gunLoaded,popper:this.popper,transfer:this.gunTransfer,firing:this.gunFiring,moving:this.gunMoving,position:Math.round(this.gunPosition),home:this.gunPosition<=3,mark:this.gunPosition>=75&&this.gunPosition<=85,target:this.gunTarget(),dropDown:this.dropDown}};}
}
