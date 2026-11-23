// T2 insert colors: neophob/wpc-emu lib/db/t2.js; addresses are column × 10 + row.
const rows=[
 ['green','green','orange','green','green','yellow','white','black'],
 ['orange','red','white','orange','yellow','green','orange','purple'],
 ['yellow','yellow','yellow','yellow','yellow','red','red','red'],
 ['green','orange','red','red','red','red','red','red'],
 ['red','red','red','red','red','red','red','red'],
 ['orange','orange','orange','orange','orange','green','orange','red'],
 ['orange','orange','orange','orange','orange','yellow','yellow','yellow'],
 ['red','red','white','yellow','white','green','green','green'],
];
const colors={green:'#63ff68',orange:'#ff9c36',yellow:'#fff06a',red:'#ff5151',white:'#fff6df',purple:'#df8cff',black:'#000000'};
export function insertColor(game,number){return game==='t2_l8'?colors[rows[Math.floor(number/10)-1]?.[number%10-1]]||colors.yellow:'#ffd86b';}
// Verified flasher outputs from the g5k T2 table script. Coil 28 is a target
// reset, not a flasher; it is intentionally excluded from this layer.
export const t2Flashers=[
 {number:17,name:'Hot dog',x:45,y:79},{number:18,name:'Right slingshot',x:77,y:77},
 {number:19,name:'Left slingshot',x:18,y:77},{number:20,name:'Left lock',x:14,y:40},
 {number:21,name:'Gun',x:85,y:48},{number:21,name:'Gun',x:87,y:52},
 {number:22,name:'Right ramp',x:76,y:31},{number:23,name:'Left ramp',x:14,y:14},
 {number:25,name:'Targets',x:7,y:36},{number:25,name:'Targets',x:8,y:40},
 {number:26,name:'Left popper',x:20,y:11},{number:26,name:'Left popper',x:24,y:17},
 {number:27,name:'Right popper',x:39,y:16},{number:27,name:'Right popper',x:39,y:13},
];
