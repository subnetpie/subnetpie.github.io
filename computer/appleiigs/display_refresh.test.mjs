import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DoubleHiresDisplay} from './display_double_hires.js';

class ImageData {
  constructor(width,height){this.width=width;this.height=height;this.data=new Uint8ClampedArray(width*height*4);}
}

test('DHGR refresh never submits an inactive buffer to Canvas', () => {
  const frames=[];
  const context={createImageData:(w,h)=>new ImageData(w,h),putImageData(image){
    assert.ok(image instanceof ImageData,'Canvas requires an ImageData instance');frames.push(image);
  }};
  const display=new DoubleHiresDisplay({_main:new Uint8Array(65536),_aux:new Uint8Array(65536)},
    {getContext:()=>context});
  const initialFrames=frames.length;
  display.refresh();assert.equal(frames.length,initialFrames);
  display.reset();const resetFrames=frames.length;
  display.refresh();assert.equal(frames.length,resetFrames);
  for(const page of [1,2]) {
    display.set_active_page(page);display.refresh();
    assert.equal(frames.at(-1),page===1?display._id1:display._id2);
  }
  display.reset();display.refresh();
});

const source=readFileSync(new URL('./script.js',import.meta.url),'utf8');
const frameLoop=source.slice(source.indexOf('function on_interval('),source.indexOf('\nfunction init()'));
function runFrame({text=true,hires=false,double=true,shr=false,mixed=false,fail=false}={}) {
  const calls=[];
  const context={cycle_fraction:0,last_ms:0,khz:2800,interval:123,buttonRunStop:{innerText:'stop'},
    console:{error(){}},showBootStatus:s=>calls.push(s),
    window:{requestAnimationFrame(){calls.push('scheduled');return 1;}},
    motherboard:{iigsEnabled:true,clock(){},legacyMemory:{dms_hires:hires},
      video_iigs:{isSuperHires:()=>shr,refresh(){calls.push('shr');}},
      io_manager:{_text_mode:text,_double_hires:double,_mixed_mode:mixed,draw_mixed_text(){calls.push('mixed');}},
      display_double_hires:{refresh(){if(fail)throw new TypeError('bad frame');calls.push('dhgr');}},
      message(){}}};
  vm.runInNewContext(frameLoop+'\non_interval(16);',context);return {calls,context};
}

test('frame loop does not render DHGR over text or low-res', () => {
  assert.deepEqual(runFrame({text:true,hires:true}).calls,['scheduled']);
  assert.deepEqual(runFrame({text:false,hires:false}).calls,['scheduled']);
  assert.deepEqual(runFrame({text:false,hires:true,double:false}).calls,['scheduled']);
  assert.deepEqual(runFrame({text:false,hires:true}).calls,['dhgr','scheduled']);
  assert.deepEqual(runFrame({text:false,hires:true,mixed:true}).calls,['dhgr','mixed','scheduled']);
  assert.deepEqual(runFrame({text:false,hires:true,shr:true}).calls,['shr','scheduled']);
});

test('render failure stops animation instead of repeatedly throwing startup errors', () => {
  const {calls,context}=runFrame({text:false,hires:true,fail:true});
  assert.equal(context.interval,undefined);assert.equal(context.buttonRunStop.innerText,'run');
  assert.deepEqual(calls,['EMULATION ERROR\nbad frame']);
});
