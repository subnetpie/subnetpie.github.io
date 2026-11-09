export function csvRows(text){
  const rows=[];let row=[],cell='',quoted=false;text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''}else cell+=c}
  if(quoted)throw Error('Unclosed quote in PuP configuration');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  if(!rows.length)throw Error('Empty PuP configuration');const headers=rows.shift().map(v=>v.trim());
  return rows.map(cells=>Object.fromEntries(headers.map((h,i)=>[h,(cells[i]??'').trim()])));
}
export function configKind(rows){const first=rows[0];if(!first)throw Error('PuP configuration contains no rows');if('ScreenDes'in first)return 'screens';if('Trigger'in first&&'ID'in first)return 'triggers';if('Folder'in first)return 'playlists';throw Error('Unrecognized PuP configuration headers')}
export function decodePupText(bytes){if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes);try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return new TextDecoder('windows-1252').decode(bytes)}}
export const number=(value,fallback=0)=>value!==''&&value!=null&&Number.isFinite(Number(value))?Number(value):fallback;
export const enabled=row=>!['','0','off','false'].includes(String(row.Active??'').toLowerCase());
export const mediaPattern=/\.(mp4|m4v|webm|mov|ogv|mp3|ogg|wav|m4a|flac|png|jpg|jpeg|gif|webp|bmp)$/i;
export function normalizePath(path){return String(path).replaceAll('\\','/').replace(/^\.\//,'').replace(/^\/+|\/+$/g,'').toLowerCase()}
export function mediaCandidates(files,folder='',filename=''){
  const list=files.filter(f=>mediaPattern.test(f.path||f.name)),wanted=normalizePath(folder),name=normalizePath(filename);
  if(name){const full=normalizePath(wanted+'/'+name);const exact=list.filter(f=>{const p=normalizePath(f.path||f.name);return p===full||p.endsWith('/'+full)});if(exact.length)return exact;const base=list.filter(f=>normalizePath(f.path||f.name).split('/').pop()===name.split('/').pop());return base.length===1?base:[]}
  if(!wanted)return [];
  return list.filter(f=>normalizePath(f.path||f.name).split('/').slice(0,-1).join('/').split('/').pop()===wanted.split('/').pop()).sort((a,b)=>(a.path||a.name).localeCompare(b.path||b.name,undefined,{numeric:true}));
}
export function screenPosition(screen){const p=String(screen.CustomPos||'').split(',').map(Number);if(p.length===5&&p.every(Number.isFinite)&&p[3]>0&&p[4]>0)return {parent:p[0],x:p[1],y:p[2],width:p[3],height:p[4]};return {parent:null,x:0,y:0,width:100,height:100}}
export function rootScreen(id,screens){const seen=new Set();while(!seen.has(String(id))){seen.add(String(id));const s=screens.find(s=>String(s.ScreenNum)===String(id));if(!s)return id;const p=screenPosition(s);if(p.parent===null)return id;id=p.parent}throw Error('Circular CustomPos screen references')}
export function actionName(row){return String(row.Loop||'normal').trim().toLowerCase().replaceAll('prty','pri').replaceAll('prity','priority')}
export function triggerCodes(row){return String(row.Trigger||'').split(',').map(v=>v.trim().toUpperCase()).filter(Boolean)}
export function mimeType(name){const ext=name.split('.').pop().toLowerCase();return {mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',mov:'video/quicktime',ogv:'video/ogg',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',m4a:'audio/mp4',flac:'audio/flac',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp'}[ext]||'application/octet-stream'}
