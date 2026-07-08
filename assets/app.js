'use strict';
const CONFIG=window.STREAMGN_CONFIG||{};
const APP_BUILD='20260708-player16';
window.STREAMGN_BUILD=APP_BUILD;
const APP_CACHE='streamgn-v59';
const SW_URL=`./sw.js?v=${APP_BUILD}`;
const TMDB_KEY=CONFIG.tmdbKey||'';
const IMG=CONFIG.images?.poster||'https://image.tmdb.org/t/p/w342',IMG_W=CONFIG.images?.posterWide||'https://image.tmdb.org/t/p/w780',BIG=CONFIG.images?.backdrop||'https://image.tmdb.org/t/p/w1280',ORIG=CONFIG.images?.original||'https://image.tmdb.org/t/p/original',FACE=CONFIG.images?.face||'https://image.tmdb.org/t/p/w185',STILL=CONFIG.images?.still||'https://image.tmdb.org/t/p/w300';
const API=CONFIG.apiBase||'https://api.themoviedb.org/3';
let heroItems=[],heroIdx=0,heroTimer,currentTvId=null,currentSrc='',currentIsAnime=false;
let currentDetailId=null,currentDetailType=null,currentDetailTitle='',currentDetailPoster='',currentDetailIsAnime=false,currentDetailSeasons=[];
let fpCurrentItem=null,fpPendingCat=null,confirmCallback=null,searchAddToFolderId=null,searchAddFolderName='';
const loaded={home:false,serie:false,film:false,anime:false,sport:false,calendario:false,profilo:false};
const loadTokens={home:0,serie:0,film:0};
const SECTION_CARD_LIMIT=16,HOME_DISCOVER_DELAY=180;
const randomPools={serie:[],film:[],anime:[]};
let activeFilterGenre={serie:null,film:null,anime:null},currentTrailerKey=null,epChangeTimer=null,listeFilter='all',listeSort='recent';
let playerProgId=null,playerProgType=null,playerProgSeason=null,playerProgEpisode=null,playerNoteSavedThisSession=false;
let playerSessionTitle='',playerSessionPoster='',playerSessionIsAnime=false,playerLastAutoSecs=0,playerLastAutoSaveAt=0,playerAutoSaveTimer=null,playerHasRealProgress=false,playerSourceHealthTimer=null;
let playerStreamSeq=0;
let playerRestoreTimer=0;
let playerSessionAnimeTitles=[],currentDetailAnimeTitles=[],playerSessionSeasons=[];
let profileStatsCache=null,calendarEntriesCache=[];
let animeExternalUrl='',sportWatchUrl='',sportRefreshTimer=null;
const sportState={data:null,selectedSport:'all',query:'',status:'all',competition:'',date:'',eventsById:new Map(),loading:false};
const SOURCE_LABELS={vixsrc:'VixSrc',vidsrc:'VidSrc',embed:'Embed.su',anime:'Streamrip',streamrip:'Streamrip'};
function sourceListFromConfig(kind,fallback){return (CONFIG.streamUiSources?.[kind]||fallback).map(id=>({id,label:SOURCE_LABELS[id]||id}));}
const SOURCES_NORMAL=sourceListFromConfig('normal',['vixsrc','vidsrc','embed']);
const SOURCES_ANIME=sourceListFromConfig('anime',['anime']);
function isAppleTouchDevice(){
  return /iPad|iPhone|iPod/i.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
}
function isMobileTouchDevice(){
  const ua=navigator.userAgent||'';
  const coarse=window.matchMedia?.('(pointer: coarse)')?.matches;
  const mobileUA=/Mobi|Android|iPad|iPhone|iPod|Mobile|Tablet/i.test(ua);
  const compact=Math.min(window.innerWidth||screen.width||0,window.innerHeight||screen.height||0)<=820;
  return isAppleTouchDevice()||((navigator.maxTouchPoints||0)>0&&(mobileUA||coarse||compact));
}
function mobileTouchAvoidSources(){
  return new Set(CONFIG.mobileTouchAvoidSources||CONFIG.appleTouchAvoidSources||['vixsrc','vidsrc']);
}
function shouldAvoidSourceOnDevice(src){
  const enabled=CONFIG.avoidUnstableMobileTouchSources??CONFIG.avoidUnstableAppleTouchSources;
  return enabled!==false&&isMobileTouchDevice()&&mobileTouchAvoidSources().has(String(src||''));
}
function orderSourcesForDevice(list){
  if(!Array.isArray(list)||!list.length)return list||[];
  const enabled=CONFIG.avoidUnstableMobileTouchSources??CONFIG.avoidUnstableAppleTouchSources;
  if(!isMobileTouchDevice()||enabled===false)return list;
  const preferred=String(CONFIG.mobileTouchPreferredSource||CONFIG.appleTouchPreferredSource||'embed');
  const ordered=[preferred,...list].filter((src,idx,arr)=>src&&arr.indexOf(src)===idx&&list.includes(src)&&!shouldAvoidSourceOnDevice(src));
  return ordered.length?ordered:list;
}
function normalizeSourceForDevice(src,isAnime=false){
  const list=(isAnime?SOURCES_ANIME:SOURCES_NORMAL).map(s=>s.id);
  const choices=orderSourcesForDevice(list);
  const value=String(src||'');
  if(value&&choices.includes(value))return value;
  return choices[0]||list[0]||value||'vixsrc';
}
currentSrc=normalizeSourceForDevice('',false);
const SPORT_DEFAULT_URL=CONFIG.sportDefaultUrl||'https://pepperstream.xyz';
const ANIME_UNITY_URL=CONFIG.animeUnityUrl||'https://www.animeunity.so';
animeExternalUrl=ANIME_UNITY_URL;
sportWatchUrl=SPORT_DEFAULT_URL;
const REMOTE_CONFIG_URL=CONFIG.remoteConfigUrl||'assets/remote-config.json';
const EXTERNAL_SITES_URL=CONFIG.externalSitesUrl||'assets/external-sites.json';
const SPORT_ADMIN_EDIT_URL=CONFIG.sportAdminEditUrl||'https://github.com/StreaMGN/StreaMGN.github.io/edit/main/assets/remote-config.json';
const EXTERNAL_SITES_ADMIN_EDIT_URL=CONFIG.externalSitesAdminEditUrl||'https://github.com/StreaMGN/StreaMGN.github.io/edit/main/assets/external-sites.json';
const PUSH_PUBLIC_KEY=CONFIG.pushPublicKey||CONFIG.push?.publicKey||'';
const PUSH_SUBSCRIBE_URL=CONFIG.pushSubscribeUrl||CONFIG.push?.subscribeUrl||'';
const PUSH_UNSUBSCRIBE_URL=CONFIG.pushUnsubscribeUrl||CONFIG.push?.unsubscribeUrl||'';
const PROVIDERS=[{name:'Netflix',id:8,c:'#e50914'},{name:'Prime Video',id:9,c:'#00a8e1'},{name:'Disney+',id:337,c:'#1133cc'},{name:'Apple TV+',id:350,c:'#aaa'},{name:'Paramount+',id:531,c:'#0055ff'},{name:'NOW',id:39,c:'#00b4b4'}];
const MV_GENRES=[{name:'Tutti',id:null},{name:'Thriller',id:53},{name:'Crime',id:80},{name:'Romantico',id:10749},{name:'Azione',id:28},{name:'Horror',id:27},{name:'Sci-Fi',id:878},{name:'Commedia',id:35},{name:'Dramma',id:18},{name:'Avventura',id:12}];
const TV_GENRES=[{name:'Tutti',id:null},{name:'Crime',id:80},{name:'Dramma',id:18},{name:'Commedia',id:35},{name:'Sci-Fi',id:10765},{name:'Mistero',id:9648},{name:'Reality',id:10764},{name:'Action',id:10759}];
const DEF_FOLDERS=[{id:'film_watch',name:'FILM che sto guardando',g:'watching',mt:'movie',an:false},{id:'serie_watch',name:'SERIE che sto guardando',g:'watching',mt:'tv',an:false},{id:'film_lista',name:'FILM in lista',g:'lista',mt:'movie',an:false},{id:'serie_lista',name:'SERIE in lista',g:'lista',mt:'tv',an:false},{id:'film_visti',name:'FILM visti',g:'visti',mt:'movie',an:false},{id:'serie_vc',name:'SERIE viste (concluse)',g:'visti',mt:'tv',an:false,sub:'c'},{id:'serie_vo',name:'SERIE viste (in corso)',g:'visti',mt:'tv',an:false,sub:'o'}];
const GROUPS=[{id:'watching',label:'👁️ Che sto guardando'},{id:'lista',label:'📋 In lista'},{id:'visti',label:'✅ Viste'}];
const DATA_KEYS=['svx_f','svx_w','svx_prog','svx_r','svx_sh','svx_notif','svx_notif_asked','svx_notif_prompt_v2','svx_s','svx_sport_url','svx_src_pref','svx_src_bad','svx_ep_seen','svx_hist','svx_tmdb_cache','svx_sport_data_v1','svx_anilist_map','svx_offline_snapshot','svx_onboarding_v1','svx_nav_state','svx_player_resume','svx_player_closed'];
const NOTIF_PROMPT_KEY='svx_notif_prompt_v2';
const NAV_STATE_KEY='svx_nav_state';
const PLAYER_RESUME_KEY='svx_player_resume';
const PLAYER_CLOSED_KEY='svx_player_closed';
const PLAYER_ROUTE_FLAG='sgnPlayer';
const NAV_RESTORE_WINDOW=30*60*1000;
const PLAYER_CLOSED_WINDOW=10*60*1000;
const RESTORABLE_PAGES=new Set(['home','film','serie','anime','sport','calendario','liste','profilo']);
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
  try{
    [NAV_STATE_KEY,PLAYER_RESUME_KEY].forEach(key=>{
      const raw=sessionStorage.getItem(key);
      if(raw!==null)storageMemory[key]=raw;
    });
  }catch(e){}
}
function readJSONKey(key,fallback){
  try{
    const sessionRaw=(key===NAV_STATE_KEY||key===PLAYER_RESUME_KEY)?sessionStorage.getItem(key):null;
    const raw=storageMemory[key]??sessionRaw??localStorage.getItem(key);
    return raw?JSON.parse(raw):fallback;
  }catch(e){return fallback;}
}
function writeJSONKey(key,value){
  try{
    const raw=JSON.stringify(value);
    storageMemory[key]=raw;
    if(key===NAV_STATE_KEY||key===PLAYER_RESUME_KEY)try{sessionStorage.setItem(key,raw);}catch(e){}
    try{localStorage.setItem(key,raw);}catch(e){}
    idbSetRaw(key,raw);
  }catch(e){}
}
function removeJSONKey(key){
  delete storageMemory[key];
  try{sessionStorage.removeItem(key);}catch(e){}
  try{localStorage.removeItem(key);}catch(e){}
  idbDelete(key);
}
function activePageName(){
  const id=document.querySelector('.page.active')?.id||'page-home';
  return id.replace(/^page-/,'')||'home';
}
function getNavState(){return readJSONKey(NAV_STATE_KEY,{page:'home',player:{open:false},updatedAt:0});}
function writeNavState(patch={}){
  const prev=getNavState();
  writeJSONKey(NAV_STATE_KEY,{...prev,...patch,updatedAt:Date.now()});
}
function playerNavSnapshot(open=document.getElementById('player-modal')?.classList.contains('open')){
  return {
    open:!!open,
    id:playerProgId||currentTvId||null,
    type:playerProgType||'movie',
    title:playerSessionTitle||document.getElementById('pm-title')?.textContent||'',
    poster:playerSessionPoster||'',
    season:playerProgSeason||null,
    episode:playerProgEpisode||null,
    isAnime:!!playerSessionIsAnime,
    src:normalizeSourceForDevice(currentSrc,!!playerSessionIsAnime),
    savedAt:Date.now()
  };
}
function playerRouteSignature(raw){
  const p=normalizePlayerSnapshot(raw);
  if(!p?.id)return'';
  return [p.id,p.type,p.season||'',p.episode||'',p.isAnime?'anime':'std',p.src||'vixsrc'].join('|');
}
function markPlayerExplicitlyClosed(snapshot=playerNavSnapshot(true)){
  const p=normalizePlayerSnapshot(snapshot,false);
  if(!p?.id)return;
  writeJSONKey(PLAYER_CLOSED_KEY,{key:playerRouteSignature(p),id:p.id,type:p.type,season:p.season||null,episode:p.episode||null,closedAt:Date.now()});
}
function isRecentlyClosedPlayer(raw){
  const p=normalizePlayerSnapshot(raw);
  if(!p?.id)return false;
  const closed=readJSONKey(PLAYER_CLOSED_KEY,null);
  if(!closed?.id||Date.now()-(closed.closedAt||0)>PLAYER_CLOSED_WINDOW)return false;
  return closed.key===playerRouteSignature(p)||(
    String(closed.id)===String(p.id)&&
    String(closed.type||'movie')===String(p.type||'movie')&&
    String(closed.season||'')===String(p.season||'')&&
    String(closed.episode||'')===String(p.episode||'')
  );
}
function normalizePlayerSnapshot(raw,forceOpen=true){
  if(!raw)return null;
  const id=String(raw.id||raw.pid||'').trim();
  if(!id)return null;
  const season=raw.season??raw.s??null,episode=raw.episode??raw.ep??null;
  return {
    open:forceOpen?true:!!raw.open,
    id,
    type:String(raw.type||raw.ptype||'movie')==='tv'?'tv':'movie',
    title:String(raw.title||raw.t||'StreaMGN'),
    poster:String(raw.poster||raw.p||''),
    season:season!==null&&season!==''?Number(season):null,
    episode:episode!==null&&episode!==''?Number(episode):null,
    isAnime:!!(raw.isAnime||raw.anime),
    src:normalizeSourceForDevice(raw.src||currentSrc,!!(raw.isAnime||raw.anime)),
    page:RESTORABLE_PAGES.has(raw.page)?raw.page:activePageName(),
    savedAt:Number(raw.savedAt||raw.updatedAt||Date.now())
  };
}
function readPlayerRouteSnapshot(){
  try{
    const hash=location.hash?location.hash.slice(1):'';
    if(!hash)return null;
    const p=new URLSearchParams(hash);
    if(p.get(PLAYER_ROUTE_FLAG)!=='1')return null;
    return normalizePlayerSnapshot({
      id:p.get('id'),
      type:p.get('type'),
      title:p.get('title'),
      poster:p.get('poster'),
      season:p.get('season'),
      episode:p.get('episode'),
      isAnime:p.get('anime')==='1',
      src:p.get('src'),
      page:p.get('page'),
      savedAt:Number(p.get('ts')||0)
    });
  }catch(e){return null;}
}
function readHistoryPlayerSnapshot(){
  try{
    const p=history.state?.streamgnPlayer;
    if(!p)return null;
    return normalizePlayerSnapshot(p);
  }catch(e){return null;}
}
function writePlayerRoute(snapshot){
  const p=normalizePlayerSnapshot(snapshot);
  if(!p?.open||!p.id)return;
  try{
    const params=new URLSearchParams();
    params.set(PLAYER_ROUTE_FLAG,'1');
    params.set('id',p.id);
    params.set('type',p.type);
    params.set('title',p.title||'StreaMGN');
    if(p.poster)params.set('poster',p.poster);
    if(p.season)params.set('season',String(p.season));
    if(p.episode)params.set('episode',String(p.episode));
    if(p.isAnime)params.set('anime','1');
    if(p.src)params.set('src',p.src);
    params.set('page',p.page||activePageName());
    const updatedAt=Date.now();
    const url=new URL(location.href);
    const nextHash=params.toString();
    const state=history.state&&typeof history.state==='object'?history.state:{};
    const nextState={...state,streamgnPlayer:{...p,updatedAt}};
    if((location.hash?location.hash.slice(1):'')===nextHash&&history.state?.streamgnPlayer){
      return;
    }
    url.hash=nextHash;
    history.replaceState(nextState,'',url);
  }catch(e){}
}
function ensurePlayerHistoryGuard(snapshot=playerNavSnapshot(true)){
  const p=normalizePlayerSnapshot(snapshot);
  if(!p?.open||!p.id||isRecentlyClosedPlayer(p))return;
  try{
    writePlayerRoute(p);
    const key=playerRouteSignature(p);
    const current=history.state&&typeof history.state==='object'?history.state:{};
    if(current.streamgnPlayerGuard?.key===key)return;
    const guardState={...current,streamgnPlayer:{...p,updatedAt:Date.now()},streamgnPlayerGuard:{key,createdAt:Date.now()}};
    history.pushState(guardState,'',location.href);
  }catch(e){}
}
function clearPlayerRoute(){
  try{
    const url=new URL(location.href);
    const current=readPlayerRouteSnapshot();
    if(current)url.hash='';
    const state=history.state&&typeof history.state==='object'?{...history.state}:{};
    delete state.streamgnPlayer;
    history.replaceState(state,'',url);
  }catch(e){}
}
function savePlayerResumeBackup(snapshot=playerNavSnapshot(true)){
  snapshot=normalizePlayerSnapshot(snapshot);
  if(!snapshot?.open||!snapshot.id)return;
  removeJSONKey(PLAYER_CLOSED_KEY);
  const now=Date.now();
  const page=snapshot.page||activePageName();
  writeJSONKey(PLAYER_RESUME_KEY,{...snapshot,page,updatedAt:now,reopenUntil:now+NAV_RESTORE_WINDOW});
  writePlayerRoute({...snapshot,page,updatedAt:now});
}
function clearPlayerResumeBackup(){removeJSONKey(PLAYER_RESUME_KEY);clearPlayerRoute();}
function persistOpenPlayerState(reason=''){
  const snapshot={...playerNavSnapshot(true),page:activePageName(),reason};
  if(!snapshot.id)return false;
  savePlayerResumeBackup(snapshot);
  writeNavState({page:snapshot.page,player:snapshot});
  ensurePlayerHistoryGuard(snapshot);
  return true;
}
function saveCurrentNavState(extra={}){
  const player=playerNavSnapshot();
  if(player.open)savePlayerResumeBackup(player);
  writeNavState({page:activePageName(),player,...extra});
}
function savePlayerNavState(open=true){
  if(open&&persistOpenPlayerState('nav'))return;
  const prev=getNavState();
  const player={...(prev.player||{}),...playerNavSnapshot(open)};
  if(player.open)savePlayerResumeBackup(player);
  writeNavState({page:activePageName(),player});
}
function clearSavedPlayerNavState(){
  const prev=getNavState();
  markPlayerExplicitlyClosed(playerNavSnapshot(true));
  clearPlayerResumeBackup();
  writeNavState({page:activePageName(),player:{...(prev.player||{}),open:false,savedAt:Date.now()}});
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
  if(getRestorablePlayerSnapshot()){
    restoreSavedPageIfNeeded(true);
    restoreSavedPlayerIfNeeded(40,true);
    return;
  }
  const active=document.querySelector('.page.active')?.id||'page-home';
  if(active==='page-home'){loaded.home=false;loadHome();}
  if(active==='page-serie'){loaded.serie=false;loadSerie();}
  if(active==='page-film'){loaded.film=false;loadFilm();}
  if(active==='page-anime'){loaded.anime=false;loadAnime();}
  if(active==='page-sport'){loaded.sport=false;loadSport();}
  if(active==='page-calendario'){loaded.calendario=false;loadCalendario();}
  if(active==='page-profilo'){loaded.profilo=false;loadProfilo();}
  if(active==='page-liste')renderListePage();
  if(document.getElementById('search-ov').classList.contains('open'))renderSearchRecent();
}
migrateLegacyScopedData();
hydrateStorageMemoryFromLocal();
hydrateStorageFromIDB();

