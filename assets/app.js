'use strict';
const CONFIG=window.STREAMGN_CONFIG||{};
const TMDB_KEY=CONFIG.tmdbKey||'';
const IMG=CONFIG.images?.poster||'https://image.tmdb.org/t/p/w342',IMG_W=CONFIG.images?.posterWide||'https://image.tmdb.org/t/p/w780',BIG=CONFIG.images?.backdrop||'https://image.tmdb.org/t/p/w1280',ORIG=CONFIG.images?.original||'https://image.tmdb.org/t/p/original',FACE=CONFIG.images?.face||'https://image.tmdb.org/t/p/w185',STILL=CONFIG.images?.still||'https://image.tmdb.org/t/p/w300';
const API=CONFIG.apiBase||'https://api.themoviedb.org/3';
let heroItems=[],heroIdx=0,heroTimer,currentTvId=null,currentSrc='vixsrc',currentIsAnime=false;
let currentDetailId=null,currentDetailType=null,currentDetailTitle='',currentDetailPoster='',currentDetailIsAnime=false,currentDetailSeasons=[];
let fpCurrentItem=null,fpPendingCat=null,confirmCallback=null,searchAddToFolderId=null,searchAddFolderName='';
const loaded={home:false,serie:false,film:false,anime:false,profilo:false};
const randomPools={serie:[],film:[],anime:[]};
let activeFilterGenre={serie:null,film:null},currentTrailerKey=null,epChangeTimer=null,listeFilter='all',listeSort='recent';
let playerProgId=null,playerProgType=null,playerProgSeason=null,playerProgEpisode=null,playerNoteSavedThisSession=false;
let playerSessionTitle='',playerSessionPoster='',playerSessionIsAnime=false,playerLastAutoSecs=0,playerLastAutoSaveAt=0,playerAutoSaveTimer=null,playerHasRealProgress=false,playerSourceHealthTimer=null;
let playerStreamSeq=0;
let playerSessionAnimeTitles=[],currentDetailAnimeTitles=[];
let profileStatsCache=null;
const SOURCE_LABELS={vixsrc:'VixSrc',vidsrc:'VidSrc',embed:'Embed.su',anime:'AnimeWorld',animeworld:'AnimeWorld',tadako:'Tadako'};
function sourceListFromConfig(kind,fallback){return (CONFIG.streamUiSources?.[kind]||fallback).map(id=>({id,label:SOURCE_LABELS[id]||id}));}
const SOURCES_NORMAL=sourceListFromConfig('normal',['vixsrc','vidsrc','embed']);
const SOURCES_ANIME=sourceListFromConfig('anime',['anime']);
const SPORT_DEFAULT_URL=CONFIG.sportDefaultUrl||'https://pepperstream.xyz/index.php';
const REMOTE_CONFIG_URL=CONFIG.remoteConfigUrl||'assets/remote-config.json';
const SPORT_ADMIN_EDIT_URL=CONFIG.sportAdminEditUrl||'https://github.com/StreaMGN/StreaMGN.github.io/edit/main/assets/remote-config.json';
const PROVIDERS=[{name:'Netflix',id:8,c:'#e50914'},{name:'Prime Video',id:9,c:'#00a8e1'},{name:'Disney+',id:337,c:'#1133cc'},{name:'Apple TV+',id:350,c:'#aaa'},{name:'Paramount+',id:531,c:'#0055ff'},{name:'NOW',id:39,c:'#00b4b4'}];
const MV_GENRES=[{name:'Tutti',id:null},{name:'Thriller',id:53},{name:'Crime',id:80},{name:'Romantico',id:10749},{name:'Azione',id:28},{name:'Horror',id:27},{name:'Sci-Fi',id:878},{name:'Commedia',id:35},{name:'Dramma',id:18},{name:'Avventura',id:12}];
const TV_GENRES=[{name:'Tutti',id:null},{name:'Crime',id:80},{name:'Dramma',id:18},{name:'Commedia',id:35},{name:'Sci-Fi',id:10765},{name:'Mistero',id:9648},{name:'Reality',id:10764},{name:'Action',id:10759}];
const DEF_FOLDERS=[{id:'film_watch',name:'FILM che sto guardando',g:'watching',mt:'movie',an:false},{id:'serie_watch',name:'SERIE che sto guardando',g:'watching',mt:'tv',an:false},{id:'film_lista',name:'FILM in lista',g:'lista',mt:'movie',an:false},{id:'serie_lista',name:'SERIE in lista',g:'lista',mt:'tv',an:false},{id:'film_visti',name:'FILM visti',g:'visti',mt:'movie',an:false},{id:'serie_vc',name:'SERIE viste (concluse)',g:'visti',mt:'tv',an:false,sub:'c'},{id:'serie_vo',name:'SERIE viste (in corso)',g:'visti',mt:'tv',an:false,sub:'o'}];
const GROUPS=[{id:'watching',label:'👁️ Che sto guardando'},{id:'lista',label:'📋 In lista'},{id:'visti',label:'✅ Viste'}];
const DATA_KEYS=['svx_f','svx_w','svx_prog','svx_r','svx_sh','svx_notif','svx_notif_asked','svx_s','svx_sport_url','svx_src_pref','svx_src_bad','svx_ep_seen','svx_hist','svx_tmdb_cache','svx_anime_links'];
const storageMemory={};
let idbDb=null,idbHydrated=false;

function uniqueTextList(items){
  return [...new Set((items||[]).map(x=>String(x||'').trim()).filter(Boolean))];
}
function itemGenres(item){
  return [...(item?.genre_ids||[]),...(item?.genres||[]).map(g=>g?.id??g)].map(String);
}
function itemCountries(item){
  return [
    ...(Array.isArray(item?.origin_country)?item.origin_country:[]),
    ...(item?.production_countries||[]).map(c=>c?.iso_3166_1)
  ].filter(Boolean).map(String);
}
function isAnimeLike(item){
  if(!item)return false;
  if(item._anime||item.isAnime)return true;
  const genres=itemGenres(item),countries=itemCountries(item),lang=String(item.original_language||'').toLowerCase();
  return genres.includes('16')&&(lang==='ja'||countries.includes('JP'));
}
function animeTitleCandidates(info,title=''){
  return uniqueTextList([
    title,
    info?.title,
    info?.name,
    info?.original_title,
    info?.original_name
  ]);
}
function withAnimeFlag(item){
  return item?{...item,_anime:isAnimeLike(item)?1:(item._anime?1:0)}:item;
}

function migrateLegacyScopedData(){
  try{
    const legacyProfiles=JSON.parse(localStorage.getItem('svx_profiles')||'[]');
    const legacyActive=localStorage.getItem('svx_profile_active')||'main';
    const candidates=['main',legacyActive,...(Array.isArray(legacyProfiles)?legacyProfiles.map(p=>p.id):[])].filter(Boolean);
    DATA_KEYS.forEach(key=>{
      if(localStorage.getItem(key)!==null)return;
      for(const id of candidates){
        const scoped=localStorage.getItem(`svx_p_${id}_${key}`);
        if(scoped!==null){localStorage.setItem(key,scoped);break;}
      }
    });
    localStorage.removeItem('svx_profile_active');
    localStorage.removeItem('svx_profiles');
  }catch(e){}
}
function hydrateStorageMemoryFromLocal(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key&&key.startsWith('svx_'))storageMemory[key]=localStorage.getItem(key);
    }
  }catch(e){}
}
function readJSONKey(key,fallback){
  try{
    const raw=storageMemory[key]??localStorage.getItem(key);
    return raw?JSON.parse(raw):fallback;
  }catch(e){return fallback;}
}
function writeJSONKey(key,value){
  try{
    const raw=JSON.stringify(value);
    storageMemory[key]=raw;
    try{localStorage.setItem(key,raw);}catch(e){}
    idbSetRaw(key,raw);
  }catch(e){}
}
function removeJSONKey(key){
  delete storageMemory[key];
  try{localStorage.removeItem(key);}catch(e){}
  idbDelete(key);
}
function openIDB(){
  if(!('indexedDB' in window))return Promise.resolve(null);
  return new Promise(resolve=>{
    const req=indexedDB.open('streamgn-db',1);
    req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains('kv'))db.createObjectStore('kv',{keyPath:'key'});};
    req.onsuccess=e=>{idbDb=e.target.result;resolve(idbDb);};
    req.onerror=()=>resolve(null);
  });
}
function idbTx(mode='readonly'){
  if(!idbDb)return null;
  try{return idbDb.transaction('kv',mode).objectStore('kv');}catch(e){return null;}
}
function idbSetRaw(key,raw){
  const run=()=>{const store=idbTx('readwrite');if(store)try{store.put({key,value:raw,updatedAt:Date.now()});}catch(e){}};
  if(idbDb)run();else idbReady.then(run);
}
function idbDelete(key){
  const run=()=>{const store=idbTx('readwrite');if(store)try{store.delete(key);}catch(e){}};
  if(idbDb)run();else idbReady.then(run);
}
async function hydrateStorageFromIDB(){
  const db=await idbReady;if(!db)return;
  await new Promise(resolve=>{
    const store=idbTx('readonly');if(!store){resolve();return;}
    const req=store.getAll();
    req.onsuccess=()=>{
      (req.result||[]).forEach(row=>{
        if(!row?.key||typeof row.value!=='string')return;
        if(storageMemory[row.key]==null){
          storageMemory[row.key]=row.value;
          try{localStorage.setItem(row.key,row.value);}catch(e){}
        }
      });
      idbHydrated=true;refreshAfterStorageHydrated();resolve();
    };
    req.onerror=()=>resolve();
  });
}
function syncMemoryToIDB(){Object.entries(storageMemory).forEach(([key,value])=>idbSetRaw(key,value));}
const idbReady=openIDB().then(db=>{if(db)syncMemoryToIDB();return db;});
function refreshAfterStorageHydrated(){
  applyTheme(loadSettings().theme||'system');
  updateNotifBadge();refreshCW();
  const active=document.querySelector('.page.active')?.id||'page-home';
  if(active==='page-home'){loaded.home=false;loadHome();}
  if(active==='page-serie'){loaded.serie=false;loadSerie();}
  if(active==='page-film'){loaded.film=false;loadFilm();}
  if(active==='page-anime'){loaded.anime=false;loadAnime();}
  if(active==='page-profilo'){loaded.profilo=false;loadProfilo();}
  if(active==='page-liste')renderListePage();
  if(document.getElementById('search-ov').classList.contains('open'))renderSearchRecent();
}
migrateLegacyScopedData();
hydrateStorageMemoryFromLocal();
hydrateStorageFromIDB();

/* SMOOTH CLOSE */
function smoothClose(el,dur,cb){el.classList.add('closing');setTimeout(()=>{el.classList.remove('open','closing');if(cb)cb();},dur);}

/* HELPERS */
const ea=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmtMin=m=>{if(!m)return null;const h=Math.floor(m/60),r=m%60;return h?`${h}h ${r}m`:`${r}m`;};
const fmtBinge=m=>{if(!m||m<1)return null;const h=Math.floor(m/60),d=Math.floor(h/24),rh=h%24;return d>0?`${d}g ${rh}h`:`${h}h ${m%60}m`;};
function buildEntityUrl(kind,id,type,isAnime=false){const url=new URL(location.href);url.searchParams.set(kind==='actor'?'actor':'id',id);if(kind!=='actor'){url.searchParams.set('type',type||'movie');if(isAnime)url.searchParams.set('anime','1');else url.searchParams.delete('anime');}return url.toString();}
async function shareEntity(title,url){
  try{if(navigator.share){await navigator.share({title:title||'StreaMGN',url});return;}}catch(e){}
  try{await navigator.clipboard.writeText(url);showToast('Link copiato ✓');}catch(e){prompt('Copia link',url);}
}
function tmdbCacheKey(path,extra){return path+'?'+new URLSearchParams({language:'it-IT',...extra}).toString();}
function getTMDBCache(){return readJSONKey('svx_tmdb_cache',{});}
function saveTMDBCache(cache){
  const entries=Object.entries(cache).sort((a,b)=>(b[1].ts||0)-(a[1].ts||0));
  writeJSONKey('svx_tmdb_cache',Object.fromEntries(entries.slice(0,CONFIG.tmdbCacheMaxItems||260)));
}
async function tmdb(path,extra={},opts={}){
  const cacheKey=tmdbCacheKey(path,extra),now=Date.now(),maxAge=opts.maxAge??(CONFIG.tmdbCacheMaxAge||21600000);
  if(!opts.noCache){
    const cache=getTMDBCache(),hit=cache[cacheKey];
    if(hit&&now-(hit.ts||0)<maxAge)return hit.data;
  }
  const p=new URLSearchParams({api_key:TMDB_KEY,language:'it-IT',...extra});
  const r=await fetch(`${API}${path}?${p}`);
  if(!r.ok)throw Error(r.status);
  const data=await r.json();
  if(!opts.noCache){const cache=getTMDBCache();cache[cacheKey]={ts:now,data};saveTMDBCache(cache);}
  return data;
}

/* LOGO */
function makeLogo(c){if(!c)return;c.innerHTML='';c.appendChild(document.getElementById('logo-tpl').content.cloneNode(true));}
['nav-logo','search-logo','dm-logo','am-logo','pm-logo'].forEach(id=>makeLogo(document.getElementById(id)));

/* TOAST */
let _tt;
function showToast(msg,dur=2400){
  const old=document.querySelector('.toast');if(old){old.classList.add('hiding');setTimeout(()=>old.remove(),220);}
  clearTimeout(_tt);const t=document.createElement('div');t.className='toast';t.textContent=msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{t.classList.add('visible');_tt=setTimeout(()=>{t.classList.add('hiding');setTimeout(()=>t.remove(),220);},dur);}));
}

/* SETTINGS */
const themeMedia=window.matchMedia?window.matchMedia('(prefers-color-scheme: light)'):null;
function loadSettings(){return{lang:'it',subs:'none',theme:'system',...readJSONKey('svx_s',{})};}
function saveSettings(patch){const next={...loadSettings(),...patch};writeJSONKey('svx_s',next);return next;}
function resolveTheme(choice){return choice==='light'||choice==='dark'?choice:(themeMedia?.matches?'light':'dark');}
function applyTheme(choice='system'){
  const resolved=resolveTheme(choice);
  document.documentElement.dataset.theme=resolved;
  document.documentElement.dataset.themeChoice=choice;
  document.getElementById('theme-color-meta')?.setAttribute('content',resolved==='light'?'#f6f6f7':'#000000');
  const select=document.getElementById('theme-select');
  if(select)select.value=choice;
}
function initTheme(){
  const choice=loadSettings().theme||'system';
  applyTheme(choice);
  const select=document.getElementById('theme-select');
  if(select)select.addEventListener('change',()=>{const theme=select.value||'system';saveSettings({theme});applyTheme(theme);showToast(theme==='system'?'Tema collegato al sistema':theme==='light'?'Tema chiaro':'Tema scuro');});
  if(themeMedia){
    const onChange=()=>{if((loadSettings().theme||'system')==='system')applyTheme('system');};
    if(themeMedia.addEventListener)themeMedia.addEventListener('change',onChange);
    else if(themeMedia.addListener)themeMedia.addListener(onChange);
  }
}
initTheme();

/* SEARCH HISTORY */
function getSH(){return readJSONKey('svx_sh',[]);}
function addSH(q){try{q=String(q||'').trim();if(q.length<3)return;let h=getSH().filter(x=>x.toLowerCase()!==q.toLowerCase());h.unshift(q);writeJSONKey('svx_sh',h.slice(0,10));}catch(e){}}
function rmSH(q){try{writeJSONKey('svx_sh',getSH().filter(x=>x!==q));}catch(e){}}
function renderSearchRecent(){
  const h=getSH(),el=document.getElementById('search-recent');
  if(!h.length){el.innerHTML='';return;}
  el.innerHTML=`<div class="search-rec-hdr">Ricerche recenti</div><div class="search-rec-list">${h.map(q=>`<div class="search-rec-item" data-rec="${ea(q)}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>${ea(q)}</span><button class="search-rec-rm" data-rm="${ea(q)}">×</button></div>`).join('')}</div>`;
}

function commitSearchHistory(){addSH(document.getElementById('search-input')?.value||'');}

/* RATINGS */
function getRating(id){try{return readJSONKey('svx_r',{})[String(id)]||0;}catch(e){return 0;}}
function setRating(id,s){try{const r=readJSONKey('svx_r',{});r[String(id)]=s;writeJSONKey('svx_r',r);}catch(e){}}

/* WATCHING */
function getWatching(){return readJSONKey('svx_w',{});}
function getAllWatching(){return Object.values(getWatching()).sort((a,b)=>b.ts-a.ts).slice(0,24);}
function saveWatching(id,type,title,poster,season,episode){try{const w=getWatching(),prev=w[String(id)]||{};w[String(id)]={id:String(id),type,title:title||prev.title||'',poster:poster||prev.poster||'',season:season||null,episode:episode||null,isAnime:prev.isAnime||currentIsAnime||false,ts:Date.now()};writeJSONKey('svx_w',w);recordHistory(id,type,title||prev.title||'',poster||prev.poster||'',season,episode,0,'open');}catch(e){}}
function removeWatching(id){try{const w=getWatching();delete w[String(id)];writeJSONKey('svx_w',w);}catch(e){}}
function getLastWatched(id){try{return getWatching()[String(id)]||null;}catch(e){return null;}}

