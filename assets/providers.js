'use strict';

(function(){
  const CONFIG=window.STREAMGN_CONFIG||{};
  const ROUTES={
    movie:'/play/movie/:id',
    tv:'/play/tv/:id/:season/:episode',
    anime:'/play/anime/:id',
    sport:'/sport/live',
    ...(CONFIG.streamRoutes||{})
  };
  const ANILIST_CACHE_KEY='svx_anilist_map';
  const ANILIST_CACHE_TTL=30*24*60*60*1000;

  function liveConfig(){return window.STREAMGN_CONFIG||CONFIG||{};}
  function apiBase(){return String(liveConfig().streamApiBase||'').replace(/\/$/,'');}
  function streamripBase(){return String(liveConfig().streamripBaseUrl||liveConfig().animeProviderBase||'https://streamrip-website-production.up.railway.app').replace(/\/$/,'');}
  function aniListApiBase(){return String(liveConfig().aniListApiBase||'https://graphql.anilist.co').replace(/\/$/,'');}
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
  function normalizePlaybackSource(src){
    const cfg=liveConfig();
    const value=String(src||'vixsrc');
    const enabled=cfg.avoidUnstableMobileTouchSources??cfg.avoidUnstableAppleTouchSources;
    const avoid=new Set(cfg.mobileTouchAvoidSources||cfg.appleTouchAvoidSources||['vixsrc','vidsrc']);
    if(enabled!==false&&isMobileTouchDevice()&&avoid.has(value))return String(cfg.mobileTouchPreferredSource||cfg.appleTouchPreferredSource||'embed');
    return value;
  }

  function readJSON(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'')||fallback;}catch(e){return fallback;}
  }
  function writeJSON(key,value){
    try{localStorage.setItem(key,JSON.stringify(value));}catch(e){}
  }
  function addResumeParams(params,startSecs){
    if(startSecs&&startSecs>10){
      const v=Math.round(startSecs);
      params.set('startAt',String(v));
      params.set('t',String(v));
    }
  }
  function fillRoute(route,params){
    return route.replace(/:([a-zA-Z]+)/g,(_,key)=>encodeURIComponent(params[key]||''));
  }
  function cleanResult(data,fallbackUrl){
    const url=data?.embedUrl||data?.iframeUrl||data?.url||data?.streamUrl||fallbackUrl||'';
    if(!url)return null;
    return {
      ok:data?.ok!==false,
      provider:data?.provider||data?.source||'configured',
      embedUrl:url,
      headers:data?.headers||null,
      kind:data?.kind||'iframe'
    };
  }
  function timeoutSignal(ms=7000){
    if(typeof AbortController==='undefined')return {};
    const controller=new AbortController();
    setTimeout(()=>controller.abort(),ms);
    return {signal:controller.signal};
  }
  async function callBackend(kind,params,fallbackUrl){
    const API_BASE=apiBase();
    if(!API_BASE)return null;
    const route=ROUTES[kind];if(!route)return null;
    const path=fillRoute(route,params);
    const qs=new URLSearchParams();
    Object.entries(params).forEach(([key,value])=>{
      if(value===undefined||value===null||value==='')return;
      if(Array.isArray(value))value.filter(Boolean).forEach(v=>qs.append(key,String(v)));
      else qs.set(key,String(value));
    });
    const url=`${API_BASE}${path}${qs.size?'?'+qs.toString():''}`;
    try{
      const r=await fetch(url,{cache:'no-store',...timeoutSignal(10000)});
      if(!r.ok)return null;
      return cleanResult(await r.json(),fallbackUrl);
    }catch(e){return null;}
  }
  function vixsrcMovie(id,startSecs,settings={}){
    const params=new URLSearchParams();
    const lang=settings.lang||'it',subs=settings.subs||'none';
    if(lang&&lang!=='original')params.set('hl',lang);
    if(subs&&subs!=='none')params.set('sl',subs);
    addResumeParams(params,startSecs);
    const qs=params.toString();
    return `https://vixsrc.to/movie/${id}${qs?'?'+qs:''}`;
  }
  function vixsrcTv(id,season,episode,startSecs,settings={}){
    const params=new URLSearchParams();
    const lang=settings.lang||'it',subs=settings.subs||'none';
    if(lang&&lang!=='original')params.set('hl',lang);
    if(subs&&subs!=='none')params.set('sl',subs);
    addResumeParams(params,startSecs);
    const qs=params.toString();
    return `https://vixsrc.to/tv/${id}/${season||1}/${episode||1}${qs?'?'+qs:''}`;
  }
  function vidsrcMovie(id){return `https://vidsrc.me/embed/movie?tmdb=${id}`;}
  function vidsrcTv(id,season,episode){return `https://vidsrc.me/embed/tv?tmdb=${id}&season=${season||1}&episode=${episode||1}`;}
  function embedMovie(id){return `https://embed.su/embed/movie/${id}`;}
  function embedTv(id,season,episode){return `https://embed.su/embed/tv/${id}/${season||1}/${episode||1}`;}
  function fallbackBySource(kind,params){
    const src=normalizePlaybackSource(params.provider||params.source||'vixsrc');
    if(kind==='movie'){
      if(src==='vidsrc')return vidsrcMovie(params.id);
      if(src==='embed')return embedMovie(params.id);
      return vixsrcMovie(params.id,params.startSecs,params.settings);
    }
    if(kind==='tv'){
      if(src==='vidsrc')return vidsrcTv(params.id,params.season,params.episode);
      if(src==='embed')return embedTv(params.id,params.season,params.episode);
      return vixsrcTv(params.id,params.season,params.episode,params.startSecs,params.settings);
    }
    return params.fallbackUrl||'about:blank';
  }

  function normalizeTitle(value){
    return String(value||'')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/&/g,' and ')
      .replace(/[''`]/g,'')
      .replace(/\b(stagione|season|serie|tv|the animation|anime)\b/g,' ')
      .replace(/[^a-z0-9]+/g,' ')
      .trim();
  }
  function uniqueTextList(items){
    return [...new Set((items||[]).map(x=>String(x||'').trim()).filter(Boolean))];
  }
  function animeTitleCandidates(params){
    return uniqueTextList([
      params?.title,
      ...(Array.isArray(params?.titles)?params.titles:[]),
      params?.originalTitle,
      params?.originalName
    ]);
  }
  function readAniListCache(){
    const raw=readJSON(ANILIST_CACHE_KEY,{});
    const now=Date.now(),out={};
    Object.entries(raw||{}).forEach(([key,value])=>{
      if(value?.id&&now-(value.ts||0)<ANILIST_CACHE_TTL)out[key]=value;
    });
    if(Object.keys(out).length!==Object.keys(raw||{}).length)writeJSON(ANILIST_CACHE_KEY,out);
    return out;
  }
  function cacheAniList(params,title,id,media){
    if(!id)return;
    const cache=readAniListCache(),entry={id:Number(id),title:title||'',media:media||null,ts:Date.now()};
    if(params?.id)cache[`tmdb:${params.type||'tv'}:${params.id}`]=entry;
    normalizeTitle(title)&& (cache[`title:${normalizeTitle(title)}`]=entry);
    animeTitleCandidates(params).forEach(candidate=>{
      const key=normalizeTitle(candidate);
      if(key)cache[`title:${key}`]=entry;
    });
    writeJSON(ANILIST_CACHE_KEY,cache);
  }
  function titleMatchScore(search,media){
    const wanted=normalizeTitle(search);
    const names=[media?.title?.romaji,media?.title?.english,media?.title?.native,media?.title?.userPreferred,...(media?.synonyms||[])].map(normalizeTitle).filter(Boolean);
    if(!wanted||!names.length)return 0;
    if(names.includes(wanted))return 100;
    if(names.some(name=>name.startsWith(wanted)||wanted.startsWith(name)))return 80;
    if(names.some(name=>name.includes(wanted)||wanted.includes(name)))return 60;
    return 40;
  }
  async function queryAniList(search){
    const query=`query ($search:String){ Media(search:$search,type:ANIME){ id idMal title{romaji english native userPreferred} synonyms episodes format status seasonYear } }`;
    const r=await fetch(aniListApiBase(),{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({query,variables:{search}}),
      ...timeoutSignal(9000)
    });
    if(!r.ok)return null;
    return (await r.json())?.data?.Media||null;
  }
  async function resolveAniListId(params={}){
    const direct=params.anilistId||params.aniListId||params.anilist_id||params.animeId;
    if(direct)return Number(direct);
    const cache=readAniListCache();
    const tmdbKey=params.id?`tmdb:${params.type||'tv'}:${params.id}`:'';
    if(tmdbKey&&cache[tmdbKey]?.id)return Number(cache[tmdbKey].id);
    const titles=animeTitleCandidates(params);
    for(const title of titles){
      const key=`title:${normalizeTitle(title)}`;
      if(cache[key]?.id){
        if(tmdbKey&&!cache[tmdbKey]){
          cache[tmdbKey]={...cache[key],ts:Date.now()};
          writeJSON(ANILIST_CACHE_KEY,cache);
        }
        return Number(cache[key].id);
      }
    }
    let best=null,bestTitle='';
    for(const title of titles){
      try{
        const media=await queryAniList(title);
        if(!media?.id)continue;
        const score=titleMatchScore(title,media);
        if(!best||score>best.score){best={...media,score};bestTitle=title;}
        if(score>=80)break;
      }catch(e){}
    }
    if(best?.id){
      cacheAniList(params,bestTitle,best.id,best);
      return Number(best.id);
    }
    return 0;
  }
  function getAnimeEpisode(params={}){
    const value=params.flatEpisode||params.absoluteEpisode||params.animeEpisode||params.episode||1;
    return Math.max(1,Math.floor(Number(value)||1));
  }
  function streamripAnimeUrl(anilistId,episode){
    if(!anilistId)return '';
    return `${streamripBase()}/anime/${encodeURIComponent(anilistId)}/${encodeURIComponent(getAnimeEpisode({episode}))}`;
  }

  async function getMovieStream(params){
    params={...params,provider:normalizePlaybackSource(params?.provider||params?.source||'vixsrc'),source:normalizePlaybackSource(params?.source||params?.provider||'vixsrc')};
    const fallback=fallbackBySource('movie',params);
    return await callBackend('movie',params,fallback)||{ok:true,provider:params.provider||'vixsrc',embedUrl:fallback};
  }
  async function getSeriesStream(params){
    params={...params,provider:normalizePlaybackSource(params?.provider||params?.source||'vixsrc'),source:normalizePlaybackSource(params?.source||params?.provider||'vixsrc')};
    const fallback=fallbackBySource('tv',params);
    return await callBackend('tv',params,fallback)||{ok:true,provider:params.provider||'vixsrc',embedUrl:fallback};
  }
  async function getAnimeStream(params){
    const anilistId=await resolveAniListId(params);
    const episode=getAnimeEpisode(params);
    const fallback=streamripAnimeUrl(anilistId,episode);
    if(!anilistId)return {ok:false,provider:'streamrip',embedUrl:'',error:'anilist not found'};
    const payload={...params,anilistId,episode,flatEpisode:episode,provider:'streamrip',source:'streamrip',fallbackUrl:fallback};
    const backend=await callBackend('anime',payload,fallback);
    return backend||{ok:true,provider:'streamrip',embedUrl:fallback,kind:'iframe',anilistId,episode};
  }
  async function getSportStream(params={}){
    const fallback=params.fallbackUrl||liveConfig().sportDefaultUrl||'';
    return await callBackend('sport',params,fallback)||{ok:true,provider:'configured',embedUrl:fallback};
  }
  function getAnimeFallbackUrl(params={}){
    const anilistId=params.anilistId||params.aniListId||params.anilist_id||params.animeId;
    return anilistId?streamripAnimeUrl(anilistId,getAnimeEpisode(params)):'';
  }

  window.StreamGNProviders={
    hasBackend:()=>!!apiBase(),
    getMovieStream,
    getSeriesStream,
    getAnimeStream,
    getSportStream,
    resolveAniListId,
    getAnimeFallbackUrl,
    streamripAnimeUrl
  };
})();
