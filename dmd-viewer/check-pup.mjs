import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {csvRows,configKind,decodePupText,mediaCandidates,screenPosition,rootScreen,enabled,triggerCodes} from './dist/pup-format.mjs';
import {openPupZip} from './dist/pup-zip.mjs';
const text='ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos\r\n2,"Main, screen",BG,"say ""hello"".mp4",0,show,,\r\n6,Inset,,,0,ForceBack,,"2,20.1,77.5,59.9,21.5"\r\n';
const screens=csvRows(text);assert.equal(screens[0].ScreenDes,'Main, screen');assert.equal(screens[0].PlayFile,'say "hello".mp4');assert.equal(configKind(screens),'screens');assert.equal(enabled(screens[1]),true);assert.equal(screenPosition(screens[1]).width,59.9);assert.equal(rootScreen('6',screens),2);
assert.throws(()=>csvRows('A\n"bad'),/Unclosed quote/);assert.throws(()=>rootScreen('1',[{ScreenNum:'1',CustomPos:'2,0,0,100,100'},{ScreenNum:'2',CustomPos:'1,0,0,100,100'}]),/Circular/);
assert.equal(decodePupText(Uint8Array.from([255,254,65,0,66,0])),'AB');
const files=[{path:'Pack/BG/Intro.MP4',name:'Intro.MP4'},{path:'Pack/BG/002.mp4',name:'002.mp4'},{path:'Pack/Call/Intro.MP4',name:'Intro.MP4'}];
assert.equal(mediaCandidates(files,'bg','intro.mp4')[0].path,'Pack/BG/Intro.MP4');assert.equal(mediaCandidates(files,'BG').length,2);assert.equal(mediaCandidates(files,'missing','intro.mp4').length,0);assert.deepEqual(triggerCodes({Trigger:'D1, E2=1'}),['D1','E2=1']);
const u16=n=>[n&255,n>>8&255],u32=n=>[n&255,n>>>8&255,n>>>16&255,n>>>24];
function crc(data){let n=0xffffffff;for(const b of data){n^=b;for(let i=0;i<8;i++)n=n>>>1^((n&1)?0xedb88320:0)}return (n^0xffffffff)>>>0}
function zip(entries){const local=[],directory=[];for(const [path,text] of entries){const name=Buffer.from(path),data=Buffer.from(text),body=deflateRawSync(data),sum=crc(data),offset=local.length;local.push(...u32(0x04034b50),...u16(20),0,0,...u16(8),0,0,0,0,...u32(sum),...u32(body.length),...u32(data.length),...u16(name.length),0,0,...name,...body);directory.push(...u32(0x02014b50),...u16(20),...u16(20),0,0,...u16(8),0,0,0,0,...u32(sum),...u32(body.length),...u32(data.length),...u16(name.length),0,0,0,0,0,0,0,0,...u32(0),...u32(offset),...name)}return new File([Uint8Array.from([...local,...directory,...u32(0x06054b50),0,0,0,0,...u16(entries.length),...u16(entries.length),...u32(directory.length),...u32(local.length),0,0])],'pack.zip')}
const archive=await openPupZip(zip([['Demo/screens.pup',text],['Demo/BG/intro.png','synthetic image bytes']]));assert.equal(archive.length,2);assert.equal(archive[1].path,'Demo/BG/intro.png');assert.equal(await (await archive[0].getBlob()).text(),text);assert.equal(await (await archive[1].getBlob()).text(),'synthetic image bytes');
assert.equal(await openPupZip(zip([['readme.txt','not a pack']])),null);
console.log('Passed PuP: quoted CSV, encodings, screen layout, cycle detection, case-insensitive media resolution, trigger codes, and lazy ZIP extraction.');
