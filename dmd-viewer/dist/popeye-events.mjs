// Switch/coil numbers: PinMAME src/wpc/sims/wpc/prelim/pop.c (BSD-3-Clause).
// This supplies ball-presence switches, not table graphics or recreated rules.
export const popeyeEvents=[
  {id:'launch',label:'Launch ball',switches:[23]},
  {id:'left-inlane',label:'Left inlane',switches:[75]},
  {id:'right-inlane',label:'Right inlane',switches:[78]},
  {id:'left-bumper',label:'Left bumper',switches:[16]},
  {id:'center-bumper',label:'Center bumper',switches:[18]},
  {id:'right-bumper',label:'Right bumper',switches:[17]},
  {id:'bumpers',label:'Bumper sequence',switches:[16,18,17,16,18,17]},
  {id:'left-sling',label:'Left slingshot',switches:[76]},
  {id:'right-sling',label:'Right slingshot',switches:[77]},
  {id:'wheel-exit',label:'Wheel exit',switches:[37]},
  {id:'drain-left',label:'Drain left',switches:[74],drain:true},
  {id:'drain-right',label:'Drain right',switches:[85],drain:true},
];
export class PopeyeMachine {
  constructor({setSwitch}){this.setSwitch=setSwitch;this.now=0;this.reset();}
  reset(){
    this.bootAt=this.now+12000;
    this.pending=[];this.trough=6;this.shooter=false;this.playfield=0;this.coils={3:0,5:0};this.flight=false;
    for(const n of [1,5,13,16,17,18,23,37,57,74,75,76,77,78,85,86])this.setSwitch(n,0);
    this.updateTrough();this.lastEvent='Ready — add a coin, then start a game.';
  }
  updateTrough(){for(let i=0;i<6;i++)this.setSwitch(51+i,i<this.trough?1:0);}
  later(delay,run){this.pending.push({at:this.now+delay,run});}
  pulse(number,delay=0){this.later(delay,()=>this.setSwitch(number,1));this.later(delay+120,()=>this.setSwitch(number,0));}
  beginGame(){
    if(this.pending.some(p=>p.begin))return;
    const delay=Math.max(0,this.bootAt-this.now);
    for(const [number,offset] of [[5,0],[1,400],[1,800],[13,1300]])this.pulse(number,delay+offset);
    this.pending.push({at:this.now+delay+1500,begin:true,run(){}});
    this.lastEvent=delay?'Waiting for ROM startup, then adding credit and pressing Start.':'Adding credit and pressing Start.';
    return this.lastEvent;
  }
  update(now,readCoil){
    this.now=now;
    for(const number of [3,5]){
      const on=!!readCoil(number);
      if(on&&!this.coils[number]){
        if(number===5&&this.trough>0&&!this.shooter&&!this.flight){
          this.flight=true;this.trough--;this.updateTrough();this.pulse(57,80);
          this.later(350,()=>{this.flight=false;this.shooter=true;this.setSwitch(86,1);this.lastEvent='Ball served — press Launch ball.';});
        }
        if(number===3&&this.shooter){
          this.shooter=false;this.playfield++;this.setSwitch(86,0);this.pulse(37,1200);this.lastEvent='Ball launched — choose a shot.';
        }
      }
      this.coils[number]=on;
    }
    const due=this.pending.filter(p=>p.at<=now);this.pending=this.pending.filter(p=>p.at>now);
    for(const p of due)p.run();
    // ROM startup/reset may rebuild the input matrix after the worker starts.
    this.updateTrough();this.setSwitch(86,this.shooter?1:0);
  }
  event(id){
    const event=popeyeEvents.find(e=>e.id===id);if(!event)throw Error('Unknown Popeye event.');
    if(id==='launch'&&!this.shooter)throw Error('Wait for the ROM to serve a ball into the shooter lane.');
    if(id!=='launch'&&!this.playfield)throw Error('Start a game and launch a ball before choosing a shot.');
    if(this.pending.some(p=>p.event))throw Error('Wait for the current shot sequence to finish.');
    event.switches.forEach((n,i)=>this.pulse(n,i*250));
    // Reserve the sequence so quick repeats cannot release a switch too early.
    this.pending.push({at:this.now+event.switches.length*250,event:true,run(){}});
    if(event.drain){this.playfield--;this.later(500,()=>{this.trough++;this.updateTrough();});}
    this.lastEvent=event.label;return event.label;
  }
  snapshot(){return {trough:this.trough,shooter:this.shooter,playfield:this.playfield,event:this.lastEvent,busy:this.pending.some(p=>p.event),starting:this.pending.some(p=>p.begin)};}
}
