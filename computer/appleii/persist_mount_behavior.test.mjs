import assert from 'node:assert/strict';
import {test} from 'node:test';

test('mounting a drive enables persistence before the mount is committed', async () => {
  const calls=[];
  const persistence={settings:()=>({boot:'auto',keep:{}})};
  const svc={
    endpoint:id=>({id,persistenceId:'s7d1'}),
    setKeep:async(id,value)=>calls.push(['keep',id,value]),
    mountFile:async(id,file)=>calls.push(['mount',id,file.name])
  };

  const id='smartport:d1';
  const file={name:'GSOS-6.0.4.hdv'};
  const ep=svc.endpoint(id);
  const wasKeep=!!persistence.settings().keep?.[ep.persistenceId];
  try {
    if(ep?.persistenceId&&!wasKeep)await svc.setKeep(id,true);
    await svc.mountFile(id,file);
  } catch(err) {
    if(ep?.persistenceId&&!wasKeep)await svc.setKeep(id,false);
    throw err;
  }

  assert.deepEqual(calls,[
    ['keep','smartport:d1',true],
    ['mount','smartport:d1','GSOS-6.0.4.hdv']
  ]);
});
