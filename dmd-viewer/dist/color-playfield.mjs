// Artwork registration is separate from the manual's original coordinates.
// Hidden mechanisms retain touch targets; the switch matrix lists every input.
const interpolate=(value,anchors)=>{
  for(let i=1;i<anchors.length;i++){
    const [a,b]=anchors[i-1],[c,d]=anchors[i];
    if(value<=c)return b+(value-a)/(c-a)*(d-b);
  }
  return anchors.at(-1)[1];
};
export const playfieldArtwork={
  popeye:{main:'popeye-main-color.webp',upper:'popeye-upper-color.webp'},
  t2:{main:'t2-main-color.webp'},
};
const upperLamps={76:[45,5],77:[51,5],78:[57,5],81:[92,15],82:[92,23],83:[35,14],84:[35,19],85:[30,8]};
const upperSwitches={82:[44,3],83:[54,3],81:[93,15],63:[91,34],84:[17,43],88:[30,8],118:[37,47],116:[67,47],117:[40,52],115:[64,52]};
const popeyeLamps={11:[40,14],12:[46,14],13:[53,14],14:[60,38],15:[63,42],16:[74,41],17:[75,45],18:[69,39],47:[46,89],86:[88,97],87:[88,93],88:[10,93]};
const popeyeSwitches={11:[39,14],15:[54,14],42:[47,14],114:[35,86],112:[60,86],113:[39,89],111:[57,89],13:[10,94],23:[90,94],12:[90,98],86:[92,90]};
export function artworkPosition(point,game,kind='switch'){
  const t2=game==='t2_l8';
  let x,y;
  if(!t2&&point.area==='upper'){
    const explicit=(kind==='lamp'?upperLamps:upperSwitches)[point.number];
    [x,y]=explicit||(point.number===41?[35,point.y<45?14:20]:[point.x,point.y*.65]);
  }else if(!t2){
    const explicit=(kind==='lamp'?popeyeLamps:popeyeSwitches)[point.number];
    [x,y]=explicit||[point.x*.94+3,interpolate(point.y,[[0,2],[20,34],[40,51],[60,67],[80,87],[100,99]])];
  }else{
    x=point.x*.96+2;
    y=interpolate(point.y,[[0,0],[35,35],[65,68],[84,87],[100,99]]);
    if(kind==='switch'&&point.number===77){x=34;y=23;}
    if(kind==='switch'&&point.number===76){x=32;y=18;}
    if(kind==='switch'&&point.flipper){x=point.number===11?91:9;y=84;}
    if(kind==='lamp'&&point.number===84){x=12;y=95;}
  }
  return {x:Math.max(2,Math.min(98,x)),y:Math.max(2,Math.min(98,y))};
}