/* SMOOTH CLOSE */
function smoothClose(el,dur,cb){el.classList.add('closing');setTimeout(()=>{el.classList.remove('open','closing');if(cb)cb();},dur);}
function lockBodyScroll(){document.body.style.overflow='hidden';}
function unlockBodyScrollIfClear(){
  const modalOpen=document.querySelector('#search-ov.open,#detail-modal.open,#actor-modal.open,#player-modal.open,#sport-detail-modal.open,#external-watch-modal.open,#folder-picker.open,#confirm-modal.open,#export-sel-modal.open,#import-modal.open');
  const notifOpen=document.getElementById('notif-panel')?.style.display==='block';
  if(!modalOpen&&!notifOpen)document.body.style.overflow='';
}
function resetPanelScroll(target){
  const el=typeof target==='string'?document.querySelector(target):target;
  if(!el)return;
  try{el.scrollTop=0;}catch(e){}
}
function hardCloseLayer(selector){
  const el=document.querySelector(selector);
  if(!el)return;
  el.classList.remove('open','closing');
}
function closeTransientLayers(){
  ['#search-ov','#folder-picker','#confirm-modal','#export-sel-modal','#import-modal','#external-watch-modal'].forEach(hardCloseLayer);
  const notif=document.getElementById('notif-panel');
  if(notif)notif.style.display='none';
  hideTrailer();
  clearTimeout(searchTimer);
  searchAddToFolderId=null;
  searchAddFolderName='';
  fpCurrentItem=null;
  fpPendingCat=null;
  confirmCallback=null;
  _importData=null;
  const banner=document.getElementById('search-add-banner');
  if(banner)banner.style.display='none';
  unlockBodyScrollIfClear();
}
function closeContentLayers(){
  closeTransientLayers();
  hardCloseLayer('#detail-modal');
  hardCloseLayer('#actor-modal');
  hardCloseLayer('#sport-detail-modal');
  if(document.getElementById('player-modal')?.classList.contains('open'))closePlayer();
  unlockBodyScrollIfClear();
}

/* HELPERS */
const ea=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmtMin=m=>{if(!m)return null;const h=Math.floor(m/60),r=m%60;return h?`${h}h ${r}m`:`${r}m`;};
const fmtBinge=m=>{if(!m||m<1)return null;const h=Math.floor(m/60),d=Math.floor(h/24),rh=h%24;return d>0?`${d}g ${rh}h`:`${h}h ${m%60}m`;};
const defer=ms=>new Promise(resolve=>setTimeout(resolve,ms));
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
['nav-logo','search-logo','dm-logo','am-logo','pm-logo','sport-detail-logo'].forEach(id=>makeLogo(document.getElementById(id)));

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
let contrastFrame=0;
let viewportUpdateTimer=0;
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
  if(typeof requestReadableContrast==='function')requestReadableContrast();
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

/* LIQUID GLASS MOTION */
function initLiquidGlassMotion(){
  const root=document.documentElement;
  const reduce=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
  let lastY=window.scrollY||0,ticking=false;
  const update=()=>{
    const y=window.scrollY||0;
    root.dataset.scroll=y>18?'moved':'top';
    root.dataset.scrollDir=y>lastY&&y>90?'down':'up';
    lastY=y;
    ticking=false;
  };
  const updateMotion=()=>{root.dataset.motion=reduce?.matches?'reduced':'full';};
  window.addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(update);}}, {passive:true});
  if(reduce){
    if(reduce.addEventListener)reduce.addEventListener('change',updateMotion);
    else if(reduce.addListener)reduce.addListener(updateMotion);
  }
  update();
  updateMotion();
}
initLiquidGlassMotion();

function initLiquidGlassPointer(){
  const els='.gbtn,.icon-btn,.theme-select,.nav-btn,.fchip,.list-filter-btn,.mood-chip,.sp-iframe-btn,.pip-btn,.folder-card,.premium-stat,.profile-pill,.search-bar,.pm-note-bar,.tv-controls,.player-tools,.fp-sheet,.confirm-box,.exp-sel-box,.imp-box,#notif-sheet,nav,.dm-topbar,.am-topbar,.pm-topbar,.sp-iframe-bar,.calendar-item,.calendar-empty,.onboarding-card,.profile-hero-actions,.offline-status,.notif-permission-card,.toast';
  document.addEventListener('pointermove',e=>{
    const el=e.target.closest?.(els);
    if(!el)return;
    const r=el.getBoundingClientRect();
    el.style.setProperty('--glass-x',`${e.clientX-r.left}px`);
    el.style.setProperty('--glass-y',`${e.clientY-r.top}px`);
    el.style.setProperty('--glass-px',`${Math.round((e.clientX-r.left)/Math.max(r.width,1)*100)}%`);
    el.style.setProperty('--glass-py',`${Math.round((e.clientY-r.top)/Math.max(r.height,1)*100)}%`);
  },{passive:true});
}
initLiquidGlassPointer();

/* READABILITY CONTRAST */
function readableRgb(value){
  if(!value||value==='transparent')return null;
  const m=String(value).match(/rgba?\(([^)]+)\)/i);
  if(!m)return null;
  const p=m[1].split(',').map(x=>x.trim());
  const r=Number(p[0]),g=Number(p[1]),b=Number(p[2]),a=p[3]==null?1:Number(p[3]);
  if(!Number.isFinite(r)||!Number.isFinite(g)||!Number.isFinite(b)||a<.08)return null;
  return{r,g,b,a};
}
function readableLuma({r,g,b}){
  const ch=[r,g,b].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});
  return .2126*ch[0]+.7152*ch[1]+.0722*ch[2];
}
function nearestReadableBg(el){
  for(let n=el;n&&n.nodeType===1;n=n.parentElement){
    const rgb=readableRgb(getComputedStyle(n).backgroundColor);
    if(rgb)return rgb;
  }
  return document.documentElement.dataset.theme==='light'?{r:247,g:247,b:248,a:1}:{r:0,g:0,b:0,a:1};
}
function requestReadableContrast(){
  if(contrastFrame)return;
  contrastFrame=requestAnimationFrame(applyReadableContrast);
}
function applyReadableContrast(){
  contrastFrame=0;
  document.documentElement.dataset.contrastReady='1';
  const media='.hero,.card,.card-ov,.dm-hero-wrap,#player-modal,.player-box,.cw-thumb,.ep-still,.no-poster,.dm-no-poster,.actor-no-photo,.iframe-fallback,.profile-hero,.am-hero,.calendar-poster,.notif-poster-ph';
  document.querySelectorAll(media).forEach(el=>{el.dataset.contrast='on-dark';});
  const surfaces='body,main,.page,nav,.dm-topbar,.am-topbar,.pm-topbar,.sp-iframe-bar,.search-header,#notif-sheet,.gbtn,.icon-btn,.theme-select,.nav-btn,.fchip,.list-filter-btn,.mood-chip,.sp-iframe-btn,.pip-btn,.src-toggle,.tv-controls,.player-tools,.pm-note-bar,.folder-card,.folder-card-body,.premium-stat,.profile-pill,.search-bar,.toast,.fp-sheet,.confirm-box,.exp-sel-box,.imp-box,.calendar-item,.calendar-empty,.onboarding-card,.notif-permission-card,.notif-item,.search-rec-item,.ep-item,.coll-card,.plat-badge,.genre-pill,.fp-cat-btn,.fp-custom-btn,.fp-cur-tag,.imp-row,.exp-chk-row,.player-source-state,.anime-note,.offline-status';
  document.querySelectorAll(surfaces).forEach(el=>{
    if(el.matches('.gbtn-white,.iframe-fallback-primary,.pm-note-save-btn,.pm-reminder-save,.notif-permission-allow,.onboarding-choice.primary')){el.dataset.contrast='on-light';return;}
    const ownsGlass=el.matches('.gbtn,.icon-btn,.theme-select,.nav-btn,.fchip,.list-filter-btn,.mood-chip,.sp-iframe-btn,.pip-btn,.src-toggle,.tv-controls,.player-tools,.pm-note-bar,.search-bar,.player-source-state,.anime-note');
    if(el.closest(media)&&!ownsGlass&&!el.matches('#player-modal,.player-box,.iframe-fallback'))return;
    const luma=readableLuma(nearestReadableBg(el));
    el.dataset.contrast=luma>.56?'on-light':'on-dark';
  });
}
function initReadableContrast(){
  const start=()=>{
    applyReadableContrast();
    requestReadableContrast();
    const observer=new MutationObserver(requestReadableContrast);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
    window.addEventListener('resize',requestReadableContrast,{passive:true});
    window.addEventListener('load',requestReadableContrast,{once:true});
  };
  if(document.body)start();
  else document.addEventListener('DOMContentLoaded',start,{once:true});
}
initReadableContrast();

