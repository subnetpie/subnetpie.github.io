// Atari Battlezone mathbox. Extracted without arithmetic changes.
const s16=v=>((v&65535)^32768)-32768;
export class Mathbox{
 constructor(){this.r=new Int16Array(16);this.result=0}
 set(i,v){this.r[i]=s16(v);return this.r[i]}
 go(o,d){let r=this.r;o&=31;d&=255;const lo=i=>this.set(i,(r[i]&0xff00)|d),hi=i=>this.set(i,(r[i]&255)|(d<<8));
  switch(o){case 0:case 2:case 4:case 6:case 8:this.result=lo(o>>1);return;case 1:case 3:case 5:case 7:case 9:this.result=hi(o>>1);return;
  case 10:this.result=lo(5);return;case 12:this.result=this.set(6,d);return;case 21:this.result=lo(7);return;case 22:this.result=hi(7);return;
  case 26:this.result=lo(8);return;case 27:this.result=hi(8);return;case 13:this.result=lo(10);return;case 14:this.result=hi(10);return;
  case 15:this.result=lo(11);return;case 16:this.result=hi(11);return;case 23:this.result=r[7];return;case 25:this.result=r[8];return;case 24:this.result=r[9];return;
  case 11:hi(5);this.set(15,-1);this.set(4,r[4]-r[2]);this.set(5,r[5]-r[3]);this.mulA();return;
  case 17:hi(5);this.set(15,0);this.mulA();return;case 18:this.mulB();return;case 19:this.divide(r[9],r[8]);return;case 20:this.divide(r[10],r[11]);return;
  case 28:hi(5);do{this.set(14,(r[4]+r[7])>>1);this.set(15,(r[5]+r[8])>>1);if(r[11]<r[14]&&r[15]<r[14]&&s16(r[14]+r[15])>=0){this.set(7,r[14]);this.set(8,r[15])}else{this.set(4,r[14]);this.set(5,r[15])}}while(this.set(6,r[6]-1)>=0);this.result=r[8];return;
  case 29:hi(3);this.set(2,r[2]-r[0]);if(r[2]<0)this.set(2,-r[2]);this.set(3,r[3]-r[1]);if(r[3]<0)this.set(3,-r[3]);
  case 30:if(r[3]>=r[2]){this.set(12,r[2]);this.set(13,r[3])}else{this.set(13,r[2]);this.set(12,r[3])}this.set(12,r[12]>>2);this.set(13,r[13]+r[12]);this.set(12,r[12]>>1);this.result=this.set(13,r[12]+r[13]);return}}
 mulA(){let r=this.r,t,q;t=(r[0]*r[4])|0;this.set(12,t>>16);this.set(14,t);t=(-r[1]*r[5])|0;this.set(7,t>>16);q=s16(t);this.set(7,r[7]+r[12]);this.set(14,(r[14]>>1)&32767);this.set(12,(q>>1)&32767);q=s16(r[12]+r[14]);if(q<0)this.set(7,r[7]+1);this.result=r[7];if(r[15]<0)return;this.set(7,r[7]+r[2]);this.mulB()}
 mulB(){let r=this.r,t,q;t=(r[1]*r[4])|0;this.set(12,t>>16);this.set(9,t);t=(r[0]*r[5])|0;this.set(8,t>>16);q=s16(t);this.set(8,r[8]+r[12]);this.set(9,(r[9]>>1)&32767);this.set(12,(q>>1)&32767);this.set(9,r[9]+r[12]);if(r[9]<0)this.set(8,r[8]+1);this.set(9,r[9]<<1);this.result=r[8];if(r[15]<0)return;this.set(8,r[8]+r[3]);this.set(9,r[9]&0xff00);this.divide(r[9],r[8])}
 divide(c,q){let r=this.r,qq=s16(q);this.set(14,r[7]^qq);this.set(13,qq);if(qq>=0)qq=s16(c);else{this.set(13,-qq-1);qq=s16(-c-1);if(qq<0&&s16(qq+1)<0)this.set(13,r[13]+1);qq=s16(qq+1)}this.set(12,r[7]>=0?r[7]:-r[7]);this.set(15,r[6]);do{this.set(13,r[13]-r[12]);let msb=qq&32768;qq=s16(qq<<1);if(r[13]>=0)qq=s16(qq+1);else this.set(13,r[13]+r[12]);this.set(13,r[13]<<1);this.set(13,r[13]+(msb?1:0))}while(this.set(15,r[15]-1)>=0);this.result=s16(r[14]>=0?qq:-qq)}
 lo(){return this.result&255}hi(){return(this.result>>8)&255}}
