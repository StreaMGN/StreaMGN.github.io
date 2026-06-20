'use strict';

const DEFAULTS={
  streamripBaseUrl:'https://streamrip-website-production.up.railway.app',
  aniListApiBase:'https://graphql.anilist.co',
  sportUrl:'https://pepperstream.xyz/index.php',
  movieProviders:['vixsrc'],
  tvProviders:['vixsrc'],
  animeProviders:['streamrip'],
  sportProviders:['configured']
};

function corsHeaders(env){
  return {
    'access-control-allow-origin':env.CORS_ORIGIN||'*',
    'access-control-allow-methods':'GET,OPTIONS',
    'access-control-allow-headers':'content-type',
    'cache-control':'no-store'
  };
}
function json(data,status=200,env={}){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8',...corsHeaders(env)}
  });
}
function splitPath(url){
  return new URL(url).pathname.split('/').filter(Boolean);
}
function getEnvList(env,key,fallback){
  const raw=env[key];
  if(!raw)return fallback;
  return String(raw).split(',').map(x=>x.trim()).filter(Boolean);
}
function addResume(params,startSecs){
  const secs=Number(startSecs)||0;
  if(secs>10){
    params.set('startAt',String(Math.round(secs)));
    params.set('t',String(Math.round(secs)));
  }
}
function uniqueTextList(items){
  return [...new Set((items||[]).map(x=>String(x||'').trim()).filter(Boolean))];
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
function animeTitleCandidates(ctx){
  return uniqueTextList([ctx.title,...(ctx.titles||[]),ctx.originalTitle,ctx.originalName]);
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
async function queryAniList(search,env){
  const endpoint=String(env.ANILIST_API_BASE||DEFAULTS.aniListApiBase).replace(/\/$/,'');
  const query=`query ($search:String){ Media(search:$search,type:ANIME){ id title{romaji english native userPreferred} synonyms episodes format status seasonYear } }`;
  const res=await fetch(endpoint,{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify({query,variables:{search}})
  });
  if(!res.ok)return null;
  return (await res.json())?.data?.Media||null;
}
async function resolveAniListId(ctx,env){
  const direct=ctx.anilistId||ctx.aniListId||ctx.anilist_id||ctx.animeId;
  if(direct)return Number(direct);
  const titles=animeTitleCandidates(ctx);
  let best=null;
  for(const title of titles){
    try{
      const media=await queryAniList(title,env);
      if(!media?.id)continue;
      const score=titleMatchScore(title,media);
      if(!best||score>best.score)best={id:media.id,score};
      if(score>=80)break;
    }catch(e){}
  }
  return best?.id||0;
}
function vixsrcMovie({id,startSecs,lang='it',subs='none'}){
  const params=new URLSearchParams();
  if(lang&&lang!=='original')params.set('hl',lang);
  if(subs&&subs!=='none')params.set('sl',subs);
  addResume(params,startSecs);
  return `https://vixsrc.to/movie/${id}${params.size?'?'+params.toString():''}`;
}
function vixsrcTv({id,season=1,episode=1,startSecs,lang='it',subs='none'}){
  const params=new URLSearchParams();
  if(lang&&lang!=='original')params.set('hl',lang);
  if(subs&&subs!=='none')params.set('sl',subs);
  addResume(params,startSecs);
  return `https://vixsrc.to/tv/${id}/${season}/${episode}${params.size?'?'+params.toString():''}`;
}
function vidsrcMovie({id}){return `https://vidsrc.me/embed/movie?tmdb=${id}`;}
function vidsrcTv({id,season=1,episode=1}){return `https://vidsrc.me/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`;}
function embedMovie({id}){return `https://embed.su/embed/movie/${id}`;}
function embedTv({id,season=1,episode=1}){return `https://embed.su/embed/tv/${id}/${season}/${episode}`;}
function animeEpisode(ctx){
  return Math.max(1,Math.floor(Number(ctx.flatEpisode||ctx.absoluteEpisode||ctx.animeEpisode||ctx.episode||1)||1));
}
async function streamripAnimeProvider(ctx,env){
  const anilistId=await resolveAniListId(ctx,env);
  if(!anilistId)throw new Error('anilist not found');
  const base=String(env.STREAMRIP_BASE_URL||DEFAULTS.streamripBaseUrl).replace(/\/$/,'');
  return {provider:'streamrip',embedUrl:`${base}/anime/${encodeURIComponent(anilistId)}/${encodeURIComponent(animeEpisode(ctx))}`,kind:'iframe',anilistId};
}
async function configuredSportProvider(ctx,env){
  return {provider:'configured',embedUrl:env.SPORT_URL||ctx.fallbackUrl||DEFAULTS.sportUrl};
}

const movieProviderMap={
  vixsrc:ctx=>({provider:'vixsrc',embedUrl:vixsrcMovie(ctx)}),
  vidsrc:ctx=>({provider:'vidsrc',embedUrl:vidsrcMovie(ctx)}),
  embed:ctx=>({provider:'embed',embedUrl:embedMovie(ctx)})
};
const tvProviderMap={
  vixsrc:ctx=>({provider:'vixsrc',embedUrl:vixsrcTv(ctx)}),
  vidsrc:ctx=>({provider:'vidsrc',embedUrl:vidsrcTv(ctx)}),
  embed:ctx=>({provider:'embed',embedUrl:embedTv(ctx)})
};

async function firstWorking(providers,registry,ctx,env){
  const errors=[];
  for(const name of providers){
    const provider=registry[name];
    if(!provider){errors.push(`${name}: missing`);continue;}
    try{
      const result=await provider(ctx,env);
      if(result?.embedUrl||result?.url)return {ok:true,...result};
    }catch(error){errors.push(`${name}: ${error.message||'error'}`);}
  }
  return {ok:false,error:'no provider available',errors};
}

async function handlePlay(request,env){
  const url=new URL(request.url),parts=splitPath(request.url);
  const kind=parts[1],id=parts[2];
  const ctx={
    id,
    tmdbId:url.searchParams.get('tmdbId')||id,
    anilistId:url.searchParams.get('anilistId')||url.searchParams.get('aniListId')||url.searchParams.get('anilist_id')||'',
    season:parts[3]||url.searchParams.get('season')||1,
    episode:parts[4]||url.searchParams.get('episode')||1,
    flatEpisode:url.searchParams.get('flatEpisode')||url.searchParams.get('absoluteEpisode')||'',
    title:url.searchParams.get('title')||'',
    titles:uniqueTextList([...url.searchParams.getAll('titles'),String(url.searchParams.get('titles')||'').split(',')].flat()),
    originalTitle:url.searchParams.get('originalTitle')||'',
    originalName:url.searchParams.get('originalName')||'',
    startSecs:url.searchParams.get('startSecs')||url.searchParams.get('t')||0,
    lang:url.searchParams.get('lang')||'it',
    subs:url.searchParams.get('subs')||'none',
    fallbackUrl:url.searchParams.get('fallbackUrl')||''
  };
  if(!id)return json({ok:false,error:'missing id'},400,env);
  if(kind==='movie'){
    const providers=getEnvList(env,'MOVIE_PROVIDERS',DEFAULTS.movieProviders);
    return json(await firstWorking(providers,movieProviderMap,ctx,env),200,env);
  }
  if(kind==='tv'){
    const providers=getEnvList(env,'TV_PROVIDERS',DEFAULTS.tvProviders);
    return json(await firstWorking(providers,tvProviderMap,ctx,env),200,env);
  }
  if(kind==='anime'){
    const providers=getEnvList(env,'ANIME_PROVIDERS',DEFAULTS.animeProviders);
    return json(await firstWorking(providers,{streamrip:streamripAnimeProvider},ctx,env),200,env);
  }
  return json({ok:false,error:'unknown play kind'},404,env);
}
async function handleSport(request,env){
  const url=new URL(request.url);
  const ctx={fallbackUrl:url.searchParams.get('fallbackUrl')||DEFAULTS.sportUrl};
  const providers=getEnvList(env,'SPORT_PROVIDERS',DEFAULTS.sportProviders);
  return json(await firstWorking(providers,{configured:configuredSportProvider},ctx,env),200,env);
}

export default {
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{headers:corsHeaders(env)});
    const parts=splitPath(request.url);
    if(parts[0]==='health')return json({ok:true,service:'streamgn-provider-api'},200,env);
    if(parts[0]==='play')return handlePlay(request,env);
    if(parts[0]==='sport'&&parts[1]==='live')return handleSport(request,env);
    return json({ok:false,error:'not found'},404,env);
  }
};