/* MOBILE VIEWPORT STABILITY */
function syncViewportMetrics(){
  document.documentElement.style.setProperty('--app-vh',`${window.innerHeight||document.documentElement.clientHeight}px`);
  document.documentElement.style.setProperty('--app-vw',`${window.innerWidth||document.documentElement.clientWidth}px`);
}
function isPlayerOpen(){return !!document.getElementById('player-modal')?.classList.contains('open');}
function scheduleViewportSync(){
  clearTimeout(viewportUpdateTimer);
  viewportUpdateTimer=setTimeout(()=>{syncViewportMetrics();requestReadableContrast();},180);
}
syncViewportMetrics();
window.addEventListener('resize',scheduleViewportSync,{passive:true});
window.addEventListener('orientationchange',()=>setTimeout(scheduleViewportSync,260),{passive:true});
window.addEventListener('pageshow',e=>{syncViewportMetrics();if(e.persisted)requestReadableContrast();},{passive:true});

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
  const video=document.getElementById('stream-video');
  if(video&&video.style.display!=='none'&&video.src){
    handleAutoProgress({event:video.ended?'ended':'timeupdate',currentTime:video.currentTime||0,duration:video.duration||0});
    return video.currentTime||0;
  }
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
  playerAutoSaveTimer=setInterval(()=>{
    if(isPlayerOpen())rememberOpenPlayer('heartbeat');
    requestPlayerRealProgress();
  },10000);
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
    return host==='vixsrc.to'||host.endsWith('.vixsrc.to')||host==='vidsrc.me'||host.endsWith('.vidsrc.me')||host==='vidsrc.xyz'||host.endsWith('.vidsrc.xyz')||host==='embed.su'||host.endsWith('.embed.su')||host==='streamrip-website-production.up.railway.app'||host.endsWith('.railway.app');
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
const nativeVideoEl=document.getElementById('stream-video');
if(nativeVideoEl){
  nativeVideoEl.addEventListener('timeupdate',()=>handleAutoProgress({event:'timeupdate',currentTime:nativeVideoEl.currentTime||0,duration:nativeVideoEl.duration||0}));
  nativeVideoEl.addEventListener('pause',()=>handleAutoProgress({event:'pause',currentTime:nativeVideoEl.currentTime||0,duration:nativeVideoEl.duration||0}));
  nativeVideoEl.addEventListener('ended',()=>handleAutoProgress({event:'ended',currentTime:nativeVideoEl.currentTime||0,duration:nativeVideoEl.duration||0}));
}
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
function readAppData(){return{folders:readJSONKey('svx_f',{}),watching:readJSONKey('svx_w',{}),progress:readJSONKey('svx_prog',{}),ratings:readJSONKey('svx_r',{}),searchHistory:readJSONKey('svx_sh',[]),settings:loadSettings(),notifications:readJSONKey('svx_notif',{items:[],snapshots:{},lastCheck:0}),sportPresets:readJSONKey('svx_sport_presets',null),sportCache:readJSONKey('svx_sport_data_v1',null),sourcePrefs:readJSONKey('svx_src_pref',{}),episodeSeen:readJSONKey('svx_ep_seen',{}),history:readJSONKey('svx_hist',{})};}
function writeAppData(data){if(!data)return;writeJSONKey('svx_f',data.folders||{});writeJSONKey('svx_w',data.watching||{});writeJSONKey('svx_prog',data.progress||{});writeJSONKey('svx_r',data.ratings||{});writeJSONKey('svx_sh',data.searchHistory||[]);writeJSONKey('svx_notif',data.notifications||{items:[],snapshots:{},lastCheck:0});if(data.settings)writeJSONKey('svx_s',data.settings);if(data.sportPresets)writeJSONKey('svx_sport_presets',data.sportPresets);if(data.sportCache)writeJSONKey('svx_sport_data_v1',data.sportCache);if(data.sourcePrefs)writeJSONKey('svx_src_pref',data.sourcePrefs);if(data.episodeSeen)writeJSONKey('svx_ep_seen',data.episodeSeen);if(data.history)writeJSONKey('svx_hist',data.history);}
function doFullBackup(){const data={version:3,kind:'streamgn_full_backup',exportedAt:new Date().toISOString(),data:readAppData()};downloadJSON(data,`streamgn-backup-${new Date().toISOString().slice(0,10)}.json`);showToast('Backup completo esportato ✓');}
function restoreFullBackup(data){if(data.kind!=='streamgn_full_backup'){showToast('Backup non valido');return;}openConfirm('Importare il <b>backup completo</b>?<br>Verranno ripristinati liste, progressi e impostazioni presenti nel file.',function(){const payload=data.data||data.profiles?.[0]?.data;if(!payload){showToast('Backup vuoto');return;}writeAppData(payload);refreshAfterStorageHydrated();showToast('Backup importato ✓',3000);});}
function idsFromSelectedFolders(folders){
  const ids=new Set();
  Object.values(folders||{}).forEach(f=>(f.items||[]).forEach(it=>{if(it?.id!=null)ids.add(String(it.id));}));
  return ids;
}
function contentIdFromEpisodeSeenKey(key){
  const m=String(key||'').match(/^(.+)_s\d+_e\d+$/i);
  return m?m[1]:'';
}
function contentIdFromHistoryKey(key,value){
  if(value?.id!=null)return String(value.id);
  const m=String(key||'').match(/^(?:movie|tv)_(.+?)(?:_s\d+_e\d+)?$/i);
  return m?m[1]:'';
}
function mergeJSONStore(key,patch){
  if(!patch||typeof patch!=='object')return;
  const current=readJSONKey(key,{});
  Object.assign(current,patch);
  writeJSONKey(key,current);
}
async function saveOfflineLibrary(){
  const items=collectPersonalItems(160).map(item=>personalCardItem(item)).filter(item=>item.id);
  const snapshot={version:1,ts:Date.now(),items,calendar:calendarEntriesCache.map(e=>({id:e.id,type:e.type,title:e.title,poster:e.poster,date:e.date,label:e.label})),data:readAppData()};
  writeJSONKey('svx_offline_snapshot',snapshot);
  if('caches' in window){
    try{
      const cache=await caches.open('streamgn-offline-v1');
      const posterUrls=items.map(i=>i.poster_path).filter(Boolean).slice(0,90).flatMap(p=>[`${IMG}${p}`,`${IMG_W}${p}`]);
      await Promise.allSettled(posterUrls.map(url=>cache.add(url)));
    }catch(e){}
  }
  showToast('Libreria offline salvata');
}
function offlineSnapshotInfo(){
  const snap=readJSONKey('svx_offline_snapshot',null);
  if(!snap?.ts)return 'Non ancora salvata';
  return `Salvata ${new Date(snap.ts).toLocaleDateString('it-IT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`;
}

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
  resetPanelScroll('#export-sel-modal .exp-sel-box');
  lockBodyScroll();
}
function closeExportModal(){smoothClose(document.getElementById('export-sel-modal'),150,unlockBodyScrollIfClear);}
function doExport(){
  const sids=Array.from(document.querySelectorAll('.exp-chk:checked')).map(c=>c.dataset.fid);if(!sids.length){showToast('Seleziona almeno una lista');return;}
  const af=getFolders(),ef={};sids.forEach(fid=>{if(af[fid])ef[fid]=af[fid];});
  const si=idsFromSelectedFolders(ef);
  const aw=getWatching(),ew={};Object.entries(aw).forEach(([id,w])=>{if(si.has(id))ew[id]=w;});
  const ar=readJSONKey('svx_r',{}),er={};si.forEach(id=>{if(ar[id])er[id]=ar[id];});
  const ap=getProgressStore(),ep={};Object.entries(ap).forEach(([k,v])=>{if([...si].some(id=>k.includes(`_${id}_`)))ep[k]=v;});
  const aes=getEpisodeSeenStore(),ee={};Object.entries(aes).forEach(([k,v])=>{if(si.has(contentIdFromEpisodeSeenKey(k)))ee[k]=v;});
  const ah=readJSONKey('svx_hist',{}),eh={};Object.entries(ah).forEach(([k,v])=>{if(si.has(contentIdFromHistoryKey(k,v)))eh[k]=v;});
  const data={version:2,exportedAt:new Date().toISOString(),selectedFolders:sids,folders:ef,watching:ew,progress:ep,ratings:er,episodeSeen:ee,history:eh};
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
function closeImportModal(){smoothClose(document.getElementById('import-modal'),150,()=>{_importData=null;unlockBodyScrollIfClear();});}
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
  resetPanelScroll('#import-modal .imp-box');
  lockBodyScroll();
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
  if(_importData.episodeSeen)mergeJSONStore('svx_ep_seen',_importData.episodeSeen);
  if(_importData.history)mergeJSONStore('svx_hist',_importData.history);
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
function isAnimeSource(src){return currentIsAnime||src==='anime'||src==='streamrip';}
function isPlayablePlayerUrl(url,anime=false){
  url=String(url||'').trim();
  if(!url||url==='about:blank')return false;
  if(/^data:|^blob:/i.test(url))return true;
  try{
    const u=new URL(url,location.href);
    const host=u.hostname.toLowerCase(),path=u.pathname.toLowerCase();
    return /^https?:$/i.test(u.protocol);
  }catch(e){return false;}
}
function isDirectVideoUrl(url){
  url=String(url||'').trim();
  if(!url)return false;
  try{
    const u=new URL(url,location.href);
    return /\.(mp4|m4v|webm|mov|m3u8)(\?|$)/i.test(u.pathname)||/\.m3u8(\?|$)/i.test(url);
  }catch(e){return /\.(mp4|m4v|webm|mov|m3u8)(\?|$)/i.test(url);}
}
function stopNativeVideo(clear=true){
  const video=document.getElementById('stream-video');
  if(!video)return;
  try{video.pause();}catch(e){}
  if(clear){video.removeAttribute('src');video.load();}
  video.style.display='none';
}
function showIframePlayer(frame){
  preparePlayerFrame(frame);
  const video=document.getElementById('stream-video');
  if(video){stopNativeVideo(true);}
  frame.style.display='block';
}
function setNativeVideoSrc(url,startSecs=0){
  const frame=document.getElementById('vix-frame'),video=document.getElementById('stream-video');
  if(!video)return false;
  if(frame){frame.removeAttribute('srcdoc');frame.removeAttribute('src');frame.style.display='none';}
  video.style.display='block';
  video.src=url;
  const seek=Number(startSecs)||0;
  if(seek>5){
    const applySeek=()=>{try{video.currentTime=seek;}catch(e){}};
    if(video.readyState>=1)applySeek();else video.addEventListener('loadedmetadata',applySeek,{once:true});
  }
  video.play().catch(()=>{});
  return true;
}
function setFrameMessage(frame,title,body,actionUrl=''){
  preparePlayerFrame(frame);
  stopNativeVideo(true);
  frame.style.display='block';
  const link=actionUrl?`<a href="${ea(actionUrl)}" target="_blank" rel="noopener" style="display:inline-flex;margin-top:18px;padding:10px 14px;border-radius:999px;background:#fff;color:#000;text-decoration:none;font:700 13px -apple-system,BlinkMacSystemFont,sans-serif">Apri ricerca</a>`:'';
  frame.removeAttribute('src');
  frame.srcdoc=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:#050505;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.wrap{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:28px;box-sizing:border-box}.box{max-width:520px}.title{font-size:20px;font-weight:800;margin-bottom:10px}.body{font-size:14px;line-height:1.45;color:rgba(255,255,255,.68)}</style></head><body><div class="wrap"><div class="box"><div class="title">${ea(title)}</div><div class="body">${ea(body)}</div>${link}</div></div></body></html>`;
}
function setIframeSrcIfChanged(frame,url){
  const next=String(url||'');
  if(!frame||!next)return false;
  if((frame.getAttribute('src')||'')===next)return false;
  frame.src=next;
  return true;
}
function isUnstableMobilePlayerUrl(url){
  if(!url||!isMobileTouchDevice())return false;
  try{
    const host=new URL(url,location.href).hostname;
    return host==='vixsrc.to'||host.endsWith('.vixsrc.to')||host==='vidsrc.me'||host.endsWith('.vidsrc.me')||host==='vidsrc.xyz'||host.endsWith('.vidsrc.xyz')||host==='vidsrcme.ru'||host.endsWith('.vidsrcme.ru');
  }catch(e){return false;}
}
function withTimeout(promise,ms,message='timeout'){
  let timer;
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,embedUrl:'',error:message}),ms);});
  return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
}
async function ensureStreamRemoteConfig(){
  try{
    const cfg=await fetchRemoteConfig();
    applyRemoteRuntimeConfig(cfg);
  }catch(e){}
}
function getAnimeFlatEpisode(season,episode){
  const s=Number(season)||1,ep=Number(episode)||1;
  if(s<=1)return ep;
  const seasons=(playerSessionSeasons&&playerSessionSeasons.length?playerSessionSeasons:currentDetailSeasons)||[];
  const before=seasons
    .filter(item=>Number(item.season_number)>0&&Number(item.season_number)<s)
    .reduce((sum,item)=>sum+(Number(item.episode_count)||0),0);
  return before>0?before+ep:ep;
}
function getEmbedUrl(id,type,season,episode,src,startSecs){
  const s=season||1,e=episode||1;
  if(isAnimeSource(src)){
    return window.StreamGNProviders?.getAnimeFallbackUrl?.({id,type,season:s,episode:e,flatEpisode:getAnimeFlatEpisode(s,e),title:playerSessionTitle,titles:playerSessionAnimeTitles})||'about:blank';
  }
  src=normalizeSourceForDevice(src,false);
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
  const anime=isAnimeSource(src);
  src=normalizeSourceForDevice(src,anime);
  const s=season||1,e=episode||1,fallback=getEmbedUrl(id,type,s,e,src,startSecs),providers=window.StreamGNProviders;
  if(!providers)return {ok:!!fallback,embedUrl:fallback};
  if(anime)await ensureStreamRemoteConfig();
  const payload={id:String(id),tmdbId:String(id),type,season:s,episode:e,title:playerSessionTitle,titles:playerSessionAnimeTitles,poster:playerSessionPoster,provider:src,source:src,startSecs,settings:loadSettings(),fallbackUrl:fallback};
  if(anime)payload.flatEpisode=getAnimeFlatEpisode(s,e);
  try{
    const result=anime
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
  preparePlayerFrame(fr);
  persistOpenPlayerState('before-frame-src');
  const anime=isAnimeSource(src);
  src=normalizeSourceForDevice(src,anime);
  if(String(currentTvId)===String(id))currentSrc=src;
  const seq=++playerStreamSeq,fallback=getEmbedUrl(id,type,season,episode,src,startSecs),providers=window.StreamGNProviders;
  if(anime)setFrameMessage(fr,'Caricamento episodio','Un attimo.');
  else{showIframePlayer(fr);fr.removeAttribute('srcdoc');setIframeSrcIfChanged(fr,providers?.hasBackend?.()?'about:blank':fallback);}
  const result=await withTimeout(resolveStreamResult(id,type,season,episode,src,startSecs),anime?12000:18000,'anime provider timeout');
  if(seq!==playerStreamSeq||String(currentTvId)!==String(id))return;
  let url=result?.embedUrl||result?.iframeUrl||result?.url||fallback;
  if(!anime&&isUnstableMobilePlayerUrl(url)){
    currentSrc=normalizeSourceForDevice('embed',false);
    url=getEmbedUrl(id,type,season,episode,currentSrc,startSecs);
  }
  if(anime&&(!result?.ok||!isPlayablePlayerUrl(url,true))){
    setFrameMessage(fr,'Anime non disponibile','Non sono riuscito a trovare questo episodio.');
    return;
  }
  if(isDirectVideoUrl(url)&&setNativeVideoSrc(url,startSecs))return;
  showIframePlayer(fr);
  fr.removeAttribute('srcdoc');
  setIframeSrcIfChanged(fr,url||fallback);
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
  if(genreId){
    el.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';
    const path=page==='anime'?(genreId===16?'/discover/movie':'/discover/tv'):(page==='serie'?'/discover/tv':'/discover/movie');
    const params={with_genres:genreId,sort_by:'popularity.desc'};
    if(page==='serie')params.watch_region='IT';
    if(page==='anime')params.with_original_language='ja';
    tmdb(path,params).then(d=>{
      el.innerHTML='';
      const genres=page==='serie'?TV_GENRES:page==='anime'?[{name:'Film anime',id:16},...TV_GENRES]:MV_GENRES;
      const label=genres.find(g=>g.id===genreId)?.name||'Anime';
      const mediaType=path.includes('/tv')?'tv':'movie';
      const items=(d.results||[]).filter(x=>page!=='anime'||isAnimeLike({...x,media_type:mediaType})||genreId===16).map(x=>({...x,media_type:mediaType,_anime:page==='anime'?1:0}));
      if(items.length){addSec(el,`Migliori — ${label}`,items,null,'');items.forEach(x=>{if(x.poster_path&&randomPools[page])randomPools[page].push(x);});}
      else el.innerHTML='<div class="empty">Nessun risultato.</div>';
    }).catch(()=>{el.innerHTML='<div class="err">Errore.</div>';});
  }
  else{loaded[page]=false;if(page==='serie')loadSerie();else if(page==='anime')loadAnime();else loadFilm();}
}

function collectPersonalItems(limit=18){const seen=new Set(),items=[];const add=i=>{if(!i?.id)return;const type=i.type||i.media_type||'movie',key=`${type}_${i.id}`;if(seen.has(key))return;seen.add(key);items.push({...i,type});};Object.values(getWatching()).forEach(add);Object.values(getFolders()).forEach(f=>(f.items||[]).forEach(add));return items.slice(0,limit);}
function personalCardItem(item,reason='Dalle tue liste'){return{id:item.id,title:item.title||item.name||'',name:item.title||item.name||'',poster_path:item.poster_path||item.poster||'',media_type:item.type||item.media_type||'movie',_anime:item.isAnime?1:item._anime?1:0,_reason:reason};}
function calendarDaysUntilDate(date,now=Date.now()){if(!date)return null;const t=new Date(`${date}T12:00:00Z`).getTime();if(!Number.isFinite(t))return null;return Math.ceil((t-now)/86400000);}
function calendarDateLabel(date){try{return new Date(`${date}T12:00:00`).toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short',year:'numeric'});}catch(e){return date||'';}}
function calendarTomorrow(){const d=new Date();d.setDate(d.getDate()+1);return d.toISOString().slice(0,10);}
function calendarDateIsFuture(date){const d=calendarDaysUntilDate(date);return d!==null&&d>=0;}
function calendarDateFromInfo(type,info){
  if(!info)return null;
  if(type==='tv'){
    const next=info.next_episode_to_air;
    if(next?.air_date)return{date:next.air_date,label:`S${next.season_number}E${next.episode_number}${next.name?' · '+next.name:''}`,kind:'episode'};
    if(info.first_air_date&&calendarDateIsFuture(info.first_air_date))return{date:info.first_air_date,label:'Prima uscita',kind:'release'};
    return null;
  }
  if(info.release_date)return{date:info.release_date,label:'Uscita film',kind:'release'};
  return null;
}
function isUpcomingCalendarDate(date,maxDays=90){const d=calendarDaysUntilDate(date);return d!==null&&d>=0&&d<=maxDays;}
function icsEscape(text){return String(text||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
function icsDate(date){return String(date||'').replace(/-/g,'');}
function icsNextDate(date){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10).replace(/-/g,'');}
function downloadCalendarEvent({title,date,desc,type,id}){
  if(!date){showToast('Data non disponibile');return;}
  const stamp=new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
  const uid=`streamgn-${type||'content'}-${id||Date.now()}-${date}@streamgn`;
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//StreaMGN//Calendar//IT','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${icsDate(date)}`,`DTEND;VALUE=DATE:${icsNextDate(date)}`,`SUMMARY:${icsEscape(title||'StreaMGN')}`,`DESCRIPTION:${icsEscape(desc||'Aggiunto da StreaMGN')}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
  const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`streamgn-${String(title||'evento').toLowerCase().replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'evento'}.ics`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('Evento calendario creato');
}
function addDetailToCalendar(info,type,id,title,poster,isAnime){
  const dateInfo=calendarDateFromInfo(type,info),date=dateInfo?.date&&calendarDateIsFuture(dateInfo.date)?dateInfo.date:calendarTomorrow();
  const label=dateInfo?.date&&calendarDateIsFuture(dateInfo.date)?dateInfo.label:'Promemoria visione';
  downloadCalendarEvent({title:`${label}: ${title}`,date,desc:`${title} su StreaMGN${isAnime?' · Anime':''}`,type,id});
}
async function getCalendarEntries(limit=60){
  const items=collectPersonalItems(limit),entries=[];
  await Promise.all(items.map(async item=>{
    try{
      const type=item.type==='tv'?'tv':'movie',info=await tmdb(`/${type}/${item.id}`,{}, {maxAge:2*60*60*1000}),dateInfo=calendarDateFromInfo(type,info);
      if(!dateInfo||!isUpcomingCalendarDate(dateInfo.date,type==='tv'?120:90))return;
      entries.push({item:personalCardItem({...item,poster:info.poster_path||item.poster},dateInfo.label),info,date:dateInfo.date,label:dateInfo.label,type,id:item.id,title:item.title||info.title||info.name||'',poster:info.poster_path||item.poster||'',days:calendarDaysUntilDate(dateInfo.date)});
    }catch(e){}
  }));
  return entries.sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,36);
}
async function addPersonalHomeSections(container,isCurrent=()=>true){
  const personal=collectPersonalItems(28).map(item=>personalCardItem(item,'Dalle tue liste')).filter(x=>x.poster_path);
  if(personal.length&&isCurrent())addSec(container,'Dalle tue liste',personal.slice(0,18),null,'smart');
  const upcoming=(await getCalendarEntries(36)).slice(0,14).map(e=>({id:e.id,title:e.title,name:e.title,poster_path:e.poster,media_type:e.type,_anime:e.item._anime||0,_reason:e.label}));
  if(!isCurrent())return;
  if(upcoming.length)addSec(container,'In arrivo per te',upcoming,null,'smart');
}
async function addForYouSection(container,isCurrent=()=>true){
  const items=collectPersonalItems();if(!items.length)return;
  const genreScore={},typeScore={movie:0,tv:0},seen=new Set(items.map(i=>String(i.id)));
  const sample=items.slice(0,8);
  const infos=await Promise.all(sample.map(async item=>{try{const type=item.type==='tv'?'tv':'movie',info=await tmdb(`/${type}/${item.id}`);return{type,info};}catch(e){return null;}}));
  if(!isCurrent())return;
  infos.filter(Boolean).forEach(({type,info})=>{typeScore[type]+=2;(info.genres||[]).forEach(g=>{genreScore[g.id]=(genreScore[g.id]||0)+1;});});
  const genreId=Object.entries(genreScore).sort((a,b)=>b[1]-a[1])[0]?.[0];if(!genreId)return;
  const genreName=[...MV_GENRES,...TV_GENRES].find(g=>String(g.id)===String(genreId))?.name||'generi simili';
  const type=typeScore.tv>typeScore.movie?'tv':'movie',path=type==='tv'?'/discover/tv':'/discover/movie';
  try{const d=await tmdb(path,{with_genres:genreId,sort_by:'popularity.desc',watch_region:'IT'});if(!isCurrent())return;const rec=(d.results||[]).filter(x=>x.poster_path&&!seen.has(String(x.id))).slice(0,18).map(x=>({...x,media_type:type,_reason:`Perche guardi ${genreName}`}));if(rec.length)addSec(container,'Per te',rec,null,'smart');}catch(e){}
}
async function addDiscoverSections(container,sections,delay=HOME_DISCOVER_DELAY,isCurrent=()=>true){
  for(const sec of sections){
    if(!isCurrent())return;
    try{
      const data=await tmdb(sec.path,sec.params||{});
      if(!isCurrent()||!document.body.contains(container))return;
      const items=(data.results||[]).map(x=>({...x,media_type:sec.mediaType||x.media_type||'movie'}));
      if(items.length){
        addSec(container,sec.name,items,sec.color||null,sec.tag||'');
        if(sec.pool)items.forEach(x=>{if(x.poster_path)randomPools[sec.pool].push(x);});
      }
    }catch(e){}
    if(delay)await defer(delay);
  }
}

/* HOME */
async function loadHome(){
  if(loaded.home)return;loaded.home=true;
  const run=++loadTokens.home,isCurrent=()=>run===loadTokens.home;
  const hw=document.getElementById('hero-wrap'),hs=document.getElementById('home-secs');
  hw.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';hs.innerHTML='';
  try{
    const [tr,top10]=await Promise.all([tmdb('/trending/all/week'),tmdb('/trending/all/day',{region:'IT'})]);
    if(!isCurrent())return;
    heroItems=tr.results.filter(x=>x.backdrop_path);renderHero(0);
    const cw=getAllWatching();if(cw.length)renderCW(hs,cw);
    await addForYouSection(hs,isCurrent);if(!isCurrent())return;
    await addPersonalHomeSections(hs,isCurrent);if(!isCurrent())return;
    addSecTop10(hs,'Top 10 in Italia oggi',top10.results.slice(0,10));
    addSec(hs,'In tendenza questa settimana',tr.results,null,'');
    addDiscoverSections(hs,[
      ...PROVIDERS.map(p=>({name:p.name,path:'/discover/movie',params:{with_watch_providers:p.id,watch_region:'IT',sort_by:'popularity.desc'},mediaType:'movie',color:p.c})),
      ...MV_GENRES.filter(g=>g.id).map(g=>({name:g.name,path:'/discover/movie',params:{with_genres:g.id,sort_by:'popularity.desc'},mediaType:'movie',tag:'genre'}))
    ],HOME_DISCOVER_DELAY,isCurrent).catch(()=>{});
  }catch(e){if(isCurrent())hw.innerHTML='<div class="err">Errore nel caricamento.</div>';}
}

async function loadCalendario(force=false){
  const el=document.getElementById('calendar-body');if(!el)return;
  if(loaded.calendario&&!force&&calendarEntriesCache.length)return;
  loaded.calendario=true;
  el.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';
  try{
    const entries=await getCalendarEntries(90);
    calendarEntriesCache=entries;
    if(!entries.length){
      el.innerHTML=`<div class="calendar-empty">
        <div class="calendar-empty-title">Nessuna uscita imminente nelle tue liste</div>
        <div class="calendar-empty-sub">Quando salvi film o serie con prossime uscite, li vedrai qui.</div>
      </div>`;
      return;
    }
    el.innerHTML=`<div class="calendar-grid">${entries.map((e,i)=>{
      const poster=e.poster?`<img src="${IMG}${e.poster}" alt="${ea(e.title)}" loading="lazy">`:'<div class="calendar-poster-ph">📅</div>';
      const day=e.days===0?'Oggi':e.days===1?'Domani':`Tra ${e.days} giorni`;
      return `<article class="calendar-item" data-cal-open="${i}">
        <div class="calendar-poster">${poster}</div>
        <div class="calendar-info">
          <div class="calendar-date">${calendarDateLabel(e.date)} · ${day}</div>
          <div class="calendar-title">${ea(e.title)}</div>
          <div class="calendar-sub">${ea(e.label)} · ${e.type==='tv'?'Serie TV':'Film'}</div>
        </div>
        <div class="calendar-actions">
          <button class="gbtn calendar-add" data-cal-add="${i}">Aggiungi al calendario</button>
        </div>
      </article>`;
    }).join('')}</div>`;
    el.onclick=e=>{
      const add=e.target.closest('[data-cal-add]');
      if(add){e.stopPropagation();const entry=calendarEntriesCache[Number(add.dataset.calAdd)];if(entry)downloadCalendarEvent({title:`${entry.label}: ${entry.title}`,date:entry.date,desc:`${entry.title} su StreaMGN`,type:entry.type,id:entry.id});return;}
      const open=e.target.closest('[data-cal-open]');
      if(open){const entry=calendarEntriesCache[Number(open.dataset.calOpen)];if(entry)openDetail(entry.id,entry.type,entry.poster||'',!!entry.item._anime);}
    };
  }catch(e){el.innerHTML='<div class="err">Errore nel caricamento del calendario.</div>';}
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
  const topGenre=stats.genres[0]?.name||'In scoperta';
  const focus=stats.watching?`${stats.watching} da finire`:'Niente in sospeso';
  return `<section class="profile-hero">
    <div class="profile-hero-bg">${stats.covers.slice(0,8).map(p=>`<img src="${IMG}${p}" alt="">`).join('')}</div>
    <div class="profile-hero-grad"></div>
    <div class="profile-hero-content">
      <div class="profile-kicker">StreaMGN Replay</div>
      <h1>Il tuo profilo visione</h1>
      <p>Statistiche, gusti e contenuti recenti raccolti dalle tue liste e dai progressi salvati.</p>
      <div class="profile-hero-actions"><button class="gbtn gbtn-white" id="btn-profile-share">Condividi</button><button class="gbtn" id="btn-profile-offline">Salva offline</button></div>
      <div class="offline-status">${offlineSnapshotInfo()}</div>
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
  <section class="profile-section"><div class="section-head"><span class="section-name">Insight smart</span><span class="gtag">Premium</span></div><div class="premium-grid profile-grid profile-insights"><div class="premium-stat"><b>${ea(topGenre)}</b><span>genere dominante</span></div><div class="premium-stat"><b>${ea(focus)}</b><span>prossima azione</span></div><div class="premium-stat"><b>${stats.recent.length}</b><span>recenti tracciati</span></div><div class="premium-stat"><b>${stats.precisionMinutes?hLabel(stats.precisionMinutes):'0m'}</b><span>progressi precisi</span></div></div></section>
  <section class="profile-section"><div class="section-head"><span class="section-name">Generi che ti descrivono</span><span class="gtag">Profilo</span></div><div class="profile-pill-row">${genreHTML}</div></section>
  <section class="profile-section"><div class="section-head"><span class="section-name">Ultime visioni</span><span class="gtag">Replay</span></div>${recentHTML}</section>`;
}
async function loadProfilo(){
  if(loaded.profilo&&profileStatsCache)return;
  loaded.profilo=true;
  const el=document.getElementById('profile-wrap');if(!el)return;
  el.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';
  try{profileStatsCache=await computeProfileStats();el.innerHTML=profileStatsHTML(profileStatsCache);document.getElementById('btn-profile-share')?.addEventListener('click',shareProfileWrapped);document.getElementById('btn-profile-offline')?.addEventListener('click',saveOfflineLibrary);const row=el.querySelector('.profile-row');if(row)drag(row);}
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
async function loadSerie(){
  if(loaded.serie)return;loaded.serie=true;
  const run=++loadTokens.serie,isCurrent=()=>run===loadTokens.serie;
  buildFilters('filter-serie',TV_GENRES,'serie');
  const el=document.getElementById('serie-secs');
  el.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';
  try{
    const tr=await tmdb('/trending/tv/week');
    if(!isCurrent())return;
    el.innerHTML='';
    const trending=tr.results.map(x=>({...x,media_type:'tv'}));
    addSec(el,'Serie in tendenza',trending,null,'');
    trending.forEach(x=>{if(x.poster_path)randomPools.serie.push(x);});
    addDiscoverSections(el,[
      ...PROVIDERS.map(p=>({name:p.name,path:'/discover/tv',params:{with_watch_providers:p.id,watch_region:'IT',sort_by:'popularity.desc'},mediaType:'tv',color:p.c,pool:'serie'})),
      ...TV_GENRES.filter(g=>g.id).map(g=>({name:g.name,path:'/discover/tv',params:{with_genres:g.id,sort_by:'popularity.desc'},mediaType:'tv',tag:'genre'}))
    ],HOME_DISCOVER_DELAY,isCurrent).catch(()=>{});
  }catch(e){if(isCurrent())el.innerHTML='<div class="err">Errore.</div>';}
}
async function loadFilm(){
  if(loaded.film)return;loaded.film=true;
  const run=++loadTokens.film,isCurrent=()=>run===loadTokens.film;
  buildFilters('filter-film',MV_GENRES,'film');
  const el=document.getElementById('film-secs');
  el.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';
  try{
    const [tr,now,top]=await Promise.all([tmdb('/trending/movie/week'),tmdb('/movie/now_playing',{region:'IT'}),tmdb('/movie/top_rated',{region:'IT'})]);
    if(!isCurrent())return;
    el.innerHTML='';
    const trending=tr.results.map(x=>({...x,media_type:'movie'}));
    addSec(el,'Film in tendenza',trending,null,'');
    addSec(el,'Ora al cinema',now.results.map(x=>({...x,media_type:'movie'})),null,'');
    addSec(el,'I più votati di sempre',top.results.map(x=>({...x,media_type:'movie'})),null,'');
    trending.forEach(x=>{if(x.poster_path)randomPools.film.push(x);});
    addDiscoverSections(el,[
      ...PROVIDERS.map(p=>({name:p.name,path:'/discover/movie',params:{with_watch_providers:p.id,watch_region:'IT',sort_by:'popularity.desc'},mediaType:'movie',color:p.c,pool:'film'})),
      ...MV_GENRES.filter(g=>g.id).map(g=>({name:g.name,path:'/discover/movie',params:{with_genres:g.id,sort_by:'popularity.desc'},mediaType:'movie',tag:'genre'}))
    ],HOME_DISCOVER_DELAY,isCurrent).catch(()=>{});
  }catch(e){if(isCurrent())el.innerHTML='<div class="err">Errore.</div>';}
}
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
  loaded.anime=true;
  const sites=await fetchExternalSites(),rawUrl=siteRawUrlFromExternal(sites,'anime',ANIME_UNITY_URL),openUrl=siteOpenUrlFromExternal(sites,'anime',rawUrl),label=document.getElementById('anime-url-label'),open=document.getElementById('anime-open-link'),fallback=document.getElementById('anime-fallback-open'),el=document.getElementById('anime-secs');
  animeExternalUrl=openUrl;
  if(label){label.textContent=externalDisplayLabel(rawUrl);label.title=rawUrl;}
  if(open)open.href=openUrl;
  if(fallback)fallback.href=openUrl;
  buildFilters('filter-anime',[{name:'Tutti',id:null},{name:'Azione',id:10759},{name:'Avventura',id:10759},{name:'Commedia',id:35},{name:'Dramma',id:18},{name:'Sci-Fi',id:10765},{name:'Film anime',id:16}],'anime');
  if(!el)return;
  el.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';
  try{
    const [trend,top,airing,movies]=await Promise.all([
      tmdb('/trending/tv/week').catch(()=>({results:[]})),
      tmdb('/discover/tv',{with_genres:16,with_original_language:'ja',sort_by:'vote_average.desc',vote_count_gte:120}).catch(()=>({results:[]})),
      tmdb('/discover/tv',{with_genres:16,with_original_language:'ja',sort_by:'popularity.desc','air_date.gte':new Date(Date.now()-45*86400000).toISOString().slice(0,10)}).catch(()=>({results:[]})),
      tmdb('/discover/movie',{with_genres:16,with_original_language:'ja',sort_by:'popularity.desc'}).catch(()=>({results:[]}))
    ]);
    el.innerHTML='';
    const animeTrend=(trend.results||[]).filter(isAnimeLike).map(x=>({...x,media_type:'tv',_anime:1}));
    if(animeTrend.length){addSec(el,'Anime in tendenza',animeTrend,null,'');animeTrend.forEach(x=>randomPools.anime.push(x));}
    addSec(el,'Nuovi episodi e serie popolari',(airing.results||[]).filter(x=>x.poster_path).map(x=>({...x,media_type:'tv',_anime:1})),null,'');
    addSec(el,'Anime più votati',(top.results||[]).filter(x=>x.poster_path).map(x=>({...x,media_type:'tv',_anime:1})),null,'');
    addSec(el,'Film anime',(movies.results||[]).filter(x=>x.poster_path).map(x=>({...x,media_type:'movie',_anime:1})),null,'');
    addDiscoverSections(el,[
      {name:'Azione anime',path:'/discover/tv',params:{with_genres:'16,10759',with_original_language:'ja',sort_by:'popularity.desc'},mediaType:'tv',pool:'anime'},
      {name:'Commedia anime',path:'/discover/tv',params:{with_genres:'16,35',with_original_language:'ja',sort_by:'popularity.desc'},mediaType:'tv',pool:'anime'},
      {name:'Dramma anime',path:'/discover/tv',params:{with_genres:'16,18',with_original_language:'ja',sort_by:'popularity.desc'},mediaType:'tv',pool:'anime'},
      {name:'Sci-Fi anime',path:'/discover/tv',params:{with_genres:'16,10765',with_original_language:'ja',sort_by:'popularity.desc'},mediaType:'tv',pool:'anime'}
    ],HOME_DISCOVER_DELAY,()=>document.querySelector('#page-anime.active')).catch(()=>{});
    if(!el.children.length)el.innerHTML='<div class="empty">Anime non disponibili al momento.</div>';
  }catch(e){
    el.innerHTML='<div class="err">Errore nel caricamento degli anime.</div>';
  }
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
function addSec(container,name,items,color,type){if(!items?.length)return;const visible=items.slice(0,SECTION_CARD_LIMIT);const sec=document.createElement('div');sec.className='section';const dot=color?`<span class="pip" style="background:${color}"></span>`:'';const gt=type==='genre'?`<span class="gtag">Genere</span>`:type==='smart'?`<span class="gtag">Smart</span>`:'';sec.innerHTML=`<div class="section-head">${dot}<span class="section-name">${name}</span>${gt}</div><div class="row">${visible.map(cardHTML).join('')}</div>`;container.appendChild(sec);drag(sec.querySelector('.row'));}
function cardHTML(item){item=withAnimeFlag(item);const title=item.title||item.name||'',type=item.media_type||'movie',poster=item.poster_path||item.poster||'',score=item.vote_average?'★ '+item.vote_average.toFixed(1):'';const inLib=isInAnyFolder(item.id),anime=item._anime?1:0,rated=getRating(item.id),progress=cardProgressHTML(item,type);const img=poster?`<img src="${IMG}${poster}" alt="${ea(title)}" loading="lazy" decoding="async" fetchpriority="low">`:`<div class="no-poster">${title}</div>`;return `<div class="card" data-id="${item.id}" data-type="${type}" data-title="${ea(title)}" data-poster="${poster}" data-anime="${anime}">${img}${rated?`<div class="card-rated visible">⭐ ${rated}/5</div>`:`<div class="card-rated">⭐ ${rated}/5</div>`}${progress}<div class="card-ov"><div class="card-ov-title">${title}</div><div class="card-ov-sub">${score||'ⓘ Dettagli'}</div></div><div class="card-bm${inLib?' saved':''}" data-bm-id="${item.id}" data-bm-type="${type}" data-bm-title="${ea(title)}" data-bm-poster="${poster}" data-bm-anime="${anime}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></div></div>`;}
function listCardHTML(item,folderId){const title=item.title||'',type=item.type||'movie',poster=item.poster||'',anime=item.isAnime?1:0,progress=cardProgressHTML(item,type);const img=poster?`<img src="${IMG}${poster}" alt="${ea(title)}" loading="lazy" decoding="async" fetchpriority="low">`:`<div class="no-poster">${ea(title)}</div>`;const score=getRating(item.id);return `<div class="card" data-id="${item.id}" data-type="${type}" data-title="${ea(title)}" data-poster="${poster}" data-anime="${anime}">${img}<button class="card-rm-item" data-rm-from="${folderId}" data-rm-id="${item.id}"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>${score?`<div class="card-rated visible">⭐ ${score}/5</div>`:''}${progress}<div class="card-ov"><div class="card-ov-title">${ea(title)}</div><div class="card-ov-sub">ⓘ Dettagli</div></div></div>`;}
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
  closeTransientLayers();
  hardCloseLayer('#actor-modal');
  currentDetailId=String(id);currentDetailType=type;currentDetailIsAnime=!!isAnime;currentDetailPoster=poster||'';currentDetailSeasons=[];currentDetailAnimeTitles=[];hideTrailer();
  const bd=document.getElementById('dm-backdrop'),bdy=document.getElementById('dm-body');
  bd.style.backgroundImage=poster?`url('${IMG_W}${poster}')`:''
  bdy.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';
  const detailModal=document.getElementById('detail-modal');
  detailModal.classList.add('open');resetPanelScroll(detailModal);lockBodyScroll();
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
    bdy.innerHTML=`<div class="dm-poster-col">${info.poster_path?`<img src="${IMG_W}${info.poster_path}" class="dm-poster" id="dm-poster-img" alt="${ea(title)}">`:`<div class="dm-no-poster">${title}</div>`}${platHTML}<div class="dm-actions">${playResumePill}<button class="gbtn gbtn-white gbtn-full" id="btn-detail-play" style="padding:11px 20px;font-size:.9rem">${playLabel}</button>${trailerBtn}<button class="gbtn gbtn-full" id="btn-detail-share">Condividi</button><button class="gbtn gbtn-full" id="btn-detail-calendar">Aggiungi al calendario</button><button class="gbtn gbtn-full" id="btn-detail-save"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>${inLib?'Nelle tue liste':'Salva in lista'}</button>${last?`<button class="gbtn gbtn-full" id="btn-detail-remove-cw">Rimuovi da Continua a guardare</button>`:''}${starRatingHTML(id)}${progNoteHTML}</div></div><div class="dm-info-col"><div class="dm-type-tag">${isAnime?'Anime · ':''}${type==='tv'?'Serie TV':'Film'}${year?' · '+year:''}</div><h1 class="dm-title">${title}</h1>${tagline}<div class="dm-genres">${genres}</div><div class="dm-meta-row">${score?`<div class="dm-meta-item"><span class="star">★</span><b>${score}</b><span>/10</span></div>`:''}${runtime?`<div class="dm-meta-item">⏱ <b>${runtime}</b></div>`:''}${type==='tv'&&info.number_of_seasons?`<div class="dm-meta-item">📺 <b>${info.number_of_seasons} stagion${info.number_of_seasons===1?'e':'i'}</b></div>`:''}${type==='tv'&&info.number_of_episodes?`<div class="dm-meta-item">📋 <b>${info.number_of_episodes} ep.</b></div>`:''}${statusLabel?`<div class="dm-meta-item">• <b>${statusLabel}</b></div>`:''}${info.original_language?`<div class="dm-meta-item">🌐 <b>${info.original_language.toUpperCase()}</b></div>`:''}</div>${bingeHTML}<p class="dm-overview">${info.overview||'Nessuna descrizione disponibile.'}</p>${cast.length?`<div class="dm-section-title" id="dm-cast-title">${type==='tv'?'Cast stagione '+(last?.season||1):'Cast completo'}</div><div class="cast-row" id="dm-cast-row">${castRow}</div>`:''}${episodesSection}<div id="dm-similar-wrap"></div><div id="dm-coll-wrap"></div></div>`;
    document.getElementById('btn-detail-play').addEventListener('click',()=>{if(isAnime){openExternalWatchPrompt('anime',{title,season:last?.season||1,episode:last?.episode||1});return;}closeDetail();openPlayer(id,type,title,info.poster_path||poster,last?.season||null,last?.episode||null,false);});
    const pr=document.getElementById('btn-detail-prog-resume');if(pr&&progNote)pr.addEventListener('click',()=>{if(isAnime){openExternalWatchPrompt('anime',{title,season:last?.season||1,episode:last?.episode||1});return;}closeDetail();openPlayer(id,type,title,info.poster_path||poster,last?.season||null,last?.episode||null,false);});
    document.getElementById('btn-detail-save').addEventListener('click',()=>openFolderPicker({id:String(id),type,title,poster:info.poster_path||poster||'',isAnime:!!isAnime}));
    document.getElementById('btn-detail-share').addEventListener('click',()=>shareEntity(title,buildEntityUrl('detail',id,type,!!isAnime)));
    document.getElementById('btn-detail-calendar').addEventListener('click',()=>addDetailToCalendar(info,type,id,title,info.poster_path||poster||'',!!isAnime));
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
function closeDetail(){hideTrailer();smoothClose(document.getElementById('detail-modal'),180,unlockBodyScrollIfClear);}
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
function creditCardHTML(item){
  const base=cardHTML(item),role=item.character||item.job||'';
  return `<div class="credit-card-wrap">${base}${role?`<div class="credit-role-under">${ea(role)}</div>`:''}</div>`;
}
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
  closeTransientLayers();
  hardCloseLayer('#detail-modal');
  const ab=document.getElementById('am-body'),actorModal=document.getElementById('actor-modal');ab.innerHTML='<div class="spin-wrap"><div class="spinner"></div></div>';actorModal.classList.add('open');resetPanelScroll(actorModal);lockBodyScroll();
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
function closeActor(){smoothClose(document.getElementById('actor-modal'),180,unlockBodyScrollIfClear);}
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
  const choices=orderSourcesForDevice(list);
  if(prefs[key]&&choices.includes(prefs[key])&&!bad[prefs[key]])return prefs[key];
  if(fallback&&choices.includes(fallback)&&!bad[fallback])return fallback;
  if(isMobileTouchDevice()&&!isAnime)return choices.find(src=>!bad[src])||choices[0]||list[0];
  return choices.find(src=>!bad[src])||list.find(src=>!bad[src])||list[0];
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
  el.textContent='';
}
function playerPickerParts(kind){
  return kind==='season'
    ? {select:document.getElementById('s-sel'),btn:document.getElementById('s-picker-btn'),label:document.getElementById('s-picker-label'),menu:document.getElementById('s-picker-menu'),wrap:document.querySelector('[data-player-picker-wrap="season"]')}
    : {select:document.getElementById('e-sel'),btn:document.getElementById('e-picker-btn'),label:document.getElementById('e-picker-label'),menu:document.getElementById('e-picker-menu'),wrap:document.querySelector('[data-player-picker-wrap="episode"]')};
}
function closePlayerPickers(except=''){
  ['season','episode'].forEach(kind=>{
    if(kind===except)return;
    const p=playerPickerParts(kind);
    p.wrap?.classList.remove('open','drop-up');
    p.btn?.setAttribute('aria-expanded','false');
  });
}
function positionPlayerPicker(kind){
  const p=playerPickerParts(kind);
  if(!p.wrap||!p.menu)return;
  const rect=p.wrap.getBoundingClientRect();
  const roomBelow=(window.innerHeight||document.documentElement.clientHeight)-rect.bottom;
  const menuH=Math.min(260,Math.max(160,p.menu.scrollHeight||220));
  p.wrap.classList.toggle('drop-up',roomBelow<menuH+18&&rect.top>menuH);
}
function syncPlayerPicker(kind){
  const p=playerPickerParts(kind);
  if(!p.select||!p.btn||!p.label||!p.menu)return;
  const options=[...p.select.options];
  const selected=p.select.options[p.select.selectedIndex]||options[0];
  const label=selected?.textContent||p.btn.dataset.empty||'Seleziona';
  p.label.textContent=label;
  p.btn.title=label;
  p.btn.disabled=!options.length;
  p.menu.innerHTML=options.map(opt=>{
    const active=String(opt.value)===String(p.select.value);
    return `<button type="button" class="player-picker-option${active?' active':''}" role="option" aria-selected="${active?'true':'false'}" data-picker-kind="${kind}" data-picker-value="${ea(opt.value)}">${ea(opt.textContent||opt.value)}</button>`;
  }).join('');
}
function syncPlayerPickers(){
  syncPlayerPicker('season');
  syncPlayerPicker('episode');
}
function choosePlayerPicker(kind,value){
  const p=playerPickerParts(kind);
  if(!p.select)return;
  p.select.value=value;
  syncPlayerPickers();
  closePlayerPickers();
  p.select.dispatchEvent(new Event('change',{bubbles:true}));
}
document.addEventListener('click',e=>{
  const trigger=e.target.closest?.('[data-player-picker]');
  if(trigger){
    e.preventDefault();
    const kind=trigger.dataset.playerPicker;
    const p=playerPickerParts(kind);
    const opening=!p.wrap?.classList.contains('open');
    closePlayerPickers(opening?kind:'');
    p.wrap?.classList.toggle('open',opening);
    if(opening)requestAnimationFrame(()=>positionPlayerPicker(kind));
    p.btn?.setAttribute('aria-expanded',opening?'true':'false');
    return;
  }
  const option=e.target.closest?.('[data-picker-kind][data-picker-value]');
  if(option){
    e.preventDefault();
    choosePlayerPicker(option.dataset.pickerKind,option.dataset.pickerValue);
    return;
  }
  if(!e.target.closest?.('[data-player-picker-wrap]'))closePlayerPickers();
},true);
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  closePlayerPickers();
});
function preparePlayerFrame(frame=document.getElementById('vix-frame')){
  if(!frame)return;
  frame.removeAttribute('sandbox');
}
function buildSrcToggle(){const toggle=document.getElementById('src-toggle');if(toggle)toggle.innerHTML='';updateSourceState();}
function reloadPlayer(saveFirst=true){if(saveFirst)requestPlayerRealProgress();clearTimeout(playerSourceHealthTimer);const tc=document.getElementById('tv-ctrl');const s=document.getElementById('s-sel').value||1,ep=document.getElementById('e-sel').value||1;preparePlayerFrame();if(tc.style.display!=='none'&&currentTvId){const prog=getProgress(currentTvId,'tv',s,ep);setPlayerFrameSrc(currentTvId,'tv',s,ep,currentSrc,prog?prog.secs:0);resetPlayerAutoClock();}else if(currentTvId){const prog=getProgress(currentTvId,'movie',null,null);setPlayerFrameSrc(currentTvId,'movie',null,null,currentSrc,prog?prog.secs:0);resetPlayerAutoClock();}updateSourceState();}
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
function setPlayerTvControlsVisible(visible){
  const tc=document.getElementById('tv-ctrl');
  if(!tc)return;
  if(visible){
    tc.hidden=false;
    tc.classList.add('is-active');
    tc.classList.remove('is-hidden');
    tc.style.display='';
  }else{
    closePlayerPickers();
    tc.hidden=true;
    tc.classList.remove('is-active');
    tc.classList.add('is-hidden');
    tc.style.display='none';
  }
}
function loadSelectedTvEpisode(s,ep){
  if(!currentTvId)return;
  const sSel=document.getElementById('s-sel'),eSel=document.getElementById('e-sel');
  if(sSel&&String(sSel.value)!==String(s))sSel.value=String(s);
  if(eSel&&String(eSel.value)!==String(ep))eSel.value=String(ep);
  syncPlayerPickers();
  playerProgSeason=Number(s);
  playerProgEpisode=Number(ep);
  currentSrc=getPreferredSource(currentTvId,'tv',s,ep,currentIsAnime,currentSrc);
  buildSrcToggle(currentIsAnime);
  refreshNoteBar(currentTvId,'tv',s,ep);
  const prog=getProgress(currentTvId,'tv',s,ep);
  preparePlayerFrame();
  setPlayerFrameSrc(currentTvId,'tv',s,ep,currentSrc,prog?prog.secs:0);
  resetPlayerAutoClock();
  saveWatching(currentTvId,'tv',playerSessionTitle||document.getElementById('pm-title').textContent,playerSessionPoster,s,ep);
  updateDeviceMediaSession(playerSessionTitle,'tv',playerSessionPoster,s,ep);
  savePlayerNavState(true);
  ensurePlayerHistoryGuard();
  refreshCW();
  updateNextEpisodeButton();
  updateSourceState();
}
async function goNextEpisode(){
  if(!currentTvId||playerProgType!=='tv')return;
  persistEstimatedProgress();clearTimeout(epChangeTimer);
  const sSel=document.getElementById('s-sel'),eSel=document.getElementById('e-sel');
  if(eSel.selectedIndex<eSel.options.length-1){eSel.selectedIndex=eSel.selectedIndex+1;syncPlayerPickers();loadSelectedTvEpisode(sSel.value,eSel.value);showToast(`Episodio ${eSel.value} avviato ▶`);return;}
  if(sSel.selectedIndex<sSel.options.length-1){sSel.selectedIndex=sSel.selectedIndex+1;syncPlayerPickers();await loadEpisodesForPlayer(currentTvId,sSel.value,1);eSel.selectedIndex=0;syncPlayerPickers();loadSelectedTvEpisode(sSel.value,eSel.value||1);showToast(`Stagione ${sSel.value}, episodio ${eSel.value||1} ▶`);return;}
  showToast('Ultimo episodio disponibile');
}
document.getElementById('s-sel').addEventListener('change',async function(){if(!currentTvId)return;persistEstimatedProgress();await loadEpisodesForPlayer(currentTvId,this.value,null);clearTimeout(epChangeTimer);epChangeTimer=setTimeout(()=>{const ep=document.getElementById('e-sel').value||1;loadSelectedTvEpisode(this.value,ep);},600);});
document.getElementById('e-sel').addEventListener('change',function(){if(!currentTvId)return;persistEstimatedProgress();clearTimeout(epChangeTimer);const s=document.getElementById('s-sel').value||1,ep=this.value||1;epChangeTimer=setTimeout(()=>loadSelectedTvEpisode(s,ep),500);});
document.getElementById('btn-next-ep').addEventListener('click',goNextEpisode);
document.getElementById('btn-src-ok').addEventListener('click',markSourceOk);
document.getElementById('btn-src-bad').addEventListener('click',markSourceBad);
async function openPlayer(id,type,title,poster,season,episode,isAnime){
  const last=getLastWatched(id),initialS=season||last?.season||1,initialE=episode||last?.episode||1;
  const resolvedAnime=!!isAnime||(currentDetailId===String(id)&&currentDetailIsAnime);
  if(resolvedAnime){
    openExternalWatchPrompt('anime',{title,season:initialS,episode:initialE});
    return;
  }
  removeJSONKey(PLAYER_CLOSED_KEY);
  currentIsAnime=resolvedAnime;currentSrc=getPreferredSource(id,type,initialS,initialE,resolvedAnime,resolvedAnime?'streamrip':'vixsrc');currentTvId=String(id);document.getElementById('pm-title').textContent=title;document.getElementById('anime-note').style.display='none';buildSrcToggle(resolvedAnime);autoAddToWatching({id:String(id),type,title,poster:poster||'',isAnime:resolvedAnime});
  playerProgId=String(id);playerProgType=type;playerProgSeason=type==='tv'?Number(initialS):null;playerProgEpisode=type==='tv'?Number(initialE):null;playerNoteSavedThisSession=true;playerSessionTitle=title;playerSessionPoster=poster||'';playerSessionIsAnime=resolvedAnime;playerSessionAnimeTitles=resolvedAnime?uniqueTextList([title,...(currentDetailId===String(id)?currentDetailAnimeTitles:[])]):[];playerSessionSeasons=[];playerLastAutoSecs=0;playerLastAutoSaveAt=0;stopPlayerAutoSave(false);hideReminderOverlay();document.getElementById('pm-note-bar').classList.remove('highlight');updateDeviceMediaSession(title,type,poster,season,episode);
  if(type==='tv'){setPlayerTvControlsVisible(true);const sSel=document.getElementById('s-sel'),eSel=document.getElementById('e-sel');sSel.innerHTML='<option>Caricamento...</option>';eSel.innerHTML='<option>Caricamento...</option>';syncPlayerPickers();const playerModal=document.getElementById('player-modal');playerModal.classList.add('open');resetPanelScroll(playerModal);lockBodyScroll();const lastS=initialS,lastE=initialE;try{const show=await tmdb(`/tv/${id}`);if(resolvedAnime)playerSessionAnimeTitles=uniqueTextList([...playerSessionAnimeTitles,...animeTitleCandidates(show,title)]);const seasons=(show.seasons||[]).filter(s=>s.season_number>0);if(!seasons.length)seasons.push({season_number:1,episode_count:10,name:'Stagione 1'});playerSessionSeasons=seasons;sSel.innerHTML=seasons.map(s=>`<option value="${s.season_number}">S${s.season_number} - ${s.name||'Stagione '+s.season_number} (${s.episode_count||'?'} ep.)</option>`).join('');sSel.value=String(lastS);syncPlayerPickers();await loadEpisodesForPlayer(id,sSel.value,lastE);}catch(e){sSel.innerHTML='<option value="1">Stagione 1</option>';eSel.innerHTML='<option value="1">Episodio 1</option>';syncPlayerPickers();}const s=sSel.value||1,ep=document.getElementById('e-sel').value||1;playerProgSeason=Number(s);playerProgEpisode=Number(ep);syncPlayerPickers();currentSrc=getPreferredSource(id,type,s,ep,resolvedAnime,currentSrc);buildSrcToggle(resolvedAnime);refreshNoteBar(id,type,s,ep);const prog=getProgress(id,type,s,ep);preparePlayerFrame();setPlayerFrameSrc(id,type,s,ep,currentSrc,prog?prog.secs:0);startPlayerAutoSave(prog?prog.secs:0);saveWatching(id,type,title,poster,s,ep);updateNextEpisodeButton();updateSourceState();}
  else{setPlayerTvControlsVisible(false);playerProgSeason=null;playerProgEpisode=null;refreshNoteBar(id,type,null,null);const prog=getProgress(id,type,null,null);preparePlayerFrame();setPlayerFrameSrc(id,type,null,null,currentSrc,prog?prog.secs:0);startPlayerAutoSave(prog?prog.secs:0);const playerModal=document.getElementById('player-modal');playerModal.classList.add('open');resetPanelScroll(playerModal);lockBodyScroll();saveWatching(id,type,title,poster,null,null);updateNextEpisodeButton();updateSourceState();}
  savePlayerNavState(true);
  ensurePlayerHistoryGuard();
  refreshCW();
}
async function loadEpisodesForPlayer(showId,season,preselect){
  const eSel=document.getElementById('e-sel');
  eSel.innerHTML='<option>Caricamento...</option>';
  syncPlayerPickers();
  try{
    const data=await tmdb(`/tv/${showId}/season/${season}`);
    const eps=data.episodes||[];
    if(!eps.length)throw Error('empty');
    eSel.innerHTML=eps.map(e=>`<option value="${e.episode_number}">Ep. ${e.episode_number}${e.name?' - '+e.name:''}</option>`).join('');
    if(preselect)eSel.value=String(preselect);
  }catch(e){
    eSel.innerHTML='<option value="1">Episodio 1</option>';
  }
  syncPlayerPickers();
}
function doClosePlayer(){pipActive=false;clearSavedPlayerNavState();closePlayerPickers();clearTimeout(epChangeTimer);clearTimeout(playerSourceHealthTimer);stopPlayerAutoSave(true);hideReminderOverlay();const fr=document.getElementById('vix-frame');smoothClose(document.getElementById('player-modal'),180,()=>{fr.src='';fr.removeAttribute('srcdoc');fr.style.display='block';stopNativeVideo(true);unlockBodyScrollIfClear();document.getElementById('anime-note').style.display='none';currentTvId=null;playerProgId=null;playerSessionTitle='';playerSessionPoster='';playerSessionIsAnime=false;playerSessionAnimeTitles=[];playerSessionSeasons=[];refreshCW();});}
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
  const video=document.getElementById('stream-video');
  if(video&&video.style.display!=='none'&&video.src){
    try{
      if(document.pictureInPictureElement!==video&&video.requestPictureInPicture){await video.requestPictureInPicture();pipActive=true;if(!silent)showToast('Picture in Picture attivo ⧉');return;}
      if(video.webkitEnterFullscreen){video.webkitEnterFullscreen();pipActive=true;if(!silent)showToast('✅ PiP pronto — premi Home per continuare');return;}
      if(video.requestFullscreen){await video.requestFullscreen();pipActive=true;if(!silent)showToast('✅ Fullscreen — premi Home per il PiP');return;}
    }catch(e){if(!silent)showToast('Avvia il video poi premi Home');return;}
  }
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
function rememberOpenPlayer(reason=''){
  if(!isPlayerOpen())return false;
  savePlayerNavState(true);
  savePlayerResumeBackup({...playerNavSnapshot(true),reason});
  return true;
}
function restorePlayerAfterLifecycle(delay=120){
  if(!getRestorablePlayerSnapshot())return false;
  restoreSavedPageIfNeeded(true);
  restoreSavedPlayerIfNeeded(delay,true);
  return true;
}
document.addEventListener('visibilitychange',()=>{
  const playerOpen=isPlayerOpen();
  if(document.hidden){
    if(playerOpen)saveLeavingState();
    return;
  }
  syncViewportMetrics();
  requestReadableContrast();
  if(!playerOpen)restorePlayerAfterLifecycle(90);
  else if(pipActive&&(isIOS||isSafari)){
    try{
      if(document.webkitExitFullscreen)document.webkitExitFullscreen();
      else if(document.exitFullscreen)document.exitFullscreen();
    }catch(e){}
    pipActive=false;
  }
});
function saveLeavingState(){
  rememberOpenPlayer('leaving');
  saveCurrentNavState({leavingAt:Date.now()});
  persistEstimatedProgress();
}
window.addEventListener('pagehide',saveLeavingState);
window.addEventListener('beforeunload',saveLeavingState);
window.addEventListener('blur',()=>{if(isPlayerOpen())saveLeavingState();},{passive:true});
window.addEventListener('focus',()=>{syncViewportMetrics();rememberOpenPlayer('focus');restorePlayerAfterLifecycle(80);},{passive:true});
window.addEventListener('pageshow',e=>{
  syncViewportMetrics();
  requestReadableContrast();
  restorePlayerAfterLifecycle(e.persisted?160:240);
},{passive:true});
window.addEventListener('orientationchange',()=>{
  if(isPlayerOpen())rememberOpenPlayer('orientation');
  [80,360,900].forEach(ms=>setTimeout(()=>{syncViewportMetrics();requestReadableContrast();},ms));
},{passive:true});
document.addEventListener('freeze',saveLeavingState);
document.addEventListener('resume',()=>{syncViewportMetrics();restorePlayerAfterLifecycle(120);});
document.addEventListener('click',e=>{const a=e.target.closest?.('a[target="_blank"]');if(a)saveLeavingState();},true);
document.getElementById('player-modal')?.addEventListener('pointerdown',()=>rememberOpenPlayer('player-pointer'),true);
['pointerdown','touchstart','focus','load'].forEach(eventName=>{
  document.getElementById('vix-frame')?.addEventListener(eventName,()=>rememberOpenPlayer(`frame-${eventName}`),{passive:true});
});

/* FOLDER PICKER */
function openFolderPicker(item){fpCurrentItem=item;fpPendingCat=null;renderFPStep1();document.getElementById('folder-picker').classList.add('open');resetPanelScroll('#folder-picker .fp-sheet');lockBodyScroll();}
function closeFolderPicker(){smoothClose(document.getElementById('folder-picker'),280,()=>{fpCurrentItem=null;fpPendingCat=null;unlockBodyScrollIfClear();});}
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
function resetListRowStart(row){if(!row)return;const reset=()=>{row.scrollLeft=0;try{row.scrollTo({left:0,behavior:'auto'});}catch(e){row.scrollLeft=0;}};reset();requestAnimationFrame(reset);setTimeout(reset,80);setTimeout(reset,220);}
function buildFolderSection(parentEl,folderId,folderName,items,opts={}){const sw=document.createElement('div');sw.className='sections-wrap';const sec=document.createElement('div');sec.className='section';const head=document.createElement('div');head.className='section-head';head.innerHTML=`<span class="section-name" style="font-size:.82rem">${ea(folderName)}</span><span class="gtag">${items.length}</span><button class="list-reset-btn" data-reset-folder="${folderId}">Svuota</button>`;head.querySelector('[data-reset-folder]').addEventListener('click',e=>{e.stopPropagation();resetFolderItems(folderId,folderName);});sec.appendChild(head);const row=document.createElement('div');row.className='row liste-row';if(opts.showPlus!==false){const plus=document.createElement('div');plus.className='plus-card';plus.innerHTML='<div class="plus-icon">+</div><div class="plus-lbl">Aggiungi</div>';plus.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();searchAddToFolderId=folderId;searchAddFolderName=folderName;openSearch();showSearchAddBanner(folderName);});row.appendChild(plus);}
  items.forEach(function(item){const tmp=document.createElement('div');tmp.innerHTML=listCardHTML(item,folderId);const card=tmp.firstElementChild;const rmBtn=card.querySelector('.card-rm-item');if(rmBtn){rmBtn.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();openConfirm(`Rimuovere da <b>${ea(getFolders()[folderId]?.name||folderName)}</b>?`,function(){removeFromFolder(folderId,item.id);updateBookmarkIcons(item.id);renderListePage();});});}card.addEventListener('click',function(e){if(e.target.closest('.card-rm-item'))return;openDetail(card.dataset.id,card.dataset.type,card.dataset.poster||'',card.dataset.anime==='1');});row.appendChild(card);});sec.appendChild(row);sw.appendChild(sec);parentEl.appendChild(sw);drag(row);resetListRowStart(row);}
