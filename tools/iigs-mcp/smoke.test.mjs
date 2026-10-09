import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
test('MCP client discovers tools and calls through a paired browser transport',async t=>{
 const token='test-pairing-token-123456789';let stderr='';
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./server.mjs',import.meta.url))],env:{...process.env,IIGS_BRIDGE_TOKEN:token,IIGS_BRIDGE_PORT:'18789'},stderr:'pipe'});
 const client=new Client({name:'test',version:'1'});t.after(()=>client.close());await client.connect(transport);
 assert.equal((await client.listTools()).tools.length,14);
 const missing=await client.callTool({name:'get_status',arguments:{}});assert.equal(missing.isError,true);
 const post=(path,body)=>fetch('http://127.0.0.1:18789'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({session:'test',...body})});
 assert.equal((await post('/pair')).status,200);
 const request=client.callTool({name:'get_status',arguments:{}});let command;
 for(let i=0;i<30&&!command;i++){command=(await (await post('/poll')).json()).command;if(!command)await new Promise(r=>setTimeout(r,10));}
 assert.equal(command.method,'get_status');await post('/result',{id:command.id,result:{machine:'iigs',running:false}});
 const result=await request;assert.equal(JSON.parse(result.content[0].text).machine,'iigs');
});
