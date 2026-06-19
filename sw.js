'use strict';

const TMDB_KEY='e64c3c6523ce13cfa49170fac2bb1691';
const API='https://api.themoviedb.org/3';
const DB_NAME='streamgn-db';
const STORE='kv';
const INTERVAL=6*60*60*1000;

self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open('streamgn-v7').then(cache=>cache.addAll(['./','./index.html','./assets/styles.css','./assets/config.js','./assets/app.js','./assets/remote-config.json','./assets/streamgn-logo.png','./manifest.webmanifest']).catch(()=>{})));});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('streamgn-')&&k!=='streamgn-v7').map(k=>caches.delete(k))))]));});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));});

function openDB(){
  return new Promise(resolve=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'});};
    req.onsuccess=e=>resolve(e.target.result);
    req.onerror=()=>resolve(null);
  });
}
async function readKey(key,fallback){
  const db=await openDB();if(!db)return fallback;
  return await new Promise(resolve=>{
    const tx=db.transaction(STORE,'readonly').objectStore(STORE).get(key);
    tx.onsuccess=()=>{try{resolve(tx.result?.value?JSON.parse(tx.result.value):fallback);}catch(e){resolve(fallback);}};
    tx.onerror=()=>resolve(fallback);
  });
}
async function writeKey(key,value){
  const db=await openDB();if(!db)return;
  await new Promise(resolve=>{
    const tx=db.transaction(STORE,'readwrite').objectStore(STORE).put({key,value:JSON.stringify(value),updatedAt:Date.now()});
    tx.onsuccess=()=>resolve();tx.onerror=()=>resolve();
  });
}
async function tmdb(path,extra={}){
  const p=new URLSearchParams({api_key:TMDB_KEY,language:'it-IT',...extra});
  const r=await fetch(`${API}${path}?${p}`);
  if(!r.ok)throw Error(r.status);
  return r.json();
}
async function getTrackedWatchingSeries(){
  const watching=await readKey('svx_w',{});
  const folders=await readKey('svx_f',{});
  const seen=new Set(),items=[];
  const add=item=>{if(!item||item.type!=='tv')return;const id=String(item.id);if(seen.has(id))return;seen.add(id);items.push(item);};
  Object.values(watching).forEach(add);
  Object.values(folders).forEach(folder=>(folder.items||[]).forEach(add));
  return items;
}
async function checkUpdates(force=false){
  const data=await readKey('svx_notif',{items:[],snapshots:{},lastCheck:0});
  const now=Date.now();
  if(!force&&now-(data.lastCheck||0)<INTERVAL)return 0;
  let newCount=0;
  const tracked=await getTrackedWatchingSeries();
  for(const item of tracked){
    try{
      const info=await tmdb(`/tv/${item.id}`,{},true);
      const snap=data.snapshots[item.id]||{};
      const seasons=info.number_of_seasons||0,eps=info.number_of_episodes||0,lastEp=info.last_episode_to_air,nextEp=info.next_episode_to_air,poster=info.poster_path||item.poster||'';
      if(!snap.seasons&&!snap.eps){data.snapshots[item.id]={seasons,eps,lastEpId:lastEp?.id||null,nextEp:nextEp||null};continue;}
      if(seasons>snap.seasons){
        const notif={id:`s_${item.id}_${seasons}`,itemId:item.id,type:'tv',title:item.title||info.name,poster,desc:`Stagione ${seasons} disponibile!`,ts:now,read:false};
        if(!data.items.find(n=>n.id===notif.id)){data.items.unshift(notif);newCount++;}
      }else if(eps>snap.eps&&lastEp){
        const epLabel=`S${lastEp.season_number}E${lastEp.episode_number}${lastEp.name?' · '+lastEp.name:''}`;
        const notif={id:`e_${item.id}_${lastEp.id}`,itemId:item.id,type:'tv',title:item.title||info.name,poster,desc:`Nuovo episodio: ${epLabel}`,ts:now,read:false};
        if(!data.items.find(n=>n.id===notif.id)){data.items.unshift(notif);newCount++;}
      }
      data.snapshots[item.id]={seasons,eps,lastEpId:lastEp?.id||null,nextEp:nextEp||null};
    }catch(e){}
  }
  try{
    const top=await tmdb('/trending/all/day',{region:'IT'});
    const topItems=(top.results||[]).filter(x=>x.media_type==='movie'||x.media_type==='tv').slice(0,10);
    const prev=data.snapshots.top10Ids||[],today=new Date(now).toISOString().slice(0,10);
    topItems.forEach((item,idx)=>{
      const key=`${item.media_type}_${item.id}`;
      if(!prev.length||prev.includes(key))return;
      const notif={id:`top10_${key}_${today}`,itemId:item.id,type:item.media_type,title:item.title||item.name,poster:item.poster_path||'',desc:`Nuovo in Top 10 #${idx+1}`,ts:now,read:false};
      if(!data.items.find(n=>n.id===notif.id)){data.items.unshift(notif);newCount++;}
    });
    data.snapshots.top10Ids=topItems.map(x=>`${x.media_type}_${x.id}`);
  }catch(e){}
  data.items=data.items.slice(0,80);
  data.lastCheck=now;
  await writeKey('svx_notif',data);
  if(newCount>0&&self.registration?.showNotification){
    await self.registration.showNotification('StreaMGN',{body:`${newCount} nuovi aggiornamenti`,icon:'./assets/streamgn-logo.png',tag:'streamgn-updates',data:{url:'./?page=profilo'}});
  }
  return newCount;
}

self.addEventListener('periodicsync',event=>{if(event.tag==='streamgn-updates')event.waitUntil(checkUpdates(false));});
self.addEventListener('sync',event=>{if(event.tag==='streamgn-updates')event.waitUntil(checkUpdates(false));});
self.addEventListener('message',event=>{if(event.data?.type==='CHECK_UPDATES')event.waitUntil(checkUpdates(false));});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=event.notification.data?.url||'./';event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const client of list){if('focus' in client)return client.focus();}return clients.openWindow(url);}));});
