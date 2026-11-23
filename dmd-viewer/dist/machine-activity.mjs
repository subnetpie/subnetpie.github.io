// Session metadata only: no frame, audio, ROM, or PAC content is retained.
export class MachineActivity {
 constructor(limit=120){this.limit=limit;this.rows=[];this.pending=[];this.sequence=0;}
 add(type,detail,time=0){const row={id:++this.sequence,type,detail:String(detail).slice(0,240),time:Math.max(0,Math.round(time))};this.rows.push(row);if(this.rows.length>this.limit)this.rows.shift();this.pending.push(row);if(this.pending.length>this.limit)this.pending.shift();return row;}
 drain(){return this.pending.splice(0);}
 clear(){this.rows=[];this.pending=[];}
}
export const t2CoilNames={1:'Skull ball popper',2:'Gun kicker',3:'Outhole',4:'Trough release',5:'Right slingshot',6:'Left slingshot',7:'Knocker',8:'Left kickback',9:'Shooter',10:'Top lock',11:'Gun motor',12:'Skull target knockdown',13:'Left jet',14:'Right jet',15:'Bottom jet',16:'Left lock',28:'Skull target reset'};