function buildImportedFolderCard(parentEl,folderId,folderName,items,opts={}){const wrap=document.createElement('div');wrap.className='imported-folder-wrap';const card=document.createElement('div');card.className='folder-card';card.innerHTML=`<span class="folder-card-icon">📁</span><div class="folder-card-info"><div class="folder-card-name">${ea(folderName)}</div><div class="folder-card-count">${items.length} contenut${items.length===1?'o':'i'}</div></div><button class="folder-card-reset">Svuota</button><svg class="folder-card-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg><button class="folder-card-del"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;const body=document.createElement('div');body.className='folder-card-body';const row=document.createElement('div');row.className='row liste-row';row.style.cssText='padding:12px 16px;scroll-padding-left:16px;';if(opts.showPlus!==false){const plus=document.createElement('div');plus.className='plus-card';plus.innerHTML='<div class="plus-icon">+</div><div class="plus-lbl">Aggiungi</div>';plus.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();searchAddToFolderId=folderId;searchAddFolderName=folderName;openSearch();showSearchAddBanner(folderName);});row.appendChild(plus);}items.forEach(function(item){const tmp=document.createElement('div');tmp.innerHTML=listCardHTML(item,folderId);const c=tmp.firstElementChild;const rmBtn=c.querySelector('.card-rm-item');if(rmBtn){rmBtn.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();openConfirm(`Rimuovere da <b>${ea(folderName)}</b>?`,function(){removeFromFolder(folderId,item.id);updateBookmarkIcons(item.id);renderListePage();});});}c.addEventListener('click',function(e){if(e.target.closest('.card-rm-item'))return;openDetail(c.dataset.id,c.dataset.type,c.dataset.poster||'',c.dataset.anime==='1');});row.appendChild(c);});body.appendChild(row);drag(row);resetListRowStart(row);card.addEventListener('click',function(e){if(e.target.closest('.folder-card-del,.folder-card-reset'))return;const opening=!body.classList.contains('open');card.classList.toggle('expanded');body.classList.toggle('open');if(opening)resetListRowStart(row);});card.querySelector('.folder-card-reset').addEventListener('click',function(e){e.stopPropagation();e.preventDefault();resetFolderItems(folderId,folderName);});card.querySelector('.folder-card-del').addEventListener('click',function(e){e.stopPropagation();e.preventDefault();openConfirm(`Eliminare la cartella <b>${ea(folderName)}</b>?`,function(){const f=getFolders();delete f[folderId];saveFolders(f);renderListePage();});});wrap.appendChild(card);wrap.appendChild(body);parentEl.appendChild(wrap);}
function renderSmartListSections(parentEl){
  if(listeFilter!=='all')return 0;
  const watching=getAllWatching().map(item=>personalCardItem(item,'Da finire')).filter(item=>item.poster_path);
  const rated=collectPersonalItems(120).filter(item=>getRating(item.id)>=4).map(item=>personalCardItem(item,'Meglio valutato')).filter(item=>item.poster_path);
  const started=collectPersonalItems(120).filter(item=>getLastWatched(item.id)||hasAnyProgressForItem(item)).map(item=>personalCardItem(item,'In corso')).filter(item=>item.poster_path);
  if(!watching.length&&!rated.length&&!started.length)return 0;
  const gEl=document.createElement('div');gEl.className='liste-group smart-liste-group';const hdr=document.createElement('div');hdr.className='liste-group-hdr';hdr.textContent='✨ Smart';gEl.appendChild(hdr);
  if(watching.length)addSec(gEl,'Da finire',watching.slice(0,18),null,'smart');
  if(rated.length)addSec(gEl,'I tuoi migliori voti',rated.slice(0,18),null,'smart');
  if(started.length)addSec(gEl,'In corso',started.slice(0,18),null,'smart');
  parentEl.appendChild(gEl);
  return 1;
}
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
function openConfirm(msg,cb){confirmCallback=cb;document.getElementById('confirm-msg').innerHTML=msg;document.getElementById('confirm-modal').classList.add('open');resetPanelScroll('#confirm-modal .confirm-box');lockBodyScroll();}
function closeConfirm(){smoothClose(document.getElementById('confirm-modal'),150,()=>{confirmCallback=null;unlockBodyScrollIfClear();});}
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
function resetSearchFilters(){
  const type=document.getElementById('search-type-filter'),year=document.getElementById('search-year-filter'),genre=document.getElementById('search-genre-filter'),provider=document.getElementById('search-provider-filter');
  if(type)type.value='all';
  if(year)year.value='';
  if(genre)genre.value='';
  if(provider)provider.value='';
}
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
function sportSearchHTML(results){
  const events=results?.events||[],teams=results?.teams||[],competitions=results?.competitions||[],sports=results?.sports||[];
  if(!events.length&&!teams.length&&!competitions.length&&!sports.length)return '';
  const chips=[
    ...sports.map(s=>`<button class="sport-search-chip" data-search-sport-tab="${ea(s.id)}">${s.icon||'🏟️'} ${ea(s.label)}</button>`),
    ...competitions.map(c=>`<button class="sport-search-chip" data-search-sport-competition="${ea(c.id)}">${ea(c.name)}</button>`),
    ...teams.map(t=>`<button class="sport-search-chip" data-search-sport-query="${ea(t.name)}">${ea(t.name)}</button>`)
  ].join('');
  return `<div class="search-sec-hdr">Sport</div>${chips?`<div class="sport-search-chips">${chips}</div>`:''}<div class="sport-search-results">${events.map(e=>sportEventCard(e,true)).join('')}</div>`;
}
async function runSportSearch(q){
  if(!window.StreamGNSportData)return {events:[],teams:[],competitions:[],sports:[]};
  const data=sportState.data||await window.StreamGNSportData.load();
  if(!sportState.data){sportState.data=data;sportState.eventsById=new Map((data.events||[]).map(ev=>[String(ev.id),ev]));}
  return await window.StreamGNSportData.search(q,{data});
}
async function runSearch(q){
  const filters=getSearchFilters();
  const peopleBox=document.getElementById('search-persons'),grid=document.getElementById('search-content-grid');
  const wantsPeople=filters.type==='all'||filters.type==='person';
  const wantsSport=filters.type==='all'||filters.type==='sport';
  const wantsContent=filters.type!=='person'&&filters.type!=='sport';
  const [multi,people,sportResults]=await Promise.all([wantsContent?tmdb('/search/multi',{query:q}):Promise.resolve({results:[]}),wantsPeople?tmdb('/search/person',{query:q}):Promise.resolve({results:[]}),wantsSport?runSportSearch(q):Promise.resolve(null)]);
  let contents=(multi.results||[]).filter(x=>x.media_type!=='person'&&(x.poster_path||x.title||x.name));
  contents=(await Promise.all(contents.slice(0,28).map(async x=>await passesSearchFilters(x,filters)?withAnimeFlag(x):null))).filter(Boolean);
  const persons=(people.results||[]).filter(x=>x.profile_path||x.known_for?.length).sort((a,b)=>(b.popularity||0)-(a.popularity||0)).slice(0,14);
  peopleBox.innerHTML=persons.length?`<div class="search-sec-hdr">Persone</div><div class="pscard-row">${persons.map(psCardHTML).join('')}</div>`:'';
  const sportHTML=sportSearchHTML(sportResults);
  const contentHTML=contents.length?`${persons.length||sportHTML?'<div class="search-sec-hdr">Film e Serie</div>':''}${contents.map(x=>cardHTML(x)).join('')}`:'';
  grid.innerHTML=sportHTML+contentHTML;
}
function openSearch(){initSearchFilters();document.getElementById('search-ov').classList.add('open');resetPanelScroll('#search-ov');lockBodyScroll();renderSearchRecent();document.getElementById('search-content-grid').innerHTML='';document.getElementById('search-persons').innerHTML='';setTimeout(()=>document.getElementById('search-input').focus(),60);}
function closeSearch(){const ov=document.getElementById('search-ov');ov.classList.add('closing');setTimeout(()=>{ov.classList.remove('open','closing');clearTimeout(searchTimer);document.getElementById('search-input').value='';document.getElementById('search-persons').innerHTML='';document.getElementById('search-content-grid').innerHTML='';document.getElementById('search-recent').innerHTML='';resetSearchFilters();unlockBodyScrollIfClear();searchAddToFolderId=null;searchAddFolderName='';document.getElementById('search-add-banner').style.display='none';},150);}
function showSearchAddBanner(name){const b=document.getElementById('search-add-banner');document.getElementById('search-add-fname').textContent=name;b.style.display='flex';}
document.getElementById('search-add-cancel').addEventListener('click',()=>{searchAddToFolderId=null;searchAddFolderName='';document.getElementById('search-add-banner').style.display='none';});
document.getElementById('btn-search').addEventListener('click',()=>{searchAddToFolderId=null;document.getElementById('search-add-banner').style.display='none';openSearch();});
document.getElementById('btn-search-close').addEventListener('click',closeSearch);
document.getElementById('search-logo').addEventListener('click',closeSearch);
document.getElementById('search-recent').addEventListener('click',e=>{const ri=e.target.closest('[data-rec]'),rm=e.target.closest('[data-rm]');if(rm){e.stopPropagation();rmSH(rm.dataset.rm);renderSearchRecent();return;}if(ri){document.getElementById('search-input').value=ri.dataset.rec;document.getElementById('search-input').dispatchEvent(new Event('input'));return;}});
document.getElementById('search-input').addEventListener('keydown',e=>{if(e.key==='Enter')commitSearchHistory();});
['search-type-filter','search-year-filter','search-genre-filter','search-provider-filter'].forEach(id=>{const el=document.getElementById(id);el?.addEventListener('input',()=>document.getElementById('search-input').dispatchEvent(new Event('input')));el?.addEventListener('change',()=>document.getElementById('search-input').dispatchEvent(new Event('input')));});
document.getElementById('search-input').addEventListener('input',function(){clearTimeout(searchTimer);const q=this.value.trim();if(!q){renderSearchRecent();document.getElementById('search-persons').innerHTML='';document.getElementById('search-content-grid').innerHTML='';return;}document.getElementById('search-recent').innerHTML='';searchTimer=setTimeout(async()=>{try{await runSearch(q);}catch(e){}},340);});
document.getElementById('search-content-grid').addEventListener('click',e=>{
  const sport=e.target.closest('[data-search-sport-tab]'),competition=e.target.closest('[data-search-sport-competition]'),query=e.target.closest('[data-search-sport-query]');
  if(!sport&&!competition&&!query)return;
  e.stopPropagation();commitSearchHistory();closeSearch();activatePage('sport');
  setTimeout(()=>{
    if(sport)sportState.selectedSport=sport.dataset.searchSportTab||'all';
    if(competition)sportState.competition=competition.dataset.searchSportCompetition||'';
    if(query){sportState.query=query.dataset.searchSportQuery||'';const inp=document.getElementById('sport-search-input');if(inp)inp.value=sportState.query;}
    renderSportPage();
  },180);
});

/* DRAG */
function drag(row){if(!row||row.dataset.dragReady==='1')return;row.dataset.dragReady='1';let down=false,sx,sl,moved=false;row.addEventListener('mousedown',e=>{if(e.target.closest('button,a,input,select,.plus-card'))return;down=true;moved=false;sx=e.pageX-row.offsetLeft;sl=row.scrollLeft;row.classList.add('drag');},{passive:true});row.addEventListener('mouseleave',()=>{down=false;row.classList.remove('drag');});row.addEventListener('mouseup',()=>{down=false;row.classList.remove('drag');});row.addEventListener('mousemove',e=>{if(!down)return;const dx=e.pageX-row.offsetLeft-sx;if(Math.abs(dx)>4){moved=true;row.scrollLeft=sl-dx;}},{passive:true});row.addEventListener('click',e=>{if(moved&&!e.target.closest('button,a,input,select,.plus-card')){e.stopPropagation();e.preventDefault();}moved=false;},true);}

/* SWIPE BACK */
(()=>{let tx=0,ty=0;document.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;},{passive:true});document.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-tx,dy=Math.abs(e.changedTouches[0].clientY-ty);if(tx>40||dx<80||dy>60)return;if(document.getElementById('external-watch-modal').classList.contains('open')){closeExternalWatchPrompt();return;}if(document.getElementById('sport-detail-modal').classList.contains('open')){closeSportDetail();return;}if(document.getElementById('actor-modal').classList.contains('open')){closeActor();return;}if(document.getElementById('import-modal').classList.contains('open')){closeImportModal();return;}if(document.getElementById('export-sel-modal').classList.contains('open')){closeExportModal();return;}if(document.getElementById('confirm-modal').classList.contains('open')){closeConfirm();return;}if(document.getElementById('folder-picker').classList.contains('open')){closeFolderPicker();return;}if(document.getElementById('player-modal').classList.contains('open')){rememberOpenPlayer('edge-swipe');return;}if(document.getElementById('detail-modal').classList.contains('open')){closeDetail();return;}if(document.getElementById('search-ov').classList.contains('open')){closeSearch();}},{passive:true});})();

/* RANDOM */
document.querySelectorAll('.random-btn[data-random]').forEach(btn=>{btn.addEventListener('click',()=>{const pool=randomPools[btn.dataset.random];if(!pool.length){showToast('Caricamento ancora in corso…');return;}const item=pool[Math.floor(Math.random()*pool.length)];openDetail(item.id,item.media_type||'tv',item.poster_path||'',!!item._anime);});});
document.addEventListener('click',e=>{const mood=e.target.closest('[data-mood]');if(mood){loadMood(mood.dataset.mood);return;}});
document.getElementById('btn-smart-random')?.addEventListener('click',async()=>{const personal=collectPersonalItems();if(personal.length){const item=personal[Math.floor(Math.random()*personal.length)];openDetail(item.id,item.type,item.poster||'',!!item.isAnime);return;}const pool=[...randomPools.serie,...randomPools.film,...randomPools.anime];if(!pool.length){showToast('Caricamento ancora in corso…');return;}const item=pool[Math.floor(Math.random()*pool.length)];openDetail(item.id,item.media_type||item.type||'movie',item.poster_path||item.poster||'',!!item._anime);});

/* SCROLL TOP */
const stBtn=document.getElementById('scroll-top');
window.addEventListener('scroll',()=>stBtn.classList.toggle('visible',window.scrollY>600),{passive:true});
stBtn.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));

/* NAV */
function activatePage(pg,opts={}){
  const page=document.getElementById('page-'+pg);
  if(!page)return;
  if(opts.preservePlayer){
    closeTransientLayers();
    hardCloseLayer('#detail-modal');
    hardCloseLayer('#actor-modal');
    hardCloseLayer('#sport-detail-modal');
  }else{
    closeContentLayers();
    clearPlayerResumeBackup();
  }
  if(pg!=='sport')stopSportAutoRefresh();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  page.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.page===pg));
  const prevPlayer=getNavState().player||{};
  writeNavState({page:pg,player:opts.preservePlayer?prevPlayer:{...prevPlayer,open:false}});
  if(pg==='sport')loadSport();
  if(pg==='serie'&&!loaded.serie)loadSerie();
  if(pg==='film'&&!loaded.film)loadFilm();
  if(pg==='anime'&&!loaded.anime)loadAnime();
  if(pg==='calendario')loadCalendario();
  if(pg==='profilo')loadProfilo();
  if(pg==='liste')renderListePage();
}
function navigateHome(){activatePage('home');}
function normalizeUrl(url){url=String(url||'').trim();if(!url)return'';return /^https?:\/\//i.test(url)?url:'https://'+url;}
let sportRemoteConfig=null,externalSitesConfig=null;
function applyRemoteRuntimeConfig(cfg){
  if(!cfg)return;
  if(cfg.streamApiBase)window.STREAMGN_CONFIG.streamApiBase=cfg.streamApiBase;
  if(cfg.streamripBaseUrl)window.STREAMGN_CONFIG.streamripBaseUrl=cfg.streamripBaseUrl;
  if(cfg.animeProviderBase)window.STREAMGN_CONFIG.animeProviderBase=cfg.animeProviderBase;
  if(cfg.aniListApiBase)window.STREAMGN_CONFIG.aniListApiBase=cfg.aniListApiBase;
}
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
    applyRemoteRuntimeConfig(sportRemoteConfig);
  }catch(e){sportRemoteConfig={sportUrl:SPORT_DEFAULT_URL};}
  return sportRemoteConfig;
}
async function fetchExternalSites(force=false){
  if(externalSitesConfig&&!force)return externalSitesConfig;
  try{
    const url=new URL(EXTERNAL_SITES_URL,location.href);
    url.searchParams.set('_',Date.now());
    const r=await fetch(url.toString(),{cache:'no-store'});
    if(!r.ok)throw Error(r.status);
    externalSitesConfig=await r.json();
  }catch(e){
    externalSitesConfig={anime:{url:ANIME_UNITY_URL},sport:{url:SPORT_DEFAULT_URL}};
  }
  return externalSitesConfig;
}
function siteRawUrlFromExternal(sites,kind,fallback){
  const cfg=sites?.[kind]||{};
  return normalizeUrl(cfg.embedUrl||cfg.url||cfg.openUrl||fallback)||fallback;
}
function siteOpenUrlFromExternal(sites,kind,fallback){
  const cfg=sites?.[kind]||{};
  return normalizeUrl(cfg.openUrl||cfg.url||cfg.embedUrl||fallback)||fallback;
}
function externalDisplayLabel(url){
  try{
    const u=new URL(normalizeUrl(url));
    return u.hostname.replace(/^www\./,'').slice(0,42);
  }catch(e){return String(url||'').replace(/^https?:\/\//,'').replace(/^www\./,'').slice(0,42);}
}
async function resolveExternalOpenUrl(kind,fallback,force=false){
  const sites=await fetchExternalSites(force);
  return siteOpenUrlFromExternal(sites,kind,fallback);
}
function closeExternalWatchPrompt(){
  smoothClose(document.getElementById('external-watch-modal'),150,unlockBodyScrollIfClear);
}
async function openExternalWatchPrompt(kind,opts={}){
  const modal=document.getElementById('external-watch-modal');
  const titleEl=document.getElementById('external-watch-title'),subEl=document.getElementById('external-watch-sub'),kicker=document.getElementById('external-watch-kicker'),open=document.getElementById('external-watch-open');
  const isAnime=kind==='anime';
  const url=await resolveExternalOpenUrl(kind,isAnime?ANIME_UNITY_URL:SPORT_DEFAULT_URL);
  if(isAnime)animeExternalUrl=url;else sportWatchUrl=url;
  const ep=opts.season&&opts.episode?` S${opts.season}E${opts.episode}`:'';
  if(kicker)kicker.textContent=isAnime?'Anime':'Sport';
  if(titleEl)titleEl.textContent=isAnime?`Continua su AnimeUnity${opts.title?` · ${opts.title}${ep}`:''}`:`Continua sul sito originale`;
  if(subEl)subEl.textContent=isAnime?'StreaMGN ti aiuta a scoprire, salvare e tenere traccia degli episodi. La visione si apre sul sito originale in una nuova scheda.':'La visione sportiva si apre fuori da StreaMGN, senza iframe o player incorporati.';
  if(open){open.href=url;open.textContent=isAnime?'Apri AnimeUnity':'Apri fuori';}
  modal.classList.add('open');
  lockBodyScroll();
}
function sportRawUrlFromConfig(cfg,sites){
  return siteRawUrlFromExternal(sites,'sport',normalizeUrl(cfg?.sportUrl||cfg?.sport?.url||SPORT_DEFAULT_URL)||SPORT_DEFAULT_URL);
}
function sportStatusMeta(status){
  if(status==='live')return{label:'Live',cls:'live'};
  if(status==='past')return{label:'Terminato',cls:'past'};
  return{label:'Programmato',cls:'upcoming'};
}
function sportDateLabel(date){
  if(!date)return 'Data da confermare';
  try{return new Date(date).toLocaleString('it-IT',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
  catch(e){return date;}
}
function sportShortDate(date){
  if(!date)return '';
  try{return new Date(date).toISOString().slice(0,10);}
  catch(e){return '';}
}
function sportScoreLine(event){
  if(event.score)return event.score;
  const ps=(event.participants||[]).map(p=>p.score).filter(Boolean);
  return ps.length?ps.join(' - '):'';
}
function sportTeamName(team,fallback='Partecipante'){
  return ea(team?.name||team?.shortName||fallback);
}
function sportTeamLogo(team){
  return team?.logo?`<img src="${ea(team.logo)}" alt="${sportTeamName(team)}" loading="lazy">`:`<span>${sportTeamName(team).slice(0,1).toUpperCase()}</span>`;
}
function sportEventCard(event,compact=false){
  const meta=sportStatusMeta(event.status),score=sportScoreLine(event),teams=event.homeTeam||event.awayTeam;
  const participants=teams
    ? `<div class="sport-matchup"><div class="sport-team">${sportTeamLogo(event.homeTeam)}<span>${sportTeamName(event.homeTeam,'Casa')}</span></div><div class="sport-score">${score||'vs'}</div><div class="sport-team">${sportTeamLogo(event.awayTeam)}<span>${sportTeamName(event.awayTeam,'Ospite')}</span></div></div>`
    : `<div class="sport-participants">${(event.participants||[]).slice(0,4).map(p=>`<span>${ea(p.name)}</span>`).join('')||'<span>Partecipanti da confermare</span>'}</div>`;
  return `<article class="sport-event-card${compact?' compact':''}" data-sport-event-id="${ea(event.id)}">
    <div class="sport-event-top"><span class="sport-badge ${meta.cls}">${meta.label}</span><span class="sport-event-date">${sportDateLabel(event.date)}</span></div>
    <h3>${ea(event.title)}</h3>
    <div class="sport-event-comp">${ea(event.sportLabel||event.sport)} · ${ea(event.competition||'Competizione')}</div>
    ${participants}
    <div class="sport-event-foot"><span>${ea(event.venue||'Luogo da confermare')}</span><span>${ea(event.source||'Fonte pubblica')}</span></div>
  </article>`;
}
function sportSectionHTML(title,items,empty='Nessun evento disponibile.'){
  if(!items.length)return `<section class="sport-section"><div class="section-head"><span class="section-name">${ea(title)}</span></div><div class="sport-empty">${ea(empty)}</div></section>`;
  return `<section class="sport-section"><div class="section-head"><span class="section-name">${ea(title)}</span><span class="gtag">${items.length}</span></div><div class="sport-row row">${items.map(e=>sportEventCard(e)).join('')}</div></section>`;
}
function sportMiniCardHTML(item,type){
  const icon=type==='team'?'👥':type==='competition'?'🏆':'🏟️';
  return `<button class="sport-mini-card" data-sport-pick="${ea(type)}" data-sport-value="${ea(item.id||item.name||item.label)}" data-sport-name="${ea(item.name||item.label)}" data-sport-scope="${ea(item.sport||item.id||'')}"><span>${icon}</span><b>${ea(item.name||item.label)}</b><small>${item.count?`${item.count} eventi`:ea(item.sport||'')}</small></button>`;
}
function sportMatchesQuery(event,q){
  if(!q)return true;
  const hay=[event.title,event.competition,event.sportLabel,event.venue,event.statusLabel,event.source,event.homeTeam?.name,event.awayTeam?.name,...(event.participants||[]).map(p=>p.name)].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}
function sportFilteredEvents(){
  const data=sportState.data||{events:[]},q=sportState.query.trim().toLowerCase();
  return data.events.filter(e=>{
    if(sportState.selectedSport!=='all'&&e.sport!==sportState.selectedSport)return false;
    if(sportState.status!=='all'&&e.status!==sportState.status)return false;
    if(sportState.competition&&String(e.competitionId||e.competition)!==String(sportState.competition))return false;
    if(sportState.date&&sportShortDate(e.date)!==sportState.date)return false;
    return sportMatchesQuery(e,q);
  });
}
function updateSportCompetitionOptions(){
  const sel=document.getElementById('sport-competition-filter');if(!sel||!sportState.data)return;
  const prev=sel.value;
  const comps=sportState.data.competitions.filter(c=>sportState.selectedSport==='all'||c.sport===sportState.selectedSport);
  sel.innerHTML='<option value="">Competizione</option>'+comps.map(c=>`<option value="${ea(c.id)}">${ea(c.name)}</option>`).join('');
  if([...sel.options].some(o=>o.value===prev))sel.value=prev;else sportState.competition='';
}
function renderSportTabs(){
  const el=document.getElementById('sport-tabs');if(!el||!sportState.data)return;
  const sports=[{id:'all',label:'Tutti',icon:'✨',count:sportState.data.events.length},...(sportState.data.sports||[])];
  el.innerHTML=sports.map(s=>`<button class="sport-tab${sportState.selectedSport===s.id?' active':''}" data-sport-tab="${ea(s.id)}"><span>${s.icon||'🏟️'}</span>${ea(s.label)}<b>${s.count||0}</b></button>`).join('');
}
function renderSportLivePanel(){
  const el=document.getElementById('sport-live-panel');if(!el||!sportState.data)return;
  const live=sportState.data.events.filter(e=>e.status==='live').slice(0,2);
  const upcoming=sportState.data.events.filter(e=>e.status==='upcoming').slice(0,2);
  const pick=[...live,...upcoming].slice(0,2);
  el.innerHTML=pick.length?`<div class="sport-live-title">${live.length?'Live ora':'Prossimi eventi'}</div>${pick.map(e=>sportEventCard(e,true)).join('')}`:`<div class="sport-live-title">Sport Center</div><div class="sport-empty">Nessun live ora. I prossimi eventi compariranno qui.</div>`;
}
function renderSportPage(){
  const body=document.getElementById('sport-body');if(!body||!sportState.data)return;
  updateSportCompetitionOptions();
  renderSportTabs();
  renderSportLivePanel();
  const events=sportFilteredEvents(),live=events.filter(e=>e.status==='live'),upcoming=events.filter(e=>e.status==='upcoming'),past=events.filter(e=>e.status==='past');
  const data=sportState.data;
  const comps=data.competitions.filter(c=>sportState.selectedSport==='all'||c.sport===sportState.selectedSport).slice(0,14);
  const teams=data.teams.filter(t=>sportState.selectedSport==='all'||t.sport===sportState.selectedSport).slice(0,18);
  const warning=data.warnings?.length?`<div class="sport-warning">${ea(data.warnings.join(' '))}</div>`:'';
  body.innerHTML=`${warning}
    ${sportSectionHTML('Live adesso',live,'Nessun evento live al momento.')}
    ${sportSectionHTML('Prossimi eventi',upcoming,'Nessun evento futuro trovato con questi filtri.')}
    ${sportSectionHTML('Risultati recenti',past.slice(0,24),'Nessun risultato recente trovato.')}
    <section class="sport-section"><div class="section-head"><span class="section-name">Competizioni</span><span class="gtag">${comps.length}</span></div><div class="sport-mini-grid">${comps.map(c=>sportMiniCardHTML(c,'competition')).join('')||'<div class="sport-empty">Competizioni non disponibili.</div>'}</div></section>
    <section class="sport-section"><div class="section-head"><span class="section-name">Squadre e partecipanti</span><span class="gtag">${teams.length}</span></div><div class="sport-mini-grid">${teams.map(t=>sportMiniCardHTML(t,'team')).join('')||'<div class="sport-empty">Partecipanti non disponibili.</div>'}</div></section>`;
  body.querySelectorAll('.sport-row').forEach(drag);
  requestReadableContrast();
}
function initSportControls(){
  if(document.body.dataset.sportControlsReady==='1')return;
  document.body.dataset.sportControlsReady='1';
  document.getElementById('sport-search-input')?.addEventListener('input',e=>{sportState.query=e.target.value||'';renderSportPage();});
  document.getElementById('sport-status-filter')?.addEventListener('change',e=>{sportState.status=e.target.value||'all';renderSportPage();});
  document.getElementById('sport-competition-filter')?.addEventListener('change',e=>{sportState.competition=e.target.value||'';renderSportPage();});
  document.getElementById('sport-date-filter')?.addEventListener('change',e=>{sportState.date=e.target.value||'';renderSportPage();});
  document.getElementById('sport-tabs')?.addEventListener('click',e=>{const btn=e.target.closest('[data-sport-tab]');if(!btn)return;sportState.selectedSport=btn.dataset.sportTab||'all';sportState.competition='';renderSportPage();});
  document.getElementById('sport-body')?.addEventListener('click',e=>{
    const mini=e.target.closest('[data-sport-pick]');
    if(mini){
      const type=mini.dataset.sportPick;
      if(type==='competition')sportState.competition=mini.dataset.sportValue||'';
      if(type==='team')sportState.query=mini.dataset.sportName||'';
      const inp=document.getElementById('sport-search-input');if(inp)inp.value=sportState.query;
      renderSportPage();return;
    }
  });
}
async function loadSportData(force=false){
  const body=document.getElementById('sport-body');
  if(!window.StreamGNSportData){
    if(body)body.innerHTML='<div class="err">Modulo Sport non caricato.</div>';
    return;
  }
  if(!sportState.data||force){
    sportState.loading=true;
    if(body)body.innerHTML='<div class="sport-skeleton-grid"><div></div><div></div><div></div></div>';
    try{sportState.data=await window.StreamGNSportData.load({force});}
    catch(e){sportState.data={events:window.StreamGNSportData.fallbackEvents(),sports:window.StreamGNSportData.sports.map(s=>({id:s.id,label:s.label,icon:s.icon,count:0})),competitions:[],teams:[],warnings:['Dati live non disponibili.']};}
    sportState.eventsById=new Map((sportState.data.events||[]).map(ev=>[String(ev.id),ev]));
    sportState.loading=false;
  }
  renderSportPage();
  startSportAutoRefresh();
}
function startSportAutoRefresh(){
  clearInterval(sportRefreshTimer);
  sportRefreshTimer=setInterval(()=>{if(document.querySelector('#page-sport.active'))loadSportData(true);},window.StreamGNSportData?.refreshMs||45000);
}
function stopSportAutoRefresh(){clearInterval(sportRefreshTimer);sportRefreshTimer=null;}
function renderSportAdmin(url){
  const panel=document.getElementById('sport-admin-panel'),link=document.getElementById('sport-admin-link'),input=document.getElementById('sport-admin-input');
  const admin=isSportAdminMode();
  if(link)link.href=EXTERNAL_SITES_ADMIN_EDIT_URL||SPORT_ADMIN_EDIT_URL;
  if(panel)panel.style.display=admin?'flex':'none';
  if(link)link.style.display=admin?'inline-flex':'none';
  if(input&&admin)input.value=url;
}
async function loadSport(force=false){
  initSportControls();
  loaded.sport=true;
  const [cfg,sites]=await Promise.all([fetchRemoteConfig(force),fetchExternalSites(force)]),rawUrl=sportRawUrlFromConfig(cfg,sites),openUrl=siteOpenUrlFromExternal(sites,'sport',rawUrl),open=document.getElementById('sport-open-link');
  sportWatchUrl=openUrl;
  if(open)open.href=openUrl;
  renderSportAdmin(rawUrl);
  await loadSportData(force);
}
async function copySportConfig(){
  const input=document.getElementById('sport-admin-input');
  const url=normalizeUrl(input?.value||SPORT_DEFAULT_URL);
  if(!url){showToast('Inserisci un link valido');return;}
  const sites=await fetchExternalSites(true);
  const text=JSON.stringify({...sites,sport:{...(sites?.sport||{}),url,embedUrl:url,openUrl:url},updatedAt:new Date().toISOString()},null,2);
  try{await navigator.clipboard.writeText(text);showToast('Config copiata: incollala su GitHub');}
  catch(e){prompt('Copia questa config',text);}
}
function closeSportDetail(){smoothClose(document.getElementById('sport-detail-modal'),180,unlockBodyScrollIfClear);}
function sportDetailTeamBlock(event){
  if(event.homeTeam||event.awayTeam){
    return `<div class="sport-detail-teams">
      <div class="sport-detail-team">${sportTeamLogo(event.homeTeam)}<b>${sportTeamName(event.homeTeam,'Casa')}</b></div>
      <div class="sport-detail-score">${sportScoreLine(event)||'vs'}</div>
      <div class="sport-detail-team">${sportTeamLogo(event.awayTeam)}<b>${sportTeamName(event.awayTeam,'Ospite')}</b></div>
    </div>`;
  }
  return `<div class="sport-detail-participants">${(event.participants||[]).map(p=>`<span>${ea(p.name)}</span>`).join('')||'<span>Partecipanti da confermare</span>'}</div>`;
}
function sportStatsHTML(event){
  const stats=(event.stats||[]).filter(s=>s.name||s.value).slice(0,18);
  if(!stats.length)return '<div class="sport-empty">Statistiche non disponibili per questo evento.</div>';
  return `<div class="sport-stat-grid">${stats.map(s=>`<div class="sport-stat"><b>${ea(s.value)}</b><span>${ea(s.team?`${s.team} · ${s.name}`:s.name)}</span></div>`).join('')}</div>`;
}
function sportTimelineHTML(event){
  const items=(event.events||[]).filter(x=>x.text||x.type).slice(0,24);
  if(!items.length)return '<div class="sport-empty">Timeline non disponibile.</div>';
  return `<div class="sport-timeline">${items.map(x=>`<div class="sport-timeline-item"><span>${ea(x.time||'')}</span><b>${ea(x.type||'Evento')}</b><p>${ea(x.text||'')}</p></div>`).join('')}</div>`;
}
function sportLineupsHTML(event){
  const lineups=(event.lineups||[]).filter(Boolean);
  if(!lineups.length)return '<div class="sport-empty">Formazioni o partecipanti dettagliati non disponibili.</div>';
  return `<div class="sport-lineups">${lineups.map(l=>`<div><b>${ea(l.team||'Partecipanti')}</b><p>${ea((l.players||[]).join(', '))}</p></div>`).join('')}</div>`;
}
function openSportDetail(id){
  const event=sportState.eventsById.get(String(id));if(!event)return;
  closeTransientLayers();
  hardCloseLayer('#actor-modal');hardCloseLayer('#detail-modal');
  const modal=document.getElementById('sport-detail-modal'),body=document.getElementById('sport-detail-body'),meta=sportStatusMeta(event.status),future=event.status==='upcoming';
  body.innerHTML=`<section class="sport-detail-hero">
    <div class="sport-detail-kicker">${ea(event.sportLabel||event.sport)} · ${ea(event.competition||'Competizione')}</div>
    <h1>${ea(event.title)}</h1>
    <div class="sport-detail-meta">
      <span class="sport-badge ${meta.cls}">${meta.label}</span>
      <span>${sportDateLabel(event.date)}</span>
      <span>${ea(event.venue||'Luogo da confermare')}</span>
      <span>${ea(event.source||'Fonte pubblica')}</span>
    </div>
    ${sportDetailTeamBlock(event)}
    <div class="sport-detail-actions">
      <button class="gbtn gbtn-white" id="sport-detail-watch">Guarda</button>
      <button class="gbtn" id="sport-detail-calendar" ${future?'':'disabled'}>Aggiungi al calendario</button>
    </div>
  </section>
  <section class="sport-detail-section"><div class="dm-section-title">Dettagli evento</div>
    <div class="sport-info-grid">
      <div><span>Sport</span><b>${ea(event.sportLabel||event.sport)}</b></div>
      <div><span>Competizione</span><b>${ea(event.competition||'Non disponibile')}</b></div>
      <div><span>Stato</span><b>${ea(event.statusLabel||meta.label)}</b></div>
      <div><span>Fase</span><b>${ea(event.liveMinute||'Non disponibile')}</b></div>
      <div><span>Risultato</span><b>${ea(sportScoreLine(event)||'Non disponibile')}</b></div>
      <div><span>Luogo</span><b>${ea(event.venue||'Da confermare')}</b></div>
    </div>
  </section>
  <section class="sport-detail-section"><div class="dm-section-title">Statistiche principali</div>${sportStatsHTML(event)}</section>
  <section class="sport-detail-section"><div class="dm-section-title">Eventi e timeline</div>${sportTimelineHTML(event)}</section>
  <section class="sport-detail-section"><div class="dm-section-title">Formazioni e partecipanti</div>${sportLineupsHTML(event)}</section>`;
  modal.classList.add('open');resetPanelScroll(modal);lockBodyScroll();
  document.getElementById('sport-detail-watch')?.addEventListener('click',()=>window.open(sportWatchUrl||SPORT_DEFAULT_URL,'_blank','noopener'));
  document.getElementById('sport-detail-calendar')?.addEventListener('click',()=>{
    if(!future){showToast('Calendario disponibile solo per eventi futuri');return;}
    const date=sportShortDate(event.date);
    downloadCalendarEvent({title:event.title,date,desc:`${event.competition||''}${event.venue?` · ${event.venue}`:''}`,type:'sport',id:event.id});
  });
  requestReadableContrast();
}
document.getElementById('btn-sport-detail-back')?.addEventListener('click',closeSportDetail);
document.getElementById('btn-sport-detail-close')?.addEventListener('click',closeSportDetail);
document.getElementById('sport-detail-modal')?.addEventListener('click',e=>{if(e.target===document.getElementById('sport-detail-modal'))closeSportDetail();});
document.getElementById('btn-sport-refresh')?.addEventListener('click',()=>loadSport(true));
document.getElementById('btn-sport-copy-config')?.addEventListener('click',copySportConfig);
document.getElementById('btn-anime-refresh')?.addEventListener('click',()=>{externalSitesConfig=null;loaded.anime=false;loadAnime();});
document.getElementById('btn-calendar-refresh')?.addEventListener('click',()=>loadCalendario(true));
document.getElementById('external-watch-close')?.addEventListener('click',closeExternalWatchPrompt);
document.getElementById('external-watch-cancel')?.addEventListener('click',closeExternalWatchPrompt);
document.getElementById('external-watch-modal')?.addEventListener('click',e=>{if(e.target===document.getElementById('external-watch-modal'))closeExternalWatchPrompt();});
document.querySelectorAll('.nav-btn[data-page]').forEach(b=>b.addEventListener('click',()=>activatePage(b.dataset.page)));
document.addEventListener('click',e=>{if(e.target.closest('[data-nav-home]')){if(document.getElementById('player-modal').classList.contains('open')){attemptClosePlayer();return;}if(document.getElementById('detail-modal').classList.contains('open'))closeDetail();else if(document.getElementById('actor-modal').classList.contains('open'))closeActor();else navigateHome();}});

/* GLOBAL DELEGATION */
document.addEventListener('click',e=>{
  const sportEvent=e.target.closest('[data-sport-event-id]');if(sportEvent){e.stopPropagation();if(sportEvent.closest('#search-ov')){commitSearchHistory();closeSearch();activatePage('sport');setTimeout(()=>openSportDetail(sportEvent.dataset.sportEventId),180);}else openSportDetail(sportEvent.dataset.sportEventId);return;}
  const sb=e.target.closest('.star-btn[data-star][data-rid]');if(sb){e.stopPropagation();const stars=Number(sb.dataset.star),rid=sb.dataset.rid;setRating(rid,stars);sb.closest('.star-row').querySelectorAll('.star-btn').forEach(b=>b.classList.toggle('active',Number(b.dataset.star)<=stars));document.querySelectorAll(`.card[data-id="${rid}"] .card-rated`).forEach(b=>{b.textContent=`⭐ ${stars}/5`;b.classList.add('visible');});showToast(`Valutazione: ${stars}/5`);return;}
  const cwRm=e.target.closest('[data-cw-id]');if(cwRm){e.stopPropagation();removeWatching(cwRm.dataset.cwId);refreshCW();return;}
  const bm=e.target.closest('[data-bm-id]');if(bm){e.stopPropagation();e.preventDefault();openFolderPicker({id:bm.dataset.bmId,type:bm.dataset.bmType,title:bm.dataset.bmTitle,poster:bm.dataset.bmPoster,isAnime:bm.dataset.bmAnime==='1'});return;}
  const actor=e.target.closest('.actor-card[data-actor-id]');if(actor){e.stopPropagation();if(actor.closest('#search-ov'))commitSearchHistory();openActor(actor.dataset.actorId);return;}
  const pscard=e.target.closest('.pscard[data-actor-id]');if(pscard){e.stopPropagation();if(pscard.closest('#search-ov'))commitSearchHistory();openActor(pscard.dataset.actorId);return;}
  const seenToggle=e.target.closest('[data-seen-toggle]');if(seenToggle){e.stopPropagation();e.preventDefault();const epItem=seenToggle.closest('.ep-item[data-ep-num]');if(epItem){const tvId=epItem.dataset.tvId,season=epItem.dataset.season,ep=seenToggle.dataset.seenToggle;setEpisodeSeen(tvId,season,ep,!isEpisodeSeen(tvId,season,ep));loadDetailEpisodes(tvId,season,epItem.dataset.anime==='1',getLastWatched(tvId));}return;}
  const epItem=e.target.closest('.ep-item[data-ep-num]');if(epItem&&!e.defaultPrevented){e.stopPropagation();const tvId=epItem.dataset.tvId,season=epItem.dataset.season,ep=epItem.dataset.epNum,isAnime=epItem.dataset.anime==='1';if(isAnime){openExternalWatchPrompt('anime',{title:currentDetailTitle,season,episode:ep});return;}closeDetail();openPlayer(tvId,'tv',currentDetailTitle,currentDetailPoster,season,ep,false);return;}
  const card=e.target.closest('.card[data-id]');if(card&&!e.defaultPrevented){if(e.target.closest('.card-rm-item')||e.target.closest('[data-bm-id]'))return;if(card.closest('#liste-body'))return;if(searchAddToFolderId){addToFolder(searchAddToFolderId,{id:card.dataset.id,type:card.dataset.type,title:card.dataset.title,poster:card.dataset.poster,isAnime:card.dataset.anime==='1'});updateBookmarkIcons(card.dataset.id);if(document.querySelector('#page-liste.active'))renderListePage();showToast(`Aggiunto a "${searchAddFolderName}"`);closeSearch();return;}if(card.closest('#search-ov'))commitSearchHistory();const fromActor=card.closest('#actor-modal');if(fromActor)closeActor();openDetail(card.dataset.id,card.dataset.type,card.dataset.poster||'',card.dataset.anime==='1');return;}
  const hb=e.target.closest('[data-id][data-type][data-poster]');if(hb&&!e.defaultPrevented)openDetail(hb.dataset.id,hb.dataset.type,hb.dataset.poster||'',false);
});

/* KEYBOARD */
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA')return;if(e.key==='Escape'){if(document.getElementById('external-watch-modal').classList.contains('open')){closeExternalWatchPrompt();return;}if(document.getElementById('sport-detail-modal').classList.contains('open')){closeSportDetail();return;}if(document.getElementById('import-modal').classList.contains('open')){closeImportModal();return;}if(document.getElementById('export-sel-modal').classList.contains('open')){closeExportModal();return;}if(document.getElementById('actor-modal').classList.contains('open')){closeActor();return;}if(document.getElementById('confirm-modal').classList.contains('open')){closeConfirm();return;}if(document.getElementById('folder-picker').classList.contains('open')){closeFolderPicker();return;}if(document.getElementById('player-modal').classList.contains('open')){closePlayer();return;}if(document.getElementById('detail-modal').classList.contains('open')){closeDetail();return;}if(document.getElementById('search-ov').classList.contains('open')){closeSearch();return;}}if(e.key==='/'&&!document.getElementById('search-ov').classList.contains('open')){e.preventDefault();openSearch();}if(e.key==='ArrowLeft'&&heroItems.length)renderHero((heroIdx-1+heroItems.length)%heroItems.length);if(e.key==='ArrowRight'&&heroItems.length)renderHero((heroIdx+1)%heroItems.length);});
document.getElementById('detail-modal').addEventListener('click',function(e){if(e.target===this)closeDetail();});

function ensureHomeLoaded(){
  if(!loaded.home)loadHome();
}
function getRestorablePlayerSnapshot(){
  const now=Date.now(),saved=getNavState(),navPlayer=saved.player||{},backup=readJSONKey(PLAYER_RESUME_KEY,null);
  const route=readPlayerRouteSnapshot();
  if(route?.id&&!isRecentlyClosedPlayer(route))return route;
  const candidates=[];
  if(navPlayer.open&&navPlayer.id&&now-(saved.updatedAt||navPlayer.savedAt||0)<NAV_RESTORE_WINDOW)candidates.push(normalizePlayerSnapshot({...navPlayer,page:saved.page,updatedAt:saved.updatedAt}));
  if(backup?.open&&backup.id&&(backup.reopenUntil||0)>now)candidates.push(normalizePlayerSnapshot(backup));
  const hist=readHistoryPlayerSnapshot();
  if(hist?.id&&now-(hist.updatedAt||hist.savedAt||0)<NAV_RESTORE_WINDOW)candidates.push(hist);
  return candidates.filter(p=>p&&!isRecentlyClosedPlayer(p)).sort((a,b)=>(b.updatedAt||b.savedAt||0)-(a.updatedAt||a.savedAt||0))[0]||null;
}
function restoreSavedPlayerIfNeeded(delay=120,force=false){
  try{
    const navType=performance.getEntriesByType?.('navigation')?.[0]?.type||'navigate';
    const p=getRestorablePlayerSnapshot();
    if(!p?.open||!p.id)return;
    const modal=document.getElementById('player-modal');
    const restoringId=modal?.dataset?.restoringPlayer||'';
    if(modal?.classList.contains('open')&&restoringId!==String(p.id))return;
    if(!force&&navType!=='reload'&&navType!=='back_forward')return;
    primePlayerRestoreShell(p);
    clearTimeout(playerRestoreTimer);
    playerRestoreTimer=setTimeout(()=>{
      const currentRestoring=document.getElementById('player-modal')?.dataset?.restoringPlayer||'';
      if(document.getElementById('player-modal')?.classList.contains('open')&&currentRestoring!==String(p.id))return;
      Promise.resolve(openPlayer(p.id,p.type||'movie',p.title||'StreaMGN',p.poster||'',p.season||null,p.episode||null,!!p.isAnime))
        .finally(()=>{delete document.getElementById('player-modal').dataset.restoringPlayer;});
    },delay);
  }catch(e){}
}
function primePlayerRestoreShell(p){
  const modal=document.getElementById('player-modal'),fr=document.getElementById('vix-frame');
  if(!modal||!fr)return;
  modal.dataset.restoringPlayer=String(p.id);
  currentTvId=String(p.id);
  playerProgId=String(p.id);
  playerProgType=p.type||'movie';
  playerProgSeason=p.type==='tv'?Number(p.season||1):null;
  playerProgEpisode=p.type==='tv'?Number(p.episode||1):null;
  playerSessionTitle=p.title||'StreaMGN';
  playerSessionPoster=p.poster||'';
  playerSessionIsAnime=!!p.isAnime;
  currentSrc=normalizeSourceForDevice(p.src||currentSrc,!!p.isAnime);
  document.getElementById('pm-title').textContent=playerSessionTitle;
  setPlayerTvControlsVisible(playerProgType==='tv');
  if(playerProgType==='tv'){
    const sSel=document.getElementById('s-sel'),eSel=document.getElementById('e-sel');
    if(sSel&&!sSel.options.length)sSel.innerHTML=`<option value="${playerProgSeason||1}">Stagione ${playerProgSeason||1}</option>`;
    if(eSel&&!eSel.options.length)eSel.innerHTML=`<option value="${playerProgEpisode||1}">Episodio ${playerProgEpisode||1}</option>`;
    if(sSel)sSel.value=String(playerProgSeason||1);
    if(eSel)eSel.value=String(playerProgEpisode||1);
    syncPlayerPickers();
  }
  modal.classList.add('open');
  resetPanelScroll(modal);
  lockBodyScroll();
  preparePlayerFrame(fr);
  writePlayerRoute({...p,page:p.page||activePageName()});
  if(!fr.getAttribute('src'))setFrameMessage(fr,'Ripristino player','Riapro il contenuto.');
}
function restoreSavedPageIfNeeded(force=false){
  try{
    const saved=getNavState(),player=getRestorablePlayerSnapshot(),now=Date.now(),navType=performance.getEntriesByType?.('navigation')?.[0]?.type||'navigate';
    const page=player?.page||saved.page||'home';
    const recent=now-(saved.updatedAt||0)<NAV_RESTORE_WINDOW||!!player;
    const leavingRecent=Date.now()-(saved.leavingAt||0)<NAV_RESTORE_WINDOW;
    const playerOpen=!!saved.player?.open||!!player;
    if(!RESTORABLE_PAGES.has(page)||!recent)return false;
    if(!force&&navType==='navigate'&&!leavingRecent&&!playerOpen)return false;
    if(activePageName()===page)return true;
    activatePage(page,{preservePlayer:true});
    return true;
  }catch(e){return false;}
}
function restoreInitialRoute(){
  try{
    const q=new URLSearchParams(location.search);
    let page=q.get('page');
    if(page==='novita')page='profilo';
    if(getRestorablePlayerSnapshot()){
      restoreSavedPageIfNeeded(true);
      restoreSavedPlayerIfNeeded(40,true);
      setTimeout(ensureHomeLoaded,900);
      return;
    }
    if(page&&document.querySelector(`.nav-btn[data-page="${page}"]`))document.querySelector(`.nav-btn[data-page="${page}"]`).click();
    if(q.get('actor')){openActor(q.get('actor'));return;}
    if(q.get('id')){openDetail(q.get('id'),q.get('type')||'movie','',q.get('anime')==='1');restoreSavedPlayerIfNeeded(450);return;}
    const restored=restoreSavedPageIfNeeded();
    restoreSavedPlayerIfNeeded(restored?420:120);
    if(activePageName()==='home')ensureHomeLoaded();
  }catch(e){}
}
setTimeout(restoreInitialRoute,30);

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

function notifDefault(){return{items:[],snapshots:{},lastCheck:0,pushStats:{day:'',count:0,lastPushAt:0}};}
function getNotifData(){return{...notifDefault(),...readJSONKey('svx_notif',notifDefault())};}
function saveNotifData(d){writeJSONKey('svx_notif',{...notifDefault(),...d});}
function getUnreadCount(){return getNotifData().items.filter(n=>!n.read).length;}
function dayKey(ts=Date.now()){return new Date(ts).toISOString().slice(0,10);}
function daysUntil(date,now=Date.now()){if(!date)return null;const t=new Date(`${date}T12:00:00Z`).getTime();if(!Number.isFinite(t))return null;return Math.ceil((t-now)/86400000);}
function addNotif(data,created,notif){
  if(!notif?.id||data.items.some(n=>n.id===notif.id))return;
  const next={ts:Date.now(),read:false,category:'news',priority:2,...notif};
  data.items.unshift(next);
  created.push(next);
}

function updateNotifBadge(){
  const cnt=getUnreadCount(),badge=document.getElementById('notif-badge');
  if(badge)badge.style.display=cnt>0?'block':'none';
}

function getTrackedContentItems(){
  const seen=new Set(),items=[];
  const add=item=>{
    if(!item||!item.id)return;
    const type=item.type||item.media_type;
    if(type!=='tv'&&type!=='movie')return;
    const key=`${type}_${item.id}`;
    if(seen.has(key))return;
    seen.add(key);items.push({...item,type});
  };
  Object.values(getWatching()).forEach(add);
  Object.values(getFolders()).forEach(f=>(f.items||[]).forEach(add));
  return items;
}
function getTrackedWatchingSeries(){return getTrackedContentItems().filter(item=>item.type==='tv');}

function canShowPush(data,now){
  data.pushStats=data.pushStats||{day:'',count:0,lastPushAt:0};
  const today=dayKey(now);
  if(data.pushStats.day!==today)data.pushStats={day:today,count:0,lastPushAt:0};
  if(data.pushStats.count>=(CONFIG.notificationDailyLimit||3))return false;
  if(now-(data.pushStats.lastPushAt||0)<(CONFIG.notificationQuietWindow||8*60*60*1000))return false;
  data.pushStats.count++;
  data.pushStats.lastPushAt=now;
  return true;
}
async function showSystemUpdateNotification(created,data,now){
  if(!created.length||!('Notification' in window)||Notification.permission!=='granted')return;
  if(!canShowPush(data,now))return;
  const top=created[0],extra=created.length>1?` + altri ${created.length-1}`:'';
  const body=created.length===1?top.desc:`${top.title}: ${top.desc}${extra}`;
  const opts={body,icon:'assets/icons/icon-192.png',badge:'assets/icons/icon-96.png',tag:'streamgn-updates',renotify:false,data:{url:'./?page=profilo',itemId:top.itemId,type:top.type,poster:top.poster||''}};
  try{
    const reg=await navigator.serviceWorker?.ready;
    if(reg?.showNotification){await reg.showNotification('StreaMGN',opts);return;}
  }catch(e){}
  try{new Notification('StreaMGN',opts);}catch(e){}
}

async function checkForUpdates(force=false,{push=true}={}){
  const data=getNotifData(),now=Date.now(),created=[];
  const interval=CONFIG.notificationInterval||6*60*60*1000;
  if(!force&&now-(data.lastCheck||0)<interval)return 0;
  data.snapshots=data.snapshots||{};
  data.snapshots.upcomingNotified=data.snapshots.upcomingNotified||{};
  const list=document.getElementById('notif-list');
  if(list)list.innerHTML='<div class="notif-checking"><div class="spinner"></div><span>Controllo aggiornamenti...</span></div>';

  for(const item of getTrackedContentItems().slice(0,80)){
    try{
      if(item.type==='tv'){
        const info=await tmdb(`/tv/${item.id}`,{}, {maxAge:2*60*60*1000});
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
        const info=await tmdb(`/movie/${item.id}`,{}, {maxAge:6*60*60*1000});
        const d=daysUntil(info.release_date,now),upKey=`movie_${item.id}_${info.release_date}`;
        if(d!==null&&d>=0&&d<=21&&!data.snapshots.upcomingNotified[upKey]){
          data.snapshots.upcomingNotified[upKey]=now;
          addNotif(data,created,{id:`up_${upKey}`,itemId:item.id,type:'movie',title:item.title||info.title,poster:info.poster_path||item.poster||'',category:'upcoming',priority:2,desc:`Uscita imminente tra ${d===0?'oggi':d+' giorni'}`});
        }
      }
    }catch(e){}
  }

  try{
    const top=await tmdb('/trending/all/day',{region:'IT'},{maxAge:2*60*60*1000});
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
  if(push)await showSystemUpdateNotification(created,data,now);
  saveNotifData(data);
  updateNotifBadge();
  return created.length;
}
let notifUpdateRunning=false;
let notifUpdateQueued=false;
async function runNotifUpdate(force=false,opts={}){
  if(notifUpdateRunning){
    notifUpdateQueued=true;
    return 0;
  }
  notifUpdateRunning=true;
  try{
    return await checkForUpdates(force,opts);
  }catch(e){
    return 0;
  }finally{
    notifUpdateRunning=false;
    if(notifUpdateQueued){
      notifUpdateQueued=false;
      queueMicrotask(()=>runNotifUpdate(false,{push:false}).catch(()=>{}));
    }
  }
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
    list.innerHTML='<div class="notif-empty">Nessuna notifica<br><span style="font-size:.72rem;color:var(--tx3)">Ti avviso solo per uscite importanti, novita nelle liste e contenuti molto richiesti.</span></div>';
    return;
  }

  list.innerHTML=data.items.map(n=>{
    const img=n.poster?`<img src="${IMG}${n.poster}" class="notif-poster" loading="lazy">`:'<div class="notif-poster-ph">📺</div>';
    const time=new Date(n.ts).toLocaleDateString('it-IT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    const label=n.category==='list'?'Dalle tue liste':n.category==='upcoming'?'In arrivo':n.category==='demand'?'Molto richiesto':'Novita';
    return `<div class="notif-item${n.read?'':' unread'}" data-notif-id="${n.itemId}" data-notif-type="${n.type}" data-notif-poster="${n.poster||''}">
      ${img}
      <div class="notif-body">
        <div class="notif-cat">${label}</div>
        <div class="notif-title">${ea(n.title)}</div>
        <div class="notif-desc">${n.desc}</div>
        <div class="notif-time">${time}</div>
      </div>
      ${n.read?'':'<div class="notif-dot"></div>'}
    </div>`;
  }).join('');
}

/* Permessi notifiche */
function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
}
async function getPushConfig(){
  const remote=await fetchRemoteConfig().catch(()=>({}));
  const push=remote?.push||{};
  return {
    publicKey:push.publicKey||PUSH_PUBLIC_KEY,
    subscribeUrl:push.subscribeUrl||PUSH_SUBSCRIBE_URL,
    unsubscribeUrl:push.unsubscribeUrl||PUSH_UNSUBSCRIBE_URL
  };
}
async function ensurePushSubscription(reg){
  if(!reg?.pushManager||Notification.permission!=='granted')return false;
  const cfg=await getPushConfig();
  if(!cfg.publicKey||!cfg.subscribeUrl){
    writeJSONKey('svx_push_status',{enabled:false,reason:'missing_config',ts:Date.now()});
    setupNotifPermRow();
    return false;
  }
  try{
    let sub=await reg.pushManager.getSubscription();
    if(!sub){
      sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(cfg.publicKey)});
    }
    const res=await fetch(cfg.subscribeUrl,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        subscription:sub.toJSON(),
        scope:location.origin,
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'',
        dailyLimit:CONFIG.notificationDailyLimit||3,
        quietWindowMs:CONFIG.notificationQuietWindow||8*60*60*1000,
        ua:navigator.userAgent
      })
    });
    writeJSONKey('svx_push_status',{enabled:res.ok,reason:res.ok?'subscribed':'server_error',ts:Date.now()});
    setupNotifPermRow();
    return res.ok;
  }catch(e){
    writeJSONKey('svx_push_status',{enabled:false,reason:'subscribe_error',ts:Date.now()});
    setupNotifPermRow();
    return false;
  }
}
function setupNotifPermRow(){
  const row=document.getElementById('notif-perm-row');
  if(!row)return;
  if(!('Notification' in window)){row.textContent='';return;}
  const pushStatus=readJSONKey('svx_push_status',null);
  if(Notification.permission==='granted'){
    row.textContent=pushStatus?.enabled?'Push attive: poche notifiche importanti durante la giornata.':'Notifiche attive. Per riceverle anche a sito chiuso configura il Web Push nel file remoto.';
  }
  else if(Notification.permission==='denied'){row.textContent='Notifiche bloccate: attivale dalle impostazioni del browser.';}
  else{row.textContent='Tocca la campanella per attivare le push importanti.';}
}

function dismissNotifPermissionPrompt(){
  const prompt=document.querySelector('.notif-permission-prompt');
  if(!prompt)return;
  prompt.classList.add('closing');
  setTimeout(()=>prompt.remove(),180);
}
async function requestNotifPermission(showFeedback=false){
  if(!('Notification' in window))return'unsupported';
  if(Notification.permission!=='default'){setupNotifPermRow();return Notification.permission;}
  let permission='default';
  try{permission=await Notification.requestPermission();}catch(e){}
  if(permission!=='default')writeJSONKey(NOTIF_PROMPT_KEY,true);
  if(permission==='granted'){
    try{const reg=await navigator.serviceWorker?.ready;await ensurePushSubscription(reg);}catch(e){}
  }
  setupNotifPermRow();
  if(showFeedback&&permission==='granted')showToast('Push importanti attivate');
  return permission;
}
function showNotifPermissionPrompt(force=false){
  if(!('Notification' in window)||Notification.permission!=='default')return;
  if(!force&&readJSONKey(NOTIF_PROMPT_KEY,false))return;
  if(document.querySelector('.notif-permission-prompt'))return;
  const prompt=document.createElement('div');
  prompt.className='notif-permission-prompt';
  prompt.innerHTML=`<div class="notif-permission-card">
    <div class="notif-permission-kicker">Notifiche</div>
    <div class="notif-permission-title">Vuoi ricevere notifiche?</div>
    <div class="notif-permission-sub">Solo poche push importanti: nuove uscite, episodi e novita dai contenuti nelle tue liste.</div>
    <div class="notif-permission-actions">
      <button class="notif-permission-deny" type="button">No grazie</button>
      <button class="notif-permission-allow" type="button">Attiva</button>
    </div>
  </div>`;
  prompt.querySelector('.notif-permission-deny').addEventListener('click',()=>{
    writeJSONKey(NOTIF_PROMPT_KEY,true);
    dismissNotifPermissionPrompt();
    setupNotifPermRow();
  });
  prompt.querySelector('.notif-permission-allow').addEventListener('click',async e=>{
    e.currentTarget.disabled=true;
    await requestNotifPermission(true);
    writeJSONKey(NOTIF_PROMPT_KEY,true);
    dismissNotifPermissionPrompt();
  });
  document.body.appendChild(prompt);
}
async function registerNotificationWorker(){
  if(!('serviceWorker' in navigator)||location.protocol==='file:')return;
  try{
    if('caches' in window){
      try{
        const keys=await caches.keys();
        await Promise.all(keys.filter(key=>key.startsWith('streamgn-')&&key!==APP_CACHE&&key!=='streamgn-offline-v1').map(key=>caches.delete(key)));
      }catch(e){}
    }
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(isPlayerOpen())rememberOpenPlayer('worker-update');
    },{once:true});
    const reg=await navigator.serviceWorker.register(SW_URL,{updateViaCache:'none'});
    reg.addEventListener('updatefound',()=>{
      const worker=reg.installing;
      if(!worker)return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed'&&navigator.serviceWorker.controller)worker.postMessage({type:'SKIP_WAITING'});
      });
    });
    if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});
    try{await reg.update();}catch(e){}
    if('sync' in reg)try{await reg.sync.register('streamgn-updates');}catch(e){}
    if('periodicSync' in reg&&navigator.permissions){
      const status=await navigator.permissions.query({name:'periodic-background-sync'});
      if(status.state==='granted')await reg.periodicSync.register('streamgn-updates',{minInterval:CONFIG.notificationInterval||21600000});
    }
    const ready=await navigator.serviceWorker.ready;
    ready.active?.postMessage({type:'CHECK_UPDATES'});
    if('Notification' in window&&Notification.permission==='granted')await ensurePushSubscription(ready);
  }catch(e){}
}

/* Open / close pannello */
function openNotifPanel(){
  const panel=document.getElementById('notif-panel');
  panel.style.display='block';
  resetPanelScroll('#notif-list');
  setupNotifPermRow();
  renderNotifPanel();
  lockBodyScroll();
  showNotifPermissionPrompt(true);
}
function closeNotifPanel(){
  const panel=document.getElementById('notif-panel');
  panel.style.display='none';
  unlockBodyScrollIfClear();
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
  const cnt=await runNotifUpdate(true,{push:false});
  renderNotifPanel();
  btn.textContent='🔄 Aggiorna';btn.disabled=false;
  if(cnt>0)showToast(`${cnt} aggiornament${cnt===1?'o':'i'} importante${cnt===1?'':'i'}`,3000);
  else showToast('Tutto aggiornato ✓');
});

registerNotificationWorker();
setTimeout(()=>showNotifPermissionPrompt(),800);

function dismissOnboardingPrompt(){
  const prompt=document.querySelector('.onboarding-prompt');
  if(!prompt)return;
  prompt.classList.add('closing');
  setTimeout(()=>prompt.remove(),180);
}
function showOnboardingPrompt(attempt=0){
  if(readJSONKey('svx_onboarding_v1',false))return;
  if(document.querySelector('.notif-permission-prompt')){setTimeout(()=>showOnboardingPrompt(attempt+1),1500);return;}
  if(document.querySelector('.onboarding-prompt'))return;
  const prompt=document.createElement('div');
  prompt.className='onboarding-prompt';
  prompt.innerHTML=`<div class="onboarding-card">
    <div class="onboarding-kicker">Primo accesso</div>
    <div class="onboarding-title">Da dove vuoi iniziare?</div>
    <div class="onboarding-sub">Salvo questa scelta solo sul dispositivo, puoi cambiarla usando la barra.</div>
    <div class="onboarding-actions">
      <button class="onboarding-choice primary" data-start-page="home">Home</button>
      <button class="onboarding-choice" data-start-page="film">Film</button>
      <button class="onboarding-choice" data-start-page="serie">Serie</button>
      <button class="onboarding-choice" data-start-page="liste">Liste</button>
    </div>
  </div>`;
  prompt.addEventListener('click',e=>{
    const btn=e.target.closest('[data-start-page]');
    if(!btn)return;
    const page=btn.dataset.startPage;
    writeJSONKey('svx_onboarding_v1',{ts:Date.now(),startPage:page});
    saveSettings({startPage:page});
    dismissOnboardingPrompt();
    document.querySelector(`.nav-btn[data-page="${page}"]`)?.click();
  });
  document.body.appendChild(prompt);
}
setTimeout(()=>showOnboardingPrompt(),2200);

/* Avvio automatico: controlla aggiornamenti dopo 3s dall'apertura */
let notifForegroundCheckAt=0;
function runNotifForegroundCheck(){
  if(document.getElementById('player-modal')?.classList.contains('open'))return;
  const now=Date.now();
  if(now-notifForegroundCheckAt<10*60*1000)return;
  notifForegroundCheckAt=now;
  runNotifUpdate(false,{push:false}).then(updateNotifBadge).catch(()=>{});
}
setTimeout(async()=>{
  updateNotifBadge();
  await runNotifUpdate(false);
  updateNotifBadge();
},3000);
setInterval(()=>runNotifUpdate(false).then(updateNotifBadge).catch(()=>{}),60*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)runNotifForegroundCheck();});
window.addEventListener('online',runNotifForegroundCheck);
