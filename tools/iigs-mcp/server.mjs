import {randomBytes} from 'node:crypto';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {createBridge} from './bridge.mjs';
const token=process.env.IIGS_BRIDGE_TOKEN||randomBytes(24).toString('hex');
if(token.length<24)throw Error('IIGS_BRIDGE_TOKEN must contain at least 24 characters');
const port=Number(process.env.IIGS_BRIDGE_PORT||8788);
const bridge=createBridge({token,origin:process.env.IIGS_BROWSER_ORIGIN||'https://subnetpie.github.io'});
await new Promise((resolve,reject)=>{bridge.server.once('error',reject);bridge.server.listen(port,'127.0.0.1',resolve);});
console.error(`IIgs bridge: http://127.0.0.1:${port}\nPairing token: ${token}`);
const server=new McpServer({name:'apple-iigs-emulator',version:'0.1.0'});
const methods={get_status:{},get_devices:{},capture_screen:{},read_memory:{region:z.enum(['ram','e0','e1','rom','main','aux']),offset:z.number().int().min(0).max(0xffffff).default(0),length:z.number().int().min(1).max(4096).default(256)},pause:{},resume:{},step:{count:z.number().int().min(1).max(1000).default(1)},capture_trace:{count:z.number().int().min(1).max(1000).default(100)}};
const descriptions={get_status:'Read CPU registers, running state and display dimensions.',get_devices:'Inspect configured slots and mounted media.',capture_screen:'Capture the current emulated framebuffer as PNG.',read_memory:'Inspect physical backing memory without I/O side effects; this is not a CPU bus read.',pause:'Pause emulation; requires browser control opt-in.',resume:'Resume emulation; requires browser control opt-in.',step:'Pause and execute up to count instructions with peripherals; remains paused. Returns actual completed count.',capture_trace:'Pause and trace up to count instructions, bounded to 50 ms; remains paused. Requires control opt-in.'};
for(const [name,inputSchema] of Object.entries(methods))server.registerTool(name,{description:descriptions[name],inputSchema,annotations:{readOnlyHint:!['pause','resume','step','capture_trace'].includes(name),destructiveHint:false,openWorldHint:false}},async args=>{
 try{const result=await bridge.call(name,args);return name==='capture_screen'?{content:[{type:'image',mimeType:result.mimeType,data:result.data}]}:{content:[{type:'text',text:JSON.stringify(result)}]};}
 catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
});
await server.connect(new StdioServerTransport());
const close=()=>{bridge.close();server.close();};process.on('SIGINT',close);process.on('SIGTERM',close);process.stdin.on('end',close);