/* PROGRESS */
function progKey(id,type,season,episode){return type==='movie'?`prog_${id}_movie`:`prog_${id}_s${season||1}_e${episode||1}`;}
function getProgressStore(){return readJSONKey('svx_prog',{});}
function saveProgressStore(p){writeJSONKey('svx_prog',p);}
function isPreciseProgress(prog){return !!prog&&!!prog.secs&&(prog.confidence==='real'||prog.real||prog.confidence==='manual'||prog.manual);}
function getProgress(id,type,season,episode){try{const prog=getProgressStore()[progKey(id,type,season,episode)]||null;return isPreciseProgress(prog)?prog:null;}catch(e){return null;}}
function saveProgressNote(id,type,season,episode,text,secs){
  try{const p=getProgressStore();p[progKey(id,type,season,episode)]={text,secs,confidence:'manual',manual:true,ts:Date.now()};const ks=Object.keys(p).sort((a,b)=>(p[b].ts||0)-(p[a].ts||0));if(ks.length>300)ks.slice(300).forEach(k=>delete p[k]);saveProgressStore(p);recordHistory(id,type,playerSessionTitle,playerSessionPoster,season,episode,secs,'manual');}catch(e){}
}
function fmtProgressSecs(secs){secs=Math.max(0,Math.floor(Number(secs)||0));const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;}
function progressConfidenceLabel(){return '';}
function trimProgressStore(p){const ks=Object.keys(p).sort((a,b)=>(p[b].ts||0)-(p[a].ts||0));if(ks.length>300)ks.slice(300).forEach(k=>delete p[k]);}
function saveProgressAuto(id,type,season,episode,secs,duration,confidence='real'){
  secs=Math.floor(Number(secs)||0);duration=Math.floor(Number(duration)||0);
  if(!id||secs<5||confidence!=='real')return null;
  try{
    const p=getProgressStore(),key=progKey(id,type,season,episode);
    if(duration&&secs/duration>=.92){delete p[key];saveProgressStore(p);return null;}
    p[key]={text:fmtProgressSecs(secs),secs,duration,auto:true,confidence:'real',real:true,ts:Date.now()};
    trimProgressStore(p);saveProgressStore(p);return p[key];
  }catch(e){return null;}
}
function clearProgressAuto(id,type,season,episode){try{const p=getProgressStore();delete p[progKey(id,type,season,episode)];saveProgressStore(p);}catch(e){}}
function epSeenKey(tvId,season,episode){return `${tvId}_s${season}_e${episode}`;}
function getEpisodeSeenStore(){return readJSONKey('svx_ep_seen',{});}
function isEpisodeSeen(tvId,season,episode){return !!getEpisodeSeenStore()[epSeenKey(tvId,season,episode)];}
function setEpisodeSeen(tvId,season,episode,seen=true){
  const st=getEpisodeSeenStore(),key=epSeenKey(tvId,season,episode);
  if(seen)st[key]={ts:Date.now()};else delete st[key];
  writeJSONKey('svx_ep_seen',st);
}
function areAllEpisodesSeen(tvId,season,episodes){
  const valid=(episodes||[]).filter(ep=>ep?.episode_number);
  return valid.length>0&&valid.every(ep=>isEpisodeSeen(tvId,season,ep.episode_number));
}
function setSeasonSeen(tvId,season,episodes,seen=true){
  const st=getEpisodeSeenStore();
  (episodes||[]).forEach(ep=>{
    const num=ep?.episode_number;if(!num)return;
    const key=epSeenKey(tvId,season,num);
    if(seen)st[key]={ts:Date.now()};else delete st[key];
  });
  writeJSONKey('svx_ep_seen',st);
  showToast(seen?`Stagione ${season} segnata come vista`:`Stagione ${season} segnata come non vista`);
}
async function setSeriesSeen(tvId,seasons,seen=true){
  const st=getEpisodeSeenStore();let total=0;
  for(const s of seasons||[]){
    try{
      const data=await tmdb(`/tv/${tvId}/season/${s.season_number}`);
      (data.episodes||[]).forEach(ep=>{
        const num=ep?.episode_number;if(!num)return;
        const key=epSeenKey(tvId,s.season_number,num);
        if(seen)st[key]={ts:Date.now()};else delete st[key];
        total++;
      });
    }catch(e){}
  }
  writeJSONKey('svx_ep_seen',st);
  showToast(seen?`Serie segnata come vista (${total} episodi)`:`Serie segnata come non vista`);
}
function isSeriesProbablySeen(tvId,seasons){
  const st=getEpisodeSeenStore();
  const valid=(seasons||[]).filter(s=>s.season_number>0&&s.episode_count>0);
  return valid.length>0&&valid.every(s=>{
    let count=0;
    Object.keys(st).forEach(k=>{if(k.startsWith(`${tvId}_s${s.season_number}_e`))count++;});
    return count>=s.episode_count;
  });
}
function resetPlayerAutoClock(){
  playerHasRealProgress=false;
  playerLastAutoSecs=0;
  playerLastAutoSaveAt=0;
}
function requestPlayerRealProgress(){
  const fr=document.getElementById('vix-frame');
  try{
    fr?.contentWindow?.postMessage({type:'STREAMGN_GET_CURRENT_TIME',event:'getCurrentTime'},'*');
    fr?.contentWindow?.postMessage('getCurrentTime','*');
  }catch(e){}
  return null;
}
function persistEstimatedProgress(){return requestPlayerRealProgress();}
function startPlayerAutoSave(){
  stopPlayerAutoSave(false);resetPlayerAutoClock();
  playerAutoSaveTimer=setInterval(()=>requestPlayerRealProgress(),10000);
}
function stopPlayerAutoSave(saveFirst=true){
  if(saveFirst)requestPlayerRealProgress();
  if(playerAutoSaveTimer){clearInterval(playerAutoSaveTimer);playerAutoSaveTimer=null;}
}
function parseTimeInput(s){if(!s)return 0;s=String(s).trim();const pts=s.split(':').map(p=>parseInt(p)||0);if(pts.length===3)return pts[0]*3600+pts[1]*60+pts[2];if(pts.length===2)return pts[0]*60+pts[1];const n=parseInt(s);return isNaN(n)?0:n*60;}
function refreshNoteBar(id,type,season,episode){
  const prog=getProgress(id,type,season,episode),rr=document.getElementById('pm-note-resume-row'),sep=document.getElementById('pm-note-sep'),disp=document.getElementById('pm-note-saved-display'),inp=document.getElementById('pm-note-inp');
  if(prog&&prog.text){disp.textContent=prog.text;rr.style.display='flex';sep.style.display='block';inp.value=prog.text;}
  else{rr.style.display='none';sep.style.display='none';inp.value='';}
}
document.getElementById('btn-note-save').addEventListener('click',function(){
  const text=document.getElementById('pm-note-inp').value.trim();if(!text||!playerProgId)return;
  const secs=parseTimeInput(text);saveProgressNote(playerProgId,playerProgType,playerProgSeason,playerProgEpisode,text,secs);resetPlayerAutoClock(secs);
  playerNoteSavedThisSession=true;refreshNoteBar(playerProgId,playerProgType,playerProgSeason,playerProgEpisode);
  this.textContent='✓ Salvato';this.classList.add('ok');showToast('Minutaggio salvato 📍');
  setTimeout(()=>{this.textContent='Salva';this.classList.remove('ok');},2000);
});
document.getElementById('pm-note-inp').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('btn-note-save').click();});
document.getElementById('btn-note-resume').addEventListener('click',function(){
  if(!playerProgId)return;const prog=getProgress(playerProgId,playerProgType,playerProgSeason,playerProgEpisode);
  if(!prog||!prog.secs){showToast('Nessun minutaggio salvato');return;}
  const tc=document.getElementById('tv-ctrl');
  const s=document.getElementById('s-sel').value||1,ep=document.getElementById('e-sel').value||1;
  if(tc.style.display!=='none')setPlayerFrameSrc(playerProgId,'tv',s,ep,currentSrc,prog.secs);
  else setPlayerFrameSrc(playerProgId,'movie',null,null,currentSrc,prog.secs);
  resetPlayerAutoClock(prog.secs);
  showToast(`Ripreso dal minuto ${prog.text} 📍`);
});
function trustedPlayerOrigin(origin){
  try{
    const host=new URL(origin).hostname;
    return host==='vixsrc.to'||host.endsWith('.vixsrc.to')||host==='vidsrc.me'||host.endsWith('.vidsrc.me')||host==='vidsrc.xyz'||host.endsWith('.vidsrc.xyz')||host==='embed.su'||host.endsWith('.embed.su')||host==='animeworld.ac'||host.endsWith('.animeworld.ac');
  }catch(e){return false;}
}
function parsePlayerPayload(data){
  let payload=data;
  if(typeof payload==='string'){try{payload=JSON.parse(payload);}catch(e){return null;}}
  if(!payload||typeof payload!=='object')return null;
  if(payload.type==='PLAYER_EVENT')payload=payload.data||payload.event||payload;
  if(payload.detail&&typeof payload.detail==='object')payload={...payload,...payload.detail};
  if(payload.data&&typeof payload.data==='object')payload={...payload,...payload.data};
  if(payload.player&&typeof payload.player==='object')payload={...payload,...payload.player};
  if(payload.event||payload.currentTime!=null||payload.time!=null||payload.seconds!=null||payload.position!=null||payload.duration!=null)return payload;
  return null;
}
function handleAutoProgress(payload){
  if(!playerProgId||!payload)return;
  const eventName=String(payload.event||payload.name||payload.type||'').toLowerCase();
  const secs=Number(payload.currentTime??payload.time??payload.seconds??payload.current??payload.position??payload.playedSeconds??0);
  const duration=Number(payload.duration??payload.totalDuration??payload.total??0);
  const now=Date.now();
  if(!secs&&eventName!=='ended')return;
  const completed=eventName==='ended'||eventName==='complete'||(duration&&secs/duration>=.92);
  if(completed){
    clearProgressAuto(playerProgId,playerProgType,playerProgSeason,playerProgEpisode);
    stopPlayerAutoSave(false);playerLastAutoSecs=0;
    playerNoteSavedThisSession=true;
    if(playerProgType==='tv'){
      const nextEp=Number(playerProgEpisode||document.getElementById('e-sel').value||1)+1;
      saveWatching(playerProgId,'tv',playerSessionTitle,playerSessionPoster,playerProgSeason||document.getElementById('s-sel').value||1,nextEp);
      const nb=document.getElementById('btn-next-ep');if(nb){nb.classList.add('next-ready');showToast('Episodio completato — pronto il successivo ▶');}
    }else removeWatching(playerProgId);
    refreshNoteBar(playerProgId,playerProgType,playerProgSeason,playerProgEpisode);refreshCW();
    return;
  }
  if(now-playerLastAutoSaveAt<2500&&Math.abs(secs-playerLastAutoSecs)<4)return;
  const saved=saveProgressAuto(playerProgId,playerProgType,playerProgSeason,playerProgEpisode,secs,duration,'real');
  if(!saved)return;
  resetPlayerAutoClock(secs);
  playerHasRealProgress=true;
  playerLastAutoSaveAt=now;playerLastAutoSecs=secs;playerNoteSavedThisSession=true;
  saveWatching(playerProgId,playerProgType,playerSessionTitle,playerSessionPoster,playerProgSeason,playerProgEpisode);
  recordHistory(playerProgId,playerProgType,playerSessionTitle,playerSessionPoster,playerProgSeason,playerProgEpisode,secs,'real');
  refreshNoteBar(playerProgId,playerProgType,playerProgSeason,playerProgEpisode);refreshCW();
}
window.addEventListener('message',function(e){if(!trustedPlayerOrigin(e.origin))return;handleAutoProgress(parsePlayerPayload(e.data));});
function showReminderOverlay(){const ov=document.getElementById('pm-reminder-ov'),inp=document.getElementById('pm-reminder-inp');inp.value=document.getElementById('pm-note-inp').value.trim();ov.classList.add('open');setTimeout(()=>inp.focus(),80);}
function hideReminderOverlay(){document.getElementById('pm-reminder-ov').classList.remove('open');}
document.getElementById('btn-reminder-save').addEventListener('click',function(){
  const text=document.getElementById('pm-reminder-inp').value.trim();if(!text||!playerProgId){showToast('Inserisci il minutaggio');return;}
  const secs=parseTimeInput(text);saveProgressNote(playerProgId,playerProgType,playerProgSeason,playerProgEpisode,text,secs);resetPlayerAutoClock(secs);
  playerNoteSavedThisSession=true;hideReminderOverlay();showToast('Salvato! 📍');doClosePlayer();
});
document.getElementById('btn-reminder-exit').addEventListener('click',function(){hideReminderOverlay();doClosePlayer();});

/* FOLDERS */
function getFolders(){const saved=readJSONKey('svx_f',{});const out={};DEF_FOLDERS.forEach(d=>{out[d.id]={...d,items:saved[d.id]?.items||[],_def:true};});Object.entries(saved).forEach(([id,f])=>{if(!out[id])out[id]={...f,id};});return out;}
function saveFolders(folders){const s={};Object.entries(folders).forEach(([id,f])=>{s[id]={items:f.items||[]};if(!f._def){s[id].name=f.name;s[id].g=f.g;s[id].mt=f.mt;s[id].an=f.an;if(f._imported)s[id]._imported=true;}});writeJSONKey('svx_f',s);}
function addToFolder(fid,item){const f=getFolders();if(!f[fid]){showToast('Cartella non trovata');return;}const sid=String(item.id);if(!f[fid].items.find(x=>x.id===sid))f[fid].items.unshift({id:sid,type:item.type,title:item.title,poster:item.poster||'',isAnime:item.isAnime||false,addedAt:Date.now()});saveFolders(f);}
function removeFromFolder(fid,itemId){const f=getFolders();if(!f[fid])return;f[fid].items=f[fid].items.filter(x=>x.id!==String(itemId));saveFolders(f);}
function isInAnyFolder(itemId){return Object.values(getFolders()).some(f=>f.items.find(x=>x.id===String(itemId)));}
function getFoldersContaining(itemId){return Object.values(getFolders()).filter(f=>f.items.find(x=>x.id===String(itemId)));}
function updateBookmarkIcons(itemId){document.querySelectorAll(`[data-bm-id="${itemId}"]`).forEach(el=>el.classList.toggle('saved',isInAnyFolder(itemId)));}
function autoAddToWatching(item){const fid=item.type==='movie'?'film_watch':'serie_watch';const f=getFolders();const sid=String(item.id);if(f[fid]&&!f[fid].items.find(x=>x.id===sid)){addToFolder(fid,item);if(document.querySelector('#page-liste.active'))renderListePage();}}
function getTargetFolderId(cat,sub,item){const m=item.type==='movie';if(cat==='lista')return m?'film_lista':'serie_lista';if(cat==='watching')return m?'film_watch':'serie_watch';if(cat==='visti'){if(m)return'film_visti';return sub==='c'?'serie_vc':'serie_vo';}return null;}
function getCustomFolders(){return Object.values(getFolders()).filter(f=>!f._def&&!f._imported&&f.g==='custom');}
function createCustomList(){
  const name=(prompt('Nome nuova lista','')||'').trim();
  if(!name)return;
  const folders=getFolders(),id='custom_'+Date.now();
  folders[id]={id,name,g:'custom',mt:'mixed',an:false,items:[]};
  saveFolders(folders);renderListePage();showToast(`Lista "${name}" creata`);
}

function historyKey(id,type,season,episode){return type==='movie'?`${type}_${id}`:`${type}_${id}_s${season||1}_e${episode||1}`;}
function recordHistory(id,type,title,poster,season,episode,secs=0,confidence='open'){
  if(!id)return;
  const hist=readJSONKey('svx_hist',{});
  const key=historyKey(id,type,season,episode);
  hist[key]={id:String(id),type,title:title||'',poster:poster||'',season:season||null,episode:episode||null,secs:Math.floor(Number(secs)||0),confidence,ts:Date.now(),isAnime:!!currentIsAnime};
  const entries=Object.entries(hist).sort((a,b)=>(b[1].ts||0)-(a[1].ts||0));
  writeJSONKey('svx_hist',Object.fromEntries(entries.slice(0,260)));
}

function downloadJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
function readAppData(){return{folders:readJSONKey('svx_f',{}),watching:readJSONKey('svx_w',{}),progress:readJSONKey('svx_prog',{}),ratings:readJSONKey('svx_r',{}),searchHistory:readJSONKey('svx_sh',[]),settings:loadSettings(),notifications:readJSONKey('svx_notif',{items:[],snapshots:{},lastCheck:0}),sportPresets:readJSONKey('svx_sport_presets',null),sourcePrefs:readJSONKey('svx_src_pref',{}),episodeSeen:readJSONKey('svx_ep_seen',{}),history:readJSONKey('svx_hist',{})};}
function writeAppData(data){if(!data)return;writeJSONKey('svx_f',data.folders||{});writeJSONKey('svx_w',data.watching||{});writeJSONKey('svx_prog',data.progress||{});writeJSONKey('svx_r',data.ratings||{});writeJSONKey('svx_sh',data.searchHistory||[]);writeJSONKey('svx_notif',data.notifications||{items:[],snapshots:{},lastCheck:0});if(data.settings)writeJSONKey('svx_s',data.settings);if(data.sportPresets)writeJSONKey('svx_sport_presets',data.sportPresets);if(data.sourcePrefs)writeJSONKey('svx_src_pref',data.sourcePrefs);if(data.episodeSeen)writeJSONKey('svx_ep_seen',data.episodeSeen);if(data.history)writeJSONKey('svx_hist',data.history);}
function doFullBackup(){const data={version:3,kind:'streamgn_full_backup',exportedAt:new Date().toISOString(),data:readAppData()};downloadJSON(data,`streamgn-backup-${new Date().toISOString().slice(0,10)}.json`);showToast('Backup completo esportato ✓');}
function restoreFullBackup(data){if(data.kind!=='streamgn_full_backup'){showToast('Backup non valido');return;}openConfirm('Importare il <b>backup completo</b>?<br>Verranno ripristinati liste, progressi e impostazioni presenti nel file.',function(){const payload=data.data||data.profiles?.[0]?.data;if(!payload){showToast('Backup vuoto');return;}writeAppData(payload);refreshAfterStorageHydrated();showToast('Backup importato ✓',3000);});}

/* EXPORT */
function openExportModal(){
  const folders=getFolders(),el=document.getElementById('exp-list-chk');el.innerHTML='';
  [{id:'lista',label:'📋 In lista'},{id:'visti',label:'✅ Visti'},{id:'watching',label:'👁️ Guardando'}].forEach(g=>{
    const items=DEF_FOLDERS.filter(d=>d.g===g.id).map(d=>folders[d.id]).filter(Boolean);if(!items.length)return;
    const hdr=document.createElement('div');hdr.className='exp-sel-group-lbl';hdr.textContent=g.label;el.appendChild(hdr);
    items.forEach(folder=>{const cnt=(folder.items||[]).length;const row=document.createElement('label');row.className='exp-chk-row';row.innerHTML=`<input type="checkbox" class="exp-chk" data-fid="${folder.id}" ${cnt>0?'checked':''} ${cnt===0?'disabled':''}><span class="exp-chk-label">${folder.name||folder.id}</span><span class="exp-chk-count">${cnt}</span>`;el.appendChild(row);});
  });
  const custom=[...getCustomFolders(),...Object.values(folders).filter(f=>!f._def&&f._imported)];
  if(custom.length){
    const hdr=document.createElement('div');hdr.className='exp-sel-group-lbl';hdr.textContent='⭐ Liste extra';el.appendChild(hdr);
    custom.forEach(folder=>{const cnt=(folder.items||[]).length;const row=document.createElement('label');row.className='exp-chk-row';row.innerHTML=`<input type="checkbox" class="exp-chk" data-fid="${folder.id}" ${cnt>0?'checked':''} ${cnt===0?'disabled':''}><span class="exp-chk-label">${folder.name||folder.id}</span><span class="exp-chk-count">${cnt}</span>`;el.appendChild(row);});
  }
  document.getElementById('export-sel-modal').classList.add('open');
}
function closeExportModal(){smoothClose(document.getElementById('export-sel-modal'),150);}
function doExport(){
  const sids=Array.from(document.querySelectorAll('.exp-chk:checked')).map(c=>c.dataset.fid);if(!sids.length){showToast('Seleziona almeno una lista');return;}
  const af=getFolders(),ef={};sids.forEach(fid=>{if(af[fid])ef[fid]=af[fid];});
  const si=new Set();Object.values(ef).forEach(f=>(f.items||[]).forEach(it=>si.add(it.id)));
  const aw=getWatching(),ew={};Object.entries(aw).forEach(([id,w])=>{if(si.has(id))ew[id]=w;});
  const ar=readJSONKey('svx_r',{}),er={};si.forEach(id=>{if(ar[id])er[id]=ar[id];});
  const ap=getProgressStore(),ep={};Object.entries(ap).forEach(([k,v])=>{if([...si].some(id=>k.includes(`_${id}_`)))ep[k]=v;});
  const data={version:1,exportedAt:new Date().toISOString(),selectedFolders:sids,folders:ef,watching:ew,progress:ep,ratings:er};
  downloadJSON(data,`streamgn-liste-${new Date().toISOString().slice(0,10)}.json`);
  closeExportModal();showToast(`Esportate ${sids.length} list${sids.length===1?'a':'e'} ✓`);
}
document.getElementById('btn-export-lists').addEventListener('click',openExportModal);
document.getElementById('btn-backup-all').addEventListener('click',doFullBackup);
document.getElementById('exp-modal-cancel').addEventListener('click',closeExportModal);
document.getElementById('export-sel-modal').addEventListener('click',e=>{if(e.target===document.getElementById('export-sel-modal'))closeExportModal();});
document.getElementById('exp-modal-ok').addEventListener('click',doExport);
document.getElementById('exp-sel-all').addEventListener('click',()=>document.querySelectorAll('.exp-chk:not(:disabled)').forEach(c=>c.checked=true));
document.getElementById('exp-sel-none').addEventListener('click',()=>document.querySelectorAll('.exp-chk:not(:disabled)').forEach(c=>c.checked=false));

