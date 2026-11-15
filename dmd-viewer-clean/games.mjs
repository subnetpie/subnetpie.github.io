import {popeyeSwitchByNumber} from '../dmd-viewer/dist/popeye-matrix.mjs';
import {t2SwitchByNumber} from '../dmd-viewer/dist/t2-matrix.mjs?v=t2-table-1';
import {popeyeLamps,popeyeHotspots} from '../dmd-viewer/dist/popeye-playfield.mjs';
import {t2Lamps,t2Hotspots} from '../dmd-viewer/dist/t2-playfield.mjs';
export const shared=new URL('../dmd-viewer/dist/',import.meta.url);
export const games=[
 {id:'popeye',title:'Popeye',set:'pop_lx5',rom:'pop_lx5.zip',pac:'popeye.pac',map:popeyeSwitchByNumber,lamps:popeyeLamps,hotspots:popeyeHotspots,areas:['main','upper']},
 {id:'terminator-2',title:'Terminator 2',set:'t2_l8',rom:'t2_l8-complete.zip',pac:'terminator-2.pac',map:t2SwitchByNumber,lamps:t2Lamps,hotspots:t2Hotspots,areas:['main']}
];
export const gameById=id=>games.find(g=>g.id===id);
