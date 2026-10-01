#!/usr/bin/env python3
"""Build a raw-output oracle from unmodified MAME 0.289 clock/polynomial methods.
Usage: python .../mame-pokey-reference.py /path/to/mame0289/src/devices/sound/pokey.cpp /tmp/pokey-reference
Requires g++. Serial/pot callbacks are disconnected, as on Battlezone.
"""
import re,sys,subprocess
from pathlib import Path
src=Path(sys.argv[1]).read_text()
def method(signature):
 start=src.index(signature);opening=src.index('{',start);depth=1;i=opening+1
 while depth:
  depth+=(src[i]=='{')-(src[i]=='}');i+=1
 return src[start:i]
defines=src[src.index('#define NOTPOLY5'):src.index('// device type definition')]
code=r'''
#include <cstdint>
#include <cstdio>
#include <cmath>
#define LOG_POLY(...)
#define LOG_RAND(...)
#define BIT(x,n) (((x)>>(n))&1)
namespace util { template<class T>T make_bitmask(int n){return (T(1)<<n)-1;} }
'''+defines+r'''
enum {CHAN1,CHAN2,CHAN3,CHAN4};
struct pokey_device {
 struct Channel {
  int m_AUDF=0,m_AUDC=0,m_counter=0,m_borrow_cnt=0,m_output=0,m_filter_sample=0;
  void reset_channel(){m_counter=m_AUDF^255;m_borrow_cnt=0;}
  void inc_chan(pokey_device&,int cycles){m_counter=(m_counter+1)&255;if(!m_counter&&!m_borrow_cnt)m_borrow_cnt=cycles;}
  bool check_borrow(){return m_borrow_cnt>0 && --m_borrow_cnt==0;}
  void sample(){m_filter_sample=m_output;}
 } m_channel[4];
 int m_SKCTL=3,m_AUDCTL=0,m_SKSTAT=0,m_IRQST=IRQ_SEROC;
 int m_p4=0,m_p5=0,m_p9=0,m_p17=0,m_clock_cnt[3]={},m_pot_counter=228;
 bool m_ser_iclk=false,m_ser_oclk=false,m_sod_twotone=false,m_serout_full=false,m_old_raw_inval=true;
 int m_serout_shift=1;uint32_t m_out_raw=0;
 uint32_t m_poly4[15],m_poly5[31],m_poly9[511],m_poly17[131071];
 struct Stream {void update(){}} stream,*m_stream=&stream;
 void m_sod_w_cb(bool){} void m_oclk_w_cb(bool){} void process_serin(){} void process_serout(){}
 void step_pot(){} void step_keyboard(){}
 void step_one_clock();void process_channel(int);
 void poly_init_4_5(uint32_t*,int);void poly_init_9_17(uint32_t*,int);
 pokey_device(){poly_init_4_5(m_poly4,4);poly_init_4_5(m_poly5,5);poly_init_9_17(m_poly9,9);poly_init_9_17(m_poly17,17);}
};
'''
for signature in ['void pokey_device::step_one_clock()', 'inline void pokey_device::process_channel(int ch)', 'void pokey_device::poly_init_4_5', 'void pokey_device::poly_init_9_17']:
 code+=method(signature)+'\n'
code+=r'''
int main(){
 // Sweep every AUDCTL routing, every AUDC distortion, joined timers and filters.
 for(int a=0;a<256;a++) {
  pokey_device p;p.m_AUDCTL=a;
  for(int c=0;c<4;c++) {
   auto &v=p.m_channel[c];v.m_AUDF=3+c*7;
   v.m_AUDC=(((a+c)%8)<<5)|((c+1)*3);
   v.reset_channel();v.m_filter_sample=c<2;
  }
  for(int n=0;n<8192;n++){p.step_one_clock();uint16_t out=p.m_out_raw;fwrite(&out,2,1,stdout);}
 }
}
'''
out=Path(sys.argv[2]);cpp=out.with_suffix('.cpp');cpp.write_text(code)
subprocess.run(['g++','-O2','-std=c++17',str(cpp),'-o',str(out)],check=True)
