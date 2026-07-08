'use strict';

const TMDB_KEY='e64c3c6523ce13cfa49170fac2bb1691';
const API='https://api.themoviedb.org/3';
const DB_NAME='streamgn-db';
const STORE='kv';
const INTERVAL=6*60*60*1000;
const CACHE='streamgn-v56';
const OFFLINE_CACHE='streamgn-offline-v1';
const MAX_IMAGE_CACHE_ITEMS=180;
const IMG='https://image.tmdb.org/t/p/w780';

self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./','./index.html','./favicon.ico','./manifest.webmanifest','./assets/styles.css?v=20260708-player13','./assets/config.js','./assets/providers.js?v=20260708-player13','./assets/sport-data.js?v=20260708-player13','./assets/app.js?v=20260708-player13','./assets/remote-config.json','./assets/external-sites.json','./assets/streamgn-logo.png','./assets/icons/favicon-16.png','./assets/icons/favicon-32.png','./assets/icons/icon-96.png','./assets/icons/icon-120.png','./assets/icons/icon-144.png','./assets/icons/icon-152.png','./assets/icons/icon-167.png','./assets/icons/icon-180.png','./assets/icons/icon-192.png','./assets/icons/icon-256.png','./assets/icons/icon-384.png','./assets/icons/icon-512.png','./assets/icons/icon-maskable-512.png','./assets/icons/streamgn-social.png']).catch(()=>{})));});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('streamgn-')&&k!==CACHE&&k!==OFFLINE_CACHE).map(k=>caches.delete(k)))),caches.open(OFFLINE_CACHE).then(cache=>trimCache(cache,MAX_IMAGE_CACHE_ITEMS))]));});
async function fallbackResponse(request){
  const match=await caches.match(request);
  if(match)return match;
  if(request.mode==='navigate'){
    const shell=await caches.match('./index.html');
    if(shell)return shell;
  }
  return new Response('',{status:504,statusText:'Offline'});
}
async function trimCache(cache,maxItems){
  try{
    const keys=await cache.keys();
    if(keys.length<=maxItems)return;
    await Promise.all(keys.slice(0,keys.length-maxItems).map(key=>cache.delete(key)));
  }catch(e){}
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.hostname==='image.tmdb.org'){
    event.respondWith((async()=>{
      const cache=await caches.open(OFFLINE_CACHE);
      const hit=await cache.match(event.request);
      if(hit)return hit;
      try{
        const res=await fetch(event.request);
        if(res&&(res.ok||res.type==='opaque')){
          cache.put(event.request,res.clone()).then(()=>trimCache(cache,MAX_IMAGE_CACHE_ITEMS)).catch(()=>{});
        }
        return res;
      }catch(e){
        return fallbackResponse(event.request);
      }
    })());
    return;
  }
  event.respondWith(fetch(event.request).catch(()=>fallbackResponse(event.request)));
});

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
function notifDefault(){return{items:[],snapshots:{},lastCheck:0,pushStats:{day:'',count:0,lastPushAt:0}};}
function dayKey(ts=Date.now()){return new Date(ts).toISOString().slice(0,10);}
function daysUntil(date,now=Date.now()){if(!date)return null;const t=new Date(`${date}T12:00:00Z`).getTime();if(!Number.isFinite(t))return null;return Math.ceil((t-now)/86400000);}
function addNotif(data,created,notif){
  if(!notif?.id||data.items.some(n=>n.id===notif.id))return;
  const next={ts:Date.now(),read:false,category:'news',priority:2,...notif};
  data.items.unshift(next);
  created.push(next);
}
function canShowPush(data,now){
  data.pushStats=data.pushStats||{day:'',count:0,lastPushAt:0};
  const today=dayKey(now);
  if(data.pushStats.day!==today)data.pushStats={day:today,count:0,lastPushAt:0};
  if(data.pushStats.count>=3)return false;
  if(now-(data.pushStats.lastPushAt||0)<8*60*60*1000)return false;
  data.pushStats.count++;
  data.pushStats.lastPushAt=now;
  return true;
}
async function getTrackedItems(){
  const watching=await readKey('svx_w',{});
  const folders=await readKey('svx_f',{});
  const seen=new Set(),items=[];
  const add=item=>{
    if(!item||!item.id)return;
    const type=item.type||item.media_type;
    if(type!=='tv'&&type!=='movie')return;
    const key=`${type}_${item.id}`;
    if(seen.has(key))return;
    seen.add(key);items.push({...item,type});
  };
  Object.values(watching).forEach(add);
  Object.values(folders).forEach(folder=>(folder.items||[]).forEach(add));
  return items;
}
async function checkUpdates(force=false){
  const data={...notifDefault(),...await readKey('svx_notif',notifDefault())};
  const now=Date.now();
  if(!force&&now-(data.lastCheck||0)<INTERVAL)return 0;
  data.snapshots=data.snapshots||{};
  data.snapshots.upcomingNotified=data.snapshots.upcomingNotified||{};
  const created=[];
  const tracked=await getTrackedItems();
  for(const item of tracked.slice(0,80)){
    try{
      if(item.type==='tv'){
        const info=await tmdb(`/tv/${item.id}`);
        const snap=data.snapshots[item.id]||{};
        const seasons=info.number_of_seasons||0,eps=info.number_of_episodes||0,lastEp=info.last_episode_to_air,nextEp=info.next_episode_to_air,poster=info.poster_path||item.poster||'';
        if(!snap.seasons&&!snap.eps){data.snapshots[item.id]={seasons,eps,lastEpId:lastEp?.id||null,nextEpId:nextEp?.id||null};}
        else if(seasons>snap.seasons){
          addNotif(data,created,{id:`s_${item.id}_${seasons}`,itemId:item.id,type:'tv',title:item.title||info.name,poster,category:'list',priority:1,desc:`Nuova stagione disponibile: stagione ${seasons}`});
        }else if(eps>snap.eps&&lastEp){
          const epLabel=`S${lastEp.season_number}E${lastEp.episode_number}${lastEp.name?' · '+lastEp.name:''}`;
          addNotif(data,created,{id:`e_${item.id}_${lastEp.id}`,itemId:item.id,type:'tv',title:item.title||info.name,poster,category:'list',priority:1,desc:`Nuovo episodio disponibile: ${epLabel}`});
        }
        const d=daysUntil(nextEp?.air_date,now),upKey=`tv_${item.id}_${nextEp?.id||nextEp?.air_date}`;
        if(nextEp&&d!==null&&d>=0&&d<=10&&!data.snapshots.upcomingNotified[upKey]){
          data.snapshots.upcomingNotified[upKey]=now;
          addNotif(data,created,{id:`up_${upKey}`,itemId:item.id,type:'tv',title:item.title||info.name,poster,category:'upcoming',priority:2,desc:`Prossima uscita tra ${d===0?'oggi':d+' giorni'}: S${nextEp.season_number}E${nextEp.episode_number}`});
        }
        data.snapshots[item.id]={seasons,eps,lastEpId:lastEp?.id||null,nextEpId:nextEp?.id||null};
      }else{
        const info=await tmdb(`/movie/${item.id}`);
        const d=daysUntil(info.release_date,now),upKey=`movie_${item.id}_${info.release_date}`;
        if(d!==null&&d>=0&&d<=21&&!data.snapshots.upcomingNotified[upKey]){
          data.snapshots.upcomingNotified[upKey]=now;
          addNotif(data,created,{id:`up_${upKey}`,itemId:item.id,type:'movie',title:item.title||info.title,poster:info.poster_path||item.poster||'',category:'upcoming',priority:2,desc:`Uscita imminente tra ${d===0?'oggi':d+' giorni'}`});
        }
      }
    }catch(e){}
  }
  try{
    const top=await tmdb('/trending/all/day',{region:'IT'});
    const demand=(top.results||[]).filter(x=>x.media_type==='movie'||x.media_type==='tv').slice(0,8);
    const ids=demand.map(x=>`${x.media_type}_${x.id}`),prev=data.snapshots.demandIds||[];
    const fresh=demand.find((item,idx)=>prev.length&&idx<5&&!prev.includes(`${item.media_type}_${item.id}`));
    if(fresh){
      const key=`${fresh.media_type}_${fresh.id}_${dayKey(now)}`;
      addNotif(data,created,{id:`demand_${key}`,itemId:fresh.id,type:fresh.media_type,title:fresh.title||fresh.name,poster:fresh.poster_path||'',category:'demand',priority:3,desc:'Nuova uscita molto richiesta in tendenza'});
    }
    data.snapshots.demandIds=ids;
  }catch(e){}
  created.sort((a,b)=>(a.priority||9)-(b.priority||9));
  data.items=data.items.slice(0,80);
  data.lastCheck=now;
  if(created.length&&canShowPush(data,now)){
    const top=created[0],extra=created.length>1?` + altri ${created.length-1}`:'';
    try{
      await self.registration.showNotification('StreaMGN',{
        body:created.length===1?top.desc:`${top.title}: ${top.desc}${extra}`,
        icon:'./assets/icons/icon-192.png',
        badge:'./assets/icons/icon-96.png',
        image:top.poster?`${IMG}${top.poster}`:undefined,
        tag:'streamgn-updates',
        renotify:false,
        data:{url:`./?page=profilo`,itemId:top.itemId,type:top.type,poster:top.poster||''}
      });
    }catch(e){}
  }
  await writeKey('svx_notif',data);
  return created.length;
}

