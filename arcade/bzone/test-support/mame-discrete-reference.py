#!/usr/bin/env python3
"""Compile MAME 0.289 RC/555/filter STEP bodies as a standalone numeric oracle.
Pass a directory containing bzone_a.cpp, disc_flt.hxx, disc_dev.hxx, then output path.
"""
import sys,subprocess,re
from pathlib import Path
root=Path(sys.argv[1]);out=Path(sys.argv[2])
def body(file,name):
 s=(root/file).read_text();start=s.index('DISCRETE_STEP('+name+')') if 'DISCRETE_STEP('+name+')' in s else s.index('DISCRETE_STEP( '+name+' )')
 begin=s.index('{',start);i=begin+1;depth=1
 while depth:depth+=(s[i]=='{')-(s[i]=='}');i+=1
 return s[begin:i]
code=r'''
#include <cmath>
#include <cstdint>
#include <cstdio>
#define RC_CHARGE_EXP_DT(rc,dt) (1-exp(-(dt)/(rc)))
#define DISCRETE_DECLARE_INFO(x) const auto *info=&desc;
#define DISC_555_ASTABLE_HAS_FAST_CHARGE_DIODE 128
#define DISC_555_OUT_SQW 0
#define DISC_555_OUT_CAP 1
#define DISC_555_OUT_ENERGY 2
#define DISC_555_OUT_LOGIC_X 3
#define DISC_555_OUT_COUNT_F_X 4
#define DISC_555_OUT_COUNT_R_X 5
#define DISC_555_OUT_COUNT_F 6
#define DISC_555_OUT_COUNT_R 7
struct Node {
 double in[9]={},out=0;
 double sample_time(){return 1.0/48000;}
 void set_output(int,double v){out=v;}
};
'''
# Replace the named input macros by their indexed expressions.
files=['disc_flt.hxx','disc_dev.hxx','bzone_a.cpp']
macros={}
for f in files:
 for name,index in re.findall(r'#define\s+(\w+)\s+DISCRETE_INPUT\((\d)\)',(root/f).read_text()):macros[name]=f'in[{index}]'
macros['DSD_555_ASTBL__RESET']='(!in[0])'
def step(f,n):
 b=body(f,n)
 for k,v in sorted(macros.items(),key=lambda x:-len(x[0])):b=b.replace(k,v)
 return 'void step()'+b+'\n'
code+=r'''
struct Envelope:Node {
 double m_v_cap=0,m_exp_1,m_exp_2,m_exp_1_2,m_v_drop=23270.0/23540,m_v_charge_1_2=5*m_v_drop;
 Envelope(double c){m_exp_1=-expm1(-sample_time()/(270*c));m_exp_2=-expm1(-sample_time()/(23270*c));m_exp_1_2=-expm1(-sample_time()/((270.0*23270/23540)*c));}
'''+step('disc_flt.hxx','dst_rc_circuit_1')+'};\n'
code+=r'''
struct Filter:Node {
 double m_v_in1_gain=1.0/23,m_v_p=20.5,m_exponent=-expm1(-sample_time()/(330000*4.7e-9));
 double m_gain[2]={1+330000.0/43000,1+330000.0/(270.0*33000/33270+10000)},m_out_v=0;
'''+step('bzone_a.cpp','bzone_custom_filter')+'};\n'
code+=r'''
struct CV:Node {
 double m_v_out=0,m_v_diode=-.5;
 double m_exponent0=-expm1(-sample_time()),m_exponent1=-expm1(-sample_time()/((100000.0*22000/122000)*10e-6));
'''+step('disc_flt.hxx','dst_rcdisc3')+'};\n'
code+=r'''
struct VCO:Node {
 struct {int options=0;}desc;
 double m_cap_voltage=0,m_threshold=10.0/3,m_trigger=5.0/3,m_v_charge=5;
 int m_flip_flop=1,m_use_ctrlv=1,m_has_rc_nodes=0,m_output_type=0,m_output_is_ac=0;
 double *m_v_charge_node=nullptr,m_v_out_high=1,m_ac_shift=0;
 double m_last_r1=0,m_last_r2=0,m_last_c=0,m_t_rc_bleed=0,m_t_rc_charge=149000*15e-9,m_t_rc_discharge=49000*15e-9;
 double m_exp_bleed=0,m_exp_charge=-expm1(-sample_time()/m_t_rc_charge),m_exp_discharge=-expm1(-sample_time()/m_t_rc_discharge);
 VCO(){in[0]=1;in[1]=100000;in[2]=49000;in[3]=15e-9;}
'''
code+='#define DSD_555_ASTBL_T_RC_BLEED (1e7*in[3])\n#define DSD_555_ASTBL_T_RC_CHARGE ((in[1]+in[2])*in[3])\n#define DSD_555_ASTBL_T_RC_DISCHARGE (in[2]*in[3])\n#define RC_CHARGE_EXP(rc) (-expm1(-sample_time()/(rc)))\n'
code+=step('disc_dev.hxx','dsd_555_astbl')+'};\n'
code+=r'''
int main(){
 Envelope shell(4.7e-6),explosion(10e-6);Filter sf,ef;CV cv;VCO osc;
 for(int n=0;n<192000;n++) {
  int d=(n/12000)*17;
  shell.in[0]=d&4;shell.in[1]=(n/31)&1;shell.step();
  explosion.in[0]=d&1;explosion.in[1]=(n/79)&1;explosion.step();
  sf.in[0]=ef.in[0]=(d>>1)&1;sf.in[1]=shell.out;ef.in[1]=explosion.out;sf.step();ef.step();
  double r=(d&16)?1270.0*4700/5970:4700;
  cv.in[0]=1;cv.in[1]=5*r/(1000+r);cv.step();
  osc.in[4]=cv.out;osc.step();
  double v[]={sf.out,ef.out,cv.out,osc.out,osc.m_cap_voltage};fwrite(v,sizeof(double),5,stdout);
 }
}
'''
cpp=out.with_suffix('.cpp');cpp.write_text(code)
subprocess.run(['g++','-O2','-std=c++17',str(cpp),'-o',str(out)],check=True)
