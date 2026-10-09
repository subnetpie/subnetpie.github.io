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
const byteList=z.array(z.number().int().min(0).max(255)).min(1).max(4096);
Object.assign(methods,{
 open_disk_workspace:{device:z.string().regex(/^(smartport|iigs35|disk2):d[1-4]$/)},
 list_disk_workspaces:{},
 close_disk_workspace:{workspace:z.string().max(100)},
 read_disk:{workspace:z.string().max(100),offset:z.number().int().min(0),length:z.number().int().min(1).max(4096).default(256)},
 patch_disk:{workspace:z.string().max(100),revision:z.number().int().min(0),offset:z.number().int().min(0),expected:byteList,bytes:byteList},
 undo_disk_patch:{workspace:z.string().max(100),revision:z.number().int().min(0)}
});
const descriptions={get_status:'Read CPU registers, running state and display dimensions.',get_devices:'Inspect configured slots and mounted media.',capture_screen:'Capture the current emulated framebuffer as PNG.',read_memory:'Inspect physical backing memory without I/O side effects; this is not a CPU bus read.',pause:'Pause emulation; requires browser control opt-in.',resume:'Resume emulation; requires browser control opt-in.',step:'Pause and execute up to count instructions with peripherals; remains paused. Returns actual completed count.',capture_trace:'Pause and trace up to count instructions, bounded to 50 ms; remains paused. Requires control opt-in.'};
Object.assign(descriptions,{
 open_disk_workspace:'Snapshot one mounted physical disk for inspection/editing. Original media is unchanged. At most two workspaces.',
 list_disk_workspaces:'List disk snapshot IDs, lengths and revisions.',
 close_disk_workspace:'Discard a disk editing snapshot, including unsaved modifications.',
 read_disk:'Read up to 4096 bytes from the disk snapshot. DSK offsets are normalized DOS sector order; block images omit container headers.',
 patch_disk:'Patch a snapshot only, checking exact original bytes and revision. Requires browser disk-editing opt-in. Does not modify the mounted game.',
 undo_disk_patch:'Undo the latest snapshot patch at the specified revision. Requires browser disk-editing opt-in.'
});
for(const [name,inputSchema] of Object.entries(methods))server.registerTool(name,{description:descriptions[name],inputSchema,annotations:{readOnlyHint:!['pause','resume','step','capture_trace','open_disk_workspace','close_disk_workspace','patch_disk','undo_disk_patch'].includes(name),destructiveHint:name==='close_disk_workspace',openWorldHint:false}},async args=>{
 try{const result=await bridge.call(name,args);return name==='capture_screen'?{content:[{type:'image',mimeType:result.mimeType,data:result.data}]}:{content:[{type:'text',text:JSON.stringify(result)}]};}
 catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
});
await server.connect(new StdioServerTransport());
const close=()=>{bridge.close();server.close();};process.on('SIGINT',close);process.on('SIGTERM',close);process.stdin.on('end',close);
