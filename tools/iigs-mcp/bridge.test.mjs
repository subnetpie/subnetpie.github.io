import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBridge} from './bridge.mjs';
test('pairing, origin/auth rejection, session isolation, result delivery and timeout',async t=>{
 const bridge=createBridge({token:'test-token',timeout:60});await new Promise(r=>bridge.server.listen(0,'127.0.0.1',r));t.after(()=>bridge.close());
 const base='http://127.0.0.1:'+bridge.server.address().port;
 const post=(path,data={},headers={})=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json',...headers},body:JSON.stringify({session:'one',...data})});
 assert.equal((await post('/pair',{}, {Origin:'https://evil.example'})).status,403);
 assert.equal((await post('/pair',{}, {Authorization:'bad'})).status,401);
 assert.equal((await post('/pair')).status,200);
 assert.equal((await post('/pair',{session:'two'})).status,409);
 const promise=bridge.call('get_status');const {command}=await (await post('/poll')).json();assert.equal(command.method,'get_status');
 await post('/result',{id:command.id,result:{running:true}});assert.deepEqual(await promise,{running:true});
 const expired=bridge.call('pause');await assert.rejects(expired,/timed out/);
 assert.equal((await (await post('/poll')).json()).command,null);
});
