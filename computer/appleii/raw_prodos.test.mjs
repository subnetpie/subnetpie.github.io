import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeMedia,readZipEntries} from './media.js';
test('raw ProDOS mislabeled .2mg requires a valid volume header',()=>{
 const data=new Uint8Array(2048),h=1024;
 data[h+4]=0xf4;data.set([84,69,83,84],h+5);
 data[h+35]=39;data[h+36]=13;data[h+39]=3;data[h+41]=4;
 assert.equal(decodeMedia('test.2mg',data).kind,'block');
 data[h+35]=0;assert.throws(()=>decodeMedia('bad.2mg',data),/signature/);
});
test('ActionGS raw volume excludes its extra padding block',{skip:!process.env.ACTION_GS_ZIP},()=>{
 const [entry]=readZipEntries(readFileSync(process.env.ACTION_GS_ZIP));
 const media=decodeMedia(entry.name,entry.data);
 assert.equal(media.kind,'block');assert.equal(media.data.length,65535*512);
 assert.deepEqual(media.data.subarray(0,512),entry.data.subarray(0,512));
});
