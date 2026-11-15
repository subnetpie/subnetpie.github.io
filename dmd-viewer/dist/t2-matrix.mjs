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
export const t2Switches=[...columns.flatMap((a,c)=>a.map((label,r)=>({number:(c+1)*10+r+1,label,column:c+1,row:r+1}))),...cabinet.map((label,r)=>({number:r+1,label,code:'D'+(r+1),row:r+1}))].map(s=>({...s,unused:s.label==='Not used',managed:[15,16,17,18,24,78].includes(s.number),bank:s.number>=71&&s.number<=75}));
export const t2SwitchByNumber=new Map(t2Switches.map(s=>[s.number,s]));
export class T2MatrixInputs {
 constructor({setSwitch}){this.setSwitch=setSwitch;this.now=0;this.held=new Set();this.pending=new Map();this.reset();}
 balls(){for(let i=0;i<3;i++)this.setSwitch(15+i,i<this.trough?1:0);this.setSwitch(18,this.outhole?1:0);this.setSwitch(78,this.shooter?1:0);this.setSwitch(24,1);}
 reset(){this.releaseHeld();this.trough=3;this.shooter=false;this.playfield=0;this.outhole=false;this.flight=false;this.coils={3:false,4:false,9:false};this.transfer=[];this.balls();this.lastEvent='Terminator 2 switch matrix ready.';}
 update(now,readCoil=()=>0){this.now=now;
  for(const n of [3,4,9]){const on=!!readCoil(n);if(on&&!this.coils[n]){
   if(n===4&&this.trough&&!this.shooter&&!this.flight){this.trough--;this.flight=true;this.transfer.push({at:now+350,run:()=>{this.flight=false;this.shooter=true}});}
   if(n===9&&this.shooter){this.shooter=false;this.playfield++;}
   if(n===3&&this.outhole){this.outhole=false;this.trough=Math.min(3,this.trough+1);}
  }this.coils[n]=on;}
  const due=this.transfer.filter(t=>t.at<=now);this.transfer=this.transfer.filter(t=>t.at>now);for(const t of due)t.run();
  for(const [n,end] of this.pending)if(now>=end){this.pending.delete(n);if(!this.held.has(n))this.setSwitch(n,0)}this.balls();
 }
 trigger(n,hold=false){const s=t2SwitchByNumber.get(n);if(!s||s.unused||s.managed)throw Error('This switch is unused or managed by the ball simulator.');
  if(hold){if(this.held.has(n)){this.held.delete(n);this.setSwitch(n,0)}else{this.held.add(n);this.setSwitch(n,1)}}else{this.setSwitch(n,1);this.pending.set(n,this.now+120);if([25,28].includes(n)&&this.playfield){this.playfield--;this.transfer.push({at:this.now+500,run:()=>{this.outhole=true}});}}
  return this.lastEvent=(s.code||n)+' · '+s.label;
 }
 setHeld(n,pressed){const item=t2SwitchByNumber.get(n);if(!item||item.managed||item.unused)throw Error('This input is not manually controlled.');if(pressed)this.held.add(n);else this.held.delete(n);this.setSwitch(n,pressed?1:0);return this.lastEvent=(item.code||n)+' · '+item.label;}
 releaseHeld(){for(const n of new Set([...this.held,...this.pending.keys()]))this.setSwitch(n,0);this.held.clear();this.pending.clear();}
 snapshot(read){return {active:t2Switches.filter(s=>read(s.number)).map(s=>s.number),held:[...this.held],event:this.lastEvent,trough:this.trough,shooter:this.shooter,playfield:this.playfield};}
}
