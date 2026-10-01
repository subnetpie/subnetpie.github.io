// Battlezone rev 2 semantic provenance. See ASSETS.md for ROM/source evidence.
export const ASSETS = Object.freeze({
  unclassified: {color:"green", brightness:1.00, glow:0.35},
  mountains: {color:"purple", brightness:0.80, glow:0.25},
  horizon: {color:"darkPurple", brightness:0.80, glow:0.30, displayIntensity:15},
  moon: {color:"blue", brightness:0.90, glow:0.40},
  obstacle: {color:"orange", brightness:0.90, glow:0.30, fillOpacity:0.32},
  crosshair: {color:"red", brightness:1.15, glow:0.55},
  volcanoSpark: {color:"red", brightness:1.25, glow:0.70, displayIntensity:15},

  tank: {color:"green", brightness:1.00, glow:0.35, coordinateSpace:"world"},
  playerLives: {originalColor:"red", color:"green", brightness:1.00, glow:0.35, coordinateSpace:"hud"},
  projectile: {color:"green", brightness:1.00, glow:0.35, coordinateSpace:"world"},
  debris: {color:"green", brightness:0.95, glow:0.30, coordinateSpace:"world"},
  missile: {color:"green", brightness:1.15, glow:0.55, coordinateSpace:"world"},
  logo: {color:"blue", brightness:1.00, glow:0.40, coordinateSpace:"hud"},
  saucer: {color:"green", brightness:1.05, glow:0.50, coordinateSpace:"world"},

  hudRadar: {originalColor:"red", color:"green", brightness:0.90, glow:0.30, displayIntensity:15, coordinateSpace:"hud", sourcePC:0x6ae9},
  radarSweep: {originalColor:"red", color:"green", brightness:1.00, glow:0.65, displayIntensity:15, coordinateSpace:"hud", sourcePC:0x6b34},
  radarTicks: {originalColor:"red", color:"green", brightness:0.90, glow:0.30, displayIntensity:15, coordinateSpace:"hud", sourcePC:0x6ae9},
  enemyBlip: {originalColor:"red", color:"red", brightness:1.20, glow:1.00, displayIntensity:15, coordinateSpace:"hud", primitive:"point", sourcePC:0x6c33},

  score: {originalColor:"red", color:"red", brightness:0.80, glow:0.25, coordinateSpace:"hud"},
  highScore: {originalColor:"red", color:"orange", brightness:1.05, glow:0.40, coordinateSpace:"hud"},
  enemyInRange: {originalColor:"red", color:"lightOrange", brightness:1.05, glow:0.45, coordinateSpace:"hud"},
  enemyDirection: {originalColor:"red", color:"lightOrange", brightness:1.05, glow:0.45, coordinateSpace:"hud"},
  motionBlocked: {originalColor:"red", color:"lightOrange", brightness:1.05, glow:0.45, coordinateSpace:"hud"}
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

export const PALETTE = Object.freeze({
  green:"rgb(80,255,80)", purple:"rgb(190,70,255)", darkPurple:"rgb(95,30,140)",
  orange:"rgb(255,145,35)", lightOrange:"rgb(255,190,105)", red:"rgb(255,45,45)", blue:"rgb(70,135,255)"
});
const bounded=(value,fallback,max)=>Number.isFinite(value)?Math.max(0,Math.min(max,value)):fallback;
export function assetStyle(asset, sourceIntensity, overrides={}, colorized=true) {
  const name=Object.hasOwn(ASSETS,asset)?asset:"unclassified";
  const defaults=ASSETS[name];
  const style={...defaults,...overrides[name]};
  const source=bounded(sourceIntensity,0,15);
  return {
    asset:name,
    color:colorized?(style.color??defaults.color):(defaults.originalColor??"green"),
    brightness:colorized?bounded(style.brightness,defaults.brightness,4):1,
    glow:colorized?bounded(style.glow,defaults.glow,4):0.35,
    coordinateSpace:defaults.coordinateSpace??"world",
    displayIntensity:colorized?bounded(style.displayIntensity,source,15):source,
    fillOpacity:colorized?bounded(style.fillOpacity,0,1):0,
    primitive:defaults.primitive??null
  };
}

// Supported live presentation edits; provenance and original-mode behavior stay
// separate from appearance. Null displayIntensity restores the ROM intensity.
export function updateAssetSettings(settings,asset,patch) {
  if(!Object.hasOwn(ASSETS,asset))throw new Error("Unknown asset: "+asset);
  const allowed=["color","brightness","glow","displayIntensity","fillOpacity"];
  for(const [key,value] of Object.entries(patch)) {
    if(!allowed.includes(key))throw new Error("Unknown asset setting: "+key);
    if(key==="color") {
      if(typeof value!=="string"||!value.trim())throw new Error("Color must be a nonempty string");
    } else if(!(key==="displayIntensity"&&value===null)&&!Number.isFinite(value))
      throw new Error(key+" must be a finite number");
  }
  settings[asset]={...settings[asset],...patch};
  return settings[asset];
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
    } else if(pc===0x6b34 && this.scopes.at(-1)?.origin.asset==="hudRadar") {
      asset="radarSweep";end=0x6b37;sp=cpu.s;
    } else if(pc===0x6c33 && this.scopes.at(-1)?.origin.asset==="hudRadar") {
      // Two VgDrawPoint calls emit the contact, then return to radar/text drawing.
      asset="enemyBlip";end=0x6c3b;sp=cpu.s;
      fields={radarStrength:Math.min(1,this.mem[0x02e9]/0xf0)};
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
    // AVG fetch tags the high byte; normalize to the instruction's word address.
    // The four short compass strokes are static ROM vectors, not enemy contacts.
    const tick={0x1542:"3",0x1548:"6",0x154e:"9",0x155c:"12"}[pc&~1];
    if(inherited?.asset==="hudRadar" && tick)
      return {...inherited,asset:"radarTicks",parentAsset:"hudRadar",clockPosition:tick};
    return inherited;
  }
  styleInstruction(origin,primitive) {
    if(!this.enabled) return primitive;
    const dx=(primitive?.x2??0)-(primitive?.x1??0);
    const dy=(primitive?.y2??0)-(primitive?.y1??0);
    const length=Number.isFinite(dx)&&Number.isFinite(dy)?Math.hypot(dx,dy):Infinity;
    const asset=origin?.asset??"unclassified";
    const style=assetStyle(asset,primitive?.intensity);
    return {...primitive,asset:style.asset,color:style.color,brightness:style.brightness,glow:style.glow,
      coordinateSpace:style.coordinateSpace,primitiveStyle:style.primitive,displayIntensity:style.displayIntensity,length};
  }

}
