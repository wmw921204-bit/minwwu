/* Live mode: the original app, fed by Home Assistant through server.py.
   Real: robot status, battery, errors, area and time, the map, robot position and path, no-go areas,
   obstacles, and start / pause / return / spot-retry commands with state confirmation.
   Study layer: the four supervision events and the automation levels still run as in the demo,
   placed where the real robot is, and labelled as study scenarios on screen.
   Open with ?demo=1 (or from the file system) for the original fully simulated demo. */
(()=>{
  const LIVE_ON=location.protocol!=='file:'&&!new URLSearchParams(location.search).has('demo');
  window.HA_LIVE=LIVE_ON;
  if(!LIVE_ON)return;

  const STORE='robot-live-v1';
  const SPOT_CELLS=2;          // a study event's spot, and a retry zone, is 2 x 2 cells (1 x 1 m)
  const CELL_MM=500;           // map grid, the same 0.5 m cells as the demo map
  const FIRE_AFTER=[90,180,270,360]; // seconds into a real cleaning when study events appear
  const HA={snap:null,dev:null,map:null,tf:null,ppm:null,foot:null,error:'',pending:null,expectStart:null,
    retryQueue:[],spotEv:null,spotStarted:false,spotError:false,notes:{},refArea:null,prevStatus:null,
    fetching:false,lastMap:0,editing:false,sig:'',prompted:false};
  window.HA=HA;
  const M=()=>window.HAModel;
  const now=()=>{const d=new Date();return d.getHours()*3600+d.getMinutes()*60+d.getSeconds()};
  const secOf=iso=>{const d=iso?new Date(iso):null;return d&&!isNaN(d)?d.getHours()*3600+d.getMinutes()*60+d.getSeconds():now()};
  const read=()=>{try{return JSON.parse(localStorage.getItem(STORE))||{}}catch(e){return {}}};
  function dayLabel(ms){
    if(!ms)return 'Earlier';const d=new Date(ms),t=new Date();
    const days=Math.round((new Date(t.toDateString())-new Date(d.toDateString()))/864e5);
    return days===0?'Earlier today':days===1?'Yesterday':days<7?d.toLocaleDateString(undefined,{weekday:'long'}):d.toLocaleDateString();
  }
  /* Rewrites the demo's fictional rooms out of event texts written by fire(). */
  const placeless=s=>String(s).replace(/ under the bed/g,' into this spot').replace(/ in the hallway/g,'').replace(/ near the sofa/g,'').replace(/ by the stove/g,' on this spot');

  /* ---------- persistence ---------- */
  let saveT=null;
  function persist(){
    clearTimeout(saveT);saveT=setTimeout(()=>{
      const zones=Object.fromEntries(Object.entries(ZONES).filter(([k])=>k.startsWith('z')));
      try{localStorage.setItem(STORE,JSON.stringify({v:1,onboarded:!S.onboarding,autonomy:S.autonomy,rules:S.rules,nogo:S.nogo,notif:S.notif,
        schedules:S.schedules,history:S.history,task:S.task,events:S.events,timeline:S.timeline,pending:S.sim.pending,zones,seq,
        notes:HA.notes,refArea:HA.refArea,scenario:S.ctl.scenario,retryQueue:HA.retryQueue,spotEv:HA.spotEv,spotStarted:HA.spotStarted,
        prevStatus:HA.prevStatus,customObj:Object.fromEntries(Object.entries(OBJ).filter(([,o])=>o.custom))}))}catch(e){/* storage full or blocked: the app still works */}
    },400);
  }
  function restore(){
    const s=read();
    S.onboarding=s.onboarded?null:'intro';
    if(s.autonomy)S.autonomy=s.autonomy;
    S.rules=s.rules||[];S.nogo=s.nogo||[];if(s.notif)S.notif=s.notif;if(s.schedules)S.schedules=s.schedules;
    Object.assign(ZONES,s.zones||{});Object.assign(OBJ,s.customObj||{});
    S.history=(s.history||[]).map(h=>({...h,day:dayLabel(h.endedAt||h.startedAt)}));
    S.task=s.task||null;if(S.task&&S.task.startedAt&&new Date(S.task.startedAt).toDateString()!==new Date().toDateString())S.task.day=dayLabel(S.task.startedAt);
    S.events=s.events||[];S.timeline=s.timeline||[];S.objects=[];
    S.sim.pending=s.pending||[];S.sim.queue=[];
    seq=Math.max(seq,s.seq||0);
    HA.notes=s.notes||{};HA.refArea=s.refArea||null;HA.retryQueue=s.retryQueue||[];HA.spotEv=s.spotEv||null;HA.spotStarted=!!s.spotStarted;HA.prevStatus=s.prevStatus||null;
    SCEN.none={label:'No study events',keys:[]};
    S.ctl.scenario=s.scenario&&SCEN[s.scenario]?s.scenario:'all';
    S.clock=now();S.conn='connecting';S.device={status:'docked',battery:null,error:null};
    S.snap={clock:S.clock,device:{...S.device},pos:null,pct:0};
  }

  /* ---------- bridge ---------- */
  async function api(path,body){
    const r=await fetch('/api/'+path,{signal:AbortSignal.timeout(15000),cache:'no-store',
      ...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    let v={};try{v=await r.json()}catch(e){}
    if(!r.ok)throw new Error(v.error||'Home Assistant request failed ('+r.status+')');
    return v;
  }
  async function loadMap(){
    HA.lastMap=Date.now();
    try{
      const r=await fetch('/api/map',{signal:AbortSignal.timeout(15000),cache:'no-store'});
      if(!r.ok)return;
      const bmp=await createImageBitmap(await r.blob());
      const cv=document.createElement('canvas');cv.width=bmp.width;cv.height=bmp.height;
      const g=cv.getContext('2d');g.drawImage(bmp,0,0);
      HA.foot=M().footprint(g.getImageData(0,0,bmp.width,bmp.height).data,bmp.width,bmp.height,6)||HA.foot;
      HA.sig='';commitIfChanged();
    }catch(e){/* status stays useful without the map image */}
  }

  /* ---------- commands: sent for real, confirmed by the robot's next state ---------- */
  async function liveCommand(action,opts,fn){
    if(S.conn!=='connected'){flash('You’re offline. Reconnect to send commands.');return false}
    if(HA.pending||(S.cmd&&S.cmd.state==='sending')){flash('Still waiting for the robot to answer.');return false}
    const fail=()=>{S.cmd={label:opts.label,state:'failed',retry:opts.retry||(()=>liveCommand(action,opts,fn))};opts.onFail&&opts.onFail();commit()};
    S.cmd={label:opts.label,state:'sending'};commit();
    try{await api('command',{action,...(opts.body||{})})}catch(e){HA.error=e.message;fail();return false}
    HA.pending={expect:opts.expect,at:Date.now(),done:opts.done,fn,fail};
    refresh();return true;
  }
  function checkPending(){
    const p=HA.pending;if(!p)return;
    if(p.expect.includes(S.device.status)){
      HA.pending=null;p.fn&&p.fn();S.cmd={label:p.done,state:'confirmed'};
      setTimeout(()=>{if(S.cmd&&S.cmd.state==='confirmed'){S.cmd=null;commit()}},1700);
    }else if(Date.now()-p.at>30000){HA.pending=null;p.fail()}
  }

  /* ---------- tasks follow the real robot ---------- */
  function startLiveTask(){
    if(S.task)archiveTask();
    const fromApp=HA.expectStart&&Date.now()-HA.expectStart.at<90000;
    const label=fromApp?HA.expectStart.label:'Started outside the app';
    HA.expectStart=null;
    S.cells=blankCells('out');S.events=[];S.timeline=[];S.ui.remember={};
    S.sim.pending=(SCEN[S.ctl.scenario]||SCEN.none).keys.slice();S.sim.fired={};S.sim.queue=[];S.waitEv=null;S.checkEv=null;
    S.task={id:'t'+Date.now(),day:'Today',startedAt:Date.now(),start:S.clock,end:null,scopeLabel:label,result:null,done:false,endedEarly:false,real:true};
    tl(fromApp?'you':'robot',fromApp?'You started cleaning: '+label:'Cleaning was started from the Roborock app, a schedule or the robot');
    tl('robot','Cleaning started');
  }
  function finishLiveTask(){
    const t=S.task;
    t.done=true;t.end=S.clock;t.endedAt=Date.now();t.area=HA.dev?.area??null;t.minutes=HA.dev?.minutes??Math.round((t.endedAt-t.startedAt)/60000);
    t.path=M().simplifyPath(HA.map?.path);
    S.sim.pending=[];S.sim.queue=[];S.waitEv=null;S.checkEv=null;
    t.result=computeResult();t.pct=taskPct(t);
    if(t.result==='completed'&&t.area>0&&t.scopeLabel==='Entire home')HA.refArea=Math.max(HA.refArea||0,t.area);
    const nc=S.events.filter(e=>e.status!=='resolved'&&e.status!=='info'&&DEFS[e.key].type!=='decision').length;
    tl('result',t.result==='completed'?'Task completed':t.result==='ended'?'Task ended early':`Task partially completed: ${nc} area${nc===1?'':'s'} not cleaned`);
    if(pendingObjs().length&&S.autonomy!=='fullAuto'){S.ui.notice='objs';clearTimeout(notice.t);notice.t=setTimeout(()=>{S.ui.notice=null;commit()},7000)}
  }
  function finishSpot(){
    const ev=findEvent(HA.spotEv);HA.spotEv=null;HA.spotStarted=false;
    if(ev){
      if(HA.spotError){ev.status='needsReview';ev.attempts=(ev.attempts||0)+1;ev.retryFailed=true;evLog(ev,'robot','Retry didn’t work: the robot reported a problem');notice(ev)}
      else{ev.status='resolved';ev.retryFailed=false;ev.outcome=ev.pendingOutcome||'Area cleaned successfully.';evLog(ev,'result',ev.outcome.replace(/\.$/,''))}
    }
    HA.spotError=false;if(S.task)S.task.spot=false;
    if(S.task&&S.task.done){S.task.result=computeResult();S.task.pct=taskPct(S.task)}
  }
  function lifecycle(status){
    const prev=HA.prevStatus;HA.prevStatus=status;
    if(HA.spotEv){
      if(status==='cleaning')HA.spotStarted=true;
      if(status==='error')HA.spotError=true;
      if(HA.spotStarted&&status==='docked')finishSpot();
      return;
    }
    if(status==='cleaning'&&(!S.task||S.task.done))startLiveTask();
    else if(S.task&&!S.task.done&&status==='docked')finishLiveTask();
    if(status==='error'&&prev!=='error'&&S.task&&!S.task.done){
      tl('robot','Stuck: '+(S.device.error||'needs help'));S.ui.notice='stuck';clearTimeout(notice.t);
    }
  }

  /* ---------- study events at the real robot's position ---------- */
  function fireStudy(key){
    const pos=HA.map?.robot;
    const zid='z'+(++seq);
    ZONES[zid]={name:'Spot at '+hhmm(S.clock),room:'live',cells:[],keys:[],mm:pos?{x:pos.x,y:pos.y}:null};
    DEFS[key].zone=zid;
    const waitBefore=S.waitEv,n=S.timeline.length;
    fire(key);
    const ev=S.events.find(e=>e.key===key&&!e.zone);
    S.timeline.slice(n).forEach(r=>r.x=placeless(r.x));
    if(!ev)return;
    ev.zone=zid;ev.study=true;ev.log.forEach(r=>r.x=placeless(r.x));
    if(S.waitEv===ev.id&&waitBefore!==ev.id){
      S.device.status='cleaning'; // stays true until the real robot confirms the pause
      liveCommand('pause',{label:'Stop and wait',done:'Robot stopped and is waiting for you',expect:['paused','idle'],
        onFail:()=>evLog(ev,'robot','The stop request didn’t reach the robot')},()=>{S.device.status='paused'});
    }
  }
  function fireDue(){
    const t=S.task;
    if(!t||t.done||HA.spotEv||S.conn!=='connected'||S.device.status!=='cleaning'||!S.sim.pending.length||HA.pending)return;
    const n=Object.keys(S.sim.fired).length;
    const due=n<FIRE_AFTER.length?FIRE_AFTER[n]:FIRE_AFTER[FIRE_AFTER.length-1]+90*(n-FIRE_AFTER.length+1);
    if(Date.now()-t.startedAt>=due*1000){fireStudy(S.sim.pending[0]);commit()}
  }
  function sendSpot(ev){
    const z=ZONES[ev.zone];
    HA.spotEv=ev.id;HA.spotStarted=false;HA.spotError=false;ev.status='inProgress';ev.queued=false;
    liveCommand('zone',{label:'Retry '+z.name.toLowerCase(),done:'Robot is going back to the spot',expect:['cleaning'],
      body:{box:spotCells(z.mm).box},retry:()=>sendSpot(ev),
      onFail:()=>{HA.spotEv=null;ev.status='needsReview';ev.retryFailed=true;evLog(ev,'robot','The retry didn’t reach the robot')}},
      ()=>{HA.spotStarted=true;if(S.task)S.task.spot=true;tl('robot','Spot clean started: '+z.name,ev.id)});
  }
  function processRetries(){
    if(HA.pending||HA.spotEv||S.conn!=='connected'||!HA.retryQueue.length)return;
    if(S.device.status!=='docked'||(S.task&&!S.task.done))return;
    const ev=findEvent(HA.retryQueue.shift());
    if(ev&&ev.status==='inProgress'&&ZONES[ev.zone]?.mm)sendSpot(ev);
  }

  /* ---------- Home Assistant snapshot → app state ---------- */
  function goOffline(msg){
    HA.error=msg;
    if(S.conn==='connected'||S.conn==='connecting')S.snap={clock:S.clock,device:{...S.device},pos:null,pct:pct()};
    S.conn='disconnected';
  }
  function apply(snap){
    HA.snap=snap;
    const d=M().device(snap);
    if(!d){goOffline(snap.vacuum?'The robot is offline in Home Assistant.':snap.vacuums.length>1?'Several robots found. Set "vacuum" in .ha-local.json.':'No robot vacuum found in Home Assistant.');return}
    HA.dev=d;S.conn='connected';S.snap=null;S.clock=now();
    let status=d.status;
    if(status==='idle'&&S.task&&!S.task.done)status='paused';
    S.device={status,battery:d.battery,error:d.error};
    HA.map=M().selectedMap(snap);HA.tf=HA.map?M().transform(HA.map.calibration):null;HA.ppm=HA.map?M().pxPerMm(HA.map.calibration):null;
    if(!HA.refArea&&status==='docked'&&d.area>0)HA.refArea=d.area;
    seedRobotRecord(snap,status);
    lifecycle(status);
    S.objects=M().objects(snap.vacuum.entity_id,HA.map,HA.notes).map(o=>({...o,at:secOf(o.source)}));
  }
  /* The robot's own record of its last cleaning, shown once so Activity starts with real history. */
  function seedRobotRecord(snap,status){
    const begin=M().value(snap,'last_clean_begin'),end=M().value(snap,'last_clean_end');
    const b=Date.parse(begin),e=Date.parse(end);
    if(S.task||S.history.length||status!=='docked'||!(e>b))return;
    const id='ha'+b,area=HA.dev.area,minutes=HA.dev.minutes??(e-b)/60000;
    const mapAfter=Date.parse(HA.map?.source_updated_at)>=e;
    S.history.push({id,day:dayLabel(e),startedAt:b,endedAt:e,start:secOf(begin),end:secOf(end),scopeLabel:'Recorded by the robot',result:'recorded',real:true,
      snap:{cells:{__task:id},cleanedM2:area??'—',rooms:'—',pct:HA.refArea&&area!=null?Math.min(100,Math.round(area/HA.refArea*100)):null,minutes,
        path:mapAfter?M().simplifyPath(HA.map?.path):[],events:[],
        timeline:[{t:secOf(begin),a:'robot',x:'Cleaning started'},{t:secOf(end),a:'result',x:'Cleaning finished. Recorded by the robot while this app wasn’t open, so there are no decisions to show.'}]}});
  }
  function signature(){
    const p=HA.map?.robot;
    return JSON.stringify([S.conn,S.device,HA.dev?.area,HA.dev?.minutes,HA.dev?.room,p&&[p.x,p.y,p.angle],HA.map?.path?.[0]?.length,HA.map?.source_updated_at,
      S.objects.map(o=>o.status+o.label),S.task&&[S.task.id,S.task.done,S.task.result],S.events.map(e=>e.status),S.cmd&&S.cmd.state,S.ui.notice,!!HA.foot,HA.error]);
  }
  function commitIfChanged(){
    if(HA.editing||S.ui.modal)return;
    const s=signature();if(s!==HA.sig){HA.sig=s;commit()}
  }
  async function refresh(){
    if(HA.fetching)return;HA.fetching=true;
    try{
      const snap=await api('state');HA.error='';apply(snap);
      if(!snap.reader)HA.error='Install the roborock_obstacles reader in Home Assistant to see the map, objects and robot position.';
      checkPending();processRetries();
      if(!HA.foot||Date.now()-HA.lastMap>(S.task&&!S.task.done?20000:60000))loadMap();
    }catch(e){
      goOffline(e.message);
      if(/token/i.test(e.message)&&!HA.prompted&&!S.onboarding){HA.prompted=true;A.haConnect()}
    }finally{HA.fetching=false;persist();commitIfChanged()}
  }

  /* ---------- derived values ---------- */
  function taskPct(t){
    const area=t&&!t.done?HA.dev?.area:t?.area;
    return HA.refArea&&area!=null?Math.min(100,Math.round(area/HA.refArea*100)):null;
  }
  const area=()=>{const a=S.task&&S.task.done?S.task.area:HA.dev?.area;return a==null?'—':Math.round(a*10)/10};
  function statusText(){
    if(S.conn!=='connected')return 'Status can’t be confirmed right now';
    const d=dev(),room=HA.dev?.room;
    if(d.status==='cleaning'){
      if(HA.spotEv){const ev=findEvent(HA.spotEv);return 'Going back to '+(ZONES[ev?.zone]?.name||'the spot').toLowerCase()}
      return room?'Cleaning '+room:'Cleaning';
    }
    if(d.status==='returning')return 'Returning to the dock';
    if(d.status==='paused')return S.waitEv?'Waiting for your choice':'Paused';
    if(d.status==='error')return 'Robot needs help';
    if(d.status==='idle')return 'Stopped, off the dock';
    return HA.dev?.charging?'Docked and charging':'Docked and ready';
  }

  /* ---------- map: the real map, drawn in the original layer order ---------- */
  function mapView(){
    const f=HA.foot,pad=24;
    return M().view({x0:f.bbox.x0-pad,y0:f.bbox.y0-pad,x1:f.bbox.x1+pad,y1:f.bbox.y1+pad});
  }
  /* Grid cells (i,j) of CELL_MM the robot's path passed through. */
  let cellCache={key:'',cells:new Set()};
  function pathCells(path){
    const key=path.length+':'+path.map(s=>s.length).join(',')+':'+(path[0]?.[0]||'');
    if(cellCache.key===key)return cellCache.cells;
    const out=new Set();
    for(const seg of path)for(let i=1;i<seg.length;i++){
      const [x0,y0]=seg[i-1],[x1,y1]=seg[i],n=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)/100));
      for(let t=0;t<=n;t++)out.add(Math.floor((x0+(x1-x0)*t/n)/CELL_MM)+','+Math.floor((y0+(y1-y0)*t/n)/CELL_MM));
    }
    cellCache={key,cells:out};return out;
  }
  /* The 2 x 2 block of cells nearest a point, so spots line up with the grid. */
  function spotCells(mm){
    const i0=Math.round(mm.x/CELL_MM)-SPOT_CELLS/2,j0=Math.round(mm.y/CELL_MM)-SPOT_CELLS/2,keys=[];
    for(let i=i0;i<i0+SPOT_CELLS;i++)for(let j=j0;j<j0+SPOT_CELLS;j++)keys.push(i+','+j);
    return {keys,box:[i0*CELL_MM,j0*CELL_MM,(i0+SPOT_CELLS)*CELL_MM,(j0+SPOT_CELLS)*CELL_MM]};
  }
  function liveMap(o={}){
    if(!HA.foot||!HA.tf)return `<div class="calm">${ic('map',20)}<span>${esc(HA.error||'Waiting for the robot’s map from Home Assistant…')}</span></div>`;
    const v=mapView();
    const P=mm=>{const p=mm&&HA.tf(mm);return p?{x:v.x(p),y:v.y(p)}:null};
    const rect=(x0,y0,x1,y1)=>{const a=P({x:x0,y:y0}),b=P({x:x1,y:y1});return a&&b?{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)}:null};
    const spot=mm=>{const b=spotCells(mm).box;return rect(b[0],b[1],b[2],b[3])};
    const hist=o.cells&&o.cells.__task?S.history.find(h=>h.id===o.cells.__task):null;
    const showLive=!o.cells;
    const tilted=S.ui.map3d&&!o.mini&&showLive&&o.robot!==false&&cur().name==='map';
    let s=`<svg class="map ${o.dim?'dim':''} ${tilted?'tilted':''}" viewBox="-8 -8 ${v.w+16} ${v.h+16}" role="img" aria-label="${esc(o.label||'Robot map of the home')}">`;
    // 1 mapped floor (the robot's own map; no invented rooms or furniture)
    const fx=`translate(${v.x({x:0,y:0})} ${v.y({x:0,y:0})}) scale(${v.s})`;
    s+=`<g filter="url(#soft)"><path class="room ha-floor ${o.sel?(o.sel.length?'sel':'dull'):''}" transform="${fx}" d="${HA.foot.d}"/></g>`;
    const wall=`<path class="ha-wall" transform="${fx}" d="${HA.foot.edge}"/>`;
    // 2 cells, as in the demo: cleaned where the real path passed, event spots take their state
    let path=[];
    if(hist)path=hist.snap.path||[];
    else if(showLive&&S.task)path=!S.task.done||S.task.spot?M().simplifyPath(HA.map?.path):(S.task.path||[]);
    const cells=new Map();
    pathCells(path).forEach(c=>cells.set(c,'cleaned'));
    if(path.length&&!o.noEvents)(o.events||visibleEvents()).forEach(ev=>{
      if(DEFS[ev.key].type==='decision'||!ZONES[ev.zone]?.mm)return;
      const st=['needsReview','deferred','inProgress'].includes(ev.status)?'review':ev.status==='skipped'?'skipped':ev.status==='resolved'?'cleaned':null;
      if(st)spotCells(ZONES[ev.zone].mm).keys.forEach(c=>cells.set(c,st));
    });
    S.nogo.forEach(z=>{if(ZONES[z]?.mm)spotCells(ZONES[z].mm).keys.forEach(c=>cells.set(c,'nogo'))});
    cells.forEach((st,c)=>{const [i,j]=c.split(',').map(Number),r=rect(i*CELL_MM,j*CELL_MM,(i+1)*CELL_MM,(j+1)*CELL_MM);
      if(r)s+=`<rect class="cell ${st}" x="${(r.x+.4).toFixed(1)}" y="${(r.y+.4).toFixed(1)}" width="${(r.w-.8).toFixed(1)}" height="${(r.h-.8).toFixed(1)}" rx="1.5"/>`});
    // 3 no-go zones set on the robot
    (HA.map?.no_go_areas||[]).forEach(a=>{const q=[0,2,4,6].map(i=>P({x:a[i],y:a[i+1]}));if(q.every(Boolean))s+=`<polygon class="cell nogo" points="${q.map(p=>p.x+','+p.y).join(' ')}"><title>No-go zone set on the robot</title></polygon>`});
    s+=wall;
    // 4 study events: spot outline and status marker, as in the demo
    if(!o.noEvents)(o.events||visibleEvents()).forEach(ev=>{
      const d=DEFS[ev.key];if(d.type==='decision')return;
      const r=ZONES[ev.zone]?.mm&&spot(ZONES[ev.zone].mm);if(!r)return;
      const tap=o.mini||ev.archived?'':`data-a="openEvent" data-v="${ev.id}"`;
      s+=`<rect class="zone ${ev.status} ${o.highlight===ev.id?'hl':''}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" ${tap}><title>${esc(d.title)}</title></rect>`;
      if(!o.mini){
        const col=ev.status==='resolved'?'var(--ok)':ev.status==='skipped'?'var(--skip)':ev.status==='inProgress'?'var(--primary)':'var(--warn-line)';
        const glyph=ev.status==='resolved'?'<path d="M-3.5 0l2.3 2.3L3.8-2.8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>':ev.status==='skipped'?'<path d="M-3.5 0h7" stroke="#fff" stroke-width="2" stroke-linecap="round"/>':'<path d="M0-4v4.5M0 3.3v.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/>';
        s+=`<g class="marker" ${tap} transform="translate(${r.x+r.w},${r.y})"><circle r="9.5" fill="${col}" stroke="var(--surface)" stroke-width="2.5" filter="url(#soft)"/>${glyph}</g>`;
      }
    });
    // 5 objects from the robot's map, one id shared by marker, list and review sheet
    if(!o.noEvents&&showLive)S.objects.forEach(ob=>{
      const p=P(ob.mm);if(!p)return;const sz=o.mini?8:10.5;
      const ring=ob.status==='pending'?'stroke="var(--warn-line)" stroke-width="2" stroke-dasharray="3 2"':ob.status==='auto'?'stroke="var(--primary)" stroke-width="1.6"':'stroke="var(--ok)" stroke-width="1.8"';
      const badge=o.mini?'':ob.status==='pending'?`<circle cx="8" cy="-8" r="5.5" fill="var(--warn-line)"/><text x="8" y="-5.3" text-anchor="middle" font-size="8" font-weight="800" fill="#fff" font-family="Manrope">?</text>`:(ob.status==='confirmed'||ob.status==='corrected')?`<circle cx="8" cy="-8" r="5" fill="var(--ok)"/><path d="M5.6-8l1.7 1.7 3-3.2" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>`:'';
      s+=`<g class="obj" ${o.mini?'':`data-a="openObj" data-v="${esc(ob.id)}"`} transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})"><circle r="${sz}" fill="var(--surface)" ${ring} filter="url(#soft)"/><text y="${o.mini?3:4}" text-anchor="middle" font-size="${o.mini?9:12}">${OBJ[ob.label].e}</text>${badge}<title>${esc(OBJ[ob.label].n)}</title></g>`;
    });
    // 6 dock, path line and robot
    const dock=P(HA.map?.charger);
    if(dock)s+=`<g transform="translate(${dock.x},${dock.y})"><rect x="2" y="-10" width="9" height="20" rx="3" fill="var(--surface)" filter="url(#soft)"/><path d="M7.5-4 5 1h3l-1.5 4" stroke="var(--ok)" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    const rb=HA.map?.robot,rp=P(rb);
    if(o.robot!==false&&showLive&&rp){
      const heading=Number.isFinite(rb.angle)?90-rb.angle:0;
      s+=`<g class="robot" style="transform:translate(${rp.x.toFixed(1)}px,${rp.y.toFixed(1)}px) rotate(${heading}deg)"><circle class="body" r="9"/><circle r="4" fill="none" stroke="#C3CAD9" stroke-width="1.2"/><circle class="eye" r="1.8" cy="-5.6"/></g>`;
    }
    return s+'</svg>';
  }
  function liveLegend(){
    const when=HA.map?.source_updated_at?' · updated '+hhmm(secOf(HA.map.source_updated_at)):'';
    return `<div class="legend"><span><i style="background:var(--surface);box-shadow:inset 0 0 0 1.5px var(--primary);border-radius:50%"></i>Robot’s label</span><span><i style="background:var(--surface);box-shadow:inset 0 0 0 1.5px var(--warn-line);border-radius:50%"></i>Not sure</span><span><i style="background:var(--clean)"></i>Cleaned</span><span><i style="background:repeating-linear-gradient(45deg,var(--warn-line) 0 2px,var(--warn-soft) 2px 5px)"></i>Needs review</span><span><i style="background:repeating-linear-gradient(45deg,var(--skip) 0 1.5px,var(--skip-soft) 1.5px 5px)"></i>Skipped</span><span><i style="background:repeating-linear-gradient(-45deg,var(--stop) 0 2px,var(--stop-soft) 2px 5px)"></i>No-go</span><span><i style="background:var(--warn-line);border-radius:50%"></i>Study event</span></div><p class="small muted" style="margin:4px 6px 0">Robot map from Home Assistant${when}.</p>`;
  }

  /* ---------- patch the original app ---------- */
  function wrap(name,after){const orig=window[name];window[name]=function(...a){return after(orig.apply(this,a),...a)}}
  function patch(){
    RESULTLABEL.recorded='Robot record';
    ROOM.live={id:'live',name:'Robot map',the:'your home'};CELLROOM.live='live';
    Object.assign(OBJ,{unknown:{n:'Unknown object',e:'❔'},waste:{n:'Pet waste',e:'💩'},scale:{n:'Scale',e:'⚖️'}});
    // Event texts without the demo's fictional rooms
    Object.assign(DEFS.cable,{title:'Possible cable on the floor',chip:'Skipped a spot: possible cable',what:'The robot saw something thin on the floor and stopped short of it.',next:'It skipped this spot and is cleaning the rest of the home.'});
    DEFS.cable.remember.avoid={text:'Avoid possible cables',scope:'Everywhere on this map. Other kinds of events still ask.'};
    Object.assign(DEFS.rug,{chip:'Left a patch for now',what:'The robot found a surface it hasn’t mapped before.'});
    Object.assign(DEFS.bed,{title:'Couldn’t get into a tight spot',chip:'Gave up on a tight spot',what:'The robot tried to reach this area 3 times.',why:'Something keeps blocking the way in. It may be a low object on the floor, or the gap may be too tight.',next:'It stopped trying and is finishing the rest of the home.'});
    Object.assign(DEFS.extra,{title:'Extra pass on a dirty spot',chip:'Extra pass on a dirty spot',what:'The robot is going over a dirty spot a second time.'});
    DEFS.extra.remember.skipOnce={text:'Skip extra passes',scope:'Everywhere. The robot still does one normal pass.'};
    SHORT.cable.q='Cable on the floor?';SHORT.bed.q='Can’t get into this spot';SHORT.extra.q='Extra pass on a dirty spot';

    // Simulation off: the real robot moves, the map is real
    window.stepClean=()=>{};window.stepReturn=()=>{};window.maybeFault=()=>{};window.renderPanel=()=>{};
    window.curRoom=()=>({name:HA.dev?.room||'Robot map',the:HA.dev?.room||'your home'});
    window.statusLine=statusText;
    window.mapSVG=liveMap;window.legend=liveLegend;
    window.visibleObjs=()=>S.objects||[];
    window.updateLive=()=>document.querySelectorAll('[data-live]').forEach(el=>{const n=el.dataset.live;if(n==='bar')el.style.width=LIVE.bar();else el.textContent=LIVE[n]()});
    window.pct=cells=>{const v=cells&&cells.__task?S.history.find(h=>h.id===cells.__task)?.snap.pct:taskPct(S.task);return v??0};
    window.computeResult=()=>S.task.endedEarly?'ended':S.events.some(e=>DEFS[e.key].type!=='decision'&&['needsReview','deferred','skipped','inProgress'].includes(e.status))?'partial':'completed';
    window.archiveTask=()=>{
      const t=S.task;
      S.history.unshift({id:t.id,day:dayLabel(t.endedAt||t.startedAt),startedAt:t.startedAt,endedAt:t.endedAt,start:t.start,end:t.end??S.clock,scopeLabel:t.scopeLabel,result:t.result||computeResult(),real:true,
        snap:{cells:{__task:t.id},cleanedM2:t.area??'—',rooms:'—',pct:t.pct??taskPct(t),minutes:t.minutes,path:t.path||[],
          events:S.events.map(e=>({...e,log:[...e.log],archived:true})),timeline:[...S.timeline]}});
      S.history=S.history.slice(0,30);
    };
    window.reportData=id=>{
      const f=taskById(id);if(!f)return null;const t=f.t;
      if(!f.live)return {t,cells:{__task:t.id},events:t.snap.events,timeline:t.snap.timeline,m2:t.snap.cleanedM2==null?'—':Math.round(t.snap.cleanedM2*10)/10,rooms:'—',result:t.result,dur:t.snap.minutes!=null?Math.round(t.snap.minutes):mins(t.end-t.start),live:false};
      const minsNow=t.done?t.minutes:(HA.dev?.minutes??(Date.now()-t.startedAt)/60000);
      return {t,cells:S.cells,events:S.events,timeline:S.timeline,m2:area(),rooms:'—',result:t.done?t.result:null,dur:Math.round(minsNow??0),live:true};
    };
    Object.assign(LIVE,{
      clock:()=>hhmm(now()),status:statusText,
      pct:()=>{const p=taskPct(S.task);return p==null?area()+' m² cleaned':'≈'+p+'% of a full clean'},
      bar:()=>(taskPct(S.task)??0)+'%',
      barText:()=>area()==='—'?'—':area()+' m²',
      elapsed:()=>{const t=S.task;if(!t)return '';const m=t.done?t.minutes:(HA.dev?.minutes??(Date.now()-t.startedAt)/60000);return Math.round(m||0)+' min elapsed'},
      remain:()=>{const p=taskPct(S.task),m=HA.dev?.minutes;return p&&m&&p<100?'about '+Math.max(1,Math.round(m*(100-p)/p))+' min left (est.)':'time left unknown'},
      battery:()=>{const b=dev().battery;return b==null?'—':b+'%'},
    });

    // Study events take the zone of the event being drawn
    const zoneOf=ev=>{if(ev&&ev.zone&&DEFS[ev.key])DEFS[ev.key].zone=ev.zone};
    const render0=window.render;window.render=function(){S.events.forEach(zoneOf);return render0.apply(this,arguments)};
    const evItem0=window.evItem;window.evItem=ev=>{zoneOf(ev);return evItem0(ev)};
    const scrEvent0=window.scrEvent;
    window.scrEvent=id=>{
      const ev=findEvent(id);zoneOf(ev);let h=scrEvent0(id);if(!ev||!ev.study)return h;
      h=h.replace('<div class="h-screen"',`<div class="mode-note" style="margin-top:12px">${ic('bulb',18)}<span><b>Study scenario.</b> Simulated for this study at the robot’s real position. Not reported by the robot.</span></div><div class="h-screen"`);
      if(ev.queued)h=h.replace('The robot is heading there now.','The robot goes back to this spot when the current cleaning ends.');
      if(h.includes('class="choices"'))h=h.replace('<details class="why">','<p class="small muted" style="margin:12px 4px 0">Retry and pause move the real robot. Other choices are recorded in this app.</p><details class="why">');
      return h;
    };
    window.startRetry=(ev,outcomeText)=>{
      ev.pendingOutcome=outcomeText||null;ev.retryTries=(ev.retryTries||0)+1;
      const z=ZONES[ev.zone];
      if(!z||!z.mm){ev.status='needsReview';evLog(ev,'robot','This spot has no map position, so the robot can’t be sent there');return}
      ev.status='inProgress';ev.queued=!!(S.task&&!S.task.done);
      if(!HA.retryQueue.includes(ev.id))HA.retryQueue.push(ev.id);
      if(ev.queued)tl('robot','Will go back to '+z.name.toLowerCase()+' after this cleaning',ev.id);
    };
    window.doAction=(ev,act,saveRule)=>{
      if(!ev.archived){S.ui.stack=[];S.ui.tab='map';S.ui.scrollTop=0;forceTop=true}
      const run=()=>{applyAction(ev,act,false);if(saveRule){const r=DEFS[ev.key].remember[act];S.rules.push({id:'r'+(++seq),key:ev.key,act,text:r.text,scope:r.scope})}};
      if(act==='pauseCheck')return liveCommand('pause',{label:'Pause',done:'Paused',expect:['paused','idle']},run);
      if(S.waitEv===ev.id&&dev().status==='paused')return liveCommand('start',{label:'Continue cleaning',done:'Cleaning continues',expect:['cleaning']},run);
      run();commit();processRetries();
    };

    // Objects: the robot's labels, corrections kept in this app
    window.objStatus=o=>o.status==='pending'?'Robot couldn’t tell what it is':o.status==='auto'?'Robot’s label':o.status==='corrected'?`You corrected it (robot said ${OBJ[o.orig].n.toLowerCase()})`:'You confirmed it';
    wrap('objItem',(h,o)=>o.label==='unknown'?h.replace('Maybe unknown object?','Unknown object'):h);
    wrap('objModal',(m,id)=>{
      if(!m)return m;const o=S.objects.find(x=>x.id===id);
      m.body=m.body.replace('Robot is sure','Robot’s label');
      if(o&&o.label==='unknown'){
        m.title='What is this?';
        m.body=m.body.replace(/<button class="obj-opt[^"]*" data-a="objPick" data-v="unknown">.*?<\/button>/,'');
        if(!S.ui.objSel)m.buttons[0]={...m.buttons[0],label:m.buttons[0].label.replace('Yes, unknown object','Pick what it is first')};
      }
      return m;
    });
    const objSave0=A.objSave,objNone0=A.objNone;
    A.objSave=()=>{const id=S.ui.objId,o0=S.objects.find(x=>x.id===id);if(o0&&o0.label==='unknown'&&(!S.ui.objSel||S.ui.objSel==='unknown'))return;objSave0();const o=S.objects.find(x=>x.id===id);if(o&&o.status!=='auto'&&o.status!=='pending')HA.notes[id]={label:o.label,name:OBJ[o.label].n};persist()};
    A.objNone=()=>{HA.notes[S.ui.objId]={dismissed:true};objNone0();persist()};

    // Screens
    wrap('statusCard',h=>{
      if(dev().status!=='idle'||S.conn!=='connected')return h;
      return h.replace('></span>undefined<','></span>Stopped<').replace('On the dock and ready for the next cleaning.','Off the dock and not cleaning.')
        .replace('<button class="btn primary block" data-a="setup">Start cleaning</button>','<button class="btn primary" data-a="setup">Start cleaning</button><button class="btn plain" data-a="haDock">Send to dock</button>');
    });
    const scrSetup0=window.scrSetup;
    window.scrSetup=()=>{
      S.ui.setup.kind='home';
      return scrSetup0().replace(/data-a="setupKind" data-v="(rooms|zone)"/g,'data-a="setupKind" data-v="$1" disabled')
        .replace('</b>.',`</b>.</p><p class="small muted" style="margin-top:6px">Rooms and saved zones need room data in the robot’s map, which Home Assistant doesn’t provide yet.`);
    };
    wrap('scrMap',h=>h.replace(/(<div class="sec-h">Objects found<small>\d+<\/small><\/div>)/,'$1<p class="small muted" style="margin:-4px 4px 10px">From the robot’s saved map. Labels you fix are kept in this app.</p>'));
    wrap('scrReport',h=>h.replace('<span>Of the plan</span>','<span>Of a full clean (est.)</span>'));
    wrap('scrRules',h=>h.replace(/\. Every cleaning\.<\/span>/g,'. Saved in this app; set robot no-go zones in the Roborock app.</span>'));
    wrap('scrActivity',h=>S.task||S.history.length?h:h+`<div class="calm">${ic('robot',20)}<span>No cleanings recorded yet. Cleanings appear here once the robot runs with this app open.</span></div>`);
    wrap('scrSettings',h=>{
      const map=HA.map?.source_updated_at?'Updated '+hhmm(secOf(HA.map.source_updated_at)):'—';
      const running=S.task&&!S.task.done;
      return h+`<div class="sec-h">Home Assistant</div><div class="group">
        <button class="row" data-a="haConnect">Connection<span class="v">${S.conn==='connected'?'Connected':'Not connected'}</span>${ic('chev',18)}</button>
        <div class="row">Robot map<span class="v">${map}</span></div></div>
        <div class="sec-h">Study scenario</div><p class="small muted" style="margin:-4px 4px 8px">Simulated events shown during real cleanings, at the robot’s position. For facilitators.</p>
        <div class="group">${Object.entries(SCEN).map(([k,x])=>`<button class="row" data-a="haScenario" data-v="${k}">${esc(x.label)}<span class="v">${S.ctl.scenario===k?ic('check',18):''}</span></button>`).join('')}</div>
        <button class="btn soft block" style="margin-top:12px" data-a="haFire" ${running&&S.sim.pending.length&&dev().status==='cleaning'?'':'disabled'}>Show next study event now${running?` (${S.sim.pending.length} left)`:''}</button>`;
    });

    // Robot commands
    A.startTask=()=>{
      HA.expectStart={label:'Entire home',at:Date.now()};
      liveCommand('start',{label:'Start cleaning',done:'Cleaning started',expect:['cleaning'],onFail:()=>{HA.expectStart=null}},
        ()=>{S.ui.stack=[];S.ui.tab='map';forceTop=true});
    };
    A.pause=()=>liveCommand('pause',{label:'Pause',done:'Paused',expect:['paused','idle']},()=>tl('you','You paused cleaning'));
    A.resume=()=>liveCommand('start',{label:'Resume',done:'Cleaning resumed',expect:['cleaning']},()=>{S.checkEv=null;S.waitEv=null;tl('you','You resumed cleaning')});
    A.endReturn=()=>{S.ui.modal={title:'End cleaning and return?',body:'<p>The robot stops and goes back to its dock. Places it hasn’t reached yet stay uncleaned this time.</p>',buttons:[{label:'End and return to dock',a:'confirmEnd',cls:'danger'},{label:'Keep cleaning',a:'closeModal'}]};commit()};
    A.confirmEnd=()=>{S.ui.modal=null;liveCommand('return_to_base',{label:'End and return',done:'Returning to dock',expect:['returning','docked']},()=>{if(S.task&&!S.task.done){S.task.endedEarly=true;tl('you','You ended cleaning early')}S.sim.pending=[]})};
    A.haDock=()=>liveCommand('return_to_base',{label:'Send to dock',done:'Returning to dock',expect:['returning','docked']});
    A.reconnect=()=>{S.conn='connecting';commit();refresh()};
    A.cmdRefresh=()=>{S.cmd=null;HA.sig='';refresh()};
    A.haScenario=v=>{if(SCEN[v]){S.ctl.scenario=v;if(S.task&&!S.task.done&&!Object.keys(S.sim.fired).length)S.sim.pending=SCEN[v].keys.slice();persist();commit()}};
    A.haFire=()=>{if(S.task&&!S.task.done&&S.sim.pending.length){fireStudy(S.sim.pending[0]);commit()}};
    A.haConnect=()=>{
      HA.editing=true;
      S.ui.modal={title:'Home Assistant connection',body:`<p>${esc(S.conn==='connected'?'Connected to Home Assistant through the local bridge.':HA.error||'Not connected.')}</p><p class="small muted">Create a long-lived access token in Home Assistant (Profile → Security). It is stored by the bridge on this computer and never sent to this page again.</p><label class="field"><span>Access token</span><input id="ha-token" type="password" autocomplete="off" placeholder="Paste a token to connect or replace it"></label>`,
        buttons:[{label:'Save and connect',a:'haSave',cls:'primary'},{label:'Close',a:'closeModal',cls:'plain'}]};
      commit();
    };
    A.haSave=async()=>{
      const token=document.getElementById('ha-token')?.value.trim();if(!token)return;
      try{await api('config',{token,vacuum:HA.snap?.vacuum?.entity_id||''});HA.editing=false;S.ui.modal=null;HA.sig='';refresh()}catch(e){flash(e.message)}
    };
    const close0=A.closeModal;A.closeModal=()=>{HA.editing=false;close0();HA.sig=''};
    const closeBg0=A.closeModalBg;A.closeModalBg=(v,el,e)=>{if(e.target===el)HA.editing=false;closeBg0(v,el,e)};

    const commit0=window.commit;window.commit=function(){persist();return commit0.apply(this,arguments)};
    const st=document.createElement('style');
    st.textContent='.map.tilted{transform:perspective(900px) rotateX(52deg) rotateZ(-32deg) scale(.84) translateY(-10px)}.pill.recorded{background:var(--primary-soft);color:var(--primary)}.map .ha-floor{fill:var(--surface)}.map .ha-floor.sel{fill:var(--primary-soft)}.map .ha-wall{fill:none;stroke:var(--wall);stroke-width:2.2;stroke-linecap:square;vector-effect:non-scaling-stroke;pointer-events:none}.map .ha-swept{fill:none;stroke:var(--clean);stroke-linecap:round;stroke-linejoin:round;pointer-events:none}';
    document.head.appendChild(st);
  }

  window.HA_INIT=()=>{window.THREE=undefined;restore();patch();refresh();setInterval(refresh,4000)};
  window.HA_TICK=()=>{S.clock=now();fireDue();updateLive()};
})();