/* IMPORT */
let _importData=null;
function closeImportModal(){smoothClose(document.getElementById('import-modal'),150,()=>{_importData=null;});}
function guessImportTarget(folder){
  if(folder.id&&DEF_FOLDERS.some(d=>d.id===folder.id))return folder.id;
  const g=folder.g||null,mt=folder.mt||null,an=folder.an!=null?!!folder.an:null,sub=folder.sub||null;
  if(g&&mt!==null&&an!==null){const m=DEF_FOLDERS.find(d=>{if(d.g!==g)return false;if(d.mt!==mt)return false;if(!!d.an!==an)return false;if(sub&&d.sub)return d.sub===sub;if(!sub&&d.sub)return false;return true;});if(m)return m.id;}
  const nrm=s=>(s||'').toLowerCase().replace(/[^a-z0-9àèéìòù\s]/g,'').replace(/\s+/g,' ').trim();
  const src=nrm(folder.name||folder.id||'');
  const syns=[{ids:['film_watch'],words:['film','guard']},{ids:['serie_watch'],words:['serie','guard']},{ids:['film_lista'],words:['film','lista']},{ids:['serie_lista'],words:['serie','lista']},{ids:['film_visti'],words:['film','vist']},{ids:['serie_vc'],words:['serie','conclus']},{ids:['serie_vo'],words:['serie','vist','corso']}];
  let best=null,bs=0;syns.forEach(e=>{const s=e.words.filter(w=>src.includes(w)).length;if(s>bs){bs=s;best=e.ids[0];}});
  return bs>=2?best:null;
}
function openImportModal(data){
  _importData=data;const listEl=document.getElementById('imp-folder-list');listEl.innerHTML='';
  const iF=Object.values(data.folders||{});if(!iF.length){showToast('Nessuna lista nel file');return;}
  const defOpts=DEF_FOLDERS.map(d=>`<option value="${d.id}">${d.name}</option>`).join('');
  iF.forEach((folder,idx)=>{
    const cnt=(folder.items||[]).length,sn=ea(folder.name||folder.id||'Lista'),rowId=`imp-row-${idx}`;
    const gid=guessImportTarget(folder),am=gid?'existing':'new',gn=gid?DEF_FOLDERS.find(d=>d.id===gid)?.name||'':'';
    const row=document.createElement('div');row.className='imp-row';row.dataset.fid=folder.id||('imported_'+idx);
    row.innerHTML=`<div class="imp-row-head"><span class="imp-row-name">${sn}</span><span class="imp-row-count">${cnt}</span></div>
      ${gid?`<div class="imp-auto-match">✓ Riconosciuta come <b>${gn}</b></div>`:''}
      <div class="imp-dest-toggle" data-row="${rowId}"><button class="imp-dest-btn${am==='existing'?' active':''}" data-mode="existing">Lista esistente</button><button class="imp-dest-btn${am==='new'?' active':''}" data-mode="new">Nuova cartella</button></div>
      <div class="imp-dest-sel${am==='existing'?' visible':''}" id="${rowId}-existing"><span class="imp-dest-label">Aggiungi a</span><select class="gsel" id="${rowId}-sel" style="width:100%">${defOpts}</select></div>
      <div class="imp-dest-sel${am==='new'?' visible':''}" id="${rowId}-new"><span class="imp-dest-label">Nome nuova cartella</span><input class="imp-new-name" id="${rowId}-name" placeholder="Nome cartella…" maxlength="48" value="${sn}"></div>`;
    if(gid){const sel=row.querySelector(`#${rowId}-sel`);if(sel)sel.value=gid;}
    row.querySelector('.imp-dest-toggle').addEventListener('click',function(e){const btn=e.target.closest('.imp-dest-btn[data-mode]');if(!btn)return;const mode=btn.dataset.mode;this.querySelectorAll('.imp-dest-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));row.querySelector(`#${rowId}-existing`).classList.toggle('visible',mode==='existing');row.querySelector(`#${rowId}-new`).classList.toggle('visible',mode==='new');});
    listEl.appendChild(row);
  });
  document.getElementById('import-modal').classList.add('open');
}
function doImport(){
  if(!_importData)return;const rows=document.querySelectorAll('#imp-folder-list .imp-row');const iF=_importData.folders||{},existing=getFolders();let total=0;
  rows.forEach((row,idx)=>{const tog=row.querySelector('.imp-dest-toggle'),am=tog.querySelector('.imp-dest-btn.active').dataset.mode;const rowId=`imp-row-${idx}`,sfid=Object.keys(iF)[idx],sf=iF[sfid];if(!sf)return;const items=sf.items||[];
    if(am==='existing'){const dfid=row.querySelector(`#${rowId}-sel`).value;if(!existing[dfid])return;const eids=new Set(existing[dfid].items.map(x=>x.id));items.forEach(item=>{if(!eids.has(item.id)){existing[dfid].items.push(item);eids.add(item.id);total++;}});}
    else{const name=(row.querySelector(`#${rowId}-name`).value||'').trim()||(sf.name||'Importata');const nid='imp_'+Date.now()+'_'+idx;existing[nid]={id:nid,name,g:'custom',mt:'',an:false,items:[],_imported:true};const eids=new Set();items.forEach(item=>{if(!eids.has(item.id)){existing[nid].items.push(item);eids.add(item.id);total++;}});}
  });
  saveFolders(existing);
  if(_importData.watching){const w=getWatching();Object.assign(w,_importData.watching);writeJSONKey('svx_w',w);}
  if(_importData.progress){const p=getProgressStore();Object.assign(p,_importData.progress);saveProgressStore(p);}
  if(_importData.ratings){const r=readJSONKey('svx_r',{});Object.assign(r,_importData.ratings);writeJSONKey('svx_r',r);}
  closeImportModal();renderListePage();refreshCW();showToast(`${total} element${total===1?'o':'i'} importat${total===1?'o':'i'} ✓`,3000);
}
function importLists(file){const r=new FileReader();r.onload=e=>{try{const d=JSON.parse(e.target.result);if(d.kind==='streamgn_full_backup'){restoreFullBackup(d);return;}if(!d.version||!d.folders){showToast('File non valido');return;}openImportModal(d);}catch(err){showToast('Errore nella lettura del file');}};r.readAsText(file);}
document.getElementById('btn-import-lists').addEventListener('click',()=>document.getElementById('import-file-input').click());
document.getElementById('import-file-input').addEventListener('change',function(){if(this.files[0]){importLists(this.files[0]);this.value='';}});
document.getElementById('imp-cancel').addEventListener('click',closeImportModal);
document.getElementById('imp-ok').addEventListener('click',doImport);
document.getElementById('import-modal').addEventListener('click',e=>{if(e.target===document.getElementById('import-modal'))closeImportModal();});

/* EMBED URLS */
function addResumeParams(params,startSecs){if(startSecs&&startSecs>10){const v=Math.round(startSecs);params.push(`startAt=${v}`);params.push(`t=${v}`);}}
function isAnimeSource(src){return currentIsAnime||src==='anime'||src==='animeworld';}
function isPlayablePlayerUrl(url,anime=false){
  url=String(url||'').trim();
  if(!url||url==='about:blank')return false;
  if(/^data:|^blob:/i.test(url))return true;
  try{
    const u=new URL(url,location.href);
    const host=u.hostname.toLowerCase(),path=u.pathname.toLowerCase();
    if(anime&&host.includes('animeworld.')&&!/\.(m3u8|mp4|webm|mov)(\?|$)/i.test(path))return false;
    return /^https?:$/i.test(u.protocol);
  }catch(e){return false;}
}
function setFrameMessage(frame,title,body,actionUrl=''){
  const link=actionUrl?`<a href="${ea(actionUrl)}" target="_blank" rel="noopener" style="display:inline-flex;margin-top:18px;padding:10px 14px;border-radius:999px;background:#fff;color:#000;text-decoration:none;font:700 13px -apple-system,BlinkMacSystemFont,sans-serif">Apri ricerca</a>`:'';
  frame.removeAttribute('src');
  frame.srcdoc=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:#050505;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.wrap{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:28px;box-sizing:border-box}.box{max-width:520px}.title{font-size:20px;font-weight:800;margin-bottom:10px}.body{font-size:14px;line-height:1.45;color:rgba(255,255,255,.68)}</style></head><body><div class="wrap"><div class="box"><div class="title">${ea(title)}</div><div class="body">${ea(body)}</div>${link}</div></div></body></html>`;
}
function getEmbedUrl(id,type,season,episode,src,startSecs){
  const s=season||1,e=episode||1;
  if(src==='anime'||src==='animeworld'){
    return window.StreamGNProviders?.getAnimeFallbackUrl?.({id,type,season:s,episode:e,title:playerSessionTitle,titles:playerSessionAnimeTitles})||'about:blank';
  }
  if(src==='vixsrc-it'){
    const url=type==='tv'?`https://vixsrc.to/tv/${id}/${s}/${e}`:`https://vixsrc.to/movie/${id}`;
    const params=['hl=it','sl=it'];
    addResumeParams(params,startSecs);
    return url+'?'+params.join('&');
  }
  if(src==='vidsrc')return type==='tv'?`https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`:`https://vidsrc.me/embed/movie?tmdb=${id}`;
  if(src==='embed')return type==='tv'?`https://embed.su/embed/tv/${id}/${s}/${e}`:`https://embed.su/embed/movie/${id}`;
  let url=type==='tv'?`https://vixsrc.to/tv/${id}/${s}/${e}`:`https://vixsrc.to/movie/${id}`;
  const cfg=loadSettings(),lang=cfg.lang||'it',subs=cfg.subs||'none',params=[];
  if(lang&&lang!=='original')params.push(`hl=${lang}`);if(subs&&subs!=='none')params.push(`sl=${subs}`);addResumeParams(params,startSecs);
  return params.length?url+'?'+params.join('&'):url;
}
async function resolveStreamResult(id,type,season,episode,src,startSecs){
  const s=season||1,e=episode||1,fallback=getEmbedUrl(id,type,s,e,src,startSecs),providers=window.StreamGNProviders;
  if(!providers)return {ok:!!fallback,embedUrl:fallback};
  const payload={id:String(id),tmdbId:String(id),type,season:s,episode:e,title:playerSessionTitle,titles:playerSessionAnimeTitles,poster:playerSessionPoster,provider:src,source:src,startSecs,settings:loadSettings(),fallbackUrl:fallback};
  try{
    const result=isAnimeSource(src)
      ? await providers.getAnimeStream(payload)
      : type==='tv'
        ? await providers.getSeriesStream(payload)
        : await providers.getMovieStream(payload);
    return result||{ok:!!fallback,embedUrl:fallback};
  }catch(e){return {ok:!!fallback,embedUrl:fallback,error:'stream resolve failed'};}
}
async function resolveStreamUrl(id,type,season,episode,src,startSecs){
  const result=await resolveStreamResult(id,type,season,episode,src,startSecs);
  return result?.embedUrl||result?.iframeUrl||result?.url||'';
}
async function setPlayerFrameSrc(id,type,season,episode,src,startSecs){
  const fr=document.getElementById('vix-frame');if(!fr)return;
  const seq=++playerStreamSeq,fallback=getEmbedUrl(id,type,season,episode,src,startSecs),providers=window.StreamGNProviders,anime=isAnimeSource(src);
  if(anime)setFrameMessage(fr,'Caricamento anime','Sto cercando una sorgente italiana valida per questo episodio.');
  else{fr.removeAttribute('srcdoc');fr.src=providers?.hasBackend?.()?'about:blank':fallback;}
  const result=await resolveStreamResult(id,type,season,episode,src,startSecs);
  if(seq!==playerStreamSeq||String(currentTvId)!==String(id))return;
  const url=result?.embedUrl||result?.iframeUrl||result?.url||fallback;
  if(anime&&(!result?.ok||!isPlayablePlayerUrl(url,true))){
    const searchUrl=providers?.animeSearchUrl?.(playerSessionAnimeTitles[0]||playerSessionTitle)||'';
    setFrameMessage(fr,'Sorgente anime non disponibile','Serve il provider AnimeWorld-API/Tadako online per aprire direttamente questo episodio. Il sito non carica piu pagine AnimeWorld bloccate nell iframe.',searchUrl);
    return;
  }
  fr.removeAttribute('srcdoc');
  fr.src=url||fallback;
}

/* TRAILERS */
async function getTrailer(id,type,season){
  try{if(type==='tv'&&season){const sd=await tmdb(`/tv/${id}/season/${season}/videos`);const sv=(sd.results||[]).filter(v=>v.site==='YouTube');if(sv.length)return sv[0].key;}const data=await tmdb(`/${type}/${id}/videos`);const trailers=(data.results||[]).filter(v=>v.site==='YouTube'&&(v.type==='Trailer'||v.type==='Teaser'));const all=(data.results||[]).filter(v=>v.site==='YouTube');const pick=trailers[0]||all[0];return pick?pick.key:null;}catch(e){return null;}
}
function showTrailerEmbed(ytKey){if(!ytKey){showToast('Nessun trailer disponibile');return;}const box=document.getElementById('dm-trailer-box'),frame=document.getElementById('dm-trailer-frame');frame.src=`https://www.youtube.com/embed/${ytKey}?autoplay=1&rel=0&modestbranding=1`;box.classList.add('active');}
function hideTrailer(){const box=document.getElementById('dm-trailer-box'),frame=document.getElementById('dm-trailer-frame');box.classList.remove('active');frame.src='';}
document.getElementById('dm-trailer-close').addEventListener('click',hideTrailer);

/* FILTERS */
function buildFilters(containerId,genres,page){const el=document.getElementById(containerId);if(!el)return;el.innerHTML=genres.map(g=>`<button class="fchip${activeFilterGenre[page]===g.id?' active':''}" data-fid="${g.id||''}" data-page="${page}">${g.name}</button>`).join('');}
document.addEventListener('click',e=>{
  const chip=e.target.closest('.fchip[data-page]');if(!chip)return;
  const page=chip.dataset.page,fid=chip.dataset.fid===''?null:Number(chip.dataset.fid);
  activeFilterGenre[page]=fid;document.querySelectorAll(`.fchip[data-page="${page}"]`).forEach(c=>c.classList.toggle('active',c.dataset.fid===(fid===null?'':String(fid))));filterPage(page,fid);
});
function filterPage(page,genreId){
  const el=document.getElementById(page+'-secs');if(!el)return;
  if(genreId){el.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';const path=page==='serie'?'/discover/tv':'/discover/movie';const params={with_genres:genreId,sort_by:'popularity.desc'};if(page==='serie')params.watch_region='IT';tmdb(path,params).then(d=>{el.innerHTML='';const label=(page==='serie'?TV_GENRES:MV_GENRES).find(g=>g.id===genreId)?.name||'';if(d.results?.length){addSec(el,`Migliori — ${label}`,d.results.map(x=>({...x,media_type:page==='serie'?'tv':'movie'})),null,'');d.results.forEach(x=>{if(x.poster_path)randomPools[page].push({...x,media_type:page==='serie'?'tv':'movie'});});}else el.innerHTML='<div class="empty">Nessun risultato.</div>';}).catch(()=>{el.innerHTML='<div class="err">Errore.</div>';});}
  else{loaded[page]=false;if(page==='serie')loadSerie();else loadFilm();}
}

function collectPersonalItems(){const seen=new Set(),items=[];Object.values(getWatching()).forEach(i=>{if(i?.id&&!seen.has(i.id)){seen.add(i.id);items.push(i);}});Object.values(getFolders()).forEach(f=>(f.items||[]).forEach(i=>{if(i?.id&&!seen.has(i.id)){seen.add(i.id);items.push(i);}}));return items.slice(0,18);}
async function addForYouSection(container){
  const items=collectPersonalItems();if(!items.length)return;
  const genreScore={},typeScore={movie:0,tv:0},seen=new Set(items.map(i=>String(i.id)));
  const sample=items.slice(0,8);
  const infos=await Promise.all(sample.map(async item=>{try{const type=item.type==='tv'?'tv':'movie',info=await tmdb(`/${type}/${item.id}`);return{type,info};}catch(e){return null;}}));
  infos.filter(Boolean).forEach(({type,info})=>{typeScore[type]+=2;(info.genres||[]).forEach(g=>{genreScore[g.id]=(genreScore[g.id]||0)+1;});});
  const genreId=Object.entries(genreScore).sort((a,b)=>b[1]-a[1])[0]?.[0];if(!genreId)return;
  const genreName=[...MV_GENRES,...TV_GENRES].find(g=>String(g.id)===String(genreId))?.name||'generi simili';
  const type=typeScore.tv>typeScore.movie?'tv':'movie',path=type==='tv'?'/discover/tv':'/discover/movie';
  try{const d=await tmdb(path,{with_genres:genreId,sort_by:'popularity.desc',watch_region:'IT'});const rec=(d.results||[]).filter(x=>x.poster_path&&!seen.has(String(x.id))).slice(0,18).map(x=>({...x,media_type:type,_reason:`Perche guardi ${genreName}`}));if(rec.length)addSec(container,'Per te',rec,null,'smart');}catch(e){}
}

/* HOME */
async function loadHome(){
  if(loaded.home)return;loaded.home=true;
  const hw=document.getElementById('hero-wrap'),hs=document.getElementById('home-secs');
  hw.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';hs.innerHTML='';
  try{
    const [tr,top10]=await Promise.all([tmdb('/trending/all/week'),tmdb('/trending/all/day',{region:'IT'})]);
    heroItems=tr.results.filter(x=>x.backdrop_path);renderHero(0);
    const cw=getAllWatching();if(cw.length)renderCW(hs,cw);
    await addForYouSection(hs);
    addSecTop10(hs,'Top 10 in Italia oggi',top10.results.slice(0,10));
    addSec(hs,'In tendenza questa settimana',tr.results,null,'');
    for(const p of PROVIDERS){tmdb('/discover/movie',{with_watch_providers:p.id,watch_region:'IT',sort_by:'popularity.desc'}).then(d=>{if(d.results?.length)addSec(hs,p.name,d.results.map(x=>({...x,media_type:'movie'})),p.c,'');}).catch(()=>{});}
    for(const g of MV_GENRES.filter(g=>g.id)){tmdb('/discover/movie',{with_genres:g.id,sort_by:'popularity.desc'}).then(d=>{if(d.results?.length)addSec(hs,g.name,d.results.map(x=>({...x,media_type:'movie'})),null,'genre');}).catch(()=>{});}
  }catch(e){hw.innerHTML='<div class="err">Errore nel caricamento.</div>';}
}

function hLabel(mins){mins=Math.max(0,Math.round(Number(mins)||0));const h=Math.floor(mins/60),m=mins%60;return h?`${h}h${m?` ${m}m`:''}`:`${m}m`;}
function profileGenreNames(scores){return Object.entries(scores).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>({name,count}));}
function profileRecentItems(limit=18){
  return Object.values(readJSONKey('svx_hist',{})).filter(x=>x.poster).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,limit).map(x=>({id:x.id,title:x.title,name:x.title,poster_path:x.poster,media_type:x.type,_anime:x.isAnime?1:0,_reason:x.type==='tv'&&x.season?`S${x.season}E${x.episode||1}`:'Visto di recente'}));
}
async function computeProfileStats(){
  const folders=getFolders(),hist=Object.values(readJSONKey('svx_hist',{})).filter(x=>x.confidence==='real'||x.confidence==='manual'),epSeen=getEpisodeSeenStore();
  const filmSeen=folders.film_visti?.items||[],seriesSeen=[...(folders.serie_vc?.items||[]),...(folders.serie_vo?.items||[])];
  const listed=Object.values(folders).reduce((sum,f)=>sum+(f.items||[]).length,0),watching=Object.values(getWatching()).length;
  const days=new Set(hist.map(x=>new Date(x.ts).toISOString().slice(0,10))).size;
  const genreScores={},covers=profileRecentItems(12).map(x=>x.poster_path).filter(Boolean);
  let filmMinutes=0,seriesMinutes=0,episodesSeen=Object.keys(epSeen).length;
  await Promise.all(filmSeen.slice(0,80).map(async item=>{
    try{const info=await tmdb(`/movie/${item.id}`);filmMinutes+=Number(info.runtime)||0;(info.genres||[]).forEach(g=>{genreScores[g.name]=(genreScores[g.name]||0)+2;});if(info.poster_path&&!covers.includes(info.poster_path))covers.push(info.poster_path);}catch(e){}
  }));
  await Promise.all(seriesSeen.slice(0,60).map(async item=>{
    try{const info=await tmdb(`/tv/${item.id}`);const avg=Number(info.episode_run_time?.[0])||42;seriesMinutes+=avg*(Number(info.number_of_episodes)||0);(info.genres||[]).forEach(g=>{genreScores[g.name]=(genreScores[g.name]||0)+2;});if(info.poster_path&&!covers.includes(info.poster_path))covers.push(info.poster_path);}catch(e){}
  }));
  const watchedSeriesIds=new Set(seriesSeen.map(x=>String(x.id)));
  const epByShow={};
  Object.keys(epSeen).forEach(k=>{const id=k.split('_s')[0];if(!watchedSeriesIds.has(id))epByShow[id]=(epByShow[id]||0)+1;});
  await Promise.all(Object.entries(epByShow).slice(0,60).map(async([id,count])=>{
    try{const info=await tmdb(`/tv/${id}`);const avg=Number(info.episode_run_time?.[0])||42;seriesMinutes+=avg*count;(info.genres||[]).forEach(g=>{genreScores[g.name]=(genreScores[g.name]||0)+1;});if(info.poster_path&&!covers.includes(info.poster_path))covers.push(info.poster_path);}catch(e){seriesMinutes+=42*count;}
  }));
  const precisionMinutes=hist.reduce((sum,x)=>sum+(Number(x.secs)||0)/60,0);
  return {filmMinutes,seriesMinutes,totalMinutes:filmMinutes+seriesMinutes,precisionMinutes,filmSeen:filmSeen.length,seriesSeen:seriesSeen.length,episodesSeen,listed,watching,days,genres:profileGenreNames(genreScores),covers:covers.slice(0,18),recent:profileRecentItems(24)};
}
function profileStatsHTML(stats){
  const genreHTML=stats.genres.length?stats.genres.map(g=>`<span class="profile-pill">${ea(g.name)} <b>${g.count}</b></span>`).join(''):'<span class="profile-muted">Ancora pochi dati per capire i generi preferiti.</span>';
  const recentHTML=stats.recent.length?`<div class="row profile-row">${stats.recent.map(cardHTML).join('')}</div>`:'<div class="empty">Guarda o segna qualche contenuto per creare il tuo replay.</div>';
  return `<section class="profile-hero">
    <div class="profile-hero-bg">${stats.covers.slice(0,8).map(p=>`<img src="${IMG}${p}" alt="">`).join('')}</div>
    <div class="profile-hero-grad"></div>
    <div class="profile-hero-content">
      <div class="profile-kicker">StreaMGN Replay</div>
      <h1>Il tuo profilo visione</h1>
      <p>Statistiche, gusti e contenuti recenti raccolti dalle tue liste e dai progressi salvati.</p>
      <button class="gbtn gbtn-white" id="btn-profile-share">Condividi</button>
    </div>
  </section>
  <section class="profile-section">
    <div class="premium-grid profile-grid">
      <div class="premium-stat"><b>${hLabel(stats.totalMinutes)}</b><span>visione totale</span></div>
      <div class="premium-stat"><b>${hLabel(stats.filmMinutes)}</b><span>film visti</span></div>
      <div class="premium-stat"><b>${hLabel(stats.seriesMinutes)}</b><span>serie viste</span></div>
      <div class="premium-stat"><b>${stats.episodesSeen}</b><span>episodi segnati</span></div>
      <div class="premium-stat"><b>${stats.filmSeen}</b><span>film completati</span></div>
      <div class="premium-stat"><b>${stats.seriesSeen}</b><span>serie completate</span></div>
      <div class="premium-stat"><b>${stats.listed}</b><span>contenuti in liste</span></div>
      <div class="premium-stat"><b>${stats.days}</b><span>giorni attivi</span></div>
    </div>
  </section>
  <section class="profile-section"><div class="section-head"><span class="section-name">Generi che ti descrivono</span><span class="gtag">Profilo</span></div><div class="profile-pill-row">${genreHTML}</div></section>
  <section class="profile-section"><div class="section-head"><span class="section-name">Ultime visioni</span><span class="gtag">Replay</span></div>${recentHTML}</section>`;
}
async function loadProfilo(){
  if(loaded.profilo&&profileStatsCache)return;
  loaded.profilo=true;
  const el=document.getElementById('profile-wrap');if(!el)return;
  el.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';
  try{profileStatsCache=await computeProfileStats();el.innerHTML=profileStatsHTML(profileStatsCache);document.getElementById('btn-profile-share')?.addEventListener('click',shareProfileWrapped);const row=el.querySelector('.profile-row');if(row)drag(row);}
  catch(e){el.innerHTML='<div class="err">Errore nel caricamento del profilo.</div>';}
}
function drawRoundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function loadCanvasImage(url){return new Promise(resolve=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=url;});}
function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight,maxLines=3){const words=String(text).split(/\s+/);let line='',lines=0;for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,x,y);y+=lineHeight;line=word;lines++;if(lines>=maxLines-1)break;}else line=test;}if(line)ctx.fillText(line,x,y);}
async function shareProfileWrapped(){
  const stats=profileStatsCache||await computeProfileStats(),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  canvas.width=1080;canvas.height=1350;
  const grad=ctx.createLinearGradient(0,0,1080,1350);grad.addColorStop(0,'#050505');grad.addColorStop(.44,'#101114');grad.addColorStop(1,'#0a84ff');ctx.fillStyle=grad;ctx.fillRect(0,0,1080,1350);
  const imgs=await Promise.all(stats.covers.slice(0,14).map(p=>loadCanvasImage(`${IMG_W}${p}`)));
  imgs.filter(Boolean).forEach((img,i)=>{
    const x=610+(i%4)*104,y=82+Math.floor(i/4)*166,rot=((i%2)?1:-1)*(3+i%3);
    ctx.save();ctx.translate(x+44,y+66);ctx.rotate(rot*Math.PI/180);ctx.globalAlpha=.44;drawRoundRect(ctx,-46,-68,92,138,16);ctx.clip();ctx.drawImage(img,-46,-68,92,138);ctx.restore();
  });
  const glow=ctx.createRadialGradient(860,1030,30,860,1030,520);glow.addColorStop(0,'rgba(10,132,255,.34)');glow.addColorStop(1,'rgba(10,132,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,1080,1350);
  ctx.fillStyle='rgba(255,255,255,.09)';drawRoundRect(ctx,58,58,964,1234,42);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=2;drawRoundRect(ctx,58,58,964,1234,42);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.72)';ctx.font='800 28px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';ctx.fillText('StreaMGN REPLAY',96,136);
  ctx.fillStyle='#fff';ctx.font='900 96px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';wrapCanvasText(ctx,'Il mio profilo visione',96,262,640,98,2);
  ctx.font='900 112px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';ctx.fillText(hLabel(stats.totalMinutes),96,500);
  ctx.font='800 30px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';ctx.fillStyle='rgba(255,255,255,.66)';ctx.fillText('ore e minuti totali',100,545);
  const boxes=[['Film',hLabel(stats.filmMinutes)],['Serie',hLabel(stats.seriesMinutes)],['Episodi',String(stats.episodesSeen)],['Giorni attivi',String(stats.days)]];
  boxes.forEach((b,i)=>{const x=96+(i%2)*342,y=632+Math.floor(i/2)*172;ctx.fillStyle='rgba(255,255,255,.13)';drawRoundRect(ctx,x,y,300,130,26);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.13)';ctx.lineWidth=1;drawRoundRect(ctx,x,y,300,130,26);ctx.stroke();ctx.fillStyle='#fff';ctx.font='900 44px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';ctx.fillText(b[1],x+26,y+58);ctx.fillStyle='rgba(255,255,255,.62)';ctx.font='800 24px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';ctx.fillText(b[0],x+26,y+96);});
  const genres=stats.genres.map(g=>g.name).slice(0,4);
  ctx.fillStyle='#fff';ctx.font='900 34px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';ctx.fillText('I miei generi',96,1030);
  genres.forEach((g,i)=>{const x=96+(i%2)*300,y=1070+Math.floor(i/2)*62;ctx.fillStyle='rgba(255,255,255,.14)';drawRoundRect(ctx,x,y,260,42,21);ctx.fill();ctx.fillStyle='rgba(255,255,255,.86)';ctx.font='800 22px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';ctx.fillText(g,x+20,y+28);});
  ctx.font='800 24px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';ctx.fillStyle='rgba(255,255,255,.58)';ctx.fillText('Creato con StreaMGN',96,1216);
  canvas.toBlob(async blob=>{
    if(!blob)return;
    const file=new File([blob],'streamgn-replay.jpg',{type:'image/jpeg'});
    try{if(navigator.canShare?.({files:[file]})){await navigator.share({title:'Il mio StreaMGN Replay',files:[file]});return;}}catch(e){}
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='streamgn-replay.jpg';a.click();URL.revokeObjectURL(url);showToast('Replay creato ✓');
  },'image/jpeg',.92);
}
function moodPickerHTML(){return `<div class="mood-row"><button class="mood-chip" data-mood="light">Leggero</button><button class="mood-chip" data-mood="thriller">Thriller</button><button class="mood-chip" data-mood="short">Da 20 minuti</button><button class="mood-chip" data-mood="movie">Filmone</button></div><div id="mood-results"></div>`;}
async function loadMood(mood){
  const box=document.getElementById('mood-results');if(!box)return;box.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';
  const cfg={light:['/discover/movie',{with_genres:35,sort_by:'popularity.desc'}],thriller:['/discover/movie',{with_genres:53,sort_by:'popularity.desc'}],short:['/discover/tv',{with_runtime_lte:25,sort_by:'popularity.desc'}],movie:['/discover/movie',{vote_average_gte:7.2,vote_count_gte:900,sort_by:'vote_average.desc'}]}[mood];
  try{const d=await tmdb(cfg[0],cfg[1]);const type=cfg[0].includes('/tv')?'tv':'movie';box.innerHTML=`<div class="row">${(d.results||[]).slice(0,18).map(x=>cardHTML({...x,media_type:type,_reason:'Mood picker'})).join('')}</div>`;drag(box.querySelector('.row'));}catch(e){box.innerHTML='<div class="empty">Nessun risultato.</div>';}
}

/* CW */
function renderCW(container,items){const old=document.getElementById('cw-section');if(old)old.remove();const sec=document.createElement('div');sec.className='section';sec.id='cw-section';sec.innerHTML=`<div class="section-head"><span class="section-name">Continua a guardare</span></div><div class="row" id="cw-row"></div>`;container.insertBefore(sec,container.firstChild);buildCWRow(sec.querySelector('#cw-row'),items);}
function buildCWRow(row,items){
  row.innerHTML='';
  items.forEach(item=>{
    const d=document.createElement('div');d.className='cw-card';d.dataset.id=item.id;d.dataset.type=item.type;
    const sub=item.type==='tv'?`S${item.season||1} · E${item.episode||1}`:'Film';const thumb=item.poster?`<img src="${IMG}${item.poster}" alt="${ea(item.title)}" loading="lazy">`:'';
    const prog=getProgress(item.id,item.type,item.season||null,item.episode||null);const progBadge=prog?`<div class="cw-prog-badge">📍 ${prog.text}${progressConfidenceLabel(prog)}</div>`:'';
    let barPct=0;if(prog&&prog.secs){const est=item.type==='movie'?5400:2400;barPct=Math.min(Math.round((prog.secs/est)*100),95);}
    d.innerHTML=`<button class="cw-remove" data-cw-id="${item.id}"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    <div class="cw-thumb">${thumb}${progBadge}<div class="cw-play-over"><div class="cw-play-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(255,255,255,.9)"><path d="M5 3l14 9-14 9z"/></svg></div></div></div>
    <div class="cw-prog"><div class="cw-bar" style="width:${barPct}%"></div></div>
    <div class="cw-info"><div class="cw-title">${item.title}</div><div class="cw-sub">${sub}</div></div>`;
    d.addEventListener('click',function(e){if(e.target.closest('.cw-remove'))return;openDetail(item.id,item.type,item.poster||'',!!item.isAnime);});
    row.appendChild(d);
  });drag(row);
}
function refreshCW(){const sec=document.getElementById('cw-section'),hs=document.getElementById('home-secs'),cw=getAllWatching();if(!cw.length){if(sec)sec.remove();return;}if(!sec){if(hs)renderCW(hs,cw);return;}const r=sec.querySelector('#cw-row');if(r)buildCWRow(r,cw);}

/* HERO */
function renderHero(idx){
  heroIdx=idx;const item=heroItems[idx];if(!item)return;
  const title=item.title||item.name||'',type=item.media_type||'movie',year=(item.release_date||item.first_air_date||'').slice(0,4),score=item.vote_average?item.vote_average.toFixed(1):'';
  const maxD=Math.min(heroItems.length,7);
  const dots=Array.from({length:maxD},(_,i)=>`<button class="hero-dot${i===idx?' active':''}" onclick="renderHero(${i})"></button>`).join('');
  document.getElementById('hero-wrap').innerHTML=`<div class="hero"><div class="hero-bg" style="background-image:url('${BIG}${item.backdrop_path}')"></div><div class="hero-grad"></div><div class="hero-body"><div class="hero-tag">${type==='tv'?'Serie TV':'Film'} · In tendenza</div><div class="hero-title">${title}</div><div class="hero-meta">${year?`<span>${year}</span>`:''} ${score?`<span class="star">★</span><span>${score}</span>`:''}</div><div class="hero-desc">${item.overview||''}</div><div class="hero-acts"><button class="gbtn gbtn-white" data-id="${item.id}" data-type="${type}" data-title="${ea(title)}" data-poster="${item.poster_path||''}"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9z"/></svg>Scopri</button></div><div class="hero-dots">${dots}</div></div></div>`;
  clearTimeout(heroTimer);heroTimer=setTimeout(()=>renderHero((heroIdx+1)%maxD),7500);
}

/* TOP 10 */
function addSecTop10(container,name,items){
  if(!items?.length)return;const sec=document.createElement('div');sec.className='section';
  const cards=items.map((raw,i)=>{const item=withAnimeFlag(raw),title=item.title||item.name||'',type=item.media_type||'movie',poster=item.poster_path||'',score=item.vote_average?'★ '+item.vote_average.toFixed(1):'',anime=item._anime?1:0;const img=poster?`<img src="${IMG}${poster}" alt="${ea(title)}" loading="lazy">`:`<div class="no-poster">${title}</div>`;return `<div class="card" data-id="${item.id}" data-type="${type}" data-title="${ea(title)}" data-poster="${poster}" data-anime="${anime}">${img}<div class="card-top10">${i+1}</div><div class="card-ov"><div class="card-ov-title">${title}</div><div class="card-ov-sub">${score||'ⓘ Dettagli'}</div></div><div class="card-bm${isInAnyFolder(item.id)?' saved':''}" data-bm-id="${item.id}" data-bm-type="${type}" data-bm-title="${ea(title)}" data-bm-poster="${poster}" data-bm-anime="${anime}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></div></div>`;}).join('');
  sec.innerHTML=`<div class="section-head"><span class="section-name">${name}</span><span class="gtag">Top 10</span></div><div class="row">${cards}</div>`;
  container.appendChild(sec);drag(sec.querySelector('.row'));
}

/* SERIE / FILM / ANIME */
async function loadSerie(){if(loaded.serie)return;loaded.serie=true;buildFilters('filter-serie',TV_GENRES,'serie');const el=document.getElementById('serie-secs');el.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';try{const tr=await tmdb('/trending/tv/week');el.innerHTML='';addSec(el,'Serie in tendenza',tr.results.map(x=>({...x,media_type:'tv'})),null,'');tr.results.forEach(x=>{if(x.poster_path)randomPools.serie.push({...x,media_type:'tv'});});for(const p of PROVIDERS){tmdb('/discover/tv',{with_watch_providers:p.id,watch_region:'IT',sort_by:'popularity.desc'}).then(d=>{if(d.results?.length){addSec(el,p.name,d.results.map(x=>({...x,media_type:'tv'})),p.c,'');d.results.forEach(x=>{if(x.poster_path)randomPools.serie.push({...x,media_type:'tv'});});}}).catch(()=>{});}for(const g of TV_GENRES.filter(g=>g.id)){tmdb('/discover/tv',{with_genres:g.id,sort_by:'popularity.desc'}).then(d=>{if(d.results?.length)addSec(el,g.name,d.results.map(x=>({...x,media_type:'tv'})),null,'genre');}).catch(()=>{});};}catch(e){el.innerHTML='<div class="err">Errore.</div>';}}
async function loadFilm(){if(loaded.film)return;loaded.film=true;buildFilters('filter-film',MV_GENRES,'film');const el=document.getElementById('film-secs');el.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';try{const [tr,now,top]=await Promise.all([tmdb('/trending/movie/week'),tmdb('/movie/now_playing',{region:'IT'}),tmdb('/movie/top_rated',{region:'IT'})]);el.innerHTML='';addSec(el,'Film in tendenza',tr.results.map(x=>({...x,media_type:'movie'})),null,'');addSec(el,'Ora al cinema',now.results.map(x=>({...x,media_type:'movie'})),null,'');addSec(el,'I più votati di sempre',top.results.map(x=>({...x,media_type:'movie'})),null,'');tr.results.forEach(x=>{if(x.poster_path)randomPools.film.push({...x,media_type:'movie'});});for(const p of PROVIDERS){tmdb('/discover/movie',{with_watch_providers:p.id,watch_region:'IT',sort_by:'popularity.desc'}).then(d=>{if(d.results?.length){addSec(el,p.name,d.results.map(x=>({...x,media_type:'movie'})),p.c,'');d.results.forEach(x=>{if(x.poster_path)randomPools.film.push({...x,media_type:'movie'});});}}).catch(()=>{});}for(const g of MV_GENRES.filter(g=>g.id)){tmdb('/discover/movie',{with_genres:g.id,sort_by:'popularity.desc'}).then(d=>{if(d.results?.length)addSec(el,g.name,d.results.map(x=>({...x,media_type:'movie'})),null,'genre');}).catch(()=>{});};}catch(e){el.innerHTML='<div class="err">Errore.</div>';}}
async function animeSection(container,title,path,params,type='tv',tag=''){
  try{
    const data=await tmdb(path,{include_adult:false,sort_by:'popularity.desc',...params});
    const unique=[];const seen=new Set();
    (data.results||[]).filter(x=>x.poster_path).forEach(x=>{
      const item={...x,media_type:type,_anime:1},key=`${type}_${x.id}`;
      if(!seen.has(key)){seen.add(key);unique.push(item);}
    });
    if(unique.length){addSec(container,title,unique,null,tag);unique.forEach(x=>randomPools.anime.push(x));}
  }catch(e){}
}
async function loadAnime(){
  if(loaded.anime)return;loaded.anime=true;
  const el=document.getElementById('anime-secs');el.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';
  try{
    el.innerHTML='';
    await Promise.all([
      animeSection(el,'Anime in tendenza','/discover/tv',{with_genres:16,with_origin_country:'JP',vote_count_gte:80},'tv'),
      animeSection(el,'Serie anime popolari','/discover/tv',{with_genres:16,with_origin_country:'JP',vote_average_gte:7},'tv'),
      animeSection(el,'Film anime','/discover/movie',{with_genres:16,with_original_language:'ja',vote_count_gte:40},'movie'),
      animeSection(el,'Azione anime','/discover/tv',{with_genres:16,with_keywords:210024,with_origin_country:'JP'},'tv','genre'),
      animeSection(el,'Romance anime','/discover/tv',{with_genres:16,with_keywords:9840,with_origin_country:'JP'},'tv','genre'),
      animeSection(el,'Anime recenti','/discover/tv',{with_genres:16,with_origin_country:'JP',first_air_date_gte:'2024-01-01'},'tv')
    ]);
    if(!el.querySelector('.section'))el.innerHTML+='<div class="empty">Nessun anime trovato. Riprova tra poco.</div>';
  }catch(e){el.innerHTML='<div class="err">Errore nel caricamento anime.</div>';}
}

/* RENDER HELPERS */
function cardProgressHTML(item,type){
  const id=item.id;if(!id)return '';
  const last=type==='tv'?getLastWatched(id):null;
  const prog=getProgress(id,type,last?.season||null,last?.episode||null);
  if(!prog||!prog.text)return '';
  const est=type==='movie'?5400:2400;
  const pct=prog.secs?Math.min(Math.max(Math.round((prog.secs/est)*100),4),95):0;
  return `<div class="card-progress-badge">📍 ${prog.text}${progressConfidenceLabel(prog)}</div>${pct?`<div class="card-progress-line"><span style="width:${pct}%"></span></div>`:''}`;
}
function addSec(container,name,items,color,type){if(!items?.length)return;const sec=document.createElement('div');sec.className='section';const dot=color?`<span class="pip" style="background:${color}"></span>`:'';const gt=type==='genre'?`<span class="gtag">Genere</span>`:type==='smart'?`<span class="gtag">Smart</span>`:'';sec.innerHTML=`<div class="section-head">${dot}<span class="section-name">${name}</span>${gt}</div><div class="row">${items.map(cardHTML).join('')}</div>`;container.appendChild(sec);drag(sec.querySelector('.row'));}
function cardHTML(item){item=withAnimeFlag(item);const title=item.title||item.name||'',type=item.media_type||'movie',poster=item.poster_path||item.poster||'',score=item.vote_average?'★ '+item.vote_average.toFixed(1):'';const inLib=isInAnyFolder(item.id),anime=item._anime?1:0,rated=getRating(item.id),progress=cardProgressHTML(item,type);const img=poster?`<img src="${IMG}${poster}" alt="${ea(title)}" loading="lazy">`:`<div class="no-poster">${title}</div>`;return `<div class="card" data-id="${item.id}" data-type="${type}" data-title="${ea(title)}" data-poster="${poster}" data-anime="${anime}">${img}${rated?`<div class="card-rated visible">⭐ ${rated}/5</div>`:`<div class="card-rated">⭐ ${rated}/5</div>`}${progress}<div class="card-ov"><div class="card-ov-title">${title}</div><div class="card-ov-sub">${score||'ⓘ Dettagli'}</div></div><div class="card-bm${inLib?' saved':''}" data-bm-id="${item.id}" data-bm-type="${type}" data-bm-title="${ea(title)}" data-bm-poster="${poster}" data-bm-anime="${anime}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></div></div>`;}
function listCardHTML(item,folderId){const title=item.title||'',type=item.type||'movie',poster=item.poster||'',anime=item.isAnime?1:0,progress=cardProgressHTML(item,type);const img=poster?`<img src="${IMG}${poster}" alt="${ea(title)}" loading="lazy">`:`<div class="no-poster">${ea(title)}</div>`;const score=getRating(item.id);return `<div class="card" data-id="${item.id}" data-type="${type}" data-title="${ea(title)}" data-poster="${poster}" data-anime="${anime}">${img}<button class="card-rm-item" data-rm-from="${folderId}" data-rm-id="${item.id}"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>${score?`<div class="card-rated visible">⭐ ${score}/5</div>`:''}${progress}<div class="card-ov"><div class="card-ov-title">${ea(title)}</div><div class="card-ov-sub">ⓘ Dettagli</div></div></div>`;}
function psCardHTML(p){const known=(p.known_for||[]).map(k=>k.title||k.name).filter(Boolean).slice(0,2).join(', ');const photo=p.profile_path?`<img src="${FACE}${p.profile_path}" class="pscard-photo" loading="lazy" alt="${ea(p.name)}">`:`<div class="pscard-photo pscard-nophoto">👤</div>`;return `<div class="pscard" data-actor-id="${p.id}">${photo}<div class="pscard-name">${ea(p.name)}</div>${known?`<div class="pscard-known">${ea(known)}</div>`:''}</div>`;}
function starRatingHTML(id){const cur=getRating(id);return `<div class="dm-rating-row"><div class="dm-rating-label">La tua valutazione</div><div class="star-row">${[1,2,3,4,5].map(n=>`<button class="star-btn${n<=cur?' active':''}" data-star="${n}" data-rid="${id}">★</button>`).join('')}</div></div>`;}
function providerUrl(name,title,fallback){
  const q=encodeURIComponent(title||'');
  const n=String(name||'').toLowerCase();
  if(n.includes('netflix'))return `https://www.netflix.com/search?q=${q}`;
  if(n.includes('prime'))return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}`;
  if(n.includes('disney'))return `https://www.disneyplus.com/search?q=${q}`;
  if(n.includes('apple'))return `https://tv.apple.com/search?term=${q}`;
  if(n.includes('paramount'))return `https://www.paramountplus.com/it/search/?query=${q}`;
  if(n.includes('now'))return `https://www.nowtv.it/cerca.html?search=${q}`;
  if(n.includes('sky'))return `https://www.sky.it/cerca?q=${q}`;
  return fallback||'#';
}
function renderCastCards(cast){
  return (cast||[]).slice(0,70).map(a=>{
    const char=a.roles?(a.roles||[]).map(r=>r.character).filter(Boolean).slice(0,2).join(', '):a.character||'';
    const photo=a.profile_path?`<img src="${FACE}${a.profile_path}" class="actor-photo" loading="lazy" alt="${ea(a.name)}">`:`<div class="actor-no-photo">👤</div>`;
    return `<div class="actor-card" data-actor-id="${a.id}">${photo}<div class="actor-name">${ea(a.name)}</div><div class="actor-char">${ea(char)}</div></div>`;
  }).join('');
}
async function loadSeasonCast(tvId,season){
  const row=document.getElementById('dm-cast-row'),title=document.getElementById('dm-cast-title');
  if(!row)return;
  if(title)title.textContent=`Cast stagione ${season}`;
  row.innerHTML='<div class="empty" style="padding:1rem 0">Caricamento cast stagione...</div>';
  try{
    let data=await tmdb(`/tv/${tvId}/season/${season}/aggregate_credits`);
    let cast=data.cast||[];
    if(!cast.length){data=await tmdb(`/tv/${tvId}/season/${season}/credits`);cast=data.cast||[];}
    row.innerHTML=cast.length?renderCastCards(cast):'<div class="empty" style="padding:1rem 0">Cast stagione non disponibile.</div>';
    drag(row);
  }catch(e){
    row.innerHTML='<div class="empty" style="padding:1rem 0">Cast stagione non disponibile.</div>';
  }
}

/* DETAIL */
async function openDetail(id,type,poster,isAnime){
  currentDetailId=String(id);currentDetailType=type;currentDetailIsAnime=!!isAnime;currentDetailPoster=poster||'';currentDetailSeasons=[];currentDetailAnimeTitles=[];hideTrailer();
  const bd=document.getElementById('dm-backdrop'),bdy=document.getElementById('dm-body');
  bd.style.backgroundImage=poster?`url('${IMG_W}${poster}')`:''
  bdy.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';
  document.getElementById('detail-modal').classList.add('open');document.body.style.overflow='hidden';
  try{
    const [info,credits,providers,trailerKey]=await Promise.all([tmdb(`/${type}/${id}`),tmdb(`/${type}/${id}/${type==='tv'?'aggregate_credits':'credits'}`),tmdb(`/${type}/${id}/watch/providers`),getTrailer(id,type,type==='tv'?1:null)]);
    currentDetailTitle=info.title||info.name||'';currentDetailPoster=info.poster_path||poster||'';currentTrailerKey=trailerKey;
    isAnime=!!isAnime||isAnimeLike({...info,media_type:type});
    currentDetailIsAnime=!!isAnime;
    currentDetailAnimeTitles=isAnime?animeTitleCandidates(info,currentDetailTitle):[];
    if(info.backdrop_path)bd.style.backgroundImage=`url('${BIG}${info.backdrop_path}')`;
    const title=currentDetailTitle,year=(info.release_date||info.first_air_date||'').slice(0,4),runtime=type==='movie'?fmtMin(info.runtime):null,score=info.vote_average?info.vote_average.toFixed(1):'';
    const genres=(info.genres||[]).map(g=>`<span class="genre-pill">${g.name}</span>`).join('');
    const tagline=info.tagline?`<p class="dm-tagline">${info.tagline}</p>`:'';
    const platIT=(providers.results?.IT?.flatrate||[]).slice(0,5),watchLink=providers.results?.IT?.link||'';
    const platHTML=platIT.length?`<div class="dm-platforms"><div class="dm-plat-label">Disponibile su</div><div class="dm-plat-row">${platIT.map(p=>`<a class="plat-badge" href="${providerUrl(p.provider_name,title,watchLink)}" target="_blank" rel="noopener">${p.logo_path?`<img src="${ORIG}${p.logo_path}" alt="${p.provider_name}">`:''}${p.provider_name}</a>`).join('')}</div></div>`:'';
    const cast=(credits.cast||[]).slice(0,70);
    const castRow=renderCastCards(cast);
    const inLib=isInAnyFolder(id),statusLabel=info.status==='Ended'||info.status==='Canceled'?'Terminata':info.status==='Returning Series'?'In corso':info.status||'';
    let bingeHTML='';if(type==='tv'&&info.number_of_episodes&&info.episode_run_time?.[0]){const bf=fmtBinge(info.number_of_episodes*(info.episode_run_time[0]||40));if(bf)bingeHTML=`<div style="margin-bottom:14px"><div class="binge-pill">🍿 Binge time: ${bf}</div></div>`;}
    const trailerBtn=trailerKey?`<button class="gbtn gbtn-full" id="btn-detail-trailer"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM9.5 8.5v7l6-3.5-6-3.5z"/></svg>Trailer</button>`:'';
    const last=getLastWatched(id);const lastS=Number(last?.season||1),lastE=Number(last?.episode||1);
    let playLabel,playResumePill='';
    if(last){if(type==='tv'){playLabel=`▶ Riprendi S${lastS}E${lastE}`;playResumePill=`<div class="dm-resume-pill">▶ Continua da S${lastS}E${lastE}</div>`;}else{playLabel='▶ Riprendi';playResumePill=`<div class="dm-resume-pill">▶ Hai già iniziato questo film</div>`;}}
    else{playLabel=type==='tv'?'▶ Guarda dall\'inizio':'▶ Guarda';}
    const progNote=getProgress(id,type,last?.season||null,last?.episode||null);
    const progNoteHTML=progNote?`<div class="dm-prog-note"><span>📍 Salvato al <b>${progNote.text}</b>${type==='tv'?` — S${last?.season}E${last?.episode}`:''}</span><button class="dm-prog-note-resume" id="btn-detail-prog-resume">Vai</button></div>`:'';
    let episodesSection='';
    if(type==='tv'){const seasons=(info.seasons||[]).filter(s=>s.season_number>0),selectedSeason=Number(last?.season||seasons[0]?.season_number||1);const sOpts=seasons.map(s=>`<option value="${s.season_number}"${Number(s.season_number)===selectedSeason?' selected':''}>Stagione ${s.season_number}${s.name&&!s.name.includes('Stagione')?' · '+s.name:''} (${s.episode_count||'?'} ep.)</option>`).join('');episodesSection=`<div class="ep-season-row"><div class="dm-section-title" style="margin:0">Episodi</div><div class="ep-season-actions"><button class="gbtn" id="btn-series-seen">Segna serie vista</button><button class="gbtn" id="btn-season-seen">Segna stagione vista</button><select class="gsel" id="dm-season-sel">${sOpts}</select></div></div><div id="dm-ep-list" class="ep-list"><div class="spin-wrap"><div class="spinner"></div></div></div>`;}
    bdy.innerHTML=`<div class="dm-poster-col">${info.poster_path?`<img src="${IMG_W}${info.poster_path}" class="dm-poster" id="dm-poster-img" alt="${ea(title)}">`:`<div class="dm-no-poster">${title}</div>`}${platHTML}<div class="dm-actions">${playResumePill}<button class="gbtn gbtn-white gbtn-full" id="btn-detail-play" style="padding:11px 20px;font-size:.9rem">${playLabel}</button>${trailerBtn}<button class="gbtn gbtn-full" id="btn-detail-share">Condividi</button><button class="gbtn gbtn-full" id="btn-detail-save"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>${inLib?'Nelle tue liste':'Salva in lista'}</button>${last?`<button class="gbtn gbtn-full" id="btn-detail-remove-cw">Rimuovi da Continua a guardare</button>`:''}${starRatingHTML(id)}${progNoteHTML}</div></div><div class="dm-info-col"><div class="dm-type-tag">${isAnime?'Anime · ':''}${type==='tv'?'Serie TV':'Film'}${year?' · '+year:''}</div><h1 class="dm-title">${title}</h1>${tagline}<div class="dm-genres">${genres}</div><div class="dm-meta-row">${score?`<div class="dm-meta-item"><span class="star">★</span><b>${score}</b><span>/10</span></div>`:''}${runtime?`<div class="dm-meta-item">⏱ <b>${runtime}</b></div>`:''}${type==='tv'&&info.number_of_seasons?`<div class="dm-meta-item">📺 <b>${info.number_of_seasons} stagion${info.number_of_seasons===1?'e':'i'}</b></div>`:''}${type==='tv'&&info.number_of_episodes?`<div class="dm-meta-item">📋 <b>${info.number_of_episodes} ep.</b></div>`:''}${statusLabel?`<div class="dm-meta-item">• <b>${statusLabel}</b></div>`:''}${info.original_language?`<div class="dm-meta-item">🌐 <b>${info.original_language.toUpperCase()}</b></div>`:''}</div>${bingeHTML}<p class="dm-overview">${info.overview||'Nessuna descrizione disponibile.'}</p>${cast.length?`<div class="dm-section-title" id="dm-cast-title">${type==='tv'?'Cast stagione '+(last?.season||1):'Cast completo'}</div><div class="cast-row" id="dm-cast-row">${castRow}</div>`:''}${episodesSection}<div id="dm-similar-wrap"></div><div id="dm-coll-wrap"></div></div>`;
    document.getElementById('btn-detail-play').addEventListener('click',()=>{closeDetail();openPlayer(id,type,title,info.poster_path||poster,last?.season||null,last?.episode||null,!!isAnime);});
    const pr=document.getElementById('btn-detail-prog-resume');if(pr&&progNote)pr.addEventListener('click',()=>{closeDetail();openPlayer(id,type,title,info.poster_path||poster,last?.season||null,last?.episode||null,!!isAnime);});
    document.getElementById('btn-detail-save').addEventListener('click',()=>openFolderPicker({id:String(id),type,title,poster:info.poster_path||poster||'',isAnime:!!isAnime}));
    document.getElementById('btn-detail-share').addEventListener('click',()=>shareEntity(title,buildEntityUrl('detail',id,type,!!isAnime)));
    const rmCW=document.getElementById('btn-detail-remove-cw');if(rmCW)rmCW.addEventListener('click',()=>{removeWatching(id);refreshCW();rmCW.remove();showToast('Rimosso da Continua a guardare');});
    if(trailerKey)document.getElementById('btn-detail-trailer').addEventListener('click',()=>showTrailerEmbed(trailerKey));
    const cr=document.getElementById('dm-cast-row');if(cr)drag(cr);
    if(type==='tv'){const seasons=(info.seasons||[]).filter(s=>s.season_number>0);currentDetailSeasons=seasons;const selectedSeason=Number(last?.season||seasons[0]?.season_number||1);const sSel=document.getElementById('dm-season-sel');if(sSel)sSel.value=String(selectedSeason);loadDetailEpisodes(String(id),selectedSeason,!!isAnime,last,seasons);if(sSel){sSel.addEventListener('change',async function(){loadDetailEpisodes(String(id),this.value,!!isAnime,last,seasons);const sk=await getTrailer(id,type,this.value);currentTrailerKey=sk;const tBtn=document.getElementById('btn-detail-trailer');if(tBtn){if(sk){tBtn.style.display='';tBtn.onclick=()=>showTrailerEmbed(sk);}else tBtn.style.display='none';}hideTrailer();});}}
    tmdb(`/${type}/${id}/similar`).then(d=>{const items=(d.results||[]).filter(x=>x.poster_path).slice(0,10);const wrap=document.getElementById('dm-similar-wrap');if(items.length&&wrap){const sec=document.createElement('div');sec.innerHTML=`<div class="dm-section-title">Ti potrebbe piacere</div><div class="row" id="dm-sim-row">${items.map(x=>cardHTML({...x,media_type:type,_anime:isAnime?1:0})).join('')}</div>`;wrap.appendChild(sec);drag(sec.querySelector('.row'));}}).catch(()=>{});
    if(type==='movie'&&info.belongs_to_collection){tmdb(`/collection/${info.belongs_to_collection.id}`).then(d=>{const wrap=document.getElementById('dm-coll-wrap');if(!wrap)return;const p=d.poster_path||info.belongs_to_collection.poster_path||'';wrap.innerHTML=`<div class="dm-section-title">Parte della collezione</div><div class="coll-card" id="coll-open">${p?`<img src="${IMG}${p}" class="coll-poster" alt="${ea(d.name)}">`:''}<div class="coll-info"><div class="coll-label">Collezione</div><div class="coll-name">${d.name}</div><div class="coll-count">${(d.parts||[]).length} film</div></div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>`;document.getElementById('coll-open').addEventListener('click',()=>{const ci=(d.parts||[]).filter(x=>x.poster_path).sort((a,b)=>(a.release_date||'').localeCompare(b.release_date||''));wrap.innerHTML=`<div class="dm-section-title">${ea(d.name)}</div><div class="row" id="dm-coll-row">${ci.map(x=>cardHTML({...x,media_type:'movie'})).join('')}</div>`;drag(document.getElementById('dm-coll-row'));});}).catch(()=>{});}
  }catch(e){bdy.innerHTML=`<div class="err" style="padding:2.5rem">Errore nel caricamento dei dettagli.</div>`;}
}
async function loadDetailEpisodes(tvId,season,isAnime,last,seasons=[]){
  const container=document.getElementById('dm-ep-list');if(!container)return;
  if(!seasons?.length)seasons=currentDetailSeasons;
  container.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';
  try{const data=await tmdb(`/tv/${tvId}/season/${season}`);const eps=data.episodes||[];if(!eps.length){container.innerHTML='<div class="empty">Nessun episodio.</div>';return;}
    const posterImg=document.getElementById('dm-poster-img');
    if(data.poster_path&&posterImg){posterImg.src=`${IMG_W}${data.poster_path}`;currentDetailPoster=data.poster_path;}
    if(data.poster_path)document.getElementById('dm-backdrop').style.backgroundImage=`url('${IMG_W}${data.poster_path}')`;
    loadSeasonCast(tvId,season);
    const seasonBtn=document.getElementById('btn-season-seen'),seriesBtn=document.getElementById('btn-series-seen');
    const allSeen=areAllEpisodesSeen(tvId,season,eps);
    if(seasonBtn){seasonBtn.textContent=allSeen?'Segna stagione non vista':'Segna stagione vista';seasonBtn.onclick=()=>{setSeasonSeen(tvId,season,eps,!allSeen);loadDetailEpisodes(tvId,season,isAnime,last,seasons);};}
    if(seriesBtn){const seriesSeen=isSeriesProbablySeen(tvId,seasons);seriesBtn.textContent=seriesSeen?'Segna serie non vista':'Segna serie vista';seriesBtn.onclick=async()=>{seriesBtn.disabled=true;await setSeriesSeen(tvId,seasons,!seriesSeen);seriesBtn.disabled=false;loadDetailEpisodes(tvId,season,isAnime,last,seasons);};}
    const watched=getLastWatched(tvId);const currentSeason=Number(season);const currentEp=watched&&Number(watched.season)===currentSeason?Number(watched.episode):null;
    container.innerHTML=eps.map(ep=>{const seen=isEpisodeSeen(tvId,season,ep.episode_number);const still=ep.still_path?`<img src="${STILL}${ep.still_path}" loading="lazy">`:`<div class="ep-still-ph">🎬</div>`;const air=ep.air_date?new Date(ep.air_date).toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'}):'';const rt=ep.runtime?`${ep.runtime} min`:'';const isCurrent=currentEp===ep.episode_number,isNext=currentEp&&ep.episode_number===currentEp+1;const wb=seen?`<div class="ep-watched-badge">✓ Visto</div>`:isCurrent?`<div class="ep-watched-badge">▶ In corso</div>`:isNext?`<div class="ep-watched-badge" style="background:rgba(48,209,88,.25);border-color:rgba(48,209,88,.5)">Prossimo</div>`:'';const nb=isNext&&!seen?`<span class="ep-next-badge">▶ Prossimo</span>`:'';const ec=seen?' is-seen':isCurrent?' is-current':isNext?' is-next':'';return `<div class="ep-item${ec}" data-ep-num="${ep.episode_number}" data-season="${season}" data-tv-id="${tvId}" data-anime="${isAnime?1:0}" id="ep-${ep.episode_number}"><div class="ep-still">${still}${wb}<div class="ep-still-play"><div class="ep-play-circle"><svg width="11" height="11" viewBox="0 0 24 24" fill="rgba(255,255,255,.9)"><path d="M5 3l14 9-14 9z"/></svg></div></div></div><div class="ep-info"><div class="ep-num-title">${ep.episode_number}${ep.name?' · '+ep.name:''}${nb}</div>${(air||rt)?`<div class="ep-air">${[air,rt].filter(Boolean).join(' · ')}</div>`:''}${ep.overview?`<div class="ep-overview">${ep.overview}</div>`:''}<button class="ep-seen-toggle" data-seen-toggle="${ep.episode_number}">${seen?'Segna non visto':'Segna visto'}</button></div></div>`;}).join('');
    if(currentEp){setTimeout(()=>{const el=document.getElementById(`ep-${Math.min(currentEp,eps.length)}`);if(el)el.scrollIntoView({behavior:'smooth',block:'nearest'});},120);}
  }catch(e){container.innerHTML='<div class="empty">Errore episodi.</div>';}
}
function closeDetail(){hideTrailer();smoothClose(document.getElementById('detail-modal'),180,()=>{document.body.style.overflow='';});}
document.getElementById('btn-detail-back').addEventListener('click',closeDetail);
document.getElementById('btn-detail-close').addEventListener('click',closeDetail);

/* ACTOR */
async function fetchWikiBio(name){
  try{
    const res=await fetch(`https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
    if(!res.ok)return null;
    const data=await res.json();
    return data.extract||null;
  }catch(e){return null;}
}
function actorCreditsRow(title,items,id){
  const clean=items.filter(x=>x.media_type==='movie'||x.media_type==='tv').sort((a,b)=>((b.release_date||b.first_air_date||'')||'').localeCompare((a.release_date||a.first_air_date||'')||'')).slice(0,80);
  return clean.length?`<div class="am-film-row"><div class="dm-section-title" style="margin-bottom:12px">${title}</div><div id="${id}" class="row" style="margin-bottom:2rem">${clean.map(x=>creditCardHTML({...x,media_type:x.media_type||'movie'})).join('')}</div></div>`:'';
}
function creditCardHTML(item){const base=cardHTML(item);const role=item.character||item.job||'';return role?base.replace('<div class="card-ov">',`<div class="credit-role">${ea(role)}</div><div class="card-ov">`):base;}
function personDateLabel(date){return date?new Date(date).toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}):'';}
function personAge(info){
  if(!info.birthday)return '';
  const end=info.deathday?new Date(info.deathday):new Date(),birth=new Date(info.birthday);
  let age=end.getFullYear()-birth.getFullYear();
  const m=end.getMonth()-birth.getMonth();
  if(m<0||(m===0&&end.getDate()<birth.getDate()))age--;
  return `${age} anni${info.deathday?' al decesso':''}`;
}
async function openActor(actorId){
  const ab=document.getElementById('am-body');ab.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';document.getElementById('actor-modal').classList.add('open');
  try{
    const [info,credits]=await Promise.all([tmdb(`/person/${actorId}`),tmdb(`/person/${actorId}/combined_credits`)]);
    const wiki=await fetchWikiBio(info.name);
    const fullBio=wiki||info.biography||'Nessuna biografia disponibile.';
    const shortBio=fullBio.length>520?fullBio.slice(0,520).replace(/\s+\S*$/,'')+'…':fullBio;
    const all=(credits.cast||[]).filter(x=>x.media_type==='movie'||x.media_type==='tv');
    const movies=all.filter(x=>x.media_type==='movie'),shows=all.filter(x=>x.media_type==='tv');
    const known=[...all].filter(x=>x.poster_path).sort((a,b)=>(b.popularity||0)-(a.popularity||0)).slice(0,12);
    const profile=info.profile_path?`<img src="${IMG_W}${info.profile_path}" class="am-poster" alt="${ea(info.name)}">`:`<div class="am-poster am-no-poster">👤</div>`;
    const bg=info.profile_path?`style="background-image:url('${IMG_W}${info.profile_path}')"`:'';
    const bday=personDateLabel(info.birthday),dday=personDateLabel(info.deathday),age=personAge(info);
    const meta=[
      info.known_for_department||'',
      bday?`Nato/a ${bday}`:'',
      dday?`Morto/a ${dday}`:'',
      age,
      info.place_of_birth||''
    ].filter(Boolean);
    ab.innerHTML=`<div class="am-hero"><div class="am-hero-bg" ${bg}></div><div class="am-hero-grad"></div><div class="am-hero-content"><div class="am-poster-wrap">${profile}</div><div class="am-detail"><div class="dm-type-tag">Persona</div><h1 class="am-title">${ea(info.name)}</h1><div class="am-meta-row">${meta.map(m=>`<span>${ea(m)}</span>`).join('')}</div><div class="am-bio" id="am-bio" data-short="${ea(shortBio)}" data-full="${ea(fullBio)}">${ea(shortBio)}</div><div class="am-actions"><button class="gbtn gbtn-white" id="btn-actor-share">Condividi</button>${fullBio.length>shortBio.length?`<button class="gbtn" id="am-bio-more">Mostra di più</button>`:''}</div></div></div></div>${known.length?`<div class="am-section"><div class="dm-section-title">Contenuti principali</div><div id="am-known-row" class="row">${known.map(x=>creditCardHTML({...x,media_type:x.media_type||'movie'})).join('')}</div></div>`:''}${actorCreditsRow('Filmografia film',movies,'am-movie-row')}${actorCreditsRow('Serie TV',shows,'am-tv-row')}`;
    ['am-known-row','am-movie-row','am-tv-row'].forEach(id=>{const r=document.getElementById(id);if(r)drag(r);});
    document.getElementById('btn-actor-share')?.addEventListener('click',()=>shareEntity(info.name,buildEntityUrl('actor',actorId)));
    const more=document.getElementById('am-bio-more');
    if(more)more.addEventListener('click',()=>{const bio=document.getElementById('am-bio'),expanded=bio.classList.toggle('expanded');bio.textContent=expanded?bio.dataset.full:bio.dataset.short;more.textContent=expanded?'Mostra meno':'Mostra di più';});
  }catch(e){ab.innerHTML='<div class="err" style="padding:2.5rem">Errore.</div>';}
}
function closeActor(){smoothClose(document.getElementById('actor-modal'),180);}
document.getElementById('btn-actor-back').addEventListener('click',closeActor);
document.getElementById('btn-actor-close').addEventListener('click',closeActor);

/* PLAYER */
function sourceContentKey(id,type,season,episode){return type==='movie'?`${type}_${id}`:`${type}_${id}_s${season||1}_e${episode||1}`;}
function getSourcePrefs(){return readJSONKey('svx_src_pref',{});}
function saveSourcePrefs(p){writeJSONKey('svx_src_pref',p);}
function getBadSources(){return readJSONKey('svx_src_bad',{});}
function saveBadSources(p){writeJSONKey('svx_src_bad',p);}
function getSourceList(isAnime){return isAnime?SOURCES_ANIME:SOURCES_NORMAL;}
function getPreferredSource(id,type,season,episode,isAnime,fallback){
  const key=sourceContentKey(id,type,season,episode),prefs=getSourcePrefs(),bad=getBadSources()[key]||{};
  const list=getSourceList(isAnime).map(s=>s.id);
  if(prefs[key]&&list.includes(prefs[key])&&!bad[prefs[key]])return prefs[key];
  if(fallback&&list.includes(fallback)&&!bad[fallback])return fallback;
  return list.find(src=>!bad[src])||list[0];
}
function setPreferredSource(id,type,season,episode,src){
  const key=sourceContentKey(id,type,season,episode),prefs=getSourcePrefs();
  prefs[key]=src;saveSourcePrefs(prefs);
}
function markSourceBad(){
  if(!currentTvId||!currentSrc)return;
  const key=sourceContentKey(currentTvId,playerProgType,playerProgSeason,playerProgEpisode),bad=getBadSources();
  bad[key]={...(bad[key]||{}),[currentSrc]:Date.now()};saveBadSources(bad);
  const next=getPreferredSource(currentTvId,playerProgType,playerProgSeason,playerProgEpisode,currentIsAnime,null);
  if(next&&next!==currentSrc){currentSrc=next;buildSrcToggle(currentIsAnime);reloadPlayer(false);showToast(`Cambio sorgente: ${getSourceLabel(next)} ▶`);}
  else showToast('Nessuna sorgente alternativa salvata');
}
function markSourceOk(){
  if(!currentTvId||!currentSrc)return;
  const key=sourceContentKey(currentTvId,playerProgType,playerProgSeason,playerProgEpisode),bad=getBadSources();
  if(bad[key]?.[currentSrc]){delete bad[key][currentSrc];saveBadSources(bad);}
  setPreferredSource(currentTvId,playerProgType,playerProgSeason,playerProgEpisode,currentSrc);
  updateSourceState();
  showToast('Sorgente salvata ✓');
}
function getSourceLabel(src){return [...SOURCES_NORMAL,...SOURCES_ANIME].find(s=>s.id===src)?.label||src;}
function updateSourceState(){
  const el=document.getElementById('player-source-state');if(!el)return;
  el.textContent=getSourceLabel(currentSrc);
}
function applySavedPlayerSandbox(){document.getElementById('vix-frame')?.removeAttribute('sandbox');}
function promptAnimeLink(){
  if(!currentTvId)return;
  const current=window.StreamGNProviders?.getAnimeOverride?.(currentTvId,playerProgType,playerProgSeason,playerProgEpisode)||'';
  let url=prompt('Incolla il link anime per questo contenuto',current);
  if(url===null)return;
  url=String(url||'').trim();
  if(!url){reloadPlayer(false);return;}
  window.StreamGNProviders?.setAnimeOverride?.(currentTvId,playerProgType,playerProgSeason,playerProgEpisode,url);
  currentSrc='anime';setPreferredSource(currentTvId,playerProgType,playerProgSeason,playerProgEpisode,currentSrc);
  buildSrcToggle(true);reloadPlayer(false);showToast('Link anime salvato ✓');
}
function buildSrcToggle(isAnime){const sources=getSourceList(isAnime);const toggle=document.getElementById('src-toggle');toggle.innerHTML=sources.length>1?sources.map(s=>`<button class="src-btn${s.id===currentSrc?' active':''}" data-src="${s.id}">${s.label}</button>`).join(''):'';toggle.querySelectorAll('.src-btn').forEach(b=>b.addEventListener('click',function(){currentSrc=this.dataset.src;setPreferredSource(currentTvId,playerProgType,playerProgSeason,playerProgEpisode,currentSrc);toggle.querySelectorAll('.src-btn').forEach(x=>x.classList.toggle('active',x.dataset.src===currentSrc));reloadPlayer();}));updateSourceState();}
function reloadPlayer(saveFirst=true){if(saveFirst)requestPlayerRealProgress();clearTimeout(playerSourceHealthTimer);const tc=document.getElementById('tv-ctrl');const s=document.getElementById('s-sel').value||1,ep=document.getElementById('e-sel').value||1;applySavedPlayerSandbox();if(tc.style.display!=='none'&&currentTvId){const prog=getProgress(currentTvId,'tv',s,ep);setPlayerFrameSrc(currentTvId,'tv',s,ep,currentSrc,prog?prog.secs:0);resetPlayerAutoClock();}else if(currentTvId){const prog=getProgress(currentTvId,'movie',null,null);setPlayerFrameSrc(currentTvId,'movie',null,null,currentSrc,prog?prog.secs:0);resetPlayerAutoClock();}updateSourceState();}
function updateDeviceMediaSession(title,type,poster,season,episode){
  if(!('mediaSession' in navigator)||typeof MediaMetadata==='undefined')return;
  try{
    navigator.mediaSession.metadata=new MediaMetadata({
      title:title||'StreaMGN',
      artist:type==='tv'?`Serie TV${season?` · S${season}`:''}${episode?` E${episode}`:''}`:'Film',
      album:'StreaMGN',
      artwork:poster?[{src:`${IMG}${poster}`,sizes:'342x513',type:'image/jpeg'},{src:`${IMG_W}${poster}`,sizes:'780x1170',type:'image/jpeg'}]:[]
    });
  }catch(e){}
}
function updateNextEpisodeButton(){const btn=document.getElementById('btn-next-ep');if(!btn)return;const tv=playerProgType==='tv'&&document.getElementById('player-modal').classList.contains('open');btn.style.display=tv?'inline-flex':'none';btn.classList.remove('next-ready');}
function loadSelectedTvEpisode(s,ep){if(!currentTvId)return;playerProgSeason=Number(s);playerProgEpisode=Number(ep);currentSrc=getPreferredSource(currentTvId,'tv',s,ep,currentIsAnime,currentSrc);buildSrcToggle(currentIsAnime);refreshNoteBar(currentTvId,'tv',s,ep);const prog=getProgress(currentTvId,'tv',s,ep);applySavedPlayerSandbox();setPlayerFrameSrc(currentTvId,'tv',s,ep,currentSrc,prog?prog.secs:0);resetPlayerAutoClock();saveWatching(currentTvId,'tv',playerSessionTitle||document.getElementById('pm-title').textContent,playerSessionPoster,s,ep);updateDeviceMediaSession(playerSessionTitle,'tv',playerSessionPoster,s,ep);refreshCW();updateNextEpisodeButton();updateSourceState();}
async function goNextEpisode(){
  if(!currentTvId||playerProgType!=='tv')return;
  persistEstimatedProgress();clearTimeout(epChangeTimer);
  const sSel=document.getElementById('s-sel'),eSel=document.getElementById('e-sel');
  if(eSel.selectedIndex<eSel.options.length-1){eSel.selectedIndex=eSel.selectedIndex+1;loadSelectedTvEpisode(sSel.value,eSel.value);showToast(`Episodio ${eSel.value} avviato ▶`);return;}
  if(sSel.selectedIndex<sSel.options.length-1){sSel.selectedIndex=sSel.selectedIndex+1;await loadEpisodesForPlayer(currentTvId,sSel.value,1);eSel.selectedIndex=0;loadSelectedTvEpisode(sSel.value,eSel.value||1);showToast(`Stagione ${sSel.value}, episodio ${eSel.value||1} ▶`);return;}
  showToast('Ultimo episodio disponibile');
}
document.getElementById('s-sel').addEventListener('change',async function(){if(!currentTvId)return;persistEstimatedProgress();await loadEpisodesForPlayer(currentTvId,this.value,null);clearTimeout(epChangeTimer);epChangeTimer=setTimeout(()=>{const ep=document.getElementById('e-sel').value||1;loadSelectedTvEpisode(this.value,ep);},600);});
document.getElementById('e-sel').addEventListener('change',function(){if(!currentTvId)return;persistEstimatedProgress();clearTimeout(epChangeTimer);const s=document.getElementById('s-sel').value||1,ep=this.value||1;epChangeTimer=setTimeout(()=>loadSelectedTvEpisode(s,ep),500);});
document.getElementById('btn-next-ep').addEventListener('click',goNextEpisode);
document.getElementById('btn-src-ok').addEventListener('click',markSourceOk);
document.getElementById('btn-src-bad').addEventListener('click',markSourceBad);
document.getElementById('btn-anime-link').addEventListener('click',promptAnimeLink);
async function openPlayer(id,type,title,poster,season,episode,isAnime){
  const last=getLastWatched(id),initialS=season||last?.season||1,initialE=episode||last?.episode||1;
  const resolvedAnime=!!isAnime||(currentDetailId===String(id)&&currentDetailIsAnime);
  currentIsAnime=resolvedAnime;currentSrc=getPreferredSource(id,type,initialS,initialE,resolvedAnime,resolvedAnime?'anime':'vixsrc');currentTvId=String(id);document.getElementById('pm-title').textContent=title;document.getElementById('anime-note').style.display='none';document.getElementById('btn-anime-link').style.display='none';buildSrcToggle(resolvedAnime);autoAddToWatching({id:String(id),type,title,poster:poster||'',isAnime:resolvedAnime});
  playerProgId=String(id);playerProgType=type;playerProgSeason=season||null;playerProgEpisode=episode||null;playerNoteSavedThisSession=true;playerSessionTitle=title;playerSessionPoster=poster||'';playerSessionIsAnime=resolvedAnime;playerSessionAnimeTitles=resolvedAnime?uniqueTextList([title,...(currentDetailId===String(id)?currentDetailAnimeTitles:[])]):[];playerLastAutoSecs=0;playerLastAutoSaveAt=0;stopPlayerAutoSave(false);hideReminderOverlay();document.getElementById('pm-note-bar').classList.remove('highlight');updateDeviceMediaSession(title,type,poster,season,episode);
  const tc=document.getElementById('tv-ctrl'),fr=document.getElementById('vix-frame');
  if(type==='tv'){tc.style.display='flex';const sSel=document.getElementById('s-sel'),eSel=document.getElementById('e-sel');sSel.innerHTML='<option>Caricamento…</option>';eSel.innerHTML='<option>Caricamento…</option>';document.getElementById('player-modal').classList.add('open');document.body.style.overflow='hidden';const lastS=initialS,lastE=initialE;try{const show=await tmdb(`/tv/${id}`);if(resolvedAnime)playerSessionAnimeTitles=uniqueTextList([...playerSessionAnimeTitles,...animeTitleCandidates(show,title)]);const seasons=(show.seasons||[]).filter(s=>s.season_number>0);if(!seasons.length)seasons.push({season_number:1,episode_count:10,name:'Stagione 1'});sSel.innerHTML=seasons.map(s=>`<option value="${s.season_number}">S${s.season_number} · ${s.name||'Stagione '+s.season_number} (${s.episode_count||'?'} ep.)</option>`).join('');sSel.value=String(lastS);await loadEpisodesForPlayer(id,sSel.value,lastE);}catch(e){sSel.innerHTML='<option value="1">Stagione 1</option>';eSel.innerHTML='<option value="1">Episodio 1</option>';}const s=sSel.value||1,ep=document.getElementById('e-sel').value||1;playerProgSeason=Number(s);playerProgEpisode=Number(ep);currentSrc=getPreferredSource(id,type,s,ep,resolvedAnime,currentSrc);buildSrcToggle(resolvedAnime);refreshNoteBar(id,type,s,ep);const prog=getProgress(id,type,s,ep);applySavedPlayerSandbox();setPlayerFrameSrc(id,type,s,ep,currentSrc,prog?prog.secs:0);startPlayerAutoSave(prog?prog.secs:0);saveWatching(id,type,title,poster,s,ep);updateNextEpisodeButton();updateSourceState();}
  else{tc.style.display='none';playerProgSeason=null;playerProgEpisode=null;refreshNoteBar(id,type,null,null);const prog=getProgress(id,type,null,null);applySavedPlayerSandbox();setPlayerFrameSrc(id,type,null,null,currentSrc,prog?prog.secs:0);startPlayerAutoSave(prog?prog.secs:0);document.getElementById('player-modal').classList.add('open');document.body.style.overflow='hidden';saveWatching(id,type,title,poster,null,null);updateNextEpisodeButton();updateSourceState();}
  refreshCW();
}
async function loadEpisodesForPlayer(showId,season,preselect){const eSel=document.getElementById('e-sel');eSel.innerHTML='<option>Caricamento…</option>';try{const data=await tmdb(`/tv/${showId}/season/${season}`);const eps=data.episodes||[];if(!eps.length)throw Error('empty');eSel.innerHTML=eps.map(e=>`<option value="${e.episode_number}">Ep. ${e.episode_number}${e.name?' · '+e.name:''}</option>`).join('');if(preselect)eSel.value=String(preselect);}catch(e){eSel.innerHTML='<option value="1">Episodio 1</option>';}}
function doClosePlayer(){pipActive=false;clearTimeout(epChangeTimer);clearTimeout(playerSourceHealthTimer);stopPlayerAutoSave(true);hideReminderOverlay();const fr=document.getElementById('vix-frame');smoothClose(document.getElementById('player-modal'),180,()=>{fr.src='';document.body.style.overflow='';document.getElementById('anime-note').style.display='none';document.getElementById('btn-anime-link').style.display='none';currentTvId=null;playerProgId=null;playerSessionTitle='';playerSessionPoster='';playerSessionIsAnime=false;playerSessionAnimeTitles=[];refreshCW();});}
function attemptClosePlayer(){hideReminderOverlay();doClosePlayer();}
function closePlayer(){attemptClosePlayer();}
document.getElementById('btn-player-back').addEventListener('click',attemptClosePlayer);
document.getElementById('btn-player-close').addEventListener('click',attemptClosePlayer);
/* ============================================================
   PiP AUTOMATICO — continua la riproduzione uscendo dall'app
   iOS: porta l'iframe in fullscreen webkit; iOS converte
        automaticamente in PiP nativo quando premi Home.
   Desktop Chrome: documentPictureInPicture.
   ============================================================ */
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isSafari=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);
let pipActive=false;

async function activatePiP(silent=false){
  const fr=document.getElementById('vix-frame');
  if(!fr||!fr.src)return;

  /* iOS / Safari — fullscreen webkit → iOS trasforma in PiP quando esci */
  if(isIOS||isSafari){
    try{
      if(fr.webkitRequestFullscreen){await fr.webkitRequestFullscreen();pipActive=true;if(!silent)showToast('✅ PiP pronto — premi Home per continuare');}
      else if(fr.requestFullscreen){await fr.requestFullscreen();pipActive=true;if(!silent)showToast('✅ PiP pronto — premi Home per continuare');}
    }catch(e){if(!silent)showToast('Avvia il video poi premi Home');}
    return;
  }

  /* Chrome/Edge Desktop: finestra PiP flottante */
  if('documentPictureInPicture' in window){
    try{
      const pw=await window.documentPictureInPicture.requestWindow({width:480,height:270});
      const ic=pw.document.createElement('iframe');
      ic.src=fr.src;
      ic.style.cssText='width:100%;height:100%;border:none;background:#000';
      ic.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media');
      ic.setAttribute('allowfullscreen','');
      ic.setAttribute('playsinline','');
      pw.document.body.style.cssText='margin:0;background:#000';
      pw.document.body.appendChild(ic);
      fr.src='';
      pw.addEventListener('pagehide',()=>{fr.src=ic.src;pipActive=false;});
      pipActive=true;
      if(!silent)showToast('Picture in Picture attivo ⧉');
      return;
    }catch(err){}
  }

  /* Fallback fullscreen */
  try{
    if(fr.requestFullscreen){await fr.requestFullscreen();pipActive=true;if(!silent)showToast('✅ Fullscreen — premi Home per il PiP');}
    else if(!silent)showToast('PiP non supportato su questo browser');
  }catch(e){if(!silent)showToast('PiP non supportato su questo browser');}
}

/* Pulsante PiP manuale */
document.getElementById('btn-pip').addEventListener('click',()=>activatePiP(false));

/* AUTOMATICO: quando l'utente esce dall'app con il player aperto */
document.addEventListener('visibilitychange',()=>{
  const playerOpen=document.getElementById('player-modal').classList.contains('open');
  if(!playerOpen)return;
  if(document.hidden){
    persistEstimatedProgress();
    activatePiP(true); // silenzioso, nessun toast
  } else {
    /* Tornato nell'app: esci dal fullscreen se siamo in PiP auto su iOS */
    if(pipActive&&(isIOS||isSafari)){
      try{
        if(document.webkitExitFullscreen)document.webkitExitFullscreen();
        else if(document.exitFullscreen)document.exitFullscreen();
      }catch(e){}
      pipActive=false;
    }
  }
});
window.addEventListener('pagehide',()=>persistEstimatedProgress());
window.addEventListener('beforeunload',()=>persistEstimatedProgress());

/* FOLDER PICKER */
function openFolderPicker(item){fpCurrentItem=item;fpPendingCat=null;renderFPStep1();document.getElementById('folder-picker').classList.add('open');}
function closeFolderPicker(){smoothClose(document.getElementById('folder-picker'),280,()=>{fpCurrentItem=null;fpPendingCat=null;});}
function renderFPStep1(){
  if(!fpCurrentItem)return;
  const current=getFoldersContaining(fpCurrentItem.id),custom=getCustomFolders();
  let curHTML='',customHTML='';
  if(current.length){const tags=current.map(f=>`<div class="fp-cur-tag">${ea(f.name)}<button data-rm-fid="${f.id}">×</button></div>`).join('');curHTML=`<div class="fp-sep"></div><div class="fp-cur-label">Già nelle liste</div><div class="fp-cur-tags">${tags}</div>`;}
  if(custom.length){customHTML=`<div class="fp-sep"></div><div class="fp-cur-label">Liste personalizzate</div><div class="fp-custom-list">${custom.map(f=>`<button class="fp-custom-btn" data-custom-fid="${f.id}">${ea(f.name)}</button>`).join('')}</div>`;}
  document.getElementById('fp-content').innerHTML=`<p class="fp-subtitle">Stato per <b style="color:var(--tx)">${ea(fpCurrentItem.title)}</b></p><div class="fp-cat-grid"><button class="fp-cat-btn" data-cat="lista"><span class="fp-cat-icon">📋</span><span class="fp-cat-label">In lista</span><span class="fp-cat-sub">Da guardare</span></button><button class="fp-cat-btn" data-cat="visti"><span class="fp-cat-icon">✅</span><span class="fp-cat-label">Visto</span><span class="fp-cat-sub">Già guardato</span></button><button class="fp-cat-btn" data-cat="watching"><span class="fp-cat-icon">▶️</span><span class="fp-cat-label">Guardando</span><span class="fp-cat-sub">In visione</span></button></div>${customHTML}${curHTML}`;
}
function renderFPStep2(cat){fpPendingCat=cat;document.getElementById('fp-content').innerHTML=`<button class="fp-back-btn" id="fp-back"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Indietro</button><p class="fp-subtitle" style="margin-top:10px">La serie è conclusa?</p><div class="fp-cat-grid-2"><button class="fp-cat-btn" data-sub="c"><span class="fp-cat-icon">✅</span><span class="fp-cat-label">Conclusa</span></button><button class="fp-cat-btn" data-sub="o"><span class="fp-cat-icon">🔄</span><span class="fp-cat-label">In corso</span></button></div>`;}
document.getElementById('fp-content').addEventListener('click',function(e){e.stopPropagation();const customBtn=e.target.closest('[data-custom-fid]');if(customBtn){handleFPCustomSelect(customBtn.dataset.customFid);return;}const catBtn=e.target.closest('.fp-cat-btn[data-cat]');if(catBtn){const cat=catBtn.dataset.cat;handleFPSelect(cat,null);return;}const subBtn=e.target.closest('.fp-cat-btn[data-sub]');if(subBtn){handleFPSelect(fpPendingCat||'visti',subBtn.dataset.sub);return;}const rmFid=e.target.closest('[data-rm-fid]');if(rmFid){removeFromFolder(rmFid.dataset.rmFid,fpCurrentItem.id);updateBookmarkIcons(fpCurrentItem.id);renderFPStep1();if(document.querySelector('#page-liste.active'))renderListePage();return;}if(e.target.closest('#fp-back')){renderFPStep1();return;}});
async function handleFPSelect(cat,sub){if(!fpCurrentItem)return;if(cat==='visti'&&fpCurrentItem.type==='tv'&&!sub){try{const info=await tmdb(`/tv/${fpCurrentItem.id}`);sub=(info.status==='Ended'||info.status==='Canceled')?'c':'o';}catch(e){sub='o';}}const fid=getTargetFolderId(cat,sub,fpCurrentItem);if(!fid){showToast('Cartella non trovata');closeFolderPicker();return;}addToFolder(fid,fpCurrentItem);updateBookmarkIcons(fpCurrentItem.id);if(document.querySelector('#page-liste.active'))renderListePage();showToast(`Aggiunto a "${getFolders()[fid]?.name||'lista'}"`);closeFolderPicker();}
function handleFPCustomSelect(fid){if(!fpCurrentItem)return;addToFolder(fid,fpCurrentItem);updateBookmarkIcons(fpCurrentItem.id);if(document.querySelector('#page-liste.active'))renderListePage();showToast(`Aggiunto a "${getFolders()[fid]?.name||'lista'}"`);closeFolderPicker();}
document.getElementById('fp-close').addEventListener('click',closeFolderPicker);
document.getElementById('folder-picker').addEventListener('click',e=>{if(e.target===document.getElementById('folder-picker'))closeFolderPicker();});

/* LISTE */
function hasAnyProgressForItem(item){const id=String(item.id),p=getProgressStore();return Object.keys(p).some(k=>k===`prog_${id}_movie`||k.startsWith(`prog_${id}_s`));}
function isListItemStarted(item,folder){return folder.g==='watching'||!!getLastWatched(item.id)||hasAnyProgressForItem(item);}
function getItemProgressSecs(item){const p=getProgressStore(),id=String(item.id);return Math.max(0,...Object.entries(p).filter(([k])=>k===`prog_${id}_movie`||k.startsWith(`prog_${id}_s`)).map(([,v])=>Number(v.secs)||0));}
function sortListItems(items){
  const arr=[...items];
  if(listeSort==='title')return arr.sort((a,b)=>(a.title||'').localeCompare(b.title||'','it'));
  if(listeSort==='rating')return arr.sort((a,b)=>(getRating(b.id)||0)-(getRating(a.id)||0)||(b.addedAt||0)-(a.addedAt||0));
  if(listeSort==='progress')return arr.sort((a,b)=>getItemProgressSecs(b)-getItemProgressSecs(a)||(b.addedAt||0)-(a.addedAt||0));
  return arr.sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
}
function filterListItems(folder,items){
  const filtered=listeFilter==='all'?items:items.filter(item=>{const completed=folder.g==='visti',started=!completed&&isListItemStarted(item,folder),queued=!completed&&!started&&(folder.g==='lista'||folder.g==='custom'||folder._imported);if(listeFilter==='started')return started;if(listeFilter==='completed')return completed;if(listeFilter==='queued')return queued;return true;});
  return sortListItems(filtered);
}
function resetFolderItems(folderId,folderName){openConfirm(`Svuotare la lista <b>${ea(folderName)}</b>?`,function(){const f=getFolders();if(!f[folderId])return;f[folderId].items=[];saveFolders(f);renderListePage();showToast('Lista ripristinata');});}
function buildFolderSection(parentEl,folderId,folderName,items,opts={}){const sw=document.createElement('div');sw.className='sections-wrap';const sec=document.createElement('div');sec.className='section';const head=document.createElement('div');head.className='section-head';head.innerHTML=`<span class="section-name" style="font-size:.82rem">${ea(folderName)}</span><span class="gtag">${items.length}</span><button class="list-reset-btn" data-reset-folder="${folderId}">Svuota</button>`;head.querySelector('[data-reset-folder]').addEventListener('click',e=>{e.stopPropagation();resetFolderItems(folderId,folderName);});sec.appendChild(head);const row=document.createElement('div');row.className='row';if(opts.showPlus!==false){const plus=document.createElement('div');plus.className='plus-card';plus.innerHTML='<div class="plus-icon">+</div><div class="plus-lbl">Aggiungi</div>';plus.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();searchAddToFolderId=folderId;searchAddFolderName=folderName;openSearch();showSearchAddBanner(folderName);});row.appendChild(plus);}
  items.forEach(function(item){const tmp=document.createElement('div');tmp.innerHTML=listCardHTML(item,folderId);const card=tmp.firstElementChild;const rmBtn=card.querySelector('.card-rm-item');if(rmBtn){rmBtn.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();openConfirm(`Rimuovere da <b>${ea(getFolders()[folderId]?.name||folderName)}</b>?`,function(){removeFromFolder(folderId,item.id);updateBookmarkIcons(item.id);renderListePage();});});}card.addEventListener('click',function(e){if(e.target.closest('.card-rm-item'))return;openDetail(card.dataset.id,card.dataset.type,card.dataset.poster||'',card.dataset.anime==='1');});row.appendChild(card);});sec.appendChild(row);sw.appendChild(sec);parentEl.appendChild(sw);drag(row);requestAnimationFrame(()=>{row.scrollLeft=0;});}
function buildImportedFolderCard(parentEl,folderId,folderName,items,opts={}){const wrap=document.createElement('div');wrap.className='imported-folder-wrap';const card=document.createElement('div');card.className='folder-card';card.innerHTML=`<span class="folder-card-icon">📁</span><div class="folder-card-info"><div class="folder-card-name">${ea(folderName)}</div><div class="folder-card-count">${items.length} contenut${items.length===1?'o':'i'}</div></div><button class="folder-card-reset">Svuota</button><svg class="folder-card-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg><button class="folder-card-del"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;const body=document.createElement('div');body.className='folder-card-body';const row=document.createElement('div');row.className='row';row.style.cssText='padding:12px 16px;scroll-padding-left:16px;';if(opts.showPlus!==false){const plus=document.createElement('div');plus.className='plus-card';plus.innerHTML='<div class="plus-icon">+</div><div class="plus-lbl">Aggiungi</div>';plus.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();searchAddToFolderId=folderId;searchAddFolderName=folderName;openSearch();showSearchAddBanner(folderName);});row.appendChild(plus);}items.forEach(function(item){const tmp=document.createElement('div');tmp.innerHTML=listCardHTML(item,folderId);const c=tmp.firstElementChild;const rmBtn=c.querySelector('.card-rm-item');if(rmBtn){rmBtn.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();openConfirm(`Rimuovere da <b>${ea(folderName)}</b>?`,function(){removeFromFolder(folderId,item.id);updateBookmarkIcons(item.id);renderListePage();});});}c.addEventListener('click',function(e){if(e.target.closest('.card-rm-item'))return;openDetail(c.dataset.id,c.dataset.type,c.dataset.poster||'',c.dataset.anime==='1');});row.appendChild(c);});body.appendChild(row);drag(row);requestAnimationFrame(()=>{row.scrollLeft=0;});card.addEventListener('click',function(e){if(e.target.closest('.folder-card-del,.folder-card-reset'))return;card.classList.toggle('expanded');body.classList.toggle('open');});card.querySelector('.folder-card-reset').addEventListener('click',function(e){e.stopPropagation();e.preventDefault();resetFolderItems(folderId,folderName);});card.querySelector('.folder-card-del').addEventListener('click',function(e){e.stopPropagation();e.preventDefault();openConfirm(`Eliminare la cartella <b>${ea(folderName)}</b>?`,function(){const f=getFolders();delete f[folderId];saveFolders(f);renderListePage();});});wrap.appendChild(card);wrap.appendChild(body);parentEl.appendChild(wrap);}
function renderListePage(){
  const el=document.getElementById('liste-body');el.innerHTML='';const folders=getFolders();let rendered=0;
  GROUPS.forEach(function(group){const gEl=document.createElement('div');gEl.className='liste-group';const hdr=document.createElement('div');hdr.className='liste-group-hdr';hdr.textContent=group.label;gEl.appendChild(hdr);let groupHas=false;DEF_FOLDERS.filter(function(f){return f.g===group.id;}).forEach(function(def){const folder=folders[def.id]||def,items=filterListItems(folder,folder.items||[]);if(listeFilter!=='all'&&!items.length)return;buildFolderSection(gEl,def.id,def.name,items,{showPlus:listeFilter==='all'});groupHas=true;rendered++;});if(groupHas||listeFilter==='all')el.appendChild(gEl);});
  const custom=getCustomFolders();
  if(custom.length||listeFilter==='all'){
    const gEl=document.createElement('div');gEl.className='liste-group';const hdr=document.createElement('div');hdr.className='liste-group-hdr';hdr.textContent='⭐ Personalizzate';gEl.appendChild(hdr);let groupHas=false;
    custom.forEach(function(folder){const items=filterListItems(folder,folder.items||[]);if(listeFilter!=='all'&&!items.length)return;buildImportedFolderCard(gEl,folder.id,folder.name,items,{showPlus:listeFilter==='all'});groupHas=true;rendered++;});
    if(groupHas||listeFilter==='all')el.appendChild(gEl);
  }
  const imported=Object.values(folders).filter(function(f){return !f._def&&f._imported;});
  if(imported.length){const gEl=document.createElement('div');gEl.className='liste-group';const hdr=document.createElement('div');hdr.className='liste-group-hdr';hdr.textContent='📥 Importate';gEl.appendChild(hdr);let groupHas=false;imported.forEach(function(folder){const items=filterListItems(folder,folder.items||[]);if(listeFilter!=='all'&&!items.length)return;buildImportedFolderCard(gEl,folder.id,folder.name,items,{showPlus:listeFilter==='all'});groupHas=true;rendered++;});if(groupHas||listeFilter==='all')el.appendChild(gEl);}
  if(!rendered&&listeFilter!=='all')el.innerHTML='<div class="liste-empty">Nessun contenuto per questo filtro.</div>';
}

/* CONFIRM */
function openConfirm(msg,cb){confirmCallback=cb;document.getElementById('confirm-msg').innerHTML=msg;document.getElementById('confirm-modal').classList.add('open');}
function closeConfirm(){smoothClose(document.getElementById('confirm-modal'),150,()=>{confirmCallback=null;});}
document.getElementById('confirm-cancel').addEventListener('click',closeConfirm);
document.getElementById('confirm-ok').addEventListener('click',()=>{if(confirmCallback)confirmCallback();closeConfirm();});
document.getElementById('liste-filter-bar').addEventListener('click',e=>{const btn=e.target.closest('[data-list-filter]');if(!btn)return;listeFilter=btn.dataset.listFilter;document.querySelectorAll('.list-filter-btn').forEach(b=>b.classList.toggle('active',b===btn));renderListePage();});
document.getElementById('liste-sort').addEventListener('change',function(){listeSort=this.value;renderListePage();});
document.getElementById('btn-new-list').addEventListener('click',createCustomList);
document.getElementById('btn-clean-lists').addEventListener('click',()=>openConfirm('Ripristinare tutte le liste?<br>Le liste restano, ma i contenuti al loro interno vengono rimossi.',function(){const f=getFolders();Object.values(f).forEach(folder=>{folder.items=[];});saveFolders(f);renderListePage();refreshCW();showToast('Liste ripristinate');}));

/* SEARCH */
let searchTimer;
function initSearchFilters(){
  const genre=document.getElementById('search-genre-filter'),provider=document.getElementById('search-provider-filter');
  if(genre&&!genre.dataset.ready){genre.innerHTML='<option value="">Genere</option>'+[...MV_GENRES,...TV_GENRES].filter(g=>g.id).reduce((acc,g)=>acc.some(x=>x.id===g.id)?acc:[...acc,g],[]).map(g=>`<option value="${g.id}">${g.name}</option>`).join('');genre.dataset.ready='1';}
  if(provider&&!provider.dataset.ready){provider.innerHTML='<option value="">Piattaforma</option>'+PROVIDERS.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');provider.dataset.ready='1';}
}
function getSearchFilters(){return{type:document.getElementById('search-type-filter')?.value||'all',year:document.getElementById('search-year-filter')?.value.trim()||'',genre:document.getElementById('search-genre-filter')?.value||'',provider:document.getElementById('search-provider-filter')?.value||''};}
async function passesSearchFilters(item,filters){
  if(filters.type==='movie'&&item.media_type!=='movie')return false;
  if(filters.type==='tv'&&item.media_type!=='tv')return false;
  if(filters.type==='anime'&&!(item.media_type==='tv'||item.media_type==='movie'))return false;
  if(filters.year){const y=(item.release_date||item.first_air_date||'').slice(0,4);if(y!==filters.year)return false;}
  if(filters.genre&&!(item.genre_ids||[]).map(String).includes(String(filters.genre)))return false;
  if(filters.type==='anime'){
    const genres=(item.genre_ids||[]).map(String);
    if(!genres.includes('16')&&item.original_language!=='ja')return false;
  }
  if(filters.provider&&item.media_type!=='person'){
    try{const p=await tmdb(`/${item.media_type}/${item.id}/watch/providers`);const all=[...(p.results?.IT?.flatrate||[]),...(p.results?.IT?.ads||[]),...(p.results?.IT?.rent||[]),...(p.results?.IT?.buy||[])];if(!all.some(x=>String(x.provider_id)===String(filters.provider)))return false;}catch(e){return false;}
  }
  return true;
}
async function runSearch(q){
  const filters=getSearchFilters();
  const peopleBox=document.getElementById('search-persons'),grid=document.getElementById('search-content-grid');
  const wantsPeople=filters.type==='all'||filters.type==='person';
  const wantsContent=filters.type!=='person';
  const [multi,people]=await Promise.all([wantsContent?tmdb('/search/multi',{query:q}):Promise.resolve({results:[]}),wantsPeople?tmdb('/search/person',{query:q}):Promise.resolve({results:[]})]);
  let contents=(multi.results||[]).filter(x=>x.media_type!=='person'&&(x.poster_path||x.title||x.name));
  contents=(await Promise.all(contents.slice(0,28).map(async x=>await passesSearchFilters(x,filters)?withAnimeFlag(x):null))).filter(Boolean);
  const persons=(people.results||[]).filter(x=>x.profile_path||x.known_for?.length).sort((a,b)=>(b.popularity||0)-(a.popularity||0)).slice(0,14);
  peopleBox.innerHTML=persons.length?`<div class="search-sec-hdr">Persone</div><div class="pscard-row">${persons.map(psCardHTML).join('')}</div>`:'';
  grid.innerHTML=contents.length?`${persons.length?'<div class="search-sec-hdr">Film e Serie</div>':''}${contents.map(x=>cardHTML(x)).join('')}`:'';
}
function openSearch(){initSearchFilters();document.getElementById('search-ov').classList.add('open');document.body.style.overflow='hidden';renderSearchRecent();document.getElementById('search-content-grid').innerHTML='';document.getElementById('search-persons').innerHTML='';setTimeout(()=>document.getElementById('search-input').focus(),60);}
function closeSearch(){const ov=document.getElementById('search-ov');ov.classList.add('closing');setTimeout(()=>{ov.classList.remove('open','closing');document.getElementById('search-input').value='';document.getElementById('search-persons').innerHTML='';document.getElementById('search-content-grid').innerHTML='';document.getElementById('search-recent').innerHTML='';document.body.style.overflow='';searchAddToFolderId=null;searchAddFolderName='';document.getElementById('search-add-banner').style.display='none';},150);}
function showSearchAddBanner(name){const b=document.getElementById('search-add-banner');document.getElementById('search-add-fname').textContent=name;b.style.display='flex';}
document.getElementById('search-add-cancel').addEventListener('click',()=>{searchAddToFolderId=null;searchAddFolderName='';document.getElementById('search-add-banner').style.display='none';});
document.getElementById('btn-search').addEventListener('click',()=>{searchAddToFolderId=null;document.getElementById('search-add-banner').style.display='none';openSearch();});
document.getElementById('btn-search-close').addEventListener('click',closeSearch);
document.getElementById('search-logo').addEventListener('click',closeSearch);
document.getElementById('search-recent').addEventListener('click',e=>{const ri=e.target.closest('[data-rec]'),rm=e.target.closest('[data-rm]');if(rm){e.stopPropagation();rmSH(rm.dataset.rm);renderSearchRecent();return;}if(ri){document.getElementById('search-input').value=ri.dataset.rec;document.getElementById('search-input').dispatchEvent(new Event('input'));return;}});
document.getElementById('search-input').addEventListener('keydown',e=>{if(e.key==='Enter')commitSearchHistory();});
['search-type-filter','search-year-filter','search-genre-filter','search-provider-filter'].forEach(id=>{const el=document.getElementById(id);el?.addEventListener('input',()=>document.getElementById('search-input').dispatchEvent(new Event('input')));el?.addEventListener('change',()=>document.getElementById('search-input').dispatchEvent(new Event('input')));});
document.getElementById('search-input').addEventListener('input',function(){clearTimeout(searchTimer);const q=this.value.trim();if(!q){renderSearchRecent();document.getElementById('search-persons').innerHTML='';document.getElementById('search-content-grid').innerHTML='';return;}document.getElementById('search-recent').innerHTML='';searchTimer=setTimeout(async()=>{try{await runSearch(q);}catch(e){}},340);});

/* DRAG */
function drag(row){if(!row||row.dataset.dragReady==='1')return;row.dataset.dragReady='1';let down=false,sx,sl,moved=false;row.addEventListener('mousedown',e=>{if(e.target.closest('button,a,input,select,.plus-card'))return;down=true;moved=false;sx=e.pageX-row.offsetLeft;sl=row.scrollLeft;row.classList.add('drag');},{passive:true});row.addEventListener('mouseleave',()=>{down=false;row.classList.remove('drag');});row.addEventListener('mouseup',()=>{down=false;row.classList.remove('drag');});row.addEventListener('mousemove',e=>{if(!down)return;const dx=e.pageX-row.offsetLeft-sx;if(Math.abs(dx)>4){moved=true;row.scrollLeft=sl-dx;}},{passive:true});row.addEventListener('click',e=>{if(moved&&!e.target.closest('button,a,input,select,.plus-card')){e.stopPropagation();e.preventDefault();}moved=false;},true);}

/* SWIPE BACK */
(()=>{let tx=0,ty=0;document.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;},{passive:true});document.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-tx,dy=Math.abs(e.changedTouches[0].clientY-ty);if(tx>40||dx<80||dy>60)return;if(document.getElementById('actor-modal').classList.contains('open')){closeActor();return;}if(document.getElementById('import-modal').classList.contains('open')){closeImportModal();return;}if(document.getElementById('export-sel-modal').classList.contains('open')){closeExportModal();return;}if(document.getElementById('confirm-modal').classList.contains('open')){closeConfirm();return;}if(document.getElementById('folder-picker').classList.contains('open')){closeFolderPicker();return;}if(document.getElementById('player-modal').classList.contains('open')){closePlayer();return;}if(document.getElementById('detail-modal').classList.contains('open')){closeDetail();return;}if(document.getElementById('search-ov').classList.contains('open')){closeSearch();}},{passive:true});})();

/* RANDOM */
document.querySelectorAll('.random-btn[data-random]').forEach(btn=>{btn.addEventListener('click',()=>{const pool=randomPools[btn.dataset.random];if(!pool.length){showToast('Caricamento ancora in corso…');return;}const item=pool[Math.floor(Math.random()*pool.length)];openDetail(item.id,item.media_type||'tv',item.poster_path||'',!!item._anime);});});
document.addEventListener('click',e=>{const mood=e.target.closest('[data-mood]');if(mood){loadMood(mood.dataset.mood);return;}});
document.getElementById('btn-smart-random')?.addEventListener('click',async()=>{const personal=collectPersonalItems();if(personal.length){const item=personal[Math.floor(Math.random()*personal.length)];openDetail(item.id,item.type,item.poster||'',!!item.isAnime);return;}const pool=[...randomPools.serie,...randomPools.film,...randomPools.anime];if(!pool.length){showToast('Caricamento ancora in corso…');return;}const item=pool[Math.floor(Math.random()*pool.length)];openDetail(item.id,item.media_type||item.type||'movie',item.poster_path||item.poster||'',!!item._anime);});

/* SCROLL TOP */
const stBtn=document.getElementById('scroll-top');
window.addEventListener('scroll',()=>stBtn.classList.toggle('visible',window.scrollY>600),{passive:true});
stBtn.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));

/* NAV */
function navigateHome(){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById('page-home').classList.add('active');document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));document.querySelector('.nav-btn[data-page="home"]').classList.add('active');}
function normalizeUrl(url){url=String(url||'').trim();if(!url)return'';return /^https?:\/\//i.test(url)?url:'https://'+url;}
let sportRemoteConfig=null;
function isSportAdminMode(){
  try{
    const q=new URLSearchParams(location.search);
    if(q.get('admin')==='1'||location.hash.toLowerCase().includes('admin'))localStorage.setItem('svx_admin','1');
    return localStorage.getItem('svx_admin')==='1';
  }catch(e){return false;}
}
async function fetchRemoteConfig(force=false){
  if(sportRemoteConfig&&!force)return sportRemoteConfig;
  try{
    const url=new URL(REMOTE_CONFIG_URL,location.href);
    url.searchParams.set('_',Date.now());
    const r=await fetch(url.toString(),{cache:'no-store'});
    if(!r.ok)throw Error(r.status);
    sportRemoteConfig=await r.json();
  }catch(e){sportRemoteConfig={sportUrl:SPORT_DEFAULT_URL};}
  return sportRemoteConfig;
}
function sportUrlFromConfig(cfg){return normalizeUrl(cfg?.sportUrl||cfg?.sport?.url||SPORT_DEFAULT_URL)||SPORT_DEFAULT_URL;}
function renderSportAdmin(url){
  const panel=document.getElementById('sport-admin-panel'),link=document.getElementById('sport-admin-link'),input=document.getElementById('sport-admin-input');
  const admin=isSportAdminMode();
  if(link)link.href=SPORT_ADMIN_EDIT_URL;
  if(panel)panel.style.display=admin?'flex':'none';
  if(link)link.style.display=admin?'inline-flex':'none';
  if(input&&admin)input.value=url;
}
async function loadSport(force=false){
  const cfg=await fetchRemoteConfig(force),fallback=sportUrlFromConfig(cfg),si=document.getElementById('sport-iframe'),label=document.getElementById('sport-url-label'),open=document.getElementById('sport-open-link');
  let url=fallback;
  try{
    const result=await window.StreamGNProviders?.getSportStream?.({fallbackUrl:fallback,config:cfg,force});
    url=normalizeUrl(result?.embedUrl||result?.url||fallback);
  }catch(e){url=fallback;}
  if(label)label.textContent=url;
  if(open)open.href=url;
  renderSportAdmin(url);
  if(si){si.removeAttribute('sandbox');if(force||si.dataset.url!==url){si.dataset.url=url;si.src=url;}}
}
async function copySportConfig(){
  const input=document.getElementById('sport-admin-input');
  const url=normalizeUrl(input?.value||SPORT_DEFAULT_URL);
  if(!url){showToast('Inserisci un link valido');return;}
  const text=JSON.stringify({sportUrl:url,updatedAt:new Date().toISOString()},null,2);
  try{await navigator.clipboard.writeText(text);showToast('Config copiata: incollala su GitHub');}
  catch(e){prompt('Copia questa config',text);}
}
document.getElementById('btn-sport-refresh')?.addEventListener('click',()=>loadSport(true));
document.getElementById('btn-sport-copy-config')?.addEventListener('click',copySportConfig);
document.querySelectorAll('.nav-btn[data-page]').forEach(b=>b.addEventListener('click',()=>{const pg=b.dataset.page;document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById('page-'+pg).classList.add('active');document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(pg==='sport')loadSport();if(pg==='serie'&&!loaded.serie)loadSerie();if(pg==='film'&&!loaded.film)loadFilm();if(pg==='anime'&&!loaded.anime)loadAnime();if(pg==='profilo')loadProfilo();if(pg==='liste')renderListePage();}));
document.addEventListener('click',e=>{if(e.target.closest('[data-nav-home]')){if(document.getElementById('player-modal').classList.contains('open')){attemptClosePlayer();return;}if(document.getElementById('detail-modal').classList.contains('open'))closeDetail();else if(document.getElementById('actor-modal').classList.contains('open'))closeActor();else navigateHome();}});

/* GLOBAL DELEGATION */
document.addEventListener('click',e=>{
  const sb=e.target.closest('.star-btn[data-star][data-rid]');if(sb){e.stopPropagation();const stars=Number(sb.dataset.star),rid=sb.dataset.rid;setRating(rid,stars);sb.closest('.star-row').querySelectorAll('.star-btn').forEach(b=>b.classList.toggle('active',Number(b.dataset.star)<=stars));document.querySelectorAll(`.card[data-id="${rid}"] .card-rated`).forEach(b=>{b.textContent=`⭐ ${stars}/5`;b.classList.add('visible');});showToast(`Valutazione: ${stars}/5`);return;}
  const cwRm=e.target.closest('[data-cw-id]');if(cwRm){e.stopPropagation();removeWatching(cwRm.dataset.cwId);refreshCW();return;}
  const bm=e.target.closest('[data-bm-id]');if(bm){e.stopPropagation();e.preventDefault();openFolderPicker({id:bm.dataset.bmId,type:bm.dataset.bmType,title:bm.dataset.bmTitle,poster:bm.dataset.bmPoster,isAnime:bm.dataset.bmAnime==='1'});return;}
  const actor=e.target.closest('.actor-card[data-actor-id]');if(actor){e.stopPropagation();if(actor.closest('#search-ov'))commitSearchHistory();openActor(actor.dataset.actorId);return;}
  const pscard=e.target.closest('.pscard[data-actor-id]');if(pscard){e.stopPropagation();if(pscard.closest('#search-ov'))commitSearchHistory();openActor(pscard.dataset.actorId);return;}
  const seenToggle=e.target.closest('[data-seen-toggle]');if(seenToggle){e.stopPropagation();e.preventDefault();const epItem=seenToggle.closest('.ep-item[data-ep-num]');if(epItem){const tvId=epItem.dataset.tvId,season=epItem.dataset.season,ep=seenToggle.dataset.seenToggle;setEpisodeSeen(tvId,season,ep,!isEpisodeSeen(tvId,season,ep));loadDetailEpisodes(tvId,season,epItem.dataset.anime==='1',getLastWatched(tvId));}return;}
  const epItem=e.target.closest('.ep-item[data-ep-num]');if(epItem&&!e.defaultPrevented){e.stopPropagation();const tvId=epItem.dataset.tvId,season=epItem.dataset.season,ep=epItem.dataset.epNum,isAnime=epItem.dataset.anime==='1';closeDetail();openPlayer(tvId,'tv',currentDetailTitle,currentDetailPoster,season,ep,isAnime);return;}
  const card=e.target.closest('.card[data-id]');if(card&&!e.defaultPrevented){if(e.target.closest('.card-rm-item')||e.target.closest('[data-bm-id]'))return;if(card.closest('#liste-body'))return;if(searchAddToFolderId){addToFolder(searchAddToFolderId,{id:card.dataset.id,type:card.dataset.type,title:card.dataset.title,poster:card.dataset.poster,isAnime:card.dataset.anime==='1'});updateBookmarkIcons(card.dataset.id);if(document.querySelector('#page-liste.active'))renderListePage();showToast(`Aggiunto a "${searchAddFolderName}"`);closeSearch();return;}if(card.closest('#search-ov'))commitSearchHistory();const fromActor=card.closest('#actor-modal');if(fromActor)closeActor();openDetail(card.dataset.id,card.dataset.type,card.dataset.poster||'',card.dataset.anime==='1');return;}
  const hb=e.target.closest('[data-id][data-type][data-poster]');if(hb&&!e.defaultPrevented)openDetail(hb.dataset.id,hb.dataset.type,hb.dataset.poster||'',false);
});

/* KEYBOARD */
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA')return;if(e.key==='Escape'){if(document.getElementById('import-modal').classList.contains('open')){closeImportModal();return;}if(document.getElementById('export-sel-modal').classList.contains('open')){closeExportModal();return;}if(document.getElementById('actor-modal').classList.contains('open')){closeActor();return;}if(document.getElementById('confirm-modal').classList.contains('open')){closeConfirm();return;}if(document.getElementById('folder-picker').classList.contains('open')){closeFolderPicker();return;}if(document.getElementById('player-modal').classList.contains('open')){closePlayer();return;}if(document.getElementById('detail-modal').classList.contains('open')){closeDetail();return;}if(document.getElementById('search-ov').classList.contains('open')){closeSearch();return;}}if(e.key==='/'&&!document.getElementById('search-ov').classList.contains('open')){e.preventDefault();openSearch();}if(e.key==='ArrowLeft'&&heroItems.length)renderHero((heroIdx-1+heroItems.length)%heroItems.length);if(e.key==='ArrowRight'&&heroItems.length)renderHero((heroIdx+1)%heroItems.length);});
document.getElementById('detail-modal').addEventListener('click',function(e){if(e.target===this)closeDetail();});

loadHome();
setTimeout(()=>{try{const q=new URLSearchParams(location.search);let page=q.get('page');if(page==='novita')page='profilo';if(page&&document.querySelector(`.nav-btn[data-page="${page}"]`))document.querySelector(`.nav-btn[data-page="${page}"]`).click();if(q.get('actor'))openActor(q.get('actor'));else if(q.get('id'))openDetail(q.get('id'),q.get('type')||'movie','',q.get('anime')==='1');}catch(e){}},500);

/* ============================================================
   SISTEMA NOTIFICHE — serie seguite + Top 10
   ============================================================ */

/* CSS aggiuntivo per il pannello */
(()=>{const s=document.createElement('style');s.textContent=`
@keyframes slideInRight{from{transform:translateX(100%);opacity:.8}to{transform:translateX(0);opacity:1}}
.notif-item{display:flex;gap:12px;padding:11px 10px;border-radius:12px;background:var(--s1);border:.5px solid var(--b1);margin-bottom:8px;cursor:pointer;transition:background var(--sm) var(--ease-out),transform var(--xs) var(--spring);will-change:transform}
.notif-item:hover{background:var(--s2);transform:translateX(2px)}
.notif-item.unread{border-color:rgba(48,209,88,.35);background:rgba(48,209,88,.06)}
.notif-poster{width:44px;height:66px;border-radius:7px;object-fit:cover;flex-shrink:0;background:var(--s2)}
.notif-poster-ph{width:44px;height:66px;border-radius:7px;background:var(--s2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.2rem}
.notif-body{flex:1;min-width:0}
.notif-title{font-size:.82rem;font-weight:700;line-height:1.3;margin-bottom:3px}
.notif-desc{font-size:.72rem;color:var(--green);font-weight:600;margin-bottom:3px}
.notif-time{font-size:.62rem;color:var(--tx3)}
.notif-dot{width:7px;height:7px;border-radius:50%;background:var(--green);flex-shrink:0;margin-top:5px}
.notif-empty{padding:3rem 1rem;text-align:center;color:var(--tx3);font-size:.855rem;line-height:1.7}
.notif-checking{padding:2rem;text-align:center;color:var(--tx3);font-size:.82rem;display:flex;flex-direction:column;align-items:center;gap:10px}
`;document.head.appendChild(s);})();

/* Storage notifiche */
function getNotifData(){return readJSONKey('svx_notif',{items:[],snapshots:{},lastCheck:0});}
function saveNotifData(d){writeJSONKey('svx_notif',d);}
function getUnreadCount(){return getNotifData().items.filter(n=>!n.read).length;}

/* Badge */
function updateNotifBadge(){
  const cnt=getUnreadCount(),badge=document.getElementById('notif-badge');
  if(badge)badge.style.display=cnt>0?'block':'none';
}

/* Raccoglie solo le serie che l'utente sta davvero guardando */
function getTrackedWatchingSeries(){
  const seen=new Set(),items=[];
  const add=item=>{
    if(!item||item.type!=='tv')return;
    const key=String(item.id);
    if(seen.has(key))return;
    seen.add(key);items.push(item);
  };
  Object.values(getWatching()).forEach(add);
  Object.values(getFolders()).forEach(f=>(f.items||[]).forEach(add));
  return items;
}

/* Controlla aggiornamenti su TMDB */
async function checkForUpdates(force=false){
  const data=getNotifData();
  const now=Date.now();
  const INTERVAL=6*60*60*1000; // 6 ore
  if(!force&&now-data.lastCheck<INTERVAL)return 0;

  const items=getTrackedWatchingSeries();

  let newCount=0;
  const list=document.getElementById('notif-list');
  if(list)list.innerHTML='<div class="notif-checking"><div class="spinner"></div><span>Controllo aggiornamenti…</span></div>';

  for(const item of items){
    try{
      const info=await tmdb(`/tv/${item.id}`);
      const snap=data.snapshots[item.id]||{};
      const seasons=info.number_of_seasons||0;
      const eps=info.number_of_episodes||0;
      const lastEp=info.last_episode_to_air;
      const nextEp=info.next_episode_to_air;
      const poster=info.poster_path||item.poster||'';

      // Prima volta — salva snapshot senza notifica
      if(!snap.seasons&&!snap.eps){
        data.snapshots[item.id]={seasons,eps,lastEpId:lastEp?.id||null};
        continue;
      }

      // Nuova stagione
      if(seasons>snap.seasons){
        const notif={id:`s_${item.id}_${seasons}`,itemId:item.id,type:'tv',title:item.title,poster,
          desc:`🎉 Stagione ${seasons} disponibile!`,ts:now,read:false};
        if(!data.items.find(n=>n.id===notif.id)){data.items.unshift(notif);newCount++;}
      }
      // Nuovo episodio (stessa stagione)
      else if(eps>snap.eps&&lastEp){
        const epLabel=`S${lastEp.season_number}E${lastEp.episode_number}${lastEp.name?' · '+lastEp.name:''}`;
        const notif={id:`e_${item.id}_${lastEp.id}`,itemId:item.id,type:'tv',title:item.title,poster,
          desc:`▶ Nuovo episodio: ${epLabel}`,ts:now,read:false};
        if(!data.items.find(n=>n.id===notif.id)){data.items.unshift(notif);newCount++;}
      }

      // Prossimo episodio in arrivo — solo info, non notifica push
      data.snapshots[item.id]={seasons,eps,lastEpId:lastEp?.id||null,nextEp:nextEp||null};
    }catch(e){/* skip */}
  }

  // Nuovi ingressi nella Top 10 dei contenuti più visti
  try{
    const top=await tmdb('/trending/all/day',{region:'IT'});
    const topItems=(top.results||[]).filter(x=>x.media_type==='movie'||x.media_type==='tv').slice(0,10);
    const topIds=topItems.map(x=>`${x.media_type}_${x.id}`);
    const prevTop=data.snapshots.top10Ids||[];
    const today=new Date(now).toISOString().slice(0,10);
    if(prevTop.length){
      topItems.forEach((item,idx)=>{
        const key=`${item.media_type}_${item.id}`;
        if(prevTop.includes(key))return;
        const title=item.title||item.name||'Nuovo contenuto';
        const notif={id:`top10_${key}_${today}`,itemId:item.id,type:item.media_type,title,poster:item.poster_path||'',
          desc:`🔥 Nuovo in Top 10 #${idx+1}`,ts:now,read:false};
        if(!data.items.find(n=>n.id===notif.id)){data.items.unshift(notif);newCount++;}
      });
    }
    data.snapshots.top10Ids=topIds;
  }catch(e){
    if(!data.snapshots.top10Ids)data.snapshots.top10Ids=[];
  }

  // Mantieni max 80 notifiche
  data.items=data.items.slice(0,80);
  data.lastCheck=now;
  saveNotifData(data);
  updateNotifBadge();

  // Notifica di sistema se permesso
  if(newCount>0&&'Notification' in window&&Notification.permission==='granted'){
    try{new Notification('StreaMGN',{body:`${newCount} nuov${newCount===1?'o':'i'} aggiornament${newCount===1?'o':'i'}!`,icon:'assets/streamgn-logo.png'});}catch(e){}
  }

  return newCount;
}

/* Render pannello */
function renderNotifPanel(){
  const data=getNotifData();
  const list=document.getElementById('notif-list');
  if(!list)return;

  // Segna tutte come lette
  let changed=false;
  data.items.forEach(n=>{if(!n.read){n.read=true;changed=true;}});
  if(changed){saveNotifData(data);updateNotifBadge();}

  if(!data.items.length){
    list.innerHTML='<div class="notif-empty">🔔 Nessuna notifica<br><span style="font-size:.72rem;color:var(--tx3)">Ti avviseremo per nuovi episodi, nuove stagioni<br>e nuovi ingressi nella Top 10</span></div>';
    return;
  }

  list.innerHTML=data.items.map(n=>{
    const img=n.poster?`<img src="${IMG}${n.poster}" class="notif-poster" loading="lazy">`:'<div class="notif-poster-ph">📺</div>';
    const time=new Date(n.ts).toLocaleDateString('it-IT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    return `<div class="notif-item${n.read?'':' unread'}" data-notif-id="${n.itemId}" data-notif-type="${n.type}" data-notif-poster="${n.poster||''}">
      ${img}
      <div class="notif-body">
        <div class="notif-title">${ea(n.title)}</div>
        <div class="notif-desc">${n.desc}</div>
        <div class="notif-time">${time}</div>
      </div>
      ${n.read?'':'<div class="notif-dot"></div>'}
    </div>`;
  }).join('');
}

/* Permessi notifiche */
function setupNotifPermRow(){
  const row=document.getElementById('notif-perm-row');
  if(!row)return;
  if(!('Notification' in window)){row.textContent='';return;}
  if(Notification.permission==='granted'){row.textContent='🔔 Notifiche di sistema attive';}
  else if(Notification.permission==='denied'){row.textContent='⚠️ Notifiche bloccate — attivale nelle impostazioni del browser';}
  else{row.textContent='';}
}

/* Richiede permesso alla prima apertura, una volta sola */
function askNotifPermissionOnce(){
  if(!('Notification' in window))return;
  if(Notification.permission!=='default')return;
  if(readJSONKey('svx_notif_asked',false))return;
  writeJSONKey('svx_notif_asked',true);
  Notification.requestPermission();
}
async function registerNotificationWorker(){
  if(!('serviceWorker' in navigator)||location.protocol==='file:')return;
  try{
    const reg=await navigator.serviceWorker.register('./sw.js');
    if('periodicSync' in reg&&navigator.permissions){
      const status=await navigator.permissions.query({name:'periodic-background-sync'});
      if(status.state==='granted')await reg.periodicSync.register('streamgn-updates',{minInterval:CONFIG.notificationInterval||21600000});
    }
    if(reg.active)reg.active.postMessage({type:'CHECK_UPDATES'});
  }catch(e){}
}

/* Open / close pannello */
function openNotifPanel(){
  const panel=document.getElementById('notif-panel');
  panel.style.display='block';
  setupNotifPermRow();
  renderNotifPanel();
  document.body.style.overflow='hidden';
}
function closeNotifPanel(){
  const panel=document.getElementById('notif-panel');
  panel.style.display='none';
  document.body.style.overflow='';
}

/* Event listeners */
document.getElementById('btn-notif').addEventListener('click',openNotifPanel);
document.getElementById('btn-notif-close').addEventListener('click',closeNotifPanel);
document.getElementById('notif-panel').addEventListener('click',e=>{
  if(e.target===document.getElementById('notif-panel'))closeNotifPanel();
  const item=e.target.closest('[data-notif-id]');
  if(item){closeNotifPanel();openDetail(item.dataset.notifId,item.dataset.notifType,item.dataset.notifPoster||'',false);}
});
document.getElementById('btn-notif-check').addEventListener('click',async()=>{
  const btn=document.getElementById('btn-notif-check');
  btn.textContent='⏳ Controllo…';btn.disabled=true;
  const cnt=await checkForUpdates(true);
  renderNotifPanel();
  btn.textContent='🔄 Aggiorna';btn.disabled=false;
  if(cnt>0)showToast(`${cnt} nuov${cnt===1?'o':'i'} aggiornament${cnt===1?'o':'i'}! 🎉`,3000);
  else showToast('Tutto aggiornato ✓');
});

/* Richiedi permesso notifiche alla prima apertura (una volta sola) */
askNotifPermissionOnce();
registerNotificationWorker();

/* Avvio automatico: controlla aggiornamenti dopo 3s dall'apertura */
setTimeout(async()=>{
  updateNotifBadge();
  await checkForUpdates(false);
  updateNotifBadge();
},3000);
