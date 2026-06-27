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
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'content-type,authorization',
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

function base64Url(input){
  const bytes=typeof input==='string'?new TextEncoder().encode(input):new Uint8Array(input);
  let binary='';
  bytes.forEach(b=>{binary+=String.fromCharCode(b);});
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function derToJose(signature){
  const bytes=new Uint8Array(signature);
  if(bytes.length===64)return bytes;
  if(bytes[0]!==0x30)return bytes;
  let offset=2;
  if(bytes[offset]!==0x02)return bytes;
  const rLen=bytes[offset+1];
  let r=bytes.slice(offset+2,offset+2+rLen);
  offset=offset+2+rLen;
  if(bytes[offset]!==0x02)return bytes;
  const sLen=bytes[offset+1];
  let s=bytes.slice(offset+2,offset+2+sLen);
  if(r[0]===0)r=r.slice(1);
  if(s[0]===0)s=s.slice(1);
  const out=new Uint8Array(64);
  out.set(r.slice(-32),32-Math.min(32,r.length));
  out.set(s.slice(-32),64-Math.min(32,s.length));
  return out;
}
async function sha256Hex(value){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function vapidJwt(endpoint,env){
  const aud=new URL(endpoint).origin;
  const subject=env.VAPID_SUBJECT||'mailto:admin@streamgn.github.io';
  const header=base64Url(JSON.stringify({typ:'JWT',alg:'ES256'}));
  const payload=base64Url(JSON.stringify({aud,exp:Math.floor(Date.now()/1000)+12*60*60,sub:subject}));
  const signingInput=`${header}.${payload}`;
  const jwk=JSON.parse(env.VAPID_PRIVATE_JWK||'{}');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64Url(derToJose(sig))}`;
}
function pushStore(env){return env.PUSH_SUBSCRIPTIONS||null;}
async function handlePushSubscribe(request,env){
  const store=pushStore(env);
  if(!store)return json({ok:false,error:'PUSH_SUBSCRIPTIONS KV not configured'},503,env);
  let body={};
  try{body=await request.json();}catch(e){}
  const subscription=body.subscription||body;
  if(!subscription?.endpoint||!subscription?.keys?.p256dh||!subscription?.keys?.auth)return json({ok:false,error:'invalid subscription'},400,env);
  const key='sub:'+await sha256Hex(subscription.endpoint);
  const prev=await store.get(key,'json');
  const now=Date.now();
  await store.put(key,JSON.stringify({
    ...(prev||{}),
    subscription,
    scope:body.scope||prev?.scope||'',
    timezone:body.timezone||prev?.timezone||'',
    dailyLimit:Number(body.dailyLimit||prev?.dailyLimit||3),
    quietWindowMs:Number(body.quietWindowMs||prev?.quietWindowMs||8*60*60*1000),
    ua:body.ua||prev?.ua||'',
    createdAt:prev?.createdAt||now,
    updatedAt:now
  }));
  return json({ok:true},200,env);
}
async function handlePushUnsubscribe(request,env){
  const store=pushStore(env);
  if(!store)return json({ok:false,error:'PUSH_SUBSCRIPTIONS KV not configured'},503,env);
  let body={};
  try{body=await request.json();}catch(e){}
  const endpoint=body.endpoint||body.subscription?.endpoint;
  if(!endpoint)return json({ok:false,error:'missing endpoint'},400,env);
  await store.delete('sub:'+await sha256Hex(endpoint));
  return json({ok:true},200,env);
}
function sameDay(a,b){return new Date(a).toISOString().slice(0,10)===new Date(b).toISOString().slice(0,10);}
function canSendServerPush(record,now){
  const limit=Math.max(1,Number(record.dailyLimit||3));
  const quiet=Math.max(60*60*1000,Number(record.quietWindowMs||8*60*60*1000));
  if(record.lastSentAt&&now-record.lastSentAt<quiet)return false;
  if(record.lastSentAt&&sameDay(record.lastSentAt,now)&&(record.dayCount||0)>=limit)return false;
  return true;
}
function markServerPush(record,now){
  if(record.lastSentAt&&sameDay(record.lastSentAt,now))record.dayCount=(record.dayCount||0)+1;
  else record.dayCount=1;
  record.lastSentAt=now;
  return record;
}
async function sendEmptyWebPush(subscription,env){
  if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_JWK)throw new Error('missing VAPID keys');
  const token=await vapidJwt(subscription.endpoint,env);
  return fetch(subscription.endpoint,{
    method:'POST',
    headers:{
      ttl:String(env.PUSH_TTL||'43200'),
      urgency:'low',
      authorization:`vapid t=${token}, k=${env.VAPID_PUBLIC_KEY}`
    }
  });
}
async function broadcastPushes(env,{force=false}={}){
  const store=pushStore(env);
  if(!store)return {ok:false,error:'PUSH_SUBSCRIPTIONS KV not configured'};
  if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_JWK)return {ok:false,error:'missing VAPID keys'};
  let cursor,checked=0,sent=0,removed=0,failed=0;
  const now=Date.now();
  do{
    const page=await store.list({prefix:'sub:',cursor,limit:100});
    cursor=page.cursor;
    for(const item of page.keys){
      checked++;
      const record=await store.get(item.name,'json');
      if(!record?.subscription?.endpoint)continue;
      if(!force&&!canSendServerPush(record,now))continue;
      try{
        const res=await sendEmptyWebPush(record.subscription,env);
        if(res.status===404||res.status===410){await store.delete(item.name);removed++;continue;}
        if(!res.ok){failed++;continue;}
        sent++;
        await store.put(item.name,JSON.stringify(markServerPush(record,now)));
      }catch(e){failed++;}
    }
  }while(cursor);
  return {ok:true,checked,sent,removed,failed};
}
function isAuthorized(request,env){
  const token=env.PUSH_ADMIN_TOKEN;
  if(!token)return false;
  const auth=request.headers.get('authorization')||'';
  return auth===`Bearer ${token}`;
}
async function handlePushBroadcast(request,env){
  if(!isAuthorized(request,env))return json({ok:false,error:'unauthorized'},401,env);
  const url=new URL(request.url);
  return json(await broadcastPushes(env,{force:url.searchParams.get('force')==='1'}),200,env);
}

const EXTERNAL_DEFAULTS={
  anime:'https://www.animeunity.so/',
  sport:'https://pepperstream.xyz/index.php'
};
const EXTERNAL_DEFAULT_HOSTS=[
  'animeunity.so',
  'www.animeunity.so',
  'pepperstream.xyz',
  'www.pepperstream.xyz'
];
function escapeHtml(value){
  return String(value||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function externalAllowedHosts(env){
  return new Set([...EXTERNAL_DEFAULT_HOSTS,...getEnvList(env,'EXTERNAL_PROXY_ALLOWED_HOSTS',[])].map(x=>x.toLowerCase()));
}
function externalFallbackUrl(kind,env){
  if(kind==='anime')return env.EXTERNAL_ANIME_URL||EXTERNAL_DEFAULTS.anime;
  if(kind==='sport')return env.EXTERNAL_SPORT_URL||env.SPORT_URL||EXTERNAL_DEFAULTS.sport;
  return '';
}
function normalizeExternalTarget(raw,kind,env){
  const fallback=externalFallbackUrl(kind,env);
  const value=String(raw||fallback||'').trim();
  if(!value)return null;
  const target=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
  if(!/^https?:$/.test(target.protocol))return null;
  if(!externalAllowedHosts(env).has(target.hostname.toLowerCase()))return null;
  return target;
}
function proxyUrlFor(request,kind,target){
  const out=new URL(`/external/${kind}`,new URL(request.url).origin);
  out.searchParams.set('url',target.href);
  return out.href;
}
function rewriteExternalUrl(value,base,request,kind){
  const raw=String(value||'').trim();
  if(!raw||raw.startsWith('#')||/^(data|blob|javascript|mailto|tel):/i.test(raw))return value;
  try{return proxyUrlFor(request,kind,new URL(raw,base.href));}
  catch(e){return value;}
}
function rewriteSrcset(value,base,request,kind){
  return String(value||'').split(',').map(part=>{
    const trimmed=part.trim();
    if(!trimmed)return trimmed;
    const bits=trimmed.split(/\s+/);
    bits[0]=rewriteExternalUrl(bits[0],base,request,kind);
    return bits.join(' ');
  }).join(', ');
}
function proxyBootstrapScript(request,kind,target){
  const endpoint=new URL(`/external/${kind}`,new URL(request.url).origin).href;
  return `<script>(()=>{const TARGET=${JSON.stringify(target.href)},ENDPOINT=${JSON.stringify(endpoint)},EP=new URL(ENDPOINT);function already(v){try{const u=new URL(String(v),location.href);return u.origin===EP.origin&&u.pathname===EP.pathname}catch(e){return false}}function prox(v){try{if(!v||/^(data|blob|javascript|mailto|tel):/i.test(String(v))||already(v))return v;const u=new URL(String(v),TARGET);const p=new URL(ENDPOINT);p.searchParams.set('url',u.href);return p.href}catch(e){return v}}document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(!a||a.target==='_blank'||e.defaultPrevented)return;e.preventDefault();location.href=prox(a.getAttribute('href'))},true);document.addEventListener('submit',e=>{const f=e.target;if(!f||!f.action)return;f.action=prox(f.getAttribute('action')||location.href)},true);const nf=window.fetch;window.fetch=function(input,init){try{if(typeof input==='string'||input instanceof URL)input=prox(input);else if(input&&input.url&&!already(input.url))input=new Request(prox(input.url),input)}catch(e){}return nf.call(this,input,init)};const xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u,...r){return xo.call(this,m,prox(u),...r)};})();</script>`;
}
function rewriteHtml(html,target,request,kind){
  let out=String(html||'');
  out=out.replace(/\s(?:nonce|integrity)=(".*?"|'.*?'|[^\s>]+)/gi,'');
  out=out.replace(/(<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>)/gi,'');
  out=out.replace(/\s(href|src|action|poster|data-src|data-href)=("([^"]*)"|'([^']*)'|([^\s>]+))/gi,(m,attr,all,dq,sq,bare)=>{
    const quote=all[0]==="'"?"'":all[0]==='"'?'"':'';
    const value=dq??sq??bare??'';
    const rewritten=rewriteExternalUrl(value,target,request,kind);
    return ` ${attr}=${quote}${escapeHtml(rewritten)}${quote}`;
  });
  out=out.replace(/\s(srcset)=("([^"]*)"|'([^']*)')/gi,(m,attr,all,dq,sq)=>{
    const quote=all[0]==="'"?"'":'"';
    return ` ${attr}=${quote}${escapeHtml(rewriteSrcset(dq??sq??'',target,request,kind))}${quote}`;
  });
  const inject=`<base href="${escapeHtml(target.href)}">${proxyBootstrapScript(request,kind,target)}`;
  if(/<head[^>]*>/i.test(out))return out.replace(/<head([^>]*)>/i,`<head$1>${inject}`);
  return `${inject}${out}`;
}
function rewriteCss(css,target,request,kind){
  return String(css||'').replace(/url\((["']?)([^"')]+)\1\)/gi,(m,q,value)=>`url(${q}${rewriteExternalUrl(value,target,request,kind)}${q})`);
}
function externalHeaders(upstream,contentType){
  const headers=new Headers(upstream.headers);
  [
    'content-security-policy',
    'content-security-policy-report-only',
    'x-frame-options',
    'frame-options',
    'cross-origin-opener-policy',
    'cross-origin-embedder-policy',
    'cross-origin-resource-policy',
    'origin-agent-cluster',
    'clear-site-data',
    'content-encoding',
    'content-length'
  ].forEach(h=>headers.delete(h));
  headers.set('content-type',contentType);
  headers.set('cache-control','no-store');
  headers.set('access-control-allow-origin','*');
  return headers;
}
function upstreamHeaders(request,target){
  const headers=new Headers(request.headers);
  ['host','origin','referer','cf-connecting-ip','cf-ipcountry','cf-ray','x-forwarded-for','x-forwarded-proto'].forEach(h=>headers.delete(h));
  headers.set('accept',headers.get('accept')||'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  headers.set('accept-language',headers.get('accept-language')||'it-IT,it;q=0.9,en;q=0.8');
  headers.set('user-agent',headers.get('user-agent')||'Mozilla/5.0');
  headers.set('referer',target.origin+'/');
  return headers;
}
async function handleExternalProxy(request,env,kind){
  const incoming=new URL(request.url);
  const target=normalizeExternalTarget(incoming.searchParams.get('url'),kind,env);
  if(!target)return json({ok:false,error:'external target not allowed'},400,env);
  const init={
    method:request.method,
    headers:upstreamHeaders(request,target),
    redirect:'follow'
  };
  if(!['GET','HEAD'].includes(request.method))init.body=request.body;
  let upstream;
  try{upstream=await fetch(target.href,init);}
  catch(error){return json({ok:false,error:'external fetch failed'},502,env);}
  const type=upstream.headers.get('content-type')||'application/octet-stream';
  if(type.includes('text/html')){
    const body=rewriteHtml(await upstream.text(),target,request,kind);
    return new Response(body,{status:upstream.status,statusText:upstream.statusText,headers:externalHeaders(upstream,'text/html; charset=UTF-8')});
  }
  if(type.includes('text/css')){
    const body=rewriteCss(await upstream.text(),target,request,kind);
    return new Response(body,{status:upstream.status,statusText:upstream.statusText,headers:externalHeaders(upstream,type)});
  }
  return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:externalHeaders(upstream,type)});
}

export default {
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{headers:corsHeaders(env)});
    const parts=splitPath(request.url);
    if(parts[0]==='health')return json({ok:true,service:'streamgn-provider-api'},200,env);
    if(parts[0]==='external'&&(parts[1]==='anime'||parts[1]==='sport'))return handleExternalProxy(request,env,parts[1]);
    if(parts[0]==='push'&&parts[1]==='subscribe'&&request.method==='POST')return handlePushSubscribe(request,env);
    if(parts[0]==='push'&&parts[1]==='unsubscribe'&&request.method==='POST')return handlePushUnsubscribe(request,env);
    if(parts[0]==='push'&&parts[1]==='broadcast'&&request.method==='POST')return handlePushBroadcast(request,env);
    if(parts[0]==='play')return handlePlay(request,env);
    if(parts[0]==='sport'&&parts[1]==='live')return handleSport(request,env);
    return json({ok:false,error:'not found'},404,env);
  },
  async scheduled(event,env,ctx){
    ctx.waitUntil(broadcastPushes(env).catch(()=>{}));
  }
};
