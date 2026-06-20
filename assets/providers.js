'use strict';

(function(){
  const CONFIG=window.STREAMGN_CONFIG||{};
  const API_BASE=String(CONFIG.streamApiBase||'').replace(/\/$/,'');
  const ROUTES={
    movie:'/play/movie/:id',
    tv:'/play/tv/:id/:season/:episode',
    anime:'/play/anime/:id',
    sport:'/sport/live',
    ...(CONFIG.streamRoutes||{})
  };
  const ANIMEWORLD_BASE=String(CONFIG.animeWorldBaseUrl||'https://www.animeworld.ac').replace(/\/$/,'');
  const ANIMEWORLD_API_BASE=String(CONFIG.animeWorldApiBase||'').replace(/\/$/,'');
  const DATA_KEY='svx_anime_links';

  function readJSON(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'')||fallback;}catch(e){return fallback;}
  }
  function writeJSON(key,value){
    try{localStorage.setItem(key,JSON.stringify(value));}catch(e){}
  }
  function contentKey(id,type,season,episode){
    return type==='movie'?`${type}_${id}`:`${type}_${id}_s${season||1}_e${episode||1}`;
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
      headers:data?.headers||null
    };
  }
  function timeoutSignal(ms=7000){
    if(typeof AbortController==='undefined')return {};
    const controller=new AbortController();
    setTimeout(()=>controller.abort(),ms);
    return {signal:controller.signal};
  }
  async function callBackend(kind,params,fallbackUrl){
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
  function normalizeAnimeUrl(url){
    url=String(url||'').trim();if(!url)return '';
    if(url.startsWith('/'))return ANIMEWORLD_BASE+url;
    if(/^https?:\/\//i.test(url))return url;
    return `${ANIMEWORLD_BASE}/${url.replace(/^\/+/,'')}`;
  }
  function animeSearchUrl(title){
    const q=encodeURIComponent(String(title||'').trim());
    return q?`${ANIMEWORLD_BASE}/archive?keyword=${q}`:ANIMEWORLD_BASE;
  }
  function isLikelyPlayableAnimeUrl(url){
    url=String(url||'').trim();
    if(!url||url==='about:blank')return false;
    try{
      const u=new URL(url,ANIMEWORLD_BASE);
      const host=u.hostname.toLowerCase(),path=u.pathname.toLowerCase();
      if(host.includes('animeworld.')&&!/\.(m3u8|mp4|webm|mov)(\?|$)/i.test(path))return false;
      return true;
    }catch(e){return false;}
  }
  function getAnimeOverride(id,type,season,episode){
    const data=readJSON(DATA_KEY,{}),key=contentKey(id,type,season,episode),url=data[key]||'';
    if(url&&!isLikelyPlayableAnimeUrl(url)){
      delete data[key];
      writeJSON(DATA_KEY,data);
      return '';
    }
    return url;
  }
  function setAnimeOverride(id,type,season,episode,url){
    const data=readJSON(DATA_KEY,{});
    data[contentKey(id,type,season,episode)]=normalizeAnimeUrl(url);
    writeJSON(DATA_KEY,data);
  }
  function animeTitleCandidates(params){
    return [...new Set([
      params?.title,
      ...(Array.isArray(params?.titles)?params.titles:[]),
      params?.originalTitle,
      params?.originalName
    ].map(x=>String(x||'').trim()).filter(Boolean))];
  }
  function extractAnimeWorldLink(data){
    const q=[data],seen=new Set();
    while(q.length){
      const x=q.shift();if(x==null)continue;
      if(typeof x==='string'){
        const m=x.match(/https?:\/\/[^"'\s<>]+animeworld[^"'\s<>]+|\/play\/[^"'\s<>]+/i);
        if(m){
          const url=normalizeAnimeUrl(m[0]);
          if(isLikelyPlayableAnimeUrl(url))return url;
        }
        continue;
      }
      if(typeof x!=='object'||seen.has(x))continue;seen.add(x);
      for(const key of ['link','url','href','embedUrl','iframeUrl','path']){
        if(x[key]){
          const url=normalizeAnimeUrl(x[key]);
          if(isLikelyPlayableAnimeUrl(url))return url;
        }
      }
      Object.values(x).forEach(v=>q.push(v));
    }
    return '';
  }
  async function tryAnimeWrapper(endpoint){
    try{
      const r=await fetch(endpoint,{cache:'no-store',headers:{accept:'application/json'},...timeoutSignal(8000)});
      if(r.ok){const found=extractAnimeWorldLink(await r.json());if(found)return found;}
    }catch(e){}
    return '';
  }
  async function findAnimeWorld(params){
    const titles=animeTitleCandidates(params);
    if(!titles.length)return '';
    const season=params?.season||1,episode=params?.episode||1,id=params?.id||params?.tmdbId||'';
    if(ANIMEWORLD_API_BASE){
      for(const title of titles){
        const qs=new URLSearchParams({title,keyword:title,q:title,id:String(id),season:String(season),episode:String(episode)});
        for(const endpoint of [
          `${ANIMEWORLD_API_BASE}/play?${qs.toString()}`,
          `${ANIMEWORLD_API_BASE}/stream?${qs.toString()}`,
          `${ANIMEWORLD_API_BASE}/find?${qs.toString()}`,
          `${ANIMEWORLD_API_BASE}/search?${qs.toString()}`,
          `${ANIMEWORLD_API_BASE}/api/search?${qs.toString()}`
        ]){
          const found=await tryAnimeWrapper(endpoint);
          if(found)return found;
        }
      }
    }
    for(const title of titles){
      try{
        const r=await fetch(`${ANIMEWORLD_BASE}/api/search/v2?keyword=${encodeURIComponent(title)}`,{method:'POST',cache:'no-store',...timeoutSignal(5000)});
        if(r.ok){const found=extractAnimeWorldLink(await r.json());if(found)return found;}
      }catch(e){}
    }
    return '';
  }
  function fallbackBySource(kind,params){
    const src=params.provider||params.source||'vixsrc';
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

  async function getMovieStream(params){
    const fallback=fallbackBySource('movie',params);
    return await callBackend('movie',params,fallback)||{ok:true,provider:params.provider||'vixsrc',embedUrl:fallback};
  }
  async function getSeriesStream(params){
    const fallback=fallbackBySource('tv',params);
    return await callBackend('tv',params,fallback)||{ok:true,provider:params.provider||'vixsrc',embedUrl:fallback};
  }
  async function getAnimeStream(params){
    const fallback=getAnimeFallbackUrl(params);
    const backend=await callBackend('anime',params,'');
    if(backend)return backend;
    const saved=getAnimeOverride(params.id,params.type||'tv',params.season,params.episode);
    if(saved)return {ok:true,provider:'manual',embedUrl:saved};
    const found=await findAnimeWorld(params);
    if(found){
      setAnimeOverride(params.id,params.type||'tv',params.season,params.episode,found);
      return {ok:true,provider:'animeworld',embedUrl:found};
    }
    return {ok:false,provider:'animeworld',embedUrl:fallback,error:'anime provider unavailable'};
  }
  async function getSportStream(params={}){
    const fallback=params.fallbackUrl||CONFIG.sportDefaultUrl||'';
    return await callBackend('sport',params,fallback)||{ok:true,provider:'configured',embedUrl:fallback};
  }
  function getAnimeFallbackUrl(params){
    return getAnimeOverride(params.id,params.type||'tv',params.season,params.episode)||'';
  }

  window.StreamGNProviders={
    hasBackend:()=>!!API_BASE,
    getMovieStream,
    getSeriesStream,
    getAnimeStream,
    getSportStream,
    getAnimeOverride,
    setAnimeOverride,
    getAnimeFallbackUrl,
    animeSearchUrl
  };
})();
