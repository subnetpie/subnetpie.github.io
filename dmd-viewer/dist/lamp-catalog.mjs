import {popeyeLamps} from './popeye-playfield.mjs';
import {t2Lamps} from './t2-playfield.mjs';
import {artworkPosition} from './color-playfield.mjs';
import {insertColor,t2Flashers} from './playfield-lighting.mjs';

export const lampSources={
 t2:'https://www.pinballrebel.com/pinball/cards/Tech_Charts/Williams_Terminator_2_Tech_Chart.pdf',
 popeye:'https://www.pinballrebel.com/pinball/cards/Tech_Charts/Bally_Popeye_Tech_Chart.pdf',
 guide:'https://www.cometpinball.com/pages/the-art-of-pinball-leds',
 brightness:'https://www.cometpinball.com/pages/pinball-led-brightness-chart',
};
export const ledColors=[
 {id:'unverified',label:'Choose / verify color',hex:'#ffd86b'},
 {id:'warm-white',label:'Warm white',hex:'#ffe1a3'},{id:'sunlight',label:'Sunlight white',hex:'#fff3d2'},
 {id:'cool-white',label:'Cool white',hex:'#e6f3ff'},{id:'red',label:'Red',hex:'#ff3c49'},
 {id:'orange',label:'Orange',hex:'#ff983b'},{id:'yellow',label:'Yellow',hex:'#fff16b'},
 {id:'green',label:'Green',hex:'#63ff76'},{id:'blue',label:'Blue',hex:'#579cff'},
 {id:'purple',label:'Purple',hex:'#cc85ff'},
];
export const ledProfiles=[
 {id:'1smd-ng',label:'1SMD · non-ghosting insert',voltage:6.3,kinds:['insert'],strength:1,url:lampSources.guide},
 {id:'1smd',label:'1SMD · moderate / diffused',voltage:6.3,kinds:['insert','gi'],strength:1,url:'https://www.cometpinball.com/products/1smd-bulbs'},
 {id:'2smd',label:'2SMD · brighter / frosted',voltage:6.3,kinds:['insert','gi'],strength:1.4,url:'https://www.cometpinball.com/products/2smd-bulbs'},
 {id:'5smd',label:'5SMD · 12 V flasher',voltage:12,kinds:['flasher'],strength:1.2,url:'https://www.cometpinball.com/products/5smd-flashers'},
 {id:'8smd',label:'8SMD · bright 12 V flasher',voltage:12,kinds:['flasher'],strength:1.6,url:'https://www.cometpinball.com/products/8smd-flashers'},
 {id:'8smd-tower',label:'Super bright · 8SMD tower (#89)',voltage:12,kinds:['flasher'],bases:['89'],strength:2,url:'https://www.cometpinball.com/products/8smd-tower-flashers'},
];
export const bulbBases={unknown:'Socket not verified',bayonet:'#44 / #47 bayonet · 6.3 V',wedge:'#555 wedge · 6.3 V','89':'#89 bayonet · 12 V LED flasher','906':'#906 wedge · 12 V LED flasher'};
const colorFromHex={'#63ff68':'green','#ff9c36':'orange','#fff06a':'yellow','#fff6df':'warm-white','#ff5151':'red','#df8cff':'purple'};
// Circuit labels, bulb bases and quantities are transcribed from the factory
// tech charts above. GI quantities and exact GI bulb positions are not supplied.
const gi={
 t2:[['Top insert string','wedge','backbox'],['Bottom insert string','wedge','backbox'],['Right playfield string','wedge','main',{x:51,y:2,w:47,h:87}],['CPU insert string','wedge','main',{x:42,y:36,w:14,h:12}],['Left playfield string','wedge','main',{x:2,y:2,w:47,h:87}]],
 popeye:[['Left playfield','bayonet','main',{x:2,y:2,w:47,h:87}],['Right playfield','bayonet','main',{x:51,y:2,w:47,h:87}],['Backbox general','wedge','backbox'],['Backbox title','wedge','backbox'],['Upper playfield','bayonet','upper',{x:5,y:2,w:90,h:60}]],
};
const flashers={
 t2:[
 [17,'Autofire / hot dog',[['906','main',4]]],[18,'Right slingshot',[['89','main',1],['906','backbox',1]]],
 [19,'Left slingshot',[['89','main',1],['906','backbox',1]]],[20,'Left lock',[['89','main',1],['906','backbox',1]]],
 [21,'Gun',[['89','main',2]]],[22,'Right ramp',[['89','main',1],['906','backbox',1]]],
 [23,'Left ramp',[['89','main',1],['906','backbox',1]]],[24,'Backglass',[['906','backbox',1]]],
 [25,'Targets',[['89','main',2]]],[26,'Left popper',[['89','main',2]]],[27,'Right popper',[['89','main',2]]],
 ],
 popeye:[
 [18,'Upper playfield left',[['906','upper',1],['89','upper',2]]],[19,'Right loop',[['89','main',1],['906','backbox',1]]],
 [20,'Fight Bluto',[['906','main',1],['89','main',2]]],[21,'Left loop',[['89','main',1],['906','backbox',1]]],
 [22,'Animal ramp',[['906','main',2],['906','backbox',1]]],[23,'Skill wheel',[['906','main',1],['906','backbox',1]]],
 [24,'Right popper / extra ball',[['906','main',1],['906','backbox',1]]],[26,'Ramp jackpot',[['89','main',1],['906','backbox',1]]],
 [27,'Lockjaw arrow',[['89','main',2],['906','backbox',1]]],[28,'Escalator / turtle',[['906','main',1],['906','backbox',1]]],
 ],
};
export function lampCatalog(game){
 const t2=game==='t2_l8',key=t2?'t2':'popeye',lamps=t2?t2Lamps:popeyeLamps,records=[];
 for(const lamp of lamps.filter(l=>!l.unused)){
  for(const [i,point] of [lamp,...lamp.extra||[]].entries())records.push({id:'insert:'+lamp.number+':'+i,kind:'insert',number:lamp.number,name:lamp.name,bulb:i+1,area:lamp.area,point:Number.isFinite(point.x)?artworkPosition({...point,number:lamp.number,area:lamp.area},game,'lamp'):null,base:'unknown',voltage:6.3,color:t2?colorFromHex[insertColor(game,lamp.number)]||'unverified':'unverified',colorEvidence:t2?'Insert color from Playfield T2 metadata; factory bulb is clear incandescent.':'Insert / cap color has not been verified; choose it below.',quantity:1,source:lampSources[key]});
 }
 gi[key].forEach(([name,base,area,zone],i)=>records.push({id:'gi:'+(i+1),kind:'gi',number:i+1,name,area,base,voltage:6.3,color:'warm-white',zone,quantity:null,colorEvidence:'Clear incandescent GI. Warm white is the suggested LED baseline; other colors are custom.',source:lampSources[key]}));
 for(const [number,name,groups] of flashers[key]){
  let bulb=0,located=0;const points=t2?t2Flashers.filter(f=>f.number===number):[];
  for(const [base,area,count] of groups)for(let i=0;i<count;i++)records.push({id:'flasher:'+number+':'+bulb++,kind:'flasher',number,name,bulb:i+1,area,base,voltage:12,color:'warm-white',point:area==='main'&&points[located]?points[located++]:null,quantity:1,colorEvidence:'Factory incandescent is clear; dome / cover color is not verified. Match its color when known.',source:lampSources[key]});
 }
 return records;
}
export function defaultLampChoice(lamp){return {base:lamp.base,color:lamp.color,profile:lamp.kind==='insert'?'1smd-ng':lamp.kind==='gi'?'2smd':'5smd',quantity:lamp.quantity};}
export function compatibleProfiles(lamp,base=lamp.base){return ledProfiles.filter(p=>p.voltage===lamp.voltage&&p.kinds.includes(lamp.kind)&&(!p.bases||p.bases.includes(base)));}
export function normalizeLampChoice(lamp,input={}){
 const value={...defaultLampChoice(lamp),...input},bases=lamp.kind==='flasher'?['89','906']:['unknown','bayonet','wedge'];
 if(!bases.includes(value.base))value.base=lamp.base;
 if(!ledColors.some(c=>c.id===value.color))value.color=lamp.color;
 if(!compatibleProfiles(lamp,value.base).some(p=>p.id===value.profile))value.profile=defaultLampChoice(lamp).profile;
 value.quantity=Number.isInteger(value.quantity)&&value.quantity>0&&value.quantity<=100?value.quantity:lamp.quantity;
 return value;
}
export function lampLabel(lamp){return (lamp.kind==='gi'?'GI ':lamp.kind==='flasher'?'F ':'L ')+lamp.number+' · '+lamp.name+(lamp.kind==='flasher'?' · '+(lamp.area==='backbox'?'backbox':'playfield')+' bulb '+(Number(lamp.id.split(':').at(-1))+1):lamp.kind==='gi'?' · string':'');}
export function lampRecommendation(lamp,choice){
 const value=normalizeLampChoice(lamp,choice),profile=ledProfiles.find(p=>p.id===value.profile),color=ledColors.find(c=>c.id===value.color);
 return {ready:value.base!=='unknown'&&value.color!=='unverified',profile,color,choice:value,text:profile.label+' · '+(color.id==='unverified'?'match insert color':color.label)+' · '+bulbBases[value.base],note:lamp.kind==='insert'?'Use a non-ghosting LED for controlled inserts. Confirm the socket and match the plastic insert / cap color.':lamp.kind==='gi'?'Frosted 2SMD warm white is a suggested starting point. Confirm dimming compatibility and count every bulb in this string.':'Use a 12 V LED flasher in the matching #89 or #906 base. A 6.3 V insert / GI LED is not a flasher replacement.'};
}