self.addEventListener('periodicsync',event=>{if(event.tag==='streamgn-updates')event.waitUntil(checkUpdates(false));});
self.addEventListener('sync',event=>{if(event.tag==='streamgn-updates')event.waitUntil(checkUpdates(false));});
self.addEventListener('message',event=>{if(event.data?.type==='CHECK_UPDATES')event.waitUntil(checkUpdates(false));});
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let payload=null;
    try{payload=event.data?.json?.()||null;}catch(e){}
    if(payload?.title||payload?.body){
      try{
        await self.registration.showNotification(payload.title||'StreaMGN',{
          body:payload.body||'Novita importanti disponibili.',
          icon:payload.icon||'./assets/icons/icon-192.png',
          badge:payload.badge||'./assets/icons/icon-96.png',
          image:payload.image,
          tag:payload.tag||'streamgn-updates',
          renotify:false,
          data:payload.data||{url:'./?page=profilo'}
        });
      }catch(e){}
      return;
    }
    await checkUpdates(true);
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const data=event.notification.data||{};
  const url=data.itemId?`./?id=${encodeURIComponent(data.itemId)}&type=${encodeURIComponent(data.type||'tv')}`:(data.url||'./?page=profilo');
  const target=new URL(url,self.registration.scope).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){
      if('focus' in client){
        if('navigate' in client)return client.navigate(target).then(c=>(c||client).focus());
        return client.focus();
      }
    }
    return clients.openWindow(target);
  }));
});
