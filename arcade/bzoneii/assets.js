// Battlezone rev 2 semantic provenance. See ASSETS.md for ROM/source evidence.
export const ASSETS = Object.freeze({
  unclassified: {color:"green"}, mountains: {color:"purple"}, horizon: {color:"darkPurple"},
  moon: {color:"blue"}, obstacle: {color:"orange"},
  crosshair: {color:"red"}, volcanoSpark: {color:"red",displayIntensity:15},
  tank: {color:"green"}, playerLives: {color:"green"}, projectile: {color:"green"}, debris: {color:"green"},
  missile: {color:"green"}, logo: {color:"blue"}, saucer: {color:"green"},
  hudRadar: {color:"red"}, score: {color:"red"}, highScore: {color:"orange"},
  enemyInRange: {color:"lightOrange"}, enemyDirection: {color:"lightOrange"},
  motionBlocked: {color:"lightOrange"}
});

export function shapeAsset(type) {
  if ([0,1,0x0c,0x0f].includes(type)) return "obstacle";
  if (type===2 || type===0x21 || (type>=4 && type<=0x0b) || type===0x0d) return "tank";
  if (type===3 || type===0x0e) return "projectile";
  if (type===0x16) return "missile";
  if ([0x17,0x1e,0x1f].includes(type)) return "logo";
  if (type===0x20) return "saucer";
  if ((type>=0x10 && type<=0x1d) || (type>=0x24 && type<=0x2b)) return "debris";
  return "unclassified";
}

export class AssetTrace {
  constructor(mem) {
    this.mem=mem;
    this.bytes=new Array(0x1000).fill(null);
    this.scopes=[];
    this.serial=0;
    // Fail closed for another ROM revision: these CPU hooks are revision-specific.
    let hash=2166136261;
    for (const [start,end] of [[0x3000,0x4000],[0x5000,0x8000]])
      for(let a=start;a<end;a++) hash=Math.imul(hash^mem[a],16777619)>>>0;
    this.enabled=hash===0x1056a217;
  }

  beforeStep(cpu) {
    if(!this.enabled) return;
    const pc=cpu.pc&0x7fff;
    // Both return PC and SP must match, including across NMI interruptions.
    while(this.scopes.length) {
      const top=this.scopes.at(-1);
      if(pc!==top.end || cpu.s!==top.sp) break;
      this.scopes.pop();
    }
    let asset, fields={}, end, sp;
    if(pc===0x6d3c) {
      // DrawScoreLives: isolate the extra-player tank icons before score drawing begins.
      asset="playerLives"; fields={record:0x00cc}; end=0x6d59; sp=cpu.s;
    } else if(pc===0x5c5c) {
      const slot=this.mem[0x10], type=cpu.a;
      asset=shapeAsset(type);
      fields={slot:slot>>>1,record:0x270+slot,type,
        shape:this.mem[0x7472+type*2]|(this.mem[0x7473+type*2]<<8)};
    } else if(pc===0x6ae9) {
      asset="hudRadar";
    } else if(pc===0x6d59 || pc===0x6d6c) {
      // One scope includes the label, fixed zeroes, and changing BCD digits.
      asset=pc===0x6d59?"score":"highScore";
      fields={record:pc===0x6d59?0xb8:0x300,textId:pc===0x6d59?0x18:0x0e};
      end=pc===0x6d59?0x6d6c:0x6d8e;sp=cpu.s;
    } else if(pc===0x6c98) {
      if(["score","highScore"].includes(this.scopes.at(-1)?.origin.asset)) return;
      // Direction strings comprise a shared prefix and a separate suffix.
      asset=cpu.x===0x10?"enemyInRange":(cpu.x===0x12?"motionBlocked":([0,2,4,6].includes(cpu.x)?"enemyDirection":"unclassified"));
      fields={textId:cpu.x};
    } else if(pc===0x58a7) {
      asset="mountains"; fields={segment:(cpu.a&14)>>>1};
    } else if(pc===0x5806) {
      asset="horizon"; end=0x5809; sp=cpu.s;
    } else if(pc===0x50ff) {
      asset="crosshair"; end=0x5102; sp=cpu.s;
    } else if(pc===0x589e) {
      asset="volcanoSpark"; fields={slot:this.mem[8],record:0x34d+this.mem[8]};
      end=0x58a1; sp=cpu.s;
    } else return;
    if(end===undefined) {
      const lo=this.mem[0x100|((cpu.s+1)&255)];
      const hi=this.mem[0x100|((cpu.s+2)&255)];
      end=((lo|(hi<<8))+1)&0x7fff; sp=(cpu.s+2)&255;
    }
    const origin=Object.freeze({id:++this.serial,asset,cpuPC:pc,...fields});
    this.scopes.push({end,sp,origin});
  }

  write(address) {
    // Overwrite even with null, so recycled display-list RAM cannot retain tags.
    this.bytes[address-0x2000]=this.scopes.at(-1)?.origin??null;
  }

  instruction(pc,inherited) {
    if(!this.enabled) return null;
    if(pc<0x1000) return this.bytes[pc];
    // MTN0 contains a complete embedded moon, not a separate AVG subroutine.
    // Atari BZMTNS.MAC explicitly marks MOON through END OF MOON here.
    if(inherited?.asset==="mountains" && pc>=0x1054 && pc<0x10c4)
      return {...inherited,asset:"moon",parentAsset:"mountains"};
    return inherited;
  }
}
