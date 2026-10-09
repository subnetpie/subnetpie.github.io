import {createServer} from 'node:http';
import {randomUUID,timingSafeEqual} from 'node:crypto';
export function createBridge({token,origin='https://subnetpie.github.io',timeout=5000}) {
 let session=null,lastSeen=0;const pending=new Map();
 const authorized=value=>{const a=Buffer.from(value||''),b=Buffer.from('Bearer '+token);return a.length===b.length&&timingSafeEqual(a,b);};
 const server=createServer(async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(!/^127\.0\.0\.1(?::\d+)?$|^localhost(?::\d+)?$/.test(req.headers.host||''))return send(403,{error:'Invalid host'});
  if(req.headers.origin && req.headers.origin!==origin)return send(403,{error:'Invalid origin'});
  if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Private-Network','true');return send(200,{});}
  if(req.method!=='POST'||!authorized(req.headers.authorization))return send(401,{error:'Unauthorized'});
  try {
   let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024){send(413,{error:'Payload too large'});return;}body+=chunk;}
   const data=JSON.parse(body);if(typeof data.session!=='string'||data.session.length>100)throw Error('Invalid session');
   if(req.url==='/pair') {
    if(session && session!==data.session && Date.now()-lastSeen<15000)return send(409,{error:'Another emulator is connected'});
    if(session!==data.session)for(const p of pending.values())p.reject(Error('Session replaced'));
    session=data.session;lastSeen=Date.now();return send(200,{session});
   }
   if(data.session!==session||Date.now()-lastSeen>15000)return send(409,{error:'Session expired; reconnect'});
   lastSeen=Date.now();
   if(req.url==='/poll') {
    const entry=[...pending.values()].find(p=>!p.sent);
    if(entry)entry.sent=true;
    return send(200,{command:entry?.command||null});
   }
   if(req.url==='/result') {
    const entry=pending.get(data.id);if(!entry||!entry.sent)return send(409,{error:'Unknown or expired command'});
    data.error?entry.reject(Error(String(data.error))):entry.resolve(data.result);return send(200,{});
   }
   send(404,{error:'Unknown route'});
  }catch(e){if(!res.headersSent)send(400,{error:e.message});}
 });
 function call(method,args={}) {
  if(!session||Date.now()-lastSeen>15000)return Promise.reject(Error('No connected emulator. Open Load → MCP / Debug connection.'));
  if(pending.size>=16)return Promise.reject(Error('Command queue is full'));
  return new Promise((resolve,reject)=>{
   const id=randomUUID(),timer=setTimeout(()=>finish(reject,Error('Emulator command timed out; it will not be retried.')),timeout);
   function finish(fn,value){clearTimeout(timer);pending.delete(id);fn(value);}
   pending.set(id,{command:{id,method,args,expires:Date.now()+timeout},sent:false,resolve:v=>finish(resolve,v),reject:e=>finish(reject,e)});
  });
 }
 return {server,call,close(){for(const p of [...pending.values()])p.reject(Error('Bridge closed'));server.close();}};
}
