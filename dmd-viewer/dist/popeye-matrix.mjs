// Transcribed from the owner's Popeye Saves the Earth switch-matrix chart.
const columns=[
  ['Left lane','Buy-in','Start button','Plumb bob tilt','Right lane','Left jet bumper','Right jet bumper','Center jet bumper'],
  ['Slam tilt','Coin door closed','Ball launch','Always closed','Left loop','Popeye 1st “E”','Popeye “Y”','Popeye 2nd “E”'],
  ['Left popper','Right popper','Right loop opto','Ramp entrance','Ramp completion','Escalator popper','Wheel exit','“Hag” standup'],
  ['Two bank','Center lane','Lockup upper','Lockup center','Lockup lower','Wheel opto 1','Wheel opto 2','Wheel opto 3'],
  ['Trough 1 (right)','Trough 2','Trough 3','Trough 4','Trough 5','Trough 6 (left)','Trough jam','“Sea” standup'],
  ['Left cheek','Right cheek','Escalator exit','Animal dolphin','Animal eagle','Animal tiger','Animal panda','Animal rhino'],
  ['Popeye 1st “P”','Popeye “O”','Popeye 2nd “P”','Left outlane','Left flipper lane','Left slingshot','Right slingshot','Right flipper lane'],
  ['Upper exit to wheel','Upper ramp left','Upper ramp right','Animal jackpot','Right outlane','Shooter lane','Lock-up kicker','Upper shot exit'],
];
export const popeyeColumnColors=['Green–brown','Green–red','Green–orange','Green–yellow','Green–black','Green–blue','Green–violet','Green–grey'];
const optos=new Set([31,32,33,34,35,36,37,46,47,48,51,52,53,54,55,56,57,81,82,83,86,112,114,116,118]);
const managed=new Set([24,51,52,53,54,55,56,57,86,111,113,115,117]);
const dedicated=['Left coin chute','Center coin chute','Right coin chute','4th coin chute','Service credits / Escape','Volume down / Down','Volume up / Up','Begin test / Enter'];
const flippers=['Lower right flipper EOS','Lower right flipper opto','Lower left flipper EOS','Lower left flipper opto','Upper right flipper EOS','Upper right flipper opto','Upper left flipper EOS','Upper left flipper opto'];
export const popeyeSwitches=[
  ...columns.flatMap((labels,c)=>labels.map((label,r)=>({number:(c+1)*10+r+1,label,column:c+1,row:r+1}))),
  ...dedicated.map((label,r)=>({number:r+1,label,code:'D'+(r+1),row:r+1})),
  ...flippers.map((label,r)=>({number:111+r,label,code:'F'+(r+1),row:r+1})),
].map(s=>({...s,opto:optos.has(s.number),managed:managed.has(s.number)}));
export const popeyeSwitchByNumber=new Map(popeyeSwitches.map(s=>[s.number,s]));
