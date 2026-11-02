// Small bounded trace recorder used by both IIe regression debugging and IIgs bring-up.
export class MachineTrace {
  constructor(limit=8192){this.limit=limit;this.events=[];this.enabled=false;}
  start(){this.events.length=0;this.enabled=true;}
  stop(){this.enabled=false;}
  log(type,data){
    if(!this.enabled)return;
    this.events.push({type,...data});
    if(this.events.length>this.limit)this.events.splice(0,this.events.length-this.limit);
  }
  snapshot(){return this.events.slice();}
  text(){
    return this.events.map(e=>{
      if(e.type==="cpu") return "CPU "+e.pc.toString(16).padStart(6,"0")+" "+e.op.toString(16).padStart(2,"0");
      if(e.type==="mem") return e.rw+" "+e.addr.toString(16).padStart(6,"0")+" "+e.value.toString(16).padStart(2,"0");
      if(e.type==="disk") return "DISK "+e.op+" "+JSON.stringify(e.data||{});
      return e.type+" "+JSON.stringify(e);
    }).join("\n");
  }
}
