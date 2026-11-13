// Add isolation headers for the browser emulator's pthreads on static hosting.
// Scope is the DMD Viewer directory. Responses are fetched normally, never cached.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.cache==='only-if-cached'&&event.request.mode!=='same-origin')return;
  event.respondWith((async()=>{
    const response=await fetch(event.request);
    if(response.status===0)return response;
    const headers=new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy','same-origin');
    headers.set('Cross-Origin-Embedder-Policy','require-corp');
    headers.set('Cross-Origin-Resource-Policy','same-origin');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  })());
});
