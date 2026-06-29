'use strict';
(function(){
  const CACHE_KEY='svx_sport_data_v1';
  const CACHE_TTL=12*60*1000;
  const LIVE_TTL=45*1000;
  const ESPN_BASE='https://site.api.espn.com/apis/site/v2/sports';
  const THESPORTSDB_BASE='https://www.thesportsdb.com/api/v1/json/3';
  const WATCH_DEFAULT='https://pepperstream.xyz';
  const SPORT_DEFS=[
    {
      id:'calcio',
      label:'Calcio',
      icon:'⚽',
      color:'#30d158',
      competitions:[
        {id:'ita.1',name:'Serie A',source:'espn',path:'soccer/ita.1'},
        {id:'eng.1',name:'Premier League',source:'espn',path:'soccer/eng.1'},
        {id:'esp.1',name:'LaLiga',source:'espn',path:'soccer/esp.1'},
        {id:'uefa.champions',name:'Champions League',source:'espn',path:'soccer/uefa.champions'}
      ]
    },
    {
      id:'tennis',
      label:'Tennis',
      icon:'🎾',
      color:'#ffd60a',
      competitions:[
        {id:'atp',name:'ATP',source:'espn',path:'tennis/atp'},
        {id:'wta',name:'WTA',source:'espn',path:'tennis/wta'}
      ]
    },
    {
      id:'f1',
      label:'Formula 1',
      icon:'🏎️',
      color:'#ff375f',
      competitions:[
        {id:'f1',name:'Formula 1',source:'espn',path:'racing/f1'}
      ]
    },
    {
      id:'basket',
      label:'Basket',
      icon:'🏀',
      color:'#ff9f0a',
      competitions:[
        {id:'nba',name:'NBA',source:'espn',path:'basketball/nba'},
        {id:'wnba',name:'WNBA',source:'espn',path:'basketball/wnba'}
      ]
    }
  ];

  function readCache(){
    try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null');}
    catch(e){return null;}
  }
  function writeCache(data){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({...data,cachedAt:Date.now()}));}
    catch(e){}
  }
  function cacheFresh(cache,force){
    if(force||!cache?.events?.length)return false;
    const hasLive=cache.events.some(e=>e.status==='live');
    return Date.now()-(cache.cachedAt||0)<(hasLive?LIVE_TTL:CACHE_TTL);
  }
  function dateKey(offset=0){
    const d=new Date();
    d.setDate(d.getDate()+offset);
    return d.toISOString().slice(0,10).replace(/-/g,'');
  }
  function isoDate(offset=0,hour=20){
    const d=new Date();
    d.setDate(d.getDate()+offset);
    d.setHours(hour,0,0,0);
    return d.toISOString();
  }
  async function fetchJson(url,timeout=8000){
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),timeout);
    try{
      const res=await fetch(url,{signal:ctrl.signal,cache:'no-store'});
      if(!res.ok)throw Error(String(res.status));
      return await res.json();
    }finally{
      clearTimeout(timer);
    }
  }
  function cleanText(value,fallback=''){
    return String(value||fallback||'').replace(/\s+/g,' ').trim();
  }
  function normalizeStatus(raw){
    const type=raw?.type||raw||{};
    const state=String(type.state||type.name||raw?.state||'').toLowerCase();
    const name=String(type.name||type.description||raw?.name||'').toLowerCase();
    const detail=raw?.displayClock||raw?.detail||type.shortDetail||type.detail||type.description||'';
    if(type.completed||state==='post'||name.includes('final')||name.includes('post'))return {status:'past',label:'Terminato',detail};
    if(state==='in'||name.includes('progress')||name.includes('live')||name.includes('halftime'))return {status:'live',label:'Live',detail};
    return {status:'upcoming',label:'Programmato',detail};
  }
  function normalizeCompetitor(comp){
    if(!comp)return null;
    const team=comp.team||comp.athlete||{};
    return {
      id:String(team.id||comp.id||team.uid||cleanText(team.displayName||team.name)),
      name:cleanText(team.displayName||team.shortDisplayName||team.name||comp.displayName||comp.name,'Partecipante'),
      shortName:cleanText(team.shortDisplayName||team.abbreviation||team.name||comp.abbreviation),
      logo:team.logo||team.logos?.[0]?.href||team.flag?.href||'',
      score:comp.score!=null?String(comp.score):''
    };
  }
  function normalizeStats(comp){
    const stats=comp?.statistics||comp?.stats||[];
    return (Array.isArray(stats)?stats:[]).slice(0,8).map(s=>({
      name:cleanText(s.displayName||s.shortDisplayName||s.name),
      value:cleanText(s.displayValue||s.value)
    })).filter(s=>s.name&&s.value);
  }
  function normalizeEspnEvent(event,sportDef,competitionDef){
    const comp=(event.competitions||[])[0]||{};
    const competitors=(comp.competitors||[]).map(normalizeCompetitor).filter(Boolean);
    const homeRaw=(comp.competitors||[]).find(c=>c.homeAway==='home')||(comp.competitors||[])[0];
    const awayRaw=(comp.competitors||[]).find(c=>c.homeAway==='away')||(comp.competitors||[])[1];
    const homeTeam=normalizeCompetitor(homeRaw)||competitors[0]||null;
    const awayTeam=normalizeCompetitor(awayRaw)||competitors[1]||null;
    const status=normalizeStatus(event.status||comp.status);
    const score=homeTeam&&awayTeam&&(homeTeam.score||awayTeam.score)?`${homeTeam.score||0} - ${awayTeam.score||0}`:(competitors.map(c=>c.score).filter(Boolean).join(' - ')||'');
    const title=cleanText(event.shortName||event.name||(homeTeam&&awayTeam?`${homeTeam.name} - ${awayTeam.name}`:'Evento sportivo'));
    const start=event.date||comp.date||'';
    const stats=[
      ...(homeRaw?normalizeStats(homeRaw).map(s=>({team:homeTeam?.name||'',...s})):[]),
      ...(awayRaw?normalizeStats(awayRaw).map(s=>({team:awayTeam?.name||'',...s})):[])
    ].slice(0,16);
    const details=(comp.details||event.details||[]).map(d=>({
      time:cleanText(d.clock?.displayValue||d.displayClock||d.time||d.period?.displayValue),
      type:cleanText(d.type?.text||d.type||d.scoringType?.displayName||d.play?.type?.text,'Evento'),
      text:cleanText(d.text||d.headline||d.shortText)
    })).filter(d=>d.text||d.type).slice(0,24);
    return {
      id:`espn:${sportDef.id}:${competitionDef.id}:${event.id}`,
      sport:sportDef.id,
      sportLabel:sportDef.label,
      sportIcon:sportDef.icon,
      title,
      competition:cleanText(event.league?.name||competitionDef.name),
      competitionId:competitionDef.id,
      status:status.status,
      statusLabel:status.label,
      date:start,
      time:start?new Date(start).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'',
      venue:cleanText(comp.venue?.fullName||comp.venue?.address?.city||event.venue?.fullName),
      homeTeam,
      awayTeam,
      participants:competitors,
      score,
      liveMinute:cleanText(status.detail||event.status?.displayClock),
      stats,
      lineups:[],
      events:details,
      source:'ESPN',
      sourceId:event.id,
      watchUrl:WATCH_DEFAULT,
      raw:event
    };
  }
  async function fetchEspnCompetition(sportDef,competitionDef){
    const offsets=[0,1,7,-1,-7];
    const urls=[`${ESPN_BASE}/${competitionDef.path}/scoreboard`,...offsets.map(o=>`${ESPN_BASE}/${competitionDef.path}/scoreboard?dates=${dateKey(o)}`)];
    const found=[];
    for(const url of urls){
      try{
        const data=await fetchJson(url,6500);
        (data.events||[]).forEach(event=>found.push(normalizeEspnEvent(event,sportDef,competitionDef)));
      }catch(e){}
    }
    return found;
  }
  async function fetchEspnEvents(){
    const groups=SPORT_DEFS.flatMap(s=>s.competitions.map(c=>({sport:s,competition:c})));
    const results=await Promise.allSettled(groups.map(g=>fetchEspnCompetition(g.sport,g.competition)));
    return results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
  }
  async function fetchTheSportsDbMeta(){
    try{
      const data=await fetchJson(`${THESPORTSDB_BASE}/all_sports.php`,6500);
      return (data.sports||[]).map(s=>({id:cleanText(s.idSport||s.strSport),name:cleanText(s.strSport),description:cleanText(s.strSportDescription),source:'TheSportsDB'})).filter(s=>s.name);
    }catch(e){return [];}
  }
  function fallbackEvents(){
    return [
      {
        id:'fallback:calcio:serie-a',
        sport:'calcio',
        sportLabel:'Calcio',
        sportIcon:'⚽',
        title:'Prossima partita di cartello',
        competition:'Serie A',
        competitionId:'serie-a',
        status:'upcoming',
        statusLabel:'Programmato',
        date:isoDate(1,20),
        time:'20:00',
        venue:'Stadio da confermare',
        homeTeam:{id:'home',name:'Squadra casa',shortName:'Casa',logo:'',score:''},
        awayTeam:{id:'away',name:'Squadra ospite',shortName:'Ospite',logo:'',score:''},
        participants:[{id:'home',name:'Squadra casa'},{id:'away',name:'Squadra ospite'}],
        score:'',
        liveMinute:'',
        stats:[],
        lineups:[],
        events:[],
        source:'Fallback',
        watchUrl:WATCH_DEFAULT
      },
      {
        id:'fallback:tennis:match',
        sport:'tennis',
        sportLabel:'Tennis',
        sportIcon:'🎾',
        title:'Match ATP in programma',
        competition:'ATP',
        competitionId:'atp',
        status:'upcoming',
        statusLabel:'Programmato',
        date:isoDate(2,15),
        time:'15:00',
        venue:'Campo da confermare',
        homeTeam:null,
        awayTeam:null,
        participants:[{id:'p1',name:'Giocatore 1'},{id:'p2',name:'Giocatore 2'}],
        score:'',
        liveMinute:'',
        stats:[],
        lineups:[],
        events:[],
        source:'Fallback',
        watchUrl:WATCH_DEFAULT
      },
      {
        id:'fallback:f1:race',
        sport:'f1',
        sportLabel:'Formula 1',
        sportIcon:'🏎️',
        title:'Weekend Formula 1',
        competition:'Formula 1',
        competitionId:'f1',
        status:'upcoming',
        statusLabel:'Programmato',
        date:isoDate(3,14),
        time:'14:00',
        venue:'Circuito da confermare',
        homeTeam:null,
        awayTeam:null,
        participants:[{id:'drivers',name:'Piloti e team'}],
        score:'',
        liveMinute:'',
        stats:[{name:'Sessione',value:'Programma in aggiornamento'}],
        lineups:[],
        events:[],
        source:'Fallback',
        watchUrl:WATCH_DEFAULT
      }
    ];
  }
  function dedupeEvents(events){
    const map=new Map();
    events.forEach(e=>{
      const key=e.id||`${e.sport}:${e.competition}:${e.title}:${e.date}`;
      if(!map.has(key))map.set(key,e);
    });
    return [...map.values()].sort((a,b)=>{
      const rank={live:0,upcoming:1,past:2};
      const ar=rank[a.status]??3,br=rank[b.status]??3;
      if(ar!==br)return ar-br;
      return new Date(a.date||0)-new Date(b.date||0);
    });
  }
  function deriveCollections(events,metaSports=[]){
    const competitionMap=new Map(),teamMap=new Map();
    events.forEach(e=>{
      if(e.competition){
        const id=e.competitionId||e.competition;
        if(!competitionMap.has(id))competitionMap.set(id,{id,name:e.competition,sport:e.sport,count:0});
        competitionMap.get(id).count++;
      }
      (e.participants||[]).forEach(p=>{
        if(!p?.name)return;
        const id=`${e.sport}:${p.id||p.name}`;
        if(!teamMap.has(id))teamMap.set(id,{id,name:p.name,shortName:p.shortName||'',logo:p.logo||'',sport:e.sport,count:0});
        teamMap.get(id).count++;
      });
    });
    return {
      sports:SPORT_DEFS.map(s=>({id:s.id,label:s.label,icon:s.icon,color:s.color,count:events.filter(e=>e.sport===s.id).length,meta:metaSports.find(m=>m.name.toLowerCase()===s.label.toLowerCase())||null})),
      competitions:[...competitionMap.values()].sort((a,b)=>b.count-a.count),
      teams:[...teamMap.values()].sort((a,b)=>b.count-a.count).slice(0,80)
    };
  }
  async function load(options={}){
    const force=!!options.force;
    const cache=readCache();
    if(cacheFresh(cache,force))return cache;
    const warnings=[];
    let events=[],metaSports=[];
    try{events=await fetchEspnEvents();}catch(e){warnings.push('ESPN non disponibile');}
    try{metaSports=await fetchTheSportsDbMeta();}catch(e){}
    if(!events.length){
      events=fallbackEvents();
      warnings.push('Fonti live non disponibili: dati dimostrativi caricati.');
    }
    events=dedupeEvents(events).slice(0,220);
    const collections=deriveCollections(events,metaSports);
    const data={events,warnings,...collections,updatedAt:Date.now()};
    writeCache(data);
    return data;
  }
  function searchableText(item){
    return [
      item.title,item.name,item.label,item.sportLabel,item.competition,item.shortName,item.statusLabel,item.venue,item.source,
      item.homeTeam?.name,item.awayTeam?.name,
      ...(item.participants||[]).map(p=>p.name)
    ].filter(Boolean).join(' ').toLowerCase();
  }
  async function search(query,options={}){
    const q=String(query||'').trim().toLowerCase();
    if(q.length<2)return {events:[],teams:[],competitions:[],sports:[]};
    const data=options.data||await load();
    return {
      events:data.events.filter(e=>searchableText(e).includes(q)).slice(0,10),
      teams:data.teams.filter(t=>searchableText(t).includes(q)).slice(0,10),
      competitions:data.competitions.filter(c=>searchableText(c).includes(q)).slice(0,8),
      sports:data.sports.filter(s=>searchableText(s).includes(q)).slice(0,6)
    };
  }
  window.StreamGNSportData={
    sports:SPORT_DEFS,
    load,
    search,
    normalizeEvent:event=>event,
    fallbackEvents,
    refreshMs:45000,
    cacheKey:CACHE_KEY
  };
})();
