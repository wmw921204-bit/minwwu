/* Live mode: the original app, fed by Home Assistant through server.py.
   Real: robot status, battery, errors, area and time, the map, robot position and path, no-go areas,
   obstacles, and start / pause / return / spot-retry commands with state confirmation.
   Study layer: the four supervision events and the automation levels still run as in the demo,
   placed where the real robot is, and labelled as study scenarios on screen.
   Settings switches between this and the original fully simulated demo (also ?demo=1, or opening the file). */
(()=>{
  const params=new URLSearchParams(location.search),served=location.protocol!=='file:';
  let pref=null;try{pref=localStorage.getItem('robot-app-mode')}catch(e){}
  const LIVE_ON=served&&!params.has('demo')&&(params.has('live')||pref!=='demo');
  window.HA_LIVE=LIVE_ON;
  const switchTo=mode=>{try{localStorage.setItem('robot-app-mode',mode)}catch(e){}location.href=location.pathname};
  const modeRows=live=>`<div class="sec-h">Robot data</div><div class="group" style="margin-bottom:14px">
    <button class="row" data-a="haMode" data-v="live">Real robot (Home Assistant)<span class="v">${live?ic('check',18):''}</span></button>
    <button class="row" data-a="haMode" data-v="demo">Simulation<span class="v">${live?'':ic('check',18)}</span></button></div>`;
  if(!LIVE_ON){
    // The demo, served by the bridge, can switch back to the real robot.
    if(served)window.HA_DEMO_INIT=()=>{
      const set0=window.scrSettings;window.scrSettings=()=>set0().replace('</div>','</div>'+modeRows(false));
      A.haMode=v=>{if(v==='live')switchTo('live')};
    };
    return;
  }

  const STORE='robot-live-v1';
  const SPOT_CELLS=2;          // a study event's spot, and a retry zone, is 2 x 2 cells (1 x 1 m)
  const CELL_MM=500;           // map grid, the same 0.5 m cells as the demo map
  const FIRE_AFTER=[90,180,270,360]; // seconds into a real cleaning when study events appear
  const SHORT_RUN_MS=3*60000; // the robot going home on its own sooner than this is a stopped cleaning, not a finished one
  const MIN_REF_AREA=10;      // m²; smaller areas can't stand for a full clean of the home
  const HA={snap:null,dev:null,map:null,tf:null,ppm:null,foot:null,error:'',pending:null,expectStart:null,
    retryQueue:[],spotEv:null,spotStarted:false,spotError:false,notes:{},refArea:null,prevStatus:null,
    fetching:false,lastMap:0,editing:false,sig:'',prompted:false,restoreMode:null,removedZones:[],notified:{},rooms:[],savedZones:[],view:null,objs:[],objSnap:'',align:null,autoPairs:[],livePts:[],lastPairKey:'',retryWhen:'now',recent:[],areaMark:null,returnSince:0,snooze:{},careDay:{},appPauseAt:0,alignDraft:null,poseRaw:null,footKey:'',lastErr:null,lastStatusProblem:null,schedLoaded:false,schedError:''};
  window.HA=HA;
  const M=()=>window.HAModel;
  const DAY0=new Date(2026,0,1);
  const clockOf=d=>Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate())-DAY0)/864e5)*86400+d.getHours()*3600+d.getMinutes()*60+d.getSeconds();
  const now=()=>clockOf(new Date());
  const secOf=iso=>{const d=iso?new Date(iso):null;return d&&!isNaN(d)?clockOf(d):now()};
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
        history:S.history,task:S.task,events:S.events,timeline:S.timeline,pending:S.sim.pending,zones,seq,
        objs:HA.objs,objSnap:HA.objSnap,align:HA.align,autoPairs:HA.autoPairs,retryWhen:HA.retryWhen,temp:S.temp,lastErr:HA.lastErr,lastStatusProblem:HA.lastStatusProblem,refArea:HA.refArea,refFrom:HA.refFrom,rooms:HA.rooms,savedZones:HA.savedZones,scenario:S.ctl.scenario,retryQueue:HA.retryQueue,spotEv:HA.spotEv,spotStarted:HA.spotStarted,
        prevStatus:HA.prevStatus,quietUntil:S.quietUntil,careDay:HA.careDay,restoreMode:HA.restoreMode,removedZones:HA.removedZones,customObj:Object.fromEntries(Object.entries(OBJ).filter(([,o])=>o.custom))}))}catch(e){/* storage full or blocked: the app still works */}
    },400);
  }
  function restore(){
    const s=read();
    S.onboarding=s.onboarded?null:'intro';
    if(s.autonomy)S.autonomy=s.autonomy;
    S.rules=s.rules||[];S.nogo=s.nogo||[];if(s.notif)S.notif={...S.notif,...s.notif}; // new switches keep their defaultS.schedules=[];
    HA.restoreMode=s.restoreMode||null;HA.removedZones=s.removedZones||[];
    Object.assign(ZONES,s.zones||{});Object.assign(OBJ,s.customObj||{});
    S.history=(s.history||[]).map(h=>({...h,day:dayLabel(h.endedAt||h.startedAt)}));
    S.task=s.task||null;if(S.task&&S.task.startedAt&&new Date(S.task.startedAt).toDateString()!==new Date().toDateString())S.task.day=dayLabel(S.task.startedAt);
    S.events=s.events||[];S.timeline=s.timeline||[];S.objects=[];
    S.sim.pending=s.pending||[];S.sim.queue=[];
    seq=Math.max(seq,s.seq||0);
    HA.rooms=s.rooms||[];HA.savedZones=s.savedZones||[];HA.objs=s.objs||[];HA.objSnap=s.objSnap||'';HA.align=s.align&&!(s.align.auto&&s.align.how==='shift'&&!(s.autoPairs||[]).some(p=>p.kind==='drive'))?s.align:null;HA.autoPairs=(s.autoPairs||[]).filter(p=>p.kind==='drive');/* dock readings proved unreliable */HA.retryWhen=s.retryWhen||'now';HA.lastErr=s.lastErr||null;HA.lastStatusProblem=s.lastStatusProblem||null;
    HA.notes=s.notes||{};HA.refFrom=s.refFrom||null;HA.refArea=s.refFrom==='complete'&&s.refArea>=MIN_REF_AREA?s.refArea:null; // only a finished whole-home clean counts; older versions saved partial ones
   HA.retryQueue=s.retryQueue||[];HA.spotEv=s.spotEv||null;HA.spotStarted=!!s.spotStarted;HA.prevStatus=s.prevStatus||null;S.quietUntil=s.quietUntil||null;HA.careDay=s.careDay||{};
    SCEN.none={label:'No study events',keys:[]};
    S.ctl.scenario=s.scenario&&SCEN[s.scenario]?s.scenario:'none'; // study events only when a facilitator turns them onS.temp=s.temp||null;
    S.clock=now();S.conn='connecting';S.device={status:'docked',battery:null,error:null};
    S.snap={clock:S.clock,device:{...S.device},pos:null,pct:0};
  }

  /* ---------- bridge ---------- */
  async function api(path,body){
    const r=await fetch('/api/'+path,{signal:AbortSignal.timeout(15000),cache:'no-store',
      ...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    let v={};try{v=await r.json()}catch(e){}
    if(!r.ok){const err=new Error(v.error||'Home Assistant request failed ('+r.status+')');err.status=r.status;throw err}
    return v;
  }
  const MAPSTORE='robot-live-map-v1';
  function saveGoodMap(){try{localStorage.setItem(MAPSTORE,JSON.stringify({foot:HA.foot,foot3:HA.foot3,map:HA.goodMap}))}catch(e){/* too big or blocked: the live map still works */}}
  function loadGoodMap(){try{const m=JSON.parse(localStorage.getItem(MAPSTORE));if(m){HA.foot=HA.foot||m.foot;HA.foot3=HA.foot3||m.foot3;HA.goodMap=HA.goodMap||m.map}}catch(e){}}
  async function loadMap(){
    HA.lastMap=Date.now();
    try{
      const r=await fetch('/api/map',{signal:AbortSignal.timeout(15000),cache:'no-store'});
      if(!r.ok)return;
      const bmp=await createImageBitmap(await r.blob());
      const cv=document.createElement('canvas');cv.width=bmp.width;cv.height=bmp.height;
      const g=cv.getContext('2d');g.drawImage(bmp,0,0);
      const px=g.getImageData(0,0,bmp.width,bmp.height).data;
      const f=M().footprint(px,bmp.width,bmp.height,6);
      // an empty image means the robot has no map right now: keep showing the last good outline
      if(f&&HA.map){HA.foot=f;HA.foot3=M().footprint(px,bmp.width,bmp.height,12)||HA.foot3;saveGoodMap()} // 3D walls on a coarser 0.3 m outline
      const oldKey=HA.footKey;HA.footKey=HA.foot?HA.foot.runs.length+':'+JSON.stringify(HA.map?.calibration):'';
      if(oldKey&&HA.footKey&&oldKey!==HA.footKey&&!HA.map?.stale){
        // the outline grows while the robot explores (same frame): just note it; a new calibration is a new map: check drawn areas
        const newFrame=HA.lastCal&&HA.map?.calibration&&JSON.stringify(HA.map.calibration)!==HA.lastCal;
        S.mapNews='The robot updated its map';
        if(newFrame){tl('robot','The robot made a new map');checkDrawnAreas('The robot’s map changed.');banner('moved',{id:'moved',title:'Map updated',body:'The robot made a new map.'})}
      }
      if(HA.map?.calibration&&!HA.map.stale)HA.lastCal=JSON.stringify(HA.map.calibration);
      // the outline grows as the robot explores; only a new calibration means a new map frame, so only that resets alignment
      const cal=calKey();
      if(HA.autoPairs.length&&HA.autoPairs[0].calKey&&cal&&HA.autoPairs[0].calKey!==cal)HA.autoPairs=[];
      if(HA.align&&HA.align.calKey&&cal&&HA.align.calKey!==cal){const was=HA.align.manual;HA.align=null;if(was)flash('New robot map: the alignment was reset.')}
      HA.sig='';commitIfChanged();
    }catch(e){/* status stays useful without the map image */}
  }

  /* ---------- commands: sent for real, confirmed by the robot's next state ---------- */
  async function liveCommand(action,opts,fn){
    if(action==='pause'){HA.appPauseAt=Date.now();HA.appPaused=true}
    if(S.conn!=='connected'){flash('You’re offline. Reconnect to send commands.');return false}
    if(!opts.force&&(HA.pending||(S.cmd&&S.cmd.state==='sending'))){flash('Still waiting for the robot to answer.');return false}
    const fail=()=>{S.cmd={label:opts.label,state:'failed',retry:opts.retry||(()=>liveCommand(action,opts,fn))};opts.onFail&&opts.onFail();commit()};
    S.cmd={label:opts.label,state:'sending'};commit();
    try{await api('command',{action,...(opts.body||{})})}catch(e){HA.error=e.message;fail();return false}
    HA.pending={expect:opts.expect,detail:opts.expectDetail||null,from:S.device.status,at:Date.now(),done:opts.done,fn,fail};
    refresh();return true;
  }
  function checkPending(){
    const p=HA.pending;if(!p)return;
    // a spot sent mid-cleaning is confirmed by the robot reporting zoned cleaning, not just "cleaning"
    const ok=p.detail&&p.from==='cleaning'?p.detail.includes(HA.dev?.detail):p.expect.includes(S.device.status);
    if(ok){
      HA.pending=null;p.fn&&p.fn();S.cmd={label:p.done,state:'confirmed'};
      setTimeout(()=>{if(S.cmd&&S.cmd.state==='confirmed'){S.cmd=null;commit()}},1700);
    }else if(Date.now()-p.at>30000){HA.pending=null;p.fail()}
  }

  /* ---------- notifications: Home Assistant, and the phone if its app is installed ---------- */
  function push(kind,key,title,message){
    if(quietNow())return; // paused: it waits in Inbox
    if(!S.notif[kind]||HA.notified[key])return;HA.notified[key]=1;
    api('notify',{title,message}).catch(()=>{delete HA.notified[key]});
  }
  function notifyEvent(ev){
    const d=DEFS[ev.key],sh=SHORT[ev.key];
    if(ev.problem)return ev.status==='needsReview'&&push(noticeKind(ev),ev.id+':problem',d.title,d.what+' '+sh.line);
    if(ev.retryFailed)return push('review',ev.id+':retry'+(ev.attempts||0),'Retry didn’t work',d.title+'. The spot is still blocked.');
    if(ev.autonomous&&!ev.changed)return push('decisions',ev.id+':auto','Robot handled it',sh.q+' Robot chose: '+(ev.autoChoice?sh.labels[ev.autoChoice]:'your saved preference')+'. (Study scenario)');
    if(S.waitEv===ev.id)return push('review',ev.id+':wait','Robot is waiting for you',sh.q+' It won’t continue until you choose. (Study scenario)');
    if(ev.status==='needsReview')return push('review',ev.id+':review',ev.suggestion?'Robot suggests something':d.kind,d.title+'. (Study scenario)');
  }

  /* ---------- rooms and saved zones, drawn in this app on the 0.5 m grid ---------- */
  const ROOM_COLORS=['living','kitchen','hall','bed','study'];
  function registerRooms(){
    HA.rooms.forEach(rm=>{const k='lr_'+rm.id;ROOM[k]={id:k,name:rm.name,the:'the '+rm.name.toLowerCase()};CELLROOM[k]=k});
    // events and zones saved in a room that was deleted later
    Object.values(ZONES).forEach(z=>{if(z.room&&!ROOM[z.room])ROOM[z.room]={id:z.room,name:'Robot map',the:'your home'}});
  }
  const roomKey=mm=>{const rm=M().roomAt(HA.rooms,mm);return rm?'lr_'+rm.id:'live'};
  const boxArea=parts=>Math.round(parts.reduce((a,b)=>a+(b[2]-b[0])*(b[3]-b[1]),0)/1e5)/10;

  /* ---------- robot problems: every error the robot reports gets a banner and an event page ---------- */
  const PROBLEMS={
    lidar_blocked:['Laser sensor blocked','Something is covering the laser sensor on top of the robot.'],
    bumper_stuck:['Bumper stuck','The front bumper is pressed in and won’t spring back.'],
    wheels_suspended:['Wheel off the floor','A wheel lost contact with the floor, for example on a ledge or a thick rug edge.'],
    cliff_sensor_error:['Floor sensor problem','A floor (cliff) sensor underneath is dirty or blocked.'],
    main_brush_jammed:['Main brush jammed','Something is wrapped around the main brush.'],
    side_brush_jammed:['Side brush jammed','Something is wrapped around the side brush.'],
    wheels_jammed:['Wheel jammed','A wheel can’t turn, usually because of hair or a cable.'],
    robot_trapped:['Robot trapped','The robot can’t find a way out of where it is.'],
    no_dustbin:['Dustbin missing','The robot can’t detect its dustbin.'],
    strainer_error:['Filter problem','The filter or strainer is missing or not seated.'],
    compass_error:['Strong magnetic field','Something magnetic near the robot is confusing its sensors.'],
    low_battery:['Battery too low','The battery is too low to keep cleaning.'],
    charging_error:['Charging problem','The robot can’t charge on the dock.'],
    battery_error:['Battery problem','The robot reports a battery fault.'],
    wall_sensor_dirty:['Wall sensor dirty','The side wall sensor is dirty.'],
    robot_tilted:['Robot tilted','The robot is on an uneven or sloped surface.'],
    side_brush_error:['Side brush problem','The side brush isn’t working.'],
    fan_error:['Fan problem','The suction fan isn’t working.'],
    dock:['Dock problem','The robot reports a problem with its dock.'],
    optical_flow_sensor_dirt:['Floor tracking sensor dirty','The sensor that tracks movement over the floor is dirty.'],
    vertical_bumper_pressed:['Top bumper pressed','Something is pressing on the top of the robot, such as low furniture.'],
    dock_locator_error:['Can’t find the dock','The robot can’t locate its dock.'],
    return_to_dock_fail:['Couldn’t get back to the dock','The robot tried to return to its dock and failed.'],
    nogo_zone_detected:['Inside a no-go zone','The robot ended up inside a no-go zone or virtual wall.'],
    visual_sensor:['Camera blocked','The front camera is dirty or blocked.'],
    vibrarise_jammed:['Mop lift jammed','The mop lifting mechanism is stuck.'],
    robot_on_carpet:['Stuck on carpet','The robot is stuck on a carpet.'],
    filter_blocked:['Filter blocked','The filter is clogged.'],
    invisible_wall_detected:['Inside a virtual wall','The robot ran into a virtual wall.'],
    cannot_cross_carpet:['Can’t cross the carpet','The robot can’t get over a carpet edge.'],
    internal_error:['Internal error','The robot reports an internal error.'],
  };
  const FIXES={
    lidar_blocked:'Clear anything around the laser sensor on top, then resume.',bumper_stuck:'Tap the bumper a few times until it moves freely, then resume.',
    wheels_suspended:'Put the robot back on flat floor, then resume.',cliff_sensor_error:'Wipe the sensors underneath with a dry cloth, then resume.',
    main_brush_jammed:'Remove the main brush, clear hair or threads, put it back, then resume.',side_brush_jammed:'Remove the side brush and clear it, then resume.',
    wheels_jammed:'Check the wheels for hair or debris, then resume.',robot_trapped:'Move the robot to open floor, then resume.',
    no_dustbin:'Put the dustbin back in, then resume.',low_battery:'Put the robot on the dock to charge.',charging_error:'Check the dock is plugged in and the contacts are clean.',
    return_to_dock_fail:'Clear the area around the dock, or carry the robot back to it.',dock_locator_error:'Make sure the dock is plugged in and nothing blocks it.',
    robot_tilted:'Put the robot back on flat floor, then resume.',vertical_bumper_pressed:'Move the robot out from under the furniture, then resume.',
    nogo_zone_detected:'Carry the robot out of the no-go zone, then resume.',robot_on_carpet:'Move the robot off the carpet, then resume.',
    filter_blocked:'Clean or replace the filter, then resume.',visual_sensor:'Wipe the front camera, then resume.',
  };
  const PLABELS={pResume:'I fixed it, resume',pDock:'Send it to the dock',pLater:'Leave it for now',pRetry:'Try again',pOk:'Got it',pAlign:'Align the map',pFinish:'Finish the cleaning here',pRooms:'Check rooms and zones'};
  function problemInfo(code){
    const [title,what]=PROBLEMS[code]||['Robot problem: '+code.replace(/_/g,' '),'The robot reports “'+code.replace(/_/g,' ')+'”.'];
    return {title,what,fix:FIXES[code]||M().errorText(code)||'Check the robot, then resume.',why:'Reported by the robot ('+code+').',options:['pResume','pDock','pLater']};
  }
  const STATUS_PROBLEMS={
    mapping:{title:'Mapping your home',what:'The robot is building a new map instead of using its saved one.',fix:'Let it finish. If it already had a map, it may have failed to find its place, and your rooms and alignment may no longer line up afterwards.',why:'Reported by the robot (mapping).',options:['pOk']},
    charging_problem:{title:'Not charging',what:'The robot is on the dock but not charging.',fix:'Check the dock is plugged in and the charging contacts are clean.',why:'Reported by the robot (charging problem).',options:['pOk']},
    locked:{title:'Robot locked',what:'The robot is locked and won’t take commands.',fix:'Unlock it in the Roborock app or on the robot.',why:'Reported by the robot (locked).',options:['pOk']},
    updating:{title:'Updating',what:'The robot is updating its firmware and can’t clean right now.',fix:'Wait until the update finishes.',why:'Reported by the robot (updating).',options:['pOk']},
  };
  function defineProblem(key,info,zone){
    DEFS[key]={type:'problem',zone,kind:'Robot problem',title:info.title,chip:info.title,what:info.what,why:info.why,unsure:null,next:'',dflt:'',options:info.options,retryControlled:false};
    SHORT[key]={q:info.title,line:info.fix,primary:info.options[0],labels:PLABELS};
  }
  function raiseProblem(key,info,noSpot){
    if(S.events.some(e=>e.key===key&&['needsReview','deferred'].includes(e.status)))return null;
    if(HA.snooze[key]&&Date.now()-HA.snooze[key]<600000)return null; // you just dealt with this one
    const pos=noSpot?null:robotPose(),zid='z'+(++seq);
    ZONES[zid]={name:pos?'Where the robot was at '+hhmm(S.clock):'Robot map',room:pos?roomKey(pos):'live',cells:[],keys:[],mm:pos?{x:pos.x,y:pos.y}:null};
    defineProblem(key,info,zid);
    const ev={id:'e'+(++seq),key,at:S.clock,status:'needsReview',autonomous:false,log:[],outcome:null,zone:zid,problem:true,info,attempts:0};
    S.events.push(ev);evLog(ev,'robot',info.what);notice(ev);
    return ev;
  }
  function resolveProblem(key,text){
    S.events.filter(e=>e.key===key&&['needsReview','deferred'].includes(e.status)).forEach(e=>{e.status='resolved';e.outcome=text;evLog(e,'result',text.replace(/\.$/,''))});
  }
  function checkProblems(snap,d){
    const code=M().value(snap,'vacuum_error'),err=code&&code!=='none'?code:null;
    if(err!==HA.lastErr){if(HA.lastErr){resolveProblem('p_'+HA.lastErr,'Fixed. The robot reports no problem now.');HA.errCleared={title:problemInfo(HA.lastErr).title,at:Date.now(),clock:S.clock}}if(err)raiseProblem('p_'+err,problemInfo(err));HA.lastErr=err}
    const st=STATUS_PROBLEMS[d.detail]?d.detail:null;
    if(st!==HA.lastStatusProblem){if(HA.lastStatusProblem)resolveProblem('p_s_'+HA.lastStatusProblem,'Back to normal.');if(st)raiseProblem('p_s_'+st,STATUS_PROBLEMS[st],true);HA.lastStatusProblem=st}
    // the map Home Assistant sends is from before this cleaning
    const t=S.task;
    if(t&&!t.done&&!mapFresh(t)&&!trailOf(t).length&&Date.now()-t.startedAt>120000&&!t.mapWarned){t.mapWarned=true;
      raiseProblem('p_map',{title:'Map not updating',what:'Home Assistant hasn’t sent a new map since '+(HA.map?.source_updated_at?hhmm(secOf(HA.map.source_updated_at)):'—')+', and the robot’s live position isn’t coming through either, so cleaned cells and the robot can’t move on the map.',fix:'Cleaning continues. In Home Assistant, reload the Roborock integration if this keeps happening.',why:'The map from Home Assistant is older than this cleaning.',options:['pOk']},true)}
    if(t&&(mapFresh(t)||trailOf(t).length))resolveProblem('p_map',mapFresh(t)?'The map is updating again.':'The robot’s live position is coming through.');
  }
  // Home Assistant can renew the map's timestamp while still sending the old path, so a map only
  // counts as this cleaning's once its path differs from the one seen when the cleaning started.
  const pathSig=path=>{const pts=(path||[]).flat();const last=pts[pts.length-1];return pts.length+':'+(last?last.x+','+last.y:'')};
  const mapFresh=t=>!!(t&&t.baseSig!==undefined&&HA.map&&pathSig(HA.map.path)!==t.baseSig&&Date.parse(HA.map.source_updated_at)>=t.startedAt-5000);

  /* ---------- objects across cleanings: sure ones stay, unsure ones go, gone ones are removed ---------- */
  function syncObjects(snap){
    const map=HA.map;if(!map)return;
    // keyed by the obstacle list itself: Home Assistant re-sends old lists with new timestamps
    const key=(map.obstacles||[]).map(o=>o.x+','+o.y+','+o.type_code).join(';');
    if(/^\d{4}-\d\d-\d\dT/.test(HA.objSnap)){ // saved by the earlier timestamp-keyed version
      HA.objSnap=key;if(S.task&&!S.task.done)HA.objs=HA.objs.filter(o=>o.status!=='pending');
    }
    if(key!==HA.objSnap){
      HA.objSnap=key;const used=new Set();
      M().objects(snap.vacuum.entity_id,map,{}).forEach(raw=>{
        const m=HA.objs.find(o=>!used.has(o.id)&&o.typeCode===raw.typeCode&&Math.hypot(o.mm.x-raw.mm.x,o.mm.y-raw.mm.y)<400);
        if(m){used.add(m.id);Object.assign(m,{mm:raw.mm,lastSeen:key,source:raw.source});if(m.dismissed&&m.dismissedSnap!==key)m.dismissed=false}
        else{const o={...raw,id:'o'+(++seq),firstSeen:key,lastSeen:key};HA.objs.push(o);used.add(o.id)}
      });
    }
    if(S.task&&S.task.done&&!S.task.objChecked)checkGone(S.task);
  }
  function checkGone(t){
    if(!mapFresh(t))return; // wait for a map from this cleaning
    t.objChecked=true;
    const gone=HA.objs.filter(o=>o.lastSeen!==HA.objSnap&&(t.kind==='home'||(t.parts||[]).some(b=>M().inBox(o.mm,b))));
    gone.forEach(o=>{if(!o.dismissed)tl('robot','Not found in this cleaning: '+OBJ[o.label].n.toLowerCase()+' in '+(ROOM[roomKey(o.mm)]?.the||'your home')+'. Removed from the map')});
    HA.objs=HA.objs.filter(o=>!gone.includes(o));
  }

  /* ---------- tasks follow the real robot ---------- */
  function startLiveTask(){
    if(S.task)archiveTask();
    const fromApp=HA.expectStart&&Date.now()-HA.expectStart.at<90000;
    const d=new Date(),day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],m=d.getHours()*60+d.getMinutes();
    const sch=!fromApp&&S.schedules.find(x=>x.on&&x.days.includes(day)&&Math.abs(m-(+x.time.slice(0,2)*60+ +x.time.slice(3,5)))<=3);
    const label=fromApp?HA.expectStart.label:sch?'Scheduled: Entire home':'Started outside the app';
    const kind=fromApp?HA.expectStart.kind||'home':'home',parts=fromApp?HA.expectStart.parts||null:null;
    HA.expectStart=null;
    S.cells=blankCells('out');S.events=[];S.timeline=[];S.ui.remember={};
    S.sim.pending=(SCEN[S.ctl.scenario]||SCEN.none).keys.slice();S.sim.fired={};S.sim.queue=[];S.waitEv=null;S.checkEv=null;
    S.task={id:'t'+Date.now(),day:'Today',startedAt:Date.now(),start:S.clock,end:null,scopeLabel:label,result:null,done:false,endedEarly:false,real:true,kind,parts,baseSig:pathSig(HA.map?.path),
      areaBase:HA.dev?.area??null,minBase:HA.dev?.minutes??null,fresh:false};
    tl(fromApp||sch?'you':'robot',fromApp?'You started cleaning: '+label:sch?'Your schedule started the cleaning ('+sch.time+')':'Cleaning was started from the Roborock app or the robot');
    tl('robot','Cleaning started');
    const unsure=HA.objs.filter(o=>o.status==='pending'||o.status==='ignored');
    if(unsure.length){HA.objs=HA.objs.filter(o=>!unsure.includes(o));tl('robot','Cleared '+unsure.length+' unsure object'+(unsure.length>1?'s':'')+' from the last cleaning')}
  }
  function finishLiveTask(){
    const t=S.task;
    const dv=liveDev(t);
    t.done=true;t.end=S.clock;t.endedAt=Date.now();t.area=dv?.area??null;t.minutes=dv?.minutes??Math.round((t.endedAt-t.startedAt)/60000);
    // the app may notice the dock a while after the robot got there, so the robot's own counter measures the run
    const ranMs=dv?.minutes!=null?dv.minutes*60000:t.endedAt-t.startedAt;
    t.stoppedEarly=!t.endedEarly&&ranMs<SHORT_RUN_MS;
    t.path=(mapFresh(t)?M().simplifyPath(HA.map?.path):[]).concat(trailOf(t));
    S.sim.pending=[];S.sim.queue=[];S.waitEv=null;S.checkEv=null;
    t.result=computeResult();t.pct=taskPct(t);
    if(t.result==='completed'&&t.area>=MIN_REF_AREA&&t.minutes>=10&&t.scopeLabel==='Entire home'){HA.refArea=Math.max(HA.refArea||0,t.area);HA.refFrom='complete'}
    const nc=S.events.filter(e=>e.status!=='resolved'&&e.status!=='info'&&DEFS[e.key].type!=='decision').length;
    tl('result',t.result==='completed'?'Task completed':t.result==='ended'?'Task ended early':`Task partially completed: ${nc} area${nc===1?'':'s'} not cleaned`);
    if(S.notif.finished)banner(pendingObjs().length?'objs':'done',{id:'done',title:'Cleaning finished',body:RESULTLABEL[t.result]});
    restoreMode(); // e.g. vacuum only, chosen because the water tank was empty
    checkGone(t);
    if(t.stoppedEarly)raiseProblem('p_short',{title:'Cleaning stopped early',what:'The cleaning ended after '+(ranMs<90000?Math.max(1,Math.round(ranMs/1000))+' seconds':Math.round(ranMs/60000)+' minutes')+' without you stopping it.',
      fix:'The robot may have failed to find its position on the map. Make sure it starts from the dock with the room lights on, then try again.',why:'The robot went back to the dock much sooner than a normal cleaning.',options:['pRetry','pLater']},true);
    const po=pendingObjs().length;
    push('finished',t.id+':done','Cleaning finished',RESULTLABEL[t.result]+(t.area!=null?' · '+Math.round(t.area)+' m²':'')+(nc?' · '+nc+' area'+(nc>1?'s':'')+' not cleaned':'')+(po?' · '+po+' object'+(po>1?'s':'')+' to check':''));
  }
  function finishSpot(){
    const ev=findEvent(HA.spotEv);HA.spotEv=null;HA.spotStarted=false;
    if(HA.spotCancelled&&ev){
      if(ev.key==='extra'){ev.extraQueued=false;ev.outcome='Extra pass stopped: you sent the robot back.'}
      else{ev.status='deferred';ev.outcome='Stopped: you sent the robot back before it finished.'}
      evLog(ev,'you',ev.outcome.replace(/\.$/,''));
    }else if(ev&&ev.key==='extra'){
      ev.extraQueued=false;ev.outcome=HA.spotError?'The extra pass didn’t finish: the robot reported a problem.':'Extra pass done on this spot.';
      evLog(ev,'result',ev.outcome.replace(/\.$/,''));
    }else if(ev){
      if(HA.spotError){ev.status='needsReview';ev.attempts=(ev.attempts||0)+1;ev.retryFailed=true;ev.retryFails=(ev.retryFails||0)+1;evLog(ev,'robot','Retry didn’t work: the robot reported a problem');notice(ev)}
      else{ev.status='resolved';ev.retryFailed=false;ev.outcome=ev.pendingOutcome||'Area cleaned successfully.';evLog(ev,'result',ev.outcome.replace(/\.$/,''))}
    }
    const cancelled=HA.spotCancelled;
    HA.spotError=false;HA.spotCancelled=false;if(S.task)S.task.spot=false;
    restoreMode();
    const t=S.task;
    if(t&&!t.done&&t.resumeAfterSpot&&!cancelled&&!t.endedEarly){
      t.resumeAfterSpot=false;
      if(HA.retryQueue.some(i=>findEvent(i)&&!findEvent(i).queued))return; // another go-now retry is waiting; it goes first
      const zones=t.kind!=='home'&&t.parts?t.parts.map(b=>M().robotBox(HA.align?.al,b)):null;
      HA.resuming=true;
      liveCommand(zones?'zones':'start',{label:'Continue cleaning',done:'Back to the rest of the cleaning',expect:['cleaning'],body:zones?{zones}:null,force:true,
        onFail:()=>{HA.resuming=false}},()=>{HA.resuming=false;tl('robot','Back to the rest of the cleaning. Roborock starts the route again, so some areas get a second pass')});
    }
    if(S.task&&S.task.done){S.task.result=computeResult();S.task.pct=taskPct(S.task)}
  }
  function lifecycle(status){
    const prev=HA.prevStatus;HA.prevStatus=status;
    if(HA.resuming){if(status==='cleaning')HA.resuming=false;else return} // continuing the cleaning after a spot
    if(HA.spotEv){
      if(status==='error')HA.spotError=true;
      if(HA.spotStarted&&status==='docked')finishSpot();
      return;
    }
    if(status==='cleaning'&&(!S.task||S.task.done))startLiveTask();
    else if(S.task&&!S.task.done&&status==='docked'){
      const t=S.task,b=S.device.battery;
      if(t.recharging){if(b>=100&&Date.now()-t.rechargeAt>20*60000)finishLiveTask()} // it never left again
      else if(!t.endedEarly&&b!=null&&b<=30&&Date.now()-t.startedAt>120000){t.recharging=true;t.rechargeAt=Date.now();
        raiseProblem('p_recharge',{title:'Recharging, then continuing',what:'The battery got low ('+b+'%), so the robot went back to charge in the middle of the cleaning.',fix:'It carries on by itself once it has enough charge. You don’t need to do anything.',why:'From the robot’s battery level and status.',options:['pOk','pFinish']},true)}
      else finishLiveTask();
    }
    if(status==='cleaning'&&S.task&&S.task.recharging){S.task.recharging=false;resolveProblem('p_recharge','Charged and back to cleaning.')}
  }

  /* ---------- study events at the real robot's position ---------- */
  function fireStudy(key){
    const pos=robotPose();
    const zid='z'+(++seq);
    ZONES[zid]={name:'Spot at '+hhmm(S.clock),room:pos?roomKey(pos):'live',cells:[],keys:[],mm:pos?{x:pos.x,y:pos.y}:null};
    DEFS[key].zone=zid;
    const waitBefore=S.waitEv,n=S.timeline.length;
    HA.inFire=true;try{fire(key)}finally{HA.inFire=false}
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
    if(!t||t.done||HA.spotEv||HA.resuming||S.conn!=='connected'||S.device.status!=='cleaning'||!S.sim.pending.length||HA.pending)return;
    const n=Object.keys(S.sim.fired).length;
    const due=n<FIRE_AFTER.length?FIRE_AFTER[n]:FIRE_AFTER[FIRE_AFTER.length-1]+90*(n-FIRE_AFTER.length+1);
    if(Date.now()-t.startedAt>=due*1000){fireStudy(S.sim.pending[0]);commit()}
  }
  function restoreMode(){
    const m=HA.restoreMode;if(!m)return;HA.restoreMode=null;
    api('command',{action:'mode',mode:m}).then(()=>tl('robot','Cleaning mode set back to '+(m==='vacuum'?'vacuum only':'vacuum and mop'))).catch(()=>{});
  }
  async function sendSpot(ev){
    const z=ZONES[ev.zone],extra=ev.key==='extra';
    HA.spotEv=ev.id;HA.spotStarted=false;HA.spotError=false;if(!extra)ev.status='inProgress';ev.queued=false;
    const fail=why=>{HA.spotEv=null;restoreMode();
      if(extra){ev.extraQueued=false;ev.outcome='The extra pass didn’t reach the robot.';evLog(ev,'robot',why)}
      else{ev.status='needsReview';ev.retryFailed=true;evLog(ev,'robot',why)}};
    // Rug and hard floor switch the robot's cleaning mode for this spot, then set it back.
    const now0=M().value(HA.snap,'cleaning_mode');
    if(ev.cleanMode&&now0&&now0!==ev.cleanMode){
      try{await api('command',{action:'mode',mode:ev.cleanMode});HA.restoreMode=HA.restoreMode||now0;
        tl('robot',ev.cleanMode==='vacuum'?'Switched to vacuum only for this spot':'Switched to vacuum and mop for this spot',ev.id)}
      catch(e){fail('Couldn’t switch the cleaning mode: '+e.message);commit();return}
    }
    const t=S.task;if(t&&!t.done)t.resumeAfterSpot=true; // Roborock drops a running cleaning for a spot; the app restarts it after
    liveCommand('zone',{label:extra?'Extra pass':'Retry '+z.name.toLowerCase(),done:'Robot is going to the spot now',expect:['cleaning'],expectDetail:['zoned_cleaning','spot_cleaning'],force:true,
      body:{box:M().robotBox(HA.align?.al,spotCells(z.mm).box)},retry:()=>sendSpot(ev),onFail:()=>fail(extra?'The extra pass didn’t reach the robot':'The retry didn’t reach the robot')},
      ()=>{HA.spotStarted=true;if(S.task)S.task.spot=true;tl('robot',(extra?'Extra pass started: ':'Spot clean started: ')+z.name,ev.id)});
  }
  /* Ending means ending: nothing queued runs afterwards, and a running spot clean counts as stopped. */
  function stopAll(){
    HA.retryQueue.forEach(id=>{const ev=findEvent(id);if(!ev)return;
      if(ev.extraQueued){ev.extraQueued=false;ev.outcome='Extra pass cancelled: you ended the cleaning.';evLog(ev,'you','Extra pass cancelled')}
      else if(ev.status==='inProgress'){ev.status='deferred';ev.queued=false;ev.outcome='Not retried: you ended the cleaning.';evLog(ev,'you','Retry cancelled: you ended the cleaning')}});
    HA.retryQueue=[];S.sim.queue=[];S.sim.pending=[];HA.resuming=false;if(S.task)S.task.resumeAfterSpot=false;
    HA.pending=null; // a command still being confirmed, such as a retry, is dropped
    if(HA.spotEv){
      if(HA.spotStarted)HA.spotCancelled=true;
      else{const ev=findEvent(HA.spotEv);HA.spotEv=null;restoreMode();
        if(ev&&ev.extraQueued){ev.extraQueued=false;ev.outcome='Extra pass cancelled: you ended the cleaning.'}
        else if(ev){ev.status='deferred';ev.outcome='Not retried: you ended the cleaning.';evLog(ev,'you','Retry cancelled: you ended the cleaning')}}
    }
  }
  /* "now" or "after" for a retry: what the user picked for this one, else the Settings default. */
  const retryTiming=ev=>{const w=ev.retryWhen||HA.retryWhen;delete ev.retryWhen;return w};
  function processRetries(){
    if(HA.pending||HA.spotEv||HA.resuming||S.conn!=='connected'||!HA.retryQueue.length)return;
    if(S.device.status==='error')return; // never while the robot needs help
    HA.retryQueue=HA.retryQueue.filter(id=>{const e=findEvent(id);return e&&(e.status==='inProgress'||e.extraQueued)&&ZONES[e.zone]?.mm});
    const running=S.task&&!S.task.done;
    // "go now" retries leave straight away; "after" ones wait for the cleaning to end and the robot to dock
    const id=HA.retryQueue.find(i=>!findEvent(i).queued)||(!running&&S.device.status==='docked'?HA.retryQueue[0]:null);
    if(!id)return;
    HA.retryQueue=HA.retryQueue.filter(x=>x!==id);sendSpot(findEvent(id));
  }

  /* ---------- no-go zones: written to the robot, which replaces its whole list on each save ---------- */
  const bbox=a=>{const xs=[a[0],a[2],a[4],a[6]],ys=[a[1],a[3],a[5],a[7]];return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]};
  const sameZone=(a,b)=>{const p=bbox(a),q=bbox(b);return p.every((v,i)=>Math.abs(v-q[i])<80)};
  const hasZone=z=>!!(ZONES[z]&&(ZONES[z].box||ZONES[z].mm));
  const zoneBox=z=>ZONES[z].box||spotCells(ZONES[z].mm).box;
  const zoneRect=z=>{const [x1,y1,x2,y2]=zoneBox(z);return [x1,y1,x2,y1,x2,y2,x1,y2]};
  const robotZones=()=>(HA.map?.no_go_areas||[]).map(a=>a.map(Math.round));
  const onRobot=z=>hasZone(z)&&robotZones().some(a=>sameZone(a,zoneRect(z)));
  function nogoList(){
    const mine=S.nogo.filter(hasZone).map(zoneRect);
    const keep=robotZones().filter(a=>!HA.removedZones.some(b=>sameZone(a,b))&&!mine.some(b=>sameZone(a,b)));
    // zones drawn in this app are in map coordinates; the robot gets them in its own
    return keep.concat(mine.map(a=>[0,2,4,6].flatMap(i=>{const p=M().toRobot(HA.align?.al,{x:a[i],y:a[i+1]});return [Math.round(p.x),Math.round(p.y)]})));
  }
  async function saveNogo(label,done){
    const zones=nogoList();
    S.cmd={label,state:'sending'};commit();
    try{await api('command',{action:'nogo',zones});S.cmd={label:done,state:'confirmed'};
      setTimeout(()=>{if(S.cmd&&S.cmd.state==='confirmed'){S.cmd=null;commit()}},1700)}
    catch(e){HA.error=e.message;S.cmd={label,state:'failed',retry:()=>saveNogo(label,done)}}
    commit();
  }

  /* ---------- live position: moves the robot and fills cells even when the map image is old ---------- */
  const robotPose=()=>HA.pose||HA.map?.robot||null;
  function takePosition(snap){
    const lp=snap.position;if(!lp||!Number.isFinite(lp.x))return;
    HA.poseRaw={x:lp.x,y:lp.y,at:lp.at};
    if(!HA.livePts.length||HA.livePts[HA.livePts.length-1].at!==lp.at){HA.livePts.push({x:lp.x,y:lp.y,at:lp.at});HA.livePts=HA.livePts.filter(p=>lp.at-p.at<300)}
    const docked=S.device.status==='docked'&&HA.map?.robot&&!HA.map.stale;
    const q=docked?{x:HA.map.robot.x,y:HA.map.robot.y}:M().toMap(HA.align?.al,lp),last=HA.pose,moved=last?Math.hypot(q.x-last.x,q.y-last.y):0;
    // the robot reports no heading here, so face the way it last moved
    const angle=last&&moved>60?Math.atan2(q.y-last.y,q.x-last.x)*180/Math.PI:last?.angle??HA.map?.robot?.angle;
    HA.pose={x:q.x,y:q.y,angle,at:lp.at};
    const t=S.task;
    if(t&&(!t.done||t.spot)&&['cleaning','returning','paused','error'].includes(S.device.status)){
      t.trail=t.trail||[[]];let seg=t.trail[t.trail.length-1];const prev=seg[seg.length-1];
      if(prev&&Math.hypot(lp.x-prev[0],lp.y-prev[1])>1500){seg=[];t.trail.push(seg)} // a jump, not a drive
      if(!prev||Math.hypot(lp.x-prev[0],lp.y-prev[1])>=60)seg.push([Math.round(lp.x),Math.round(lp.y)]);
    }
  }
  /* Automatic alignment, the way it's done by hand: points on the robot's way give the true position on the map.
     Each new map records where the robot was; while it cleans, the live reading at that moment pairs with it.
     One pair gives a shift, pairs at least 2 m apart give rotation and shift. A manual alignment always wins.
     (On the dock the live reading can be ~0.5 m off while the map is right, so dock readings are not used:
     the robot on its dock is drawn where its map puts it instead.) */
  const calKey=()=>HA.map&&HA.map.calibration?JSON.stringify(HA.map.calibration):'';
  function collectPairs(){
    const map=HA.map,raw=HA.poseRaw;if(!map||map.stale||!map.robot||!raw||!map.source_updated_at)return;
    const key=map.source_updated_at+'|'+map.robot.x+','+map.robot.y;if(key===HA.lastPairKey)return;
    const mapAt=Date.parse(map.source_updated_at)/1000,st=S.device.status;let live=null,kind=null;
    if(['cleaning','returning'].includes(st)){
      live=liveAt(mapAt);if(live)kind='drive';
    }
    HA.lastPairKey=key;if(!live)return;
    const pair={live:{x:live.x,y:live.y},map:{x:map.robot.x,y:map.robot.y},kind,at:mapAt,calKey:calKey()};
    HA.autoPairs=HA.autoPairs.concat(pair).slice(-40);
    autoAlign();persist();
  }
  /* where the live position was at time t: between the two readings around it, if they are close in time and place */
  function liveAt(t){
    const pts=HA.livePts;let before=null,after=null;
    for(const p of pts){if(p.at<=t&&(!before||p.at>before.at))before=p;if(p.at>=t&&(!after||p.at<after.at))after=p}
    if(before&&after){
      if(after.at-before.at>12||Math.hypot(after.x-before.x,after.y-before.y)>1500)return null; // a gap or a jump: no reliable point
      const k=after.at===before.at?0:(t-before.at)/(after.at-before.at);
      return {x:before.x+k*(after.x-before.x),y:before.y+k*(after.y-before.y)};
    }
    const one=before||after;return one&&Math.abs(one.at-t)<=3?{x:one.x,y:one.y}:null;
  }
  function autoAlign(){
    if(HA.align&&HA.align.manual)return;
    const pairs=HA.autoPairs;if(!pairs.length)return;
    let spread=0;for(const a of pairs)for(const b of pairs)spread=Math.max(spread,Math.hypot(a.live.x-b.live.x,a.live.y-b.live.y));
    let al=null,how='';
    if(pairs.length>=3&&spread>=2000){const f=M().rigidFit(pairs);if(f&&f.rms<=300){al=f;how='turn'}}
    if(!al){
      if(pairs.length<3)return; // one reading can be 30 cm off while the robot moves
      const med=a=>{const v=a.slice().sort((x,y)=>x-y);return v[v.length>>1]};
      const dx=med(pairs.map(p=>p.map.x-p.live.x)),dy=med(pairs.map(p=>p.map.y-p.live.y));
      al={c:1,s:0,tx:dx,ty:dy,rms:0};how='shift';
    }
    // the frames usually already agree: if no point on its way would move by 15 cm, there is nothing to correct
    const disp=Math.max(...pairs.map(p=>{const q=M().toMap(al,p.live);return Math.hypot(q.x-p.live.x,q.y-p.live.y)}));
    if(disp<150){if(HA.align&&HA.align.auto){HA.align=null;HA.sig=''}HA.alignChecked={n:pairs.length,at:S.clock};return}
    if(!al)return;
    const old=HA.align&&HA.align.al,moved=old?Math.hypot(old.tx-al.tx,old.ty-al.ty)+Math.abs(Math.atan2(old.s,old.c)-Math.atan2(al.s,al.c))*5000:Infinity;
    if(moved<30)return; // no visible change
    HA.align={al,auto:true,how,n:pairs.length,calKey:calKey(),at:S.clock};
    if(HA.poseRaw){const q=M().toMap(al,HA.poseRaw);HA.pose={...HA.pose,x:q.x,y:q.y}}
    HA.sig='';
  }
  // the trail is kept in the robot's own coordinates and aligned when drawn, so a later alignment fixes it too
  const trailOf=t=>(t&&t.trail||[]).filter(seg=>seg.length).map(seg=>seg.map(([x,y])=>{const p=M().toMap(HA.align?.al,{x,y});return [p.x,p.y]}));

  function checkDrawnAreas(why){
    if(!HA.rooms.length&&!HA.savedZones.length&&!S.nogo.length&&!HA.align)return;
    raiseProblem('p_newmap',{title:'Check your rooms on the new map',what:why,fix:'Rooms, saved zones and no-go zones you drew, and the alignment, were made on the old map and may no longer line up. Open Rooms and zones to check them, and align the map if the robot looks off.',why:'The robot’s map in Home Assistant changed.',options:['pRooms','pAlign','pOk']},true);
  }
  /* ---------- maintenance counters: one notice a day per part that is due ---------- */
  const CARE=[['sensor_time_left',10,'Sensors need cleaning','Wipe the floor sensors underneath and the laser cover with a dry cloth, then reset the counter in the Roborock app.'],
    ['filter_time_left',15,'Filter needs cleaning','Tap the filter clean, or replace it if it is worn.'],
    ['side_brush_time_left',10,'Side brush wearing out','Replace the side brush soon.'],
    ['main_brush_time_left',15,'Main brush wearing out','Replace the main brush soon.']];
  function checkCare(snap){
    const today=new Date().toDateString();
    CARE.forEach(([k,limit,title,fix])=>{const v=M().number(snap,k);if(v==null||v>=limit||HA.careDay[k]===today)return;HA.careDay[k]=today;
      const ev=raiseProblem('p_care_'+k,{title,what:'About '+Math.max(0,Math.round(v))+' hours of cleaning left on this part.',fix,why:'From the robot’s maintenance counters.',options:['pOk']},true);if(ev){ev.care=true;DEFS[ev.key].kind='Maintenance'}});
  }

  /* ---------- behaviour the robot doesn't report as an error ---------- */
  function watchBehaviour(d){
    const t=S.task,now=Date.now(),st=S.device.status;
    if(HA.poseRaw&&(!HA.recent.length||HA.recent[HA.recent.length-1].at!==HA.poseRaw.at))HA.recent.push({x:HA.poseRaw.x,y:HA.poseRaw.y,at:HA.poseRaw.at,t:now});
    HA.recent=HA.recent.filter(p=>now-p.t<300000);
    if(st==='returning'){HA.returnSince=HA.returnSince||now;
      if(now-HA.returnSince>240000)raiseProblem('p_slowreturn',{title:'Taking long to get back',what:'It has been heading to the dock for 4 minutes.',fix:'Check that nothing blocks the way to the dock, or carry it back.',why:'From the robot’s status.',options:['pOk']},true)}
    else{HA.returnSince=0;if(st==='docked')resolveProblem('p_slowreturn','Back on the dock.')}
    if(st==='cleaning'||st==='returning'||st==='docked')resolveProblem('p_paused',st==='docked'?'Back on the dock.':st==='returning'?'Heading back to the dock.':'Cleaning again.');
    if(!t||t.done||HA.spotEv||HA.resuming||t.recharging)return;
    // paused, but not by this app: someone pressed its button, used the Roborock app, or it stopped by itself
    if(st==='cleaning'||st==='docked')HA.appPaused=false;
    const after=HA.errCleared&&now-HA.errCleared.at<180000?HA.errCleared:null;
    if(st==='paused'&&!HA.appPaused&&!S.waitEv&&!S.checkEv&&!HA.pending&&now-HA.appPauseAt>20000)
      raiseProblem('p_paused',after?{title:'Stopped: '+after.title.toLowerCase(),what:'At '+hhmm(after.clock)+' the robot reported “'+after.title.toLowerCase()+'” (for example when it is picked up), so it stopped. It is waiting now.',
        fix:'If it’s back on the floor, resume. If not, put it down first, or send it to the dock.',why:'From the robot’s error, then its status.',options:['pResume','pDock']}:{title:'Paused on its own',what:'The robot paused without a command from this app.',fix:'Someone may have pressed its button or paused it in the Roborock app, or it stopped because it couldn’t carry on. Check on it, then resume.',why:'From the robot’s status.',options:['pResume','pDock']},true);
    if(st==='cleaning'){
      // working in one spot: everything from the last 2 minutes within about 0.7 m
      const win=HA.recent.filter(p=>now-p.t<=120000);
      if(win.length>=8&&now-win[0].t>=110000){
        const cx=win.reduce((a,p)=>a+p.x,0)/win.length,cy=win.reduce((a,p)=>a+p.y,0)/win.length,rad=Math.max(...win.map(p=>Math.hypot(p.x-cx,p.y-cy)));
        if(rad<700)raiseProblem('p_dwell',{title:'Working in one spot',what:'The robot has stayed within about 1 m for 2 minutes.',fix:'It may be cleaning a dirty patch, or going round something it can’t get past. Take a look if it keeps going.',why:'From the robot’s live position.',options:['pOk','pDock']});
        else if(rad>1500)resolveProblem('p_dwell','It moved on.');
      }
      // no progress: the cleaned area hasn't grown for 4 minutes
      if(d.area!=null){
        if(!HA.areaMark||HA.areaMark.task!==t.id||d.area>HA.areaMark.a){HA.areaMark={a:d.area,t:now,task:t.id};resolveProblem('p_noprogress','Cleaning is making progress again.')}
        else if(now-HA.areaMark.t>240000)raiseProblem('p_noprogress',{title:'Not making progress',what:'The cleaned area hasn’t grown for 4 minutes (still '+d.area+' m²).',fix:'The robot may be circling or unable to reach new areas. Check on it, or send it to the dock.',why:'From the robot’s cleaned-area reading.',options:['pOk','pDock']},true);
      }
    }
    // a jump: the robot re-found (or lost) its place on the map
    const a=HA.recent[HA.recent.length-2],b=HA.recent[HA.recent.length-1];
    if(a&&b&&b.t-a.t<10000&&Math.hypot(b.x-a.x,b.y-a.y)>2500&&!t.jumpWarned){t.jumpWarned=true;
      raiseProblem('p_jump',{title:'Robot lost its place',what:'Its position jumped by '+(Math.hypot(b.x-a.x,b.y-a.y)/1000).toFixed(1)+' m in a few seconds.',fix:'This happens when the robot re-finds where it is on the map. If the robot on the map now looks wrong, align the map.',why:'From the robot’s live position.',options:['pOk','pAlign']},true)}
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
    HA.map=M().selectedMap(snap);
    if(HA.map&&HA.map.calibration&&!HA.map.stale){if(S.events.some(e=>e.key==='p_nomap'&&e.status==='needsReview'))checkDrawnAreas('The robot has a map again after having none.');HA.goodMap={map_id:HA.map.map_id,calibration:HA.map.calibration,no_go_areas:HA.map.no_go_areas,source_updated_at:HA.map.source_updated_at,charger:HA.map.charger,image_size:HA.map.image_size};resolveProblem('p_nomap','The robot has a map again.')}
    else if(HA.map&&(HA.map.stale||HA.goodMap)){
      // the robot reports no map: keep using the last good copy, without its old path or objects
      if(!S.events.some(e=>e.key==='p_nomap'&&e.status!=='resolved'))raiseProblem('p_nomap',{title:'Robot has no map right now',what:'Home Assistant reports an empty map for the robot.',fix:'This usually means it is building a new map, or lost its saved one after failing to find its place. The app keeps showing your last saved copy. Check the map in the Roborock app; if it is gone, let the robot finish a full cleaning from the dock, then redraw rooms and align the map.',why:'The robot’s map in Home Assistant has no size or calibration.',options:['pOk','pAlign']},true);
      HA.map=HA.map.stale?{...HA.map,path:[],obstacles:[],robot:null}:{...HA.goodMap,path:[],obstacles:[],robot:null,stale:true}; // the bridge may already fill it from its cache
    }
    HA.tf=HA.map&&HA.map.calibration?M().transform(HA.map.calibration):null;HA.ppm=HA.map?M().pxPerMm(HA.map.calibration):null;
    seedRobotRecord(snap,status);
    lifecycle(status);
    takePosition(snap);
    collectPairs();
    checkProblems(snap,d);checkCare(snap); // errors first, so a pause that follows one knows why
    watchBehaviour(d);
    if(!HA.map?.stale)syncObjects(snap); // a placeholder map says nothing about objects
    S.objects=HA.objs.filter(o=>!o.dismissed).map(o=>({...o,k:roomKey(o.mm),at:secOf(o.source)}));
    HA.removedZones=HA.removedZones.filter(b=>robotZones().some(a=>sameZone(a,b))); // until the robot's map drops them
    const rp=to3D(robotPose());
    if(rp){S.sim.pos={c:rp.x-.5,r:rp.z-.5};S.sim.heading=Number.isFinite(robotPose().angle)?90-robotPose().angle:0}
  }
  async function loadSchedules(){
    try{const r=await api('schedules');S.schedules=r.schedules;HA.schedLoaded=true;HA.schedError=''}
    catch(e){HA.schedError=e.message}
    HA.sig='';commitIfChanged();
  }
  async function schedCall(path,body,label){
    S.ui.modal=null;S.cmd={label,state:'sending'};commit();
    try{await api(path,body);await loadSchedules();S.cmd={label:'Saved in Home Assistant',state:'confirmed'};
      setTimeout(()=>{if(S.cmd&&S.cmd.state==='confirmed'){S.cmd=null;commit()}},1700)}
    catch(e){HA.error=e.message;S.cmd={label,state:'failed',retry:()=>schedCall(path,body,label)}}
    commit();
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
    const p=robotPose(),tr=S.task&&trailOf(S.task).reduce((a,x)=>a+x.length,0);
    return JSON.stringify([S.conn,S.device,HA.dev?.area,HA.dev?.minutes,HA.dev?.room,p&&[p.x,p.y,p.angle],HA.map?.path?.[0]?.length,HA.map?.source_updated_at,
      S.objects.map(o=>o.status+o.label),tr,robotZones().length,S.schedules.map(x=>x.id+x.on+x.time),S.task&&[S.task.id,S.task.done,S.task.result],S.events.map(e=>e.status),S.cmd&&S.cmd.state,S.ui.notice,!!HA.foot,HA.error]);
  }
  function commitIfChanged(){
    if(HA.editing||S.ui.modal||cur().name==='roomEdit')return; // never redraw under a drag or a typed name
    const s=signature();if(s!==HA.sig){HA.sig=s;commit()}
  }
  async function refresh(){
    if(HA.fetching)return;HA.fetching=true;
    try{
      const snap=await api('state');HA.error='';HA.bridgeSeen=true;apply(snap);
      if(!snap.reader)HA.error='Install the roborock_obstacles reader in Home Assistant to see the map, objects and robot position.';
      checkPending();processRetries();
      if(Date.now()-HA.lastMap>(HA.foot&&S.task&&!S.task.done?20000:60000))loadMap(); // at most every 20 s, even with no outline yet
    }catch(e){
      // no bridge behind this page at all (e.g. GitHub Pages): use the simulation instead
      if(e.status===404&&!HA.bridgeSeen){location.replace(location.pathname+'?demo=1');return}
      goOffline(e.message);
      if(/token/i.test(e.message)&&!HA.prompted&&!S.onboarding){HA.prompted=true;A.haConnect()}
    }finally{HA.fetching=false;persist();commitIfChanged()}
  }

  /* ---------- derived values ---------- */
  /* the robot's area and time counters for this cleaning, or null while they still show the previous one */
  function liveDev(t){
    if(!t||!HA.dev)return null;
    if(t.done||t.fresh||t.areaBase===undefined)return HA.dev;
    if(HA.dev.minutes!==t.minBase||HA.dev.area!==t.areaBase){t.fresh=true;return HA.dev}
    return null;
  }
  function taskPct(t){
    if(t&&t.kind&&t.kind!=='home')return null; // a full-home estimate means nothing for one room
    const area=t&&!t.done?liveDev(t)?.area:t?.area;
    return HA.refArea&&area!=null?Math.min(100,Math.round(area/HA.refArea*100)):null;
  }
  const area=()=>{const t=S.task;const a=t&&t.done?t.area:t?liveDev(t)?.area:HA.dev?.area;return a==null?'—':Math.round(a*10)/10};
  function statusText(){
    if(S.conn!=='connected')return 'Status can’t be confirmed right now';
    const d=dev(),room=HA.dev?.room;
    if(d.status==='cleaning'){
      if(HA.spotEv){const ev=findEvent(HA.spotEv);return 'Going back to '+(ZONES[ev?.zone]?.name||'the spot').toLowerCase()}
      const here=room||M().roomAt(HA.rooms,robotPose())?.name;
      return here?'Cleaning the '+here.toLowerCase():'Cleaning';
    }
    if(d.status==='returning')return 'Returning to the dock';
    if(d.status==='paused')return S.waitEv?'Waiting for your choice':'Paused';
    if(d.status==='error')return 'Robot needs help';
    if(d.status==='idle')return 'Stopped, off the dock';
    return HA.dev?.charging?'Docked and charging':'Docked and ready';
  }

  /* ---------- map: the real map, drawn in the original layer order ---------- */
  function mapView(){
    const f=HA.foot,pad=24,bb={x0:f.bbox.x0-pad,y0:f.bbox.y0-pad,x1:f.bbox.x1+pad,y1:f.bbox.y1+pad};
    return Object.assign(M().view(bb),{bb});
  }
  /* mm box → rectangle in map view units */
  function viewRect(box,v){
    const P=mm=>{const p=HA.tf(mm);return {x:v.x(p),y:v.y(p)}},a=P({x:box[0],y:box[1]}),b=P({x:box[2],y:box[3]});
    return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)};
  }
  /* Grid cells (i,j) of CELL_MM the robot's path passed through. */
  let cellCache={key:'',cells:new Set()};
  function pathCells(path){
    const key=path.length+':'+path.map(s=>s.length).join(',')+':'+(path[0]?.[0]||'');
    if(cellCache.key===key)return cellCache.cells;
    const out=new Set();
    for(const seg of path){if(seg.length===1)out.add(Math.floor(seg[0][0]/CELL_MM)+','+Math.floor(seg[0][1]/CELL_MM));for(let i=1;i<seg.length;i++){
      const [x0,y0]=seg[i-1],[x1,y1]=seg[i],n=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)/100));
      for(let t=0;t<=n;t++)out.add(Math.floor((x0+(x1-x0)*t/n)/CELL_MM)+','+Math.floor((y0+(y1-y0)*t/n)/CELL_MM));
    }}
    cellCache={key,cells:out};return out;
  }
  /* The 2 x 2 block of cells nearest a point, so spots line up with the grid. */
  function spotCells(mm){
    const i0=Math.round(mm.x/CELL_MM)-SPOT_CELLS/2,j0=Math.round(mm.y/CELL_MM)-SPOT_CELLS/2,keys=[];
    for(let i=i0;i<i0+SPOT_CELLS;i++)for(let j=j0;j<j0+SPOT_CELLS;j++)keys.push(i+','+j);
    return {keys,box:[i0*CELL_MM,j0*CELL_MM,(i0+SPOT_CELLS)*CELL_MM,(j0+SPOT_CELLS)*CELL_MM]};
  }
  /* Cell states for a map: cleaned where the real path passed; event spots and no-go zones take their state. */
  function cellStates(o){
    const hist=o.cells&&o.cells.__task?S.history.find(h=>h.id===o.cells.__task):null;
    let path=[];
    if(hist)path=hist.snap.path||[];
    else if(!o.cells&&S.task)path=!S.task.done||S.task.spot?(mapFresh(S.task)?M().simplifyPath(HA.map?.path):[]).concat(trailOf(S.task)):(S.task.path||[]);
    const cells=new Map();
    pathCells(path).forEach(c=>cells.set(c,'cleaned'));
    if(path.length&&!o.noEvents)(o.events||visibleEvents()).forEach(ev=>{
      if(DEFS[ev.key].type==='decision'||!ZONES[ev.zone]?.mm)return;
      const st=['needsReview','deferred','inProgress'].includes(ev.status)?'review':ev.status==='skipped'?'skipped':ev.status==='resolved'?'cleaned':null;
      if(st)spotCells(ZONES[ev.zone].mm).keys.forEach(c=>cells.set(c,st));
    });
    S.nogo.forEach(z=>{if(hasZone(z))M().boxCells(zoneBox(z),CELL_MM).forEach(c=>cells.set(c,'nogo'))});
    return cells;
  }
  function liveMap(o={}){
    if(!HA.foot||!HA.tf)return `<div class="calm">${ic('map',20)}<span>${esc(HA.error||'Waiting for the robot’s map from Home Assistant…')}</span></div>`;
    const v=mapView();HA.view=v;
    const P=mm=>{const p=mm&&HA.tf(mm);return p?{x:v.x(p),y:v.y(p)}:null};
    const rect=(x0,y0,x1,y1)=>{const a=P({x:x0,y:y0}),b=P({x:x1,y:y1});return a&&b?{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)}:null};
    const spot=mm=>{const b=spotCells(mm).box;return rect(b[0],b[1],b[2],b[3])};
    const showLive=!o.cells;
    let s=`<svg class="map ${o.dim?'dim':''} ${o.edit?'ha-editing':''} ${o.align?'ha-aligning':''}" viewBox="-8 -8 ${v.w+16} ${v.h+16}" role="img" aria-label="${esc(o.label||'Robot map of the home')}">`;
    // 1 mapped floor (the robot's own map; no invented rooms or furniture)
    const fx=`translate(${v.x({x:0,y:0})} ${v.y({x:0,y:0})}) scale(${v.s})`;
    s+=`<g filter="url(#soft)"><path class="room ha-floor ${o.sel?(o.sel.length?'sel':'dull'):''}" transform="${fx}" d="${HA.foot.d}"/></g>`;
    const wall=`<path class="ha-wall" transform="${fx}" d="${HA.foot.edge}"/>`;
    // 1b rooms drawn in this app, clipped to the mapped floor, coloured like the demo's rooms
    const set=o.setup,edit=o.edit;
    s+=`<clipPath id="ha-floor-clip"><path transform="${fx}" d="${HA.foot.d}"/></clipPath><g clip-path="url(#ha-floor-clip)">`;
    if(set&&set.kind==='home')s+=`<path class="room sel" transform="${fx}" d="${HA.foot.d}"/>`;
    HA.rooms.forEach((rm,i)=>{
      const cls=set?(set.kind==='rooms'?(set.rooms.includes(rm.id)?'sel':'dull'):set.kind==='home'?'sel':'dull'):edit&&edit.id===rm.id?'dull':'';
      rm.parts.forEach(b=>{const q=viewRect(b,v);s+=`<rect class="room r-${ROOM_COLORS[rm.color%ROOM_COLORS.length]} ${cls}" x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}"/>`});
    });
    s+='</g>';
    // 2 cells, as in the demo
    const cells=cellStates(o);
    cells.forEach((st,c)=>{const [i,j]=c.split(',').map(Number),r=rect(i*CELL_MM,j*CELL_MM,(i+1)*CELL_MM,(j+1)*CELL_MM);
      if(r)s+=`<rect class="cell ${st}" x="${(r.x+.4).toFixed(1)}" y="${(r.y+.4).toFixed(1)}" width="${(r.w-.8).toFixed(1)}" height="${(r.h-.8).toFixed(1)}" rx="1.5"/>`});
    // 3 no-go zones set on the robot
    (HA.map?.no_go_areas||[]).forEach(a=>{const q=[0,2,4,6].map(i=>P({x:a[i],y:a[i+1]}));if(q.every(Boolean))s+=`<polygon class="cell nogo" points="${q.map(p=>p.x+','+p.y).join(' ')}"><title>No-go zone set on the robot</title></polygon>`});
    s+=wall;
    if(!o.mini)HA.rooms.forEach(rm=>{if(edit&&edit.id===rm.id)return;const b=rm.parts.reduce((m,x)=>(x[2]-x[0])*(x[3]-x[1])>(m[2]-m[0])*(m[3]-m[1])?x:m),q=viewRect(b,v);
      s+=`<text class="lbl" x="${(q.x+q.w/2).toFixed(1)}" y="${(q.y+q.h/2+3).toFixed(1)}" text-anchor="middle">${esc(rm.name)}</text>`});
    if(o.roomTap)HA.rooms.forEach(rm=>rm.parts.forEach(b=>{const q=viewRect(b,v);s+=`<rect class="roomtap" data-a="toggleRoom" data-v="${rm.id}" x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}"><title>${esc(rm.name)}</title></rect>`}));
    if(set&&set.kind==='zone'&&set.zone)set.zone.forEach(b=>{const q=viewRect(b,v);s+=`<rect class="zone hl" x="${q.x-2}" y="${q.y-2}" width="${q.w+4}" height="${q.h+4}" rx="6" style="stroke:var(--primary);fill:var(--clean)"/>`});
    if(edit){
      edit.parts.forEach((b,i)=>{const q=viewRect(b,v);s+=`<rect class="${edit.type==='nogo'?'cell nogo':'ha-part'}" x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" rx="2"/><text class="lbl" x="${q.x+4}" y="${q.y+11}">${i+1}</text>`});
      s+=`<rect id="ha-draft" class="ha-draft" x="0" y="0" width="0" height="0" rx="2" style="display:none"/>`;
    }
    if(o.align&&HA.alignDraft){const q=P(HA.alignDraft.a.map);if(q)s+=`<g transform="translate(${q.x},${q.y})"><circle r="6" fill="none" stroke="var(--primary)" stroke-width="2"/><path d="M-9 0h18M0-9v18" stroke="var(--primary)" stroke-width="1.5"/></g>`}
    // 4 study events: spot outline and status marker, as in the demo
    if(!o.noEvents)(o.events||visibleEvents()).forEach(ev=>{
      const d=DEFS[ev.key];if(d.type==='decision')return;
      const r=ZONES[ev.zone]?.mm&&spot(ZONES[ev.zone].mm);if(!r)return;
      const tap=o.mini||ev.archived?'':`data-a="openEvent" data-v="${ev.id}"`;
      s+=`<rect class="zone ${ev.status} ${o.highlight===ev.id?'hl':''}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" ${tap}><title>${esc(d.title)}</title></rect>`;
      if(!o.mini){
        const col=ev.status==='resolved'?'var(--ok)':ev.status==='skipped'?'var(--skip)':ev.status==='inProgress'?'var(--primary)':ev.problem?'var(--stop)':'var(--warn-line)';
        const glyph=ev.status==='resolved'?'<path d="M-3.5 0l2.3 2.3L3.8-2.8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>':ev.status==='skipped'?'<path d="M-3.5 0h7" stroke="#fff" stroke-width="2" stroke-linecap="round"/>':'<path d="M0-4v4.5M0 3.3v.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/>';
        s+=`<g class="marker" ${tap} transform="translate(${r.x+r.w},${r.y})"><circle r="9.5" fill="${col}" stroke="var(--surface)" stroke-width="2.5" filter="url(#soft)"/>${glyph}</g>`;
      }
    });
    // 5 objects from the robot's map, one id shared by marker, list and review sheet
    if(!o.noEvents&&showLive)S.objects.forEach(ob=>{
      const p=P(ob.mm);if(!p)return;const sz=o.mini?8:10.5;
      const ring=ob.status==='pending'||ob.status==='ignored'?'stroke="var(--warn-line)" stroke-width="2" stroke-dasharray="3 2"':ob.status==='auto'?'stroke="var(--primary)" stroke-width="1.6"':'stroke="var(--ok)" stroke-width="1.8"';
      const badge=o.mini?'':ob.status==='pending'?`<circle cx="8" cy="-8" r="5.5" fill="var(--warn-line)"/><text x="8" y="-5.3" text-anchor="middle" font-size="8" font-weight="800" fill="#fff" font-family="Manrope">?</text>`:(ob.status==='confirmed'||ob.status==='corrected')?`<circle cx="8" cy="-8" r="5" fill="var(--ok)"/><path d="M5.6-8l1.7 1.7 3-3.2" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>`:'';
      s+=`<g class="obj" ${o.mini?'':`data-a="openObj" data-v="${esc(ob.id)}"`} transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})"><circle r="${sz}" fill="var(--surface)" ${ring} filter="url(#soft)"/><text y="${o.mini?3:4}" text-anchor="middle" font-size="${o.mini?9:12}">${OBJ[ob.label].e}</text>${badge}<title>${esc(OBJ[ob.label].n)}</title></g>`;
    });
    // 6 dock, path line and robot
    const dock=P(HA.map?.charger);
    if(dock)s+=`<g transform="translate(${dock.x},${dock.y})"><rect x="2" y="-10" width="9" height="20" rx="3" fill="var(--surface)" filter="url(#soft)"/><path d="M7.5-4 5 1h3l-1.5 4" stroke="var(--ok)" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    const rb=robotPose(),rp=P(rb);
    if(o.robot!==false&&showLive&&rp){
      const heading=Number.isFinite(rb.angle)?90-rb.angle:0;
      s+=`<g class="robot" style="transform:translate(${rp.x.toFixed(1)}px,${rp.y.toFixed(1)}px) rotate(${heading}deg)"><circle class="body" r="9"/><circle r="4" fill="none" stroke="#C3CAD9" stroke-width="1.2"/><circle class="eye" r="1.8" cy="-5.6"/></g>`;
    }
    return s+'</svg>';
  }
  /* ---------- 3D: the demo's three.js scene, built from the real map ---------- */
  function to3D(mm){
    const f=HA.foot,p=mm&&HA.tf&&HA.ppm?HA.tf(mm):null;if(!f||!p)return null;
    const U=1/(CELL_MM*HA.ppm); // one 3D unit = one 0.5 m cell, as in the demo
    return {x:(p.x-(f.bbox.x0+f.bbox.x1)/2)*U,z:(p.y-(f.bbox.y0+f.bbox.y1)/2)*U};
  }
  function live3D(){
    const f=HA.foot3,key=f?f.runs.length+':'+f.segs.length+':'+f.bbox.x0+':'+f.bbox.y0:'';
    if(T3.built&&T3.key===key)return true;
    if(typeof THREE==='undefined'||!f||!HA.foot||!HA.tf||!HA.ppm)return false;
    if(T3.built){T3.R.dispose();T3.R.domElement.remove();T3.built=false}
    const U=1/(CELL_MM*HA.ppm),cx=(HA.foot.bbox.x0+HA.foot.bbox.x1)/2,cz=(HA.foot.bbox.y0+HA.foot.bbox.y1)/2; // same centre as to3D()
    const W=(f.bbox.x1-f.bbox.x0)*U,D=(f.bbox.y1-f.bbox.y0)*U,size=Math.max(W,D),half=size/2+2;
    const R3=new THREE.WebGLRenderer({antialias:true,alpha:true});R3.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    R3.shadowMap.enabled=true;R3.shadowMap.type=THREE.PCFSoftShadowMap;
    const sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(34,1,1,500);
    sc.add(new THREE.HemisphereLight(0xffffff,0xb9c3dd,.75));
    const sun=new THREE.DirectionalLight(0xffffff,.75);sun.position.set(-size*.4,size,-size*.12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera,{left:-half,right:half,top:half,bottom:-half,near:1,far:size*3});sun.shadow.bias=-.0015;sc.add(sun);
    const root=new THREE.Group();sc.add(root);
    const mat=(c,o={})=>new THREE.MeshStandardMaterial(Object.assign({color:new THREE.Color(c),roughness:.85,metalness:0},o));
    const box=(w,h,d,x,y,z,m)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);b.position.set(x,y,z);b.castShadow=true;b.receiveShadow=true;root.add(b);return b};
    const base=box(W+1.5,.25,D+1.5,0,-.13,0,mat(cssv('--plan')));base.castShadow=false;
    // floor: the mapped area, one mesh
    const fp=[],fn=[],fi=[];
    f.runs.forEach(([x,y,w])=>{const x0=(x-cx)*U,x1=(x+w-cx)*U,z0=(y-cz)*U,z1=(y+f.step-cz)*U,n=fp.length/3;
      fp.push(x0,0,z0,x1,0,z0,x1,0,z1,x0,0,z1);fn.push(0,1,0,0,1,0,0,1,0,0,1,0);fi.push(n,n+2,n+1,n,n+3,n+2)});
    const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute(fp,3));fg.setAttribute('normal',new THREE.Float32BufferAttribute(fn,3));fg.setIndex(fi);
    const floor=new THREE.Mesh(fg,mat(cssv('--r-hall'),{side:THREE.DoubleSide}));floor.receiveShadow=true;root.add(floor);
    // walls along the edge of the mapped area, same height and thickness as the demo, merged into one mesh
    const WH=.8,WT=.14,wp=[],wn=[];
    f.segs.forEach(([x1,y1,x2,y2])=>{const h=y1===y2,len=(h?x2-x1:y2-y1)*U;
      const g=new THREE.BoxGeometry(h?len+WT:WT,WH,h?WT:len+WT).toNonIndexed();g.translate(((x1+x2)/2-cx)*U,WH/2,((y1+y2)/2-cz)*U);
      const P=g.attributes.position.array,N=g.attributes.normal.array;for(let i=0;i<P.length;i++){wp.push(P[i]);wn.push(N[i])}g.dispose()});
    const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(wp,3));wg.setAttribute('normal',new THREE.Float32BufferAttribute(wn,3));
    const walls=new THREE.Mesh(wg,mat('#ffffff',{roughness:.6}));walls.castShadow=true;walls.receiveShadow=true;root.add(walls);
    // robot no-go zones
    robotZones().forEach(a=>{const b=bbox(a),p=to3D({x:b[0],y:b[3]}),q=to3D({x:b[2],y:b[1]});if(!p||!q)return;
      const m=new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(q.x-p.x),Math.abs(q.z-p.z)),new THREE.MeshBasicMaterial({color:0xD2433A,transparent:true,opacity:.35,depthWrite:false}));
      m.rotation.x=-Math.PI/2;m.position.set((p.x+q.x)/2,.01,(p.z+q.z)/2);root.add(m)});
    const dock=to3D(HA.map?.charger);
    if(dock){box(.35,.5,.9,dock.x,.25,dock.z,mat('#ffffff'))}
    // robot: the demo's model
    const rb=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.15,40),mat('#FAFBFD',{roughness:.35}));body.position.y=.09;body.castShadow=true;rb.add(body);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.42,.02,8,40),mat('#AAB3C6'));ring.rotation.x=Math.PI/2;ring.position.y=.09;rb.add(ring);
    const lid=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.08,24),mat('#E8EBF2',{roughness:.3}));lid.position.set(0,.2,.1);lid.castShadow=true;rb.add(lid);
    const eye=new THREE.Mesh(new THREE.BoxGeometry(.3,.05,.04),mat(cssv('--primary'),{emissive:new THREE.Color(cssv('--primary')),emissiveIntensity:.5}));eye.position.set(0,.12,-.41);rb.add(eye);
    rb.visible=!!robotPose();root.add(rb);
    Object.assign(T3,{robot:rb,root,R:R3,sc,cam,built:true,key,cellGeo:new THREE.PlaneGeometry(.94,.94),cells:[],markers:[],
      dist:Math.max(16,size*2.1),maxDist:Math.max(40,size*3.5)});
    // controls, as in the demo
    const el=R3.domElement;let drag=null,pinch=null;
    el.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,az:T3.az,el:T3.el,moved:0};el.setPointerCapture(e.pointerId)});
    el.addEventListener('pointermove',e=>{if(!drag||pinch)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved=Math.max(drag.moved,Math.abs(dx)+Math.abs(dy));T3.az=drag.az-dx*.008;T3.el=Math.max(.32,Math.min(1.38,drag.el+dy*.006))});
    el.addEventListener('pointerup',e=>{if(drag&&drag.moved<6)pick3D(e);drag=null});
    el.addEventListener('wheel',e=>{e.preventDefault();T3.dist=Math.max(8,Math.min(T3.maxDist,T3.dist+e.deltaY*.03))},{passive:false});
    el.addEventListener('touchstart',e=>{if(e.touches.length===2){pinch={d:Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY),dist:T3.dist};drag=null}},{passive:true});
    el.addEventListener('touchmove',e=>{if(pinch&&e.touches.length===2){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);T3.dist=Math.max(8,Math.min(T3.maxDist,pinch.dist*pinch.d/d))}},{passive:true});
    el.addEventListener('touchend',()=>{pinch=null},{passive:true});
    return true;
  }
  function liveSync3D(full){
    if(!T3.built||!full)return;
    T3.markers.concat(T3.cells).forEach(m=>{T3.root.remove(m);if(m.material.map)m.material.map.dispose();m.material.dispose();if(m.geometry&&m.geometry!==T3.cellGeo&&!m.isSprite)m.geometry.dispose()});
    T3.markers=[];T3.cells=[];T3.robot.visible=!!robotPose();
    HA.rooms.forEach(rm=>{
      rm.parts.forEach(b=>{const p=to3D({x:b[0],y:b[3]}),q=to3D({x:b[2],y:b[1]});if(!p||!q)return;
        const m=new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(q.x-p.x),Math.abs(q.z-p.z)),new THREE.MeshStandardMaterial({color:new THREE.Color(cssv('--r-'+ROOM_COLORS[rm.color%ROOM_COLORS.length])).offsetHSL(0,.3,-.08).multiplyScalar(.72),roughness:.85,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
        m.rotation.x=-Math.PI/2;m.position.set((p.x+q.x)/2,.006,(p.z+q.z)/2);m.receiveShadow=true;T3.root.add(m);T3.cells.push(m)});
      const b=rm.parts[0],c=to3D({x:(b[0]+b[2])/2,y:(b[1]+b[3])/2});if(!c)return;
      const t=textSprite(rm.name);t.scale.set(3.6,.9,1);t.position.set(c.x,1.25,c.z);T3.root.add(t);T3.cells.push(t);
    });
    const col={cleaned:[cssv('--primary'),.28],review:['#F2A93B',.55],skipped:['#9AA1B2',.5],nogo:['#D2433A',.45]};
    cellStates({}).forEach((st,c)=>{const [i,j]=c.split(',').map(Number),p=to3D({x:(i+.5)*CELL_MM,y:(j+.5)*CELL_MM}),v=col[st];if(!p||!v)return;
      const m=new THREE.Mesh(T3.cellGeo,new THREE.MeshBasicMaterial({transparent:true,opacity:v[1],depthWrite:false,color:new THREE.Color(v[0])}));
      m.rotation.x=-Math.PI/2;m.position.set(p.x,.012,p.z);m.renderOrder=1;T3.root.add(m);T3.cells.push(m)});
    S.objects.forEach(o=>{const p=to3D(o.mm);if(!p)return;
      const sp=emojiSprite(OBJ[o.label].e,o.status==='pending'?'#F2A93B':o.status==='auto'?cssv('--primary'):'#17855A',o.status==='pending'?'?':o.status==='auto'?null:'ok');
      sp.scale.set(.85,.85,1);sp.position.set(p.x,.75,p.z);sp.userData={obj:o.id};T3.root.add(sp);T3.markers.push(sp)});
    visibleEvents().forEach(ev=>{if(DEFS[ev.key].type==='decision'||!ZONES[ev.zone]?.mm)return;const b=spotCells(ZONES[ev.zone].mm).box,p=to3D({x:(b[0]+b[2])/2,y:(b[1]+b[3])/2});if(!p)return;
      const sp=emojiSprite(ev.status==='resolved'?'✓':ev.status==='skipped'?'–':'!',ev.status==='resolved'?'#17855A':ev.status==='skipped'?'#9AA1B2':'#F2A93B',null);
      sp.scale.set(.8,.8,1);sp.position.set(p.x,1.25,p.z);sp.userData={ev:ev.id};T3.root.add(sp);T3.markers.push(sp)});
  }
  /* ---------- screens: rooms and zones ---------- */
  function scrRooms(){
    const sw=rm=>`<span class="ico" style="background:var(--r-${ROOM_COLORS[rm.color%ROOM_COLORS.length]})">${ic('home',20)}</span>`;
    let h=topbar('Rooms and zones')+`<p class="small muted" style="margin:0 4px 12px">Draw on the robot’s map. Rooms let you clean one part of the home and show where the robot is. Kept in this app; the robot’s own map isn’t changed.</p>`;
    h+=`<div class="map-wrap">${liveMap({robot:false,noEvents:true})}</div>`;
    h+=`<div class="sec-h">Rooms<small>${HA.rooms.length}</small></div>`;
    h+=HA.rooms.map(rm=>`<button class="item" data-a="haEditArea" data-v="room|${rm.id}">${sw(rm)}<span class="body"><span class="t">${esc(rm.name)}</span><span class="s">${boxArea(rm.parts)} m² · ${rm.parts.length} part${rm.parts.length>1?'s':''}</span></span>${ic('chev',18)}</button>`).join('');
    h+=`<button class="btn soft block" style="margin-top:8px" data-a="haEditArea" data-v="room|">Add a room</button>`;
    h+=`<div class="sec-h">Saved zones<small>${HA.savedZones.length}</small></div>`;
    h+=HA.savedZones.map(z=>`<button class="item" data-a="haEditArea" data-v="zone|${z.id}"><span class="ico blue">${ic('map',20)}</span><span class="body"><span class="t">${esc(z.name)}</span><span class="s">${boxArea(z.parts)} m²</span></span>${ic('chev',18)}</button>`).join('');
    h+=`<button class="btn soft block" style="margin-top:8px" data-a="haEditArea" data-v="zone|">Add a zone</button>`;
    h+=`<div class="sec-h">No-go zones<small>${S.nogo.length}</small></div><p class="small muted" style="margin:-4px 4px 8px">Saved on the robot. Remove them in Saved preferences.</p>`;
    h+=`<button class="btn soft block" data-a="haEditArea" data-v="nogo|">Draw a no-go zone</button>`;
    h+=`<div class="sec-h">Robot position</div><p class="small muted" style="margin:-4px 4px 8px">Robot not where it really is on the map? Line it up in two taps.</p><button class="btn soft block" data-a="go" data-v="align">Align map with the robot</button>`;
    return h;
  }
  function scrRoomEdit(){
    const e=S.ui.edit;if(!e)return topbar('');
    const what={room:'room',zone:'zone',nogo:'no-go zone'}[e.type],max=e.type==='zone'?1:5;
    let h=topbar((e.id?'Edit ':'New ')+what);
    h+=`<p class="small muted" style="margin:0 4px 10px">Drag on the map to mark the ${what}. It snaps to the 0.5 m grid.${max>1?' Add up to 5 rectangles for an L-shaped area.':''}</p>`;
    h+=`<div class="map-wrap">${liveMap({robot:false,noEvents:true,edit:e})}</div>`;
    h+=`<div class="btn-row" style="margin-top:10px"><span class="small muted" style="flex:1;align-self:center">${e.parts.length?boxArea(e.parts)+' m² · '+e.parts.length+' part'+(e.parts.length>1?'s':''):'Nothing drawn yet'}</span><button class="btn plain" data-a="haUndoPart" ${e.parts.length?'':'disabled'}>Undo</button></div>`;
    if(e.type!=='nogo')h+=`<label class="field" style="margin-top:12px"><span>Name</span><input id="ha-area-name" data-ha-name maxlength="24" placeholder="${e.type==='room'?'e.g. Kitchen':'e.g. Around the sofa'}" value="${esc(e.name||'')}" autocomplete="off"></label>`;
    else h+=`<p class="small muted" style="margin:12px 4px 0">Saved on the robot together with its other no-go zones. Virtual walls and no-mop zones set in the Roborock app may be reset.</p>`;
    h+=`<button class="btn primary block" style="margin-top:16px" data-a="haSaveArea">${e.type==='nogo'?'Save on the robot':'Save'}</button>`;
    if(e.id)h+=`<button class="btn danger block" style="margin-top:8px" data-a="haDeleteArea">Delete ${what}</button>`;
    return h;
  }
  /* Two taps line the robot's live coordinates up with the saved map. */
  function scrAlign(){
    const d=HA.alignDraft,raw=HA.poseRaw,al=HA.align;
    let h=topbar('Align map with the robot');
    h+=`<p class="small muted" style="margin:0 4px 12px">The app lines the robot up with the map by itself, from points on its way while it cleans. If it still looks wrong (for example after it failed to find its position), tap its real position twice to set it by hand.</p>`;
    if(!raw)h+=`<div class="calm">${ic('robot',20)}<span>Waiting for the robot’s live position…</span></div>`;
    h+=`<div class="map-wrap">${liveMap({noEvents:true,align:true})}</div>`;
    const moved=d&&raw?Math.hypot(raw.x-d.a.live.x,raw.y-d.a.live.y)/1000:0;
    const byHand=!!d||!al?.auto||S.ui.alignByHand; // with an automatic alignment, setting it by hand is a choice, not the first step
    if(!byHand)h+=`<div class="card" style="margin-top:12px"><b>Lined up automatically</b><p class="small" style="margin-top:4px">If the robot on the map is where it really is, there’s nothing to do.</p><div class="btn-row"><button class="btn plain" data-a="haAlignByHand">It’s wrong, set it by hand</button></div></div>`;
    else if(!d)h+=`<div class="card" style="margin-top:12px"><b>Step 1 of 2</b><p class="small" style="margin-top:4px">Tap where the robot really is right now. On the dock is easiest.</p></div>`;
    else h+=`<div class="card" style="margin-top:12px"><b>Step 2 of 2</b><p class="small" style="margin-top:4px">Let the robot drive at least 2 m (it has moved ${moved.toFixed(1)} m), then tap where it really is.</p>
      <div class="btn-row"><button class="btn plain" data-a="haAlignShift">Use a shift only</button><button class="btn plain" data-a="haAlignRestart">Start over</button></div></div>`;
    const turn=a=>Math.round(Math.atan2(a.s,a.c)*180/Math.PI);
    h+=`<div class="sec-h">Current alignment</div><p class="small muted" style="margin:0 4px">${al?.auto?`Automatic: ${al.how==='turn'?`turned ${turn(al.al)}° and shifted ${Math.round(Math.hypot(al.al.tx,al.al.ty)/10)} cm, from ${al.n} points (within about ${Math.max(1,Math.round((al.al.rms||0)/10))} cm)`:`shifted ${Math.round(Math.hypot(al.al.tx,al.al.ty)/10)} cm from ${al.n} point${al.n>1?'s':''}; it turns it too once the robot has driven 2 m`}. It keeps refining as the robot drives.`:al?'By hand: shifted'+(al.b?' and turned '+turn(al.al)+'°':'')+'. Set at '+hhmm(al.at||0)+'. Remove it to go back to automatic.':HA.alignChecked?`Checked against ${HA.alignChecked.n} points on its way: the robot’s position and the map already agree, so nothing needs correcting.`:'None yet. It checks by itself a few minutes into the next cleaning. On the dock, the robot is drawn where its own map puts it.'}</p>`;
    if(al?.manual)h+=`<button class="btn danger block" style="margin-top:12px" data-a="haAlignReset">Remove and go back to automatic</button>`;
    return h;
  }
  function attachAlign(){
    const svg=document.querySelector('.scroll svg.map.ha-aligning');if(!svg||svg.dataset.bound)return;svg.dataset.bound='1';
    const inv=M().inverse(HA.map?.calibration);if(!inv)return;
    svg.addEventListener('click',ev=>{
      if(HA.align?.auto&&!HA.alignDraft&&!S.ui.alignByHand)return; // taps only set points once they chose to do it by hand
      const raw=HA.poseRaw;if(!raw){flash('Waiting for the robot’s live position.');return}
      const pt=svg.createSVGPoint();pt.x=ev.clientX;pt.y=ev.clientY;const p=pt.matrixTransform(svg.getScreenCTM().inverse()),v=HA.view;
      const mm=inv({x:p.x/v.s+v.bb.x0,y:p.y/v.s+v.bb.y0}),pair={live:{x:raw.x,y:raw.y},map:{x:mm.x,y:mm.y}};
      const d=HA.alignDraft;
      if(!d){HA.alignDraft={a:pair};commit();return}
      if(Math.hypot(raw.x-d.a.live.x,raw.y-d.a.live.y)<2000){flash('Let the robot move at least 2 m first.');return}
      saveAlign(d.a,pair);
    });
  }
  function saveAlign(a,b){
    HA.align={a,b:b||null,al:M().alignFrom(a,b),manual:true,calKey:calKey(),at:S.clock};HA.alignDraft=null;S.ui.alignByHand=false;
    if(HA.poseRaw){const q=M().toMap(HA.align.al,HA.poseRaw);HA.pose={...HA.pose,x:q.x,y:q.y}}
    persist();HA.sig='';commit();flash(b?'Map aligned':'Map shifted. Add a second point later to fix turning.');
  }

  /* Drag on the editor's map: screen → view units → map pixels → robot mm, snapped to the grid. */
  function attachDrawing(){
    const svg=document.querySelector('.scroll svg.map.ha-editing'),e=S.ui.edit;if(!svg||!e||svg.dataset.bound)return;
    svg.dataset.bound='1';
    const inv=M().inverse(HA.map?.calibration),draft=svg.querySelector('#ha-draft');if(!inv)return;
    const toMm=ev=>{const pt=svg.createSVGPoint();pt.x=ev.clientX;pt.y=ev.clientY;const p=pt.matrixTransform(svg.getScreenCTM().inverse()),v=HA.view;
      return inv({x:p.x/v.s+v.bb.x0,y:p.y/v.s+v.bb.y0})};
    let start=null;
    svg.addEventListener('pointerdown',ev=>{if(e.parts.length>=(e.type==='zone'?1:5)&&e.type!=='zone')return;ev.preventDefault();start=toMm(ev);svg.setPointerCapture(ev.pointerId)});
    svg.addEventListener('pointermove',ev=>{if(!start)return;const q=viewRect(M().snapBox(start,toMm(ev),CELL_MM),HA.view);
      Object.assign(draft.style,{display:''});draft.setAttribute('x',q.x);draft.setAttribute('y',q.y);draft.setAttribute('width',q.w);draft.setAttribute('height',q.h)});
    svg.addEventListener('pointerup',ev=>{if(!start)return;const b=M().snapBox(start,toMm(ev),CELL_MM);start=null;
      if(b[2]-b[0]>15000||b[3]-b[1]>15000){flash('Keep each part under 15 m on a side.');return}
      if(e.type==='zone')e.parts=[b];else e.parts.push(b);commit()});
  }
  function liveLegend(){
    const when=HA.map?.stale?' · saved copy from '+hhmm(secOf(HA.map.source_updated_at))+' (the robot has no map in Home Assistant right now)':HA.map?.source_updated_at?' · updated '+hhmm(secOf(HA.map.source_updated_at)):'';
    return `<div class="legend"><span><i style="background:var(--surface);box-shadow:inset 0 0 0 1.5px var(--primary);border-radius:50%"></i>Robot’s label</span><span><i style="background:var(--surface);box-shadow:inset 0 0 0 1.5px var(--warn-line);border-radius:50%"></i>Not sure</span><span><i style="background:var(--clean)"></i>Cleaned</span><span><i style="background:repeating-linear-gradient(45deg,var(--warn-line) 0 2px,var(--warn-soft) 2px 5px)"></i>Needs review</span><span><i style="background:repeating-linear-gradient(45deg,var(--skip) 0 1.5px,var(--skip-soft) 1.5px 5px)"></i>Skipped</span><span><i style="background:repeating-linear-gradient(-45deg,var(--stop) 0 2px,var(--stop-soft) 2px 5px)"></i>No-go</span><span><i style="background:var(--warn-line);border-radius:50%"></i>Study event</span><span><i style="background:var(--stop);border-radius:50%"></i>Robot problem</span></div><p class="small muted" style="margin:4px 6px 0">Robot map from Home Assistant${when}.${HA.pose&&HA.pose.at?' Robot position live, '+Math.max(0,Math.round(Date.now()/1000-HA.pose.at))+' s ago.':''}</p>`;
  }

  /* ---------- patch the original app ---------- */
  function wrap(name,after){const orig=window[name];window[name]=function(...a){return after(orig.apply(this,a),...a)}}
  function patch(){
    RESULTLABEL.recorded='Robot record';
    AUTOOUT.asRug='Treated as a rug (simulated: the real robot was not sent back).'; // study events never move the robot on their own
    Object.assign(OPTICON,{pResume:'retry',pDock:'home',pLater:'clock',pRetry:'retry',pOk:'check',pAlign:'map',pFinish:'check',pRooms:'home'});
    ROOM.live={id:'live',name:'Robot map',the:'your home'};CELLROOM.live='live';
    Object.assign(OBJ,{unknown:{n:'Unknown object',e:'❔'},waste:{n:'Pet waste',e:'💩'},scale:{n:'Scale',e:'⚖️'}});
    // Event texts without the demo's fictional rooms
    Object.assign(DEFS.cable,{title:'Possible cable on the floor',chip:'Skipped a spot: possible cable',what:'The robot saw something thin on the floor and stopped short of it.',next:'It skipped this spot and is cleaning the rest of the home.'});
    DEFS.cable.remember.avoid={text:'Avoid possible cables',scope:'Everywhere on this map. Other kinds of events still ask.'};
    Object.assign(DEFS.rug,{chip:'Left a patch for now',what:'The robot found a surface it hasn’t mapped before.'});
    Object.assign(DEFS.bed,{title:'Couldn’t get into a tight spot',chip:'Gave up on a tight spot',what:'The robot tried to reach this area 3 times.',why:'Something keeps blocking the way in. It may be a low object on the floor, or the gap may be too tight.',next:'It stopped trying and is finishing the rest of the home.'});
    Object.assign(DEFS.extra,{title:'Extra pass on a dirty spot',chip:'Extra pass on a dirty spot',what:'The robot is going over a dirty spot a second time.'});
    DEFS.extra.remember.skipOnce={text:'Skip extra passes',scope:'Everywhere. The robot still does one normal pass.'};
    DEFS.extra.remember.allow={text:'Always allow extra passes',scope:'Everywhere. It won’t ask or tell you each time.'};
    DEFS.rug.remember.asRug={text:'Treat unclear floors as rug (vacuum only)',scope:'Everywhere on this map. Other kinds of events still ask.'};
    DEFS.rug.remember.asHard={text:'Treat unclear floors as hard floor (vacuum and mop)',scope:'Everywhere on this map. Other kinds of events still ask.'};
    SHORT.cable.q='Cable on the floor?';SHORT.bed.q='Can’t get into this spot';SHORT.extra.q='Extra pass on a dirty spot';

    // Simulation off: the real robot moves, the map is real
    window.stepClean=()=>{};window.stepReturn=()=>{};window.maybeFault=()=>{};window.renderPanel=()=>{};
    window.curRoom=()=>({name:HA.dev?.room||'Robot map',the:HA.dev?.room||'your home'});
    window.statusLine=statusText;
    window.mapSVG=liveMap;window.legend=liveLegend;window.build3D=live3D;window.sync3D=liveSync3D;
    // Extra pass: a real second pass over the spot once the cleaning ends
    window.queueExtra=ev=>{
      if(HA.inFire){ev.outcome='Extra pass (simulated: the real robot was not sent back).';return}
      ev.extraQueued=true;ev.queued=retryTiming(ev)==='after'&&!!(S.task&&!S.task.done);S.sim.queue.unshift({kind:'extra',ev:ev.id});if(!HA.retryQueue.includes(ev.id))HA.retryQueue.push(ev.id)};
    const notice0=window.notice;window.notice=ev=>{notice0(ev);if(ev.problem)clearTimeout(notice.t);notifyEvent(ev)}; // problem banners stay until opened
    window.visibleObjs=()=>S.objects||[];
    window.updateLive=()=>document.querySelectorAll('[data-live]').forEach(el=>{const n=el.dataset.live;if(n==='bar')el.style.width=LIVE.bar();else el.textContent=LIVE[n]()});
    window.pct=cells=>{const v=cells&&cells.__task?S.history.find(h=>h.id===cells.__task)?.snap.pct:taskPct(S.task);return v??0};
    window.computeResult=()=>S.task.endedEarly?'ended':S.task.stoppedEarly?'partial':S.events.some(e=>DEFS[e.key].type!=='decision'&&['needsReview','deferred','skipped','inProgress'].includes(e.status))?'partial':'completed';
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
      const minsNow=t.done?t.minutes:(liveDev(t)?.minutes??(Date.now()-t.startedAt)/60000);
      return {t,cells:S.cells,events:S.events,timeline:S.timeline,m2:area(),rooms:'—',result:t.done?t.result:null,dur:Math.round(minsNow??0),live:true};
    };
    // Home's "last cleaning" tile: a percentage only against a real full-clean reference, otherwise the area
    window.doneTile=()=>{const t=S.task;if(!t)return '—';const p=HA.refArea?taskPct(t):null; // a percentage saved against an old, partial reference no longer counts
     return p!=null?p+'%':t.area!=null?Math.round(t.area*10)/10+' m²':'—'};
    Object.assign(LIVE,{
      clock:()=>hhmm(now()),status:statusText,
      pct:()=>{const p=taskPct(S.task);return p!=null?'≈'+p+'% of a full clean':area()==='—'?'Just started':area()+' m² cleaned'},
      bar:()=>(taskPct(S.task)??0)+'%',
      barText:()=>area()==='—'?'—':area()+' m²',
      elapsed:()=>{const t=S.task;if(!t)return '';const wall=(Date.now()-t.startedAt)/60000,m=t.done?t.minutes:Math.max(liveDev(t)?.minutes??0,wall);/* the robot's counter lags and skips pauses */return Math.round(m||0)+' min elapsed'},
      remain:()=>{const p=taskPct(S.task),m=HA.dev?.minutes;return p&&m&&p<100?'about '+Math.max(1,Math.round(m*(100-p)/p))+' min left (est.)':'time left unknown'},
      battery:()=>{const b=dev().battery;return b==null?'—':b+'%'},
    });

    // Study events take the zone of the event being drawn
    const zoneOf=ev=>{if(ev&&ev.zone&&DEFS[ev.key])DEFS[ev.key].zone=ev.zone};
    window.EXTRA_SCREENS={rooms:scrRooms,roomEdit:scrRoomEdit,align:scrAlign};
    const render0=window.render;window.render=function(){S.events.forEach(zoneOf);const out=render0.apply(this,arguments);if(cur().name==='roomEdit')attachDrawing();if(cur().name==='align')attachAlign();return out};
    const art0=window.eventArt;window.eventArt=key=>{
      if(!key.startsWith('p_'))return art0(key);
      const L='fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
      return `<svg viewBox="0 0 320 170" class="art" role="img" aria-label="${esc(DEFS[key].title)}"><path d="M10 150H310" ${L} opacity=".35"/>
        <g transform="translate(150,132)"><ellipse cx="0" cy="12" rx="34" ry="9" fill="var(--surface)" ${L}/><path d="M-34 0v12M34 0v12" ${L}/><ellipse cx="0" cy="0" rx="34" ry="9" fill="var(--surface)" ${L}/><ellipse cx="8" cy="-5" rx="9" ry="3.4" fill="var(--surface)" ${L}/></g>
        <g transform="translate(196,88)"><circle r="17" fill="var(--stop)"/><path d="M0-8v9M0 6v.5" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g></svg>`;
    };
    const evItem0=window.evItem;window.evItem=ev=>{zoneOf(ev);return evItem0(ev)};
    const scrEvent0=window.scrEvent;
    window.scrEvent=id=>{
      const ev=findEvent(id);zoneOf(ev);let h=scrEvent0(id);
      if(ev&&ev.problem){
        h=h.replace(/<p class="small muted" style="margin:12px 4px 0">No rush\.[^<]*<\/p>/,'');
        if(h.includes('class="choices"'))h=h.replace('<details class="why">','<p class="small muted" style="margin:12px 4px 0">Resume, Try again and Send to dock control the real robot.</p><details class="why">');
        return h;
      }
      if(!ev||!ev.study)return h;
      h=h.replace('<div class="h-screen"',`<div class="mode-note" style="margin-top:12px">${ic('bulb',18)}<span><b>Study scenario.</b> Simulated for this study at the robot’s real position. Not reported by the robot.</span></div><div class="h-screen"`);
      if(ev.queued)h=h.replace('The robot is heading there now.','The robot goes back to this spot when the current cleaning ends.');
      if(h.includes('class="choices"'))h=h.replace('<details class="why">','<p class="small muted" style="margin:12px 4px 0">Retry and pause move the real robot. Other choices are recorded in this app.</p><details class="why">');
      return h;
    };
    window.startRetry=(ev,outcomeText)=>{
      if(HA.inFire){ // the robot "decided" on a study event: show the outcome, don't drive the real robot
        ev.status='resolved';ev.outcome=(outcomeText||'Area cleaned.').replace(/\.$/,'')+' (simulated: the real robot was not sent back).';return}
      if(!ev.zone)ev.zone=DEFS[ev.key].zone; // automatic choices run inside fire(), before fireStudy() stores the spot
      ev.pendingOutcome=outcomeText||null;ev.retryTries=(ev.retryTries||0)+1;
      ev.cleanMode=/rug/i.test(outcomeText||'')?'vacuum':/hard floor/i.test(outcomeText||'')?'vac_and_mop':null;
      const z=ZONES[ev.zone];
      if(!z||!z.mm){ev.status='needsReview';evLog(ev,'robot','This spot has no map position, so the robot can’t be sent there');return}
      ev.status='inProgress';ev.queued=retryTiming(ev)==='after'&&!!(S.task&&!S.task.done);
      if(!HA.retryQueue.includes(ev.id))HA.retryQueue.push(ev.id);
      if(ev.queued)tl('robot','Will go back to '+z.name.toLowerCase()+' after this cleaning',ev.id);

    };
    window.doAction=(ev,act,saveRule)=>{
      if(ev.problem){
        if(!ev.archived)leaveEvent(false);
        const done=(st,text)=>{ev.status=st;ev.outcome=text;evLog(ev,'you',text.replace(/\.$/,''));HA.snooze[ev.key]=Date.now()};
        if(act==='pResume'){
          if(S.conn==='connected'&&['error','paused','idle'].includes(dev().status))return liveCommand('start',{label:'Resume',done:'Cleaning resumed',expect:['cleaning']},()=>done('resolved','You fixed it and the robot carried on.'));
          done('resolved','Marked as fixed.');return commit();
        }
        if(act==='pDock'){stopAll();return liveCommand('return_to_base',{label:'Send to dock',done:'Returning to dock',expect:['returning','docked'],force:true},()=>done('resolved','Sent back to the dock.'))}
        if(act==='pRetry'){HA.expectStart={label:'Entire home',at:Date.now(),kind:'home'};
          return liveCommand('start',{label:'Start cleaning',done:'Cleaning started',expect:['cleaning'],onFail:()=>{HA.expectStart=null}},()=>done('resolved','You started the cleaning again.'))}
        if(act==='pLater'){done('deferred','Left for later.');return commit()}
        if(act==='pAlign'){done('resolved','Opened Align map.');S.ui.stack=[];S.ui.tab='settings';go('align');return}
        if(act==='pRooms'){done('resolved','Opened Rooms and zones.');S.ui.stack=[];S.ui.tab='settings';go('rooms');return}
        if(act==='pFinish'){done('resolved','You finished the cleaning here.');if(S.task&&!S.task.done){S.task.endedEarly=true;finishLiveTask()}return commit()}
        done('resolved','Seen.');return commit();
      }
      if(!ev.archived)leaveEvent(true);
      const snap=snapFor(ev);
      const run=()=>{resetForChange(ev,act);applyAction(ev,act,false);if(saveRule){const r=DEFS[ev.key].remember[act];S.rules=S.rules.filter(x=>x.key!==ev.key);S.rules.push({id:'r'+(++seq),key:ev.key,act,text:r.text,scope:r.scope})}};
      if(act==='pauseCheck')return liveCommand('pause',{label:'Pause',done:'Paused',expect:['paused','idle']},run);
      if(S.ui.retryOnce)ev.retryWhen=S.ui.retryOnce;
      const goesNow=['retry','retryCleared','asRug','asHard','allow'].includes(act)&&(ev.retryWhen||HA.retryWhen)==='now';
      if(S.waitEv===ev.id&&dev().status==='paused'&&!goesNow)return liveCommand('start',{label:'Continue cleaning',done:'Cleaning continues',expect:['cleaning']},run);
      run();
      if(act==='skipOnce'){ev.extraQueued=false;HA.retryQueue=HA.retryQueue.filter(x=>x!==ev.id)}
      if(act==='nogo'){commit();return saveNogo('Save no-go zone on the robot','No-go zone saved on the robot')}
      if(!['retry','retryCleared','asRug','asHard','allow'].includes(act))offerUndo(ev,act,snap); // app-only choices can be undone
      commit();processRetries();
    };
    const delNogo0=A.delNogo;A.delNogo=v=>{if(hasZone(v))HA.removedZones.push(zoneRect(v));delNogo0(v);saveNogo('Remove no-go zone from the robot','No-go zone removed from the robot')};
    const RETRY_ACTS=['retry','retryCleared','asRug','asHard','allow'];
    A.haRetryWhen=v=>{const [id,act,when]=v.split('|');S.ui.modal=null;S.ui.retryOnce=when;try{evAct0(id+'|'+act)}finally{S.ui.retryOnce=null}};
    A.haRetryDefault=v=>{HA.retryWhen=v;persist();commit()};
    const evAct0=A.evAct;A.evAct=v=>{
      const [id,act]=v.split('|'),ev=findEvent(id);
      const asks=RETRY_ACTS.includes(act)&&ev&&!ev.archived&&S.task&&!S.task.done&&(act!=='allow'||(ev.suggest&&ev.status==='needsReview'));
      if(asks){
        const now={label:'Go now',a:'haRetryWhen',v:id+'|'+act+'|now'},after={label:'After this cleaning',a:'haRetryWhen',v:id+'|'+act+'|after'};
        const first=HA.retryWhen==='after'?after:now,second=first===now?after:now;
        S.ui.modal={title:'When should the robot go?',body:'<p><b style="color:var(--ink)">Go now:</b> it leaves the cleaning, does this spot, then starts the cleaning again from the beginning.</p><p><b style="color:var(--ink)">After this cleaning:</b> it finishes first, then comes back to this spot.</p>',
          buttons:[{...first,cls:'primary'},{...second},{label:'Cancel',a:'closeModal'}]};
        return commit();
      }
      evAct0(v);if(v.endsWith('|nogo')&&S.ui.modal){
      S.ui.modal.body+='<p class="small muted">This is saved on the robot. Its other no-go zones are kept. Virtual walls and no-mop zones set in the Roborock app may be reset.</p>';commit()}};

    // Schedules live in Home Assistant as automations that start the robot
    A.toggleSched=v=>{const x=S.schedules.find(y=>y.id===v);if(x)schedCall('schedules/switch',{id:v,on:!x.on},x.on?'Turn schedule off':'Turn schedule on')};
    const inDnd=t=>{if(M().value(HA.snap,'do_not_disturb')!=='on')return null;
      const b=M().value(HA.snap,'do_not_disturb_begin'),e=M().value(HA.snap,'do_not_disturb_end');if(!b||!e)return null;
      const m=x=>+x.slice(0,2)*60+ +x.slice(3,5),v=m(t),bb=m(b),ee=m(e),inside=bb>ee?(v>=bb||v<ee):(v>=bb&&v<ee);
      return inside?b.slice(0,5)+'–'+e.slice(0,5):null};
    A.haSchedBack=()=>schedModal();
    A.haSchedForce=()=>{S.ui.dndOk=true;A.schedSave();S.ui.dndOk=false};
    A.schedSave=()=>{const f=S.ui.sched,t=document.getElementById('sch-time')?.value||f.time;if(!f.days.length)return;
      f.time=t;const dnd=inDnd(t);
      if(dnd&&!S.ui.dndOk){S.ui.modal={title:'Inside Do Not Disturb',body:`<p>The robot’s Do Not Disturb runs ${dnd}. A cleaning at ${t} can still wake people, and during Do Not Disturb the robot won’t resume or empty by itself.</p>`,
        buttons:[{label:'Save anyway',a:'haSchedForce',cls:'primary'},{label:'Change the time',a:'haSchedBack'}]};return commit()}
      schedCall('schedules',{id:f.id==='new'?null:f.id,time:t,days:f.days,on:f.id==='new'?true:f.on!==false},'Save schedule')};
    A.schedDelete=()=>schedCall('schedules/delete',{id:S.ui.sched.id},'Delete schedule');
    const schedModal0=window.schedModal;window.schedModal=()=>{schedModal0();if(!S.ui.modal)return;
      S.ui.modal.body=S.ui.modal.body.replace(/<select id="sch-scope">[\s\S]*?<\/select>/,'<select id="sch-scope"><option selected>Entire home</option></select>')
        +'<p class="small muted" style="margin-top:8px">Saved in Home Assistant. It starts the robot at this time even when this app is closed.</p>';commit()};
    wrap('scrSchedule',h=>h.replace('</div>',`</div><p class="small muted" style="margin:0 4px 12px">${HA.schedError?esc(HA.schedError):HA.schedLoaded?'Saved in Home Assistant. These start the robot even when this app is closed.':'Loading schedules from Home Assistant…'}</p>`));
    A.haMode=v=>{if(v==='demo')switchTo('demo')};

    // Objects: the robot's labels, corrections kept in this app
    window.objStatus=o=>o.status==='ignored'?'Not checked yet (ignored for now)':o.status==='pending'?'Robot couldn’t tell what it is':o.status==='auto'?'Robot’s label':o.status==='corrected'?`You corrected it (robot said ${OBJ[o.orig].n.toLowerCase()})`:'You confirmed it';
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
    A.objSave=()=>{const id=S.ui.objId,o0=S.objects.find(x=>x.id===id);if(o0&&o0.label==='unknown'&&(!S.ui.objSel||S.ui.objSel==='unknown'))return;objSave0();
      const m=HA.objs.find(x=>x.id===id),o=S.objects.find(x=>x.id===id);if(m&&o)Object.assign(m,{label:o.label,status:o.status});persist()};
    window.onObjChange=items=>{items.forEach(o=>{const m=HA.objs.find(x=>x.id===o.id);if(m)m.status=o.status});persist()};
    A.objNone=()=>{const m=HA.objs.find(x=>x.id===S.ui.objId);if(m)Object.assign(m,{dismissed:true,dismissedSnap:HA.objSnap});objNone0();persist()};

    // Screens
    wrap('scrHome',h=>S.ctl.scenario==='none'?h:h.replace('</button></div>',`</button></div><p class="small" style="margin:8px 2px 0;color:var(--warn);font-weight:700">${ic('bulb',14)} Study events on: simulated events can appear during cleanings. <button class="link" data-a="haScenario" data-v="none">Turn off</button></p>`));
    wrap('statusCard',h=>{
      if(dev().status!=='idle'||S.conn!=='connected')return h;
      return h.replace('></span>undefined<','></span>Stopped<').replace('On the dock and ready for the next cleaning.','Off the dock and not cleaning.')
        .replace('<button class="btn primary block" data-a="setup">Start cleaning</button>','<button class="btn primary" data-a="setup">Start cleaning</button><button class="btn plain" data-a="haDock">Send to dock</button>');
    });
    window.scrSetup=()=>{
      const st=S.ui.setup,rooms=HA.rooms,zones=HA.savedZones;
      st.rooms=st.rooms.filter(id=>rooms.some(x=>x.id===id));
      if(st.kind==='rooms'&&!rooms.length||st.kind==='zone'&&!zones.length)st.kind='home';
      if(st.kind==='zone'&&!zones.some(z=>z.id===st.zone))st.zone=zones[0].id;
      const zone=zones.find(z=>z.id===st.zone),parts=setupParts();
      let h=topbar('Start cleaning');
      h+=`<div class="seg" role="tablist">${[['home','Entire home',1],['rooms','Rooms',rooms.length],['zone','Zone',zones.length]].map(([k,l,n])=>`<button class="${st.kind===k?'on':''}" data-a="setupKind" data-v="${k}" ${n?'':'disabled'}>${l}</button>`).join('')}</div>`;
      h+=`<div class="map-wrap" style="margin-top:12px">${liveMap({robot:false,noEvents:true,roomTap:st.kind==='rooms',setup:{kind:st.kind,rooms:st.rooms,zone:st.kind==='zone'&&zone?zone.parts:null}})}</div>`;
      if(!rooms.length&&!zones.length)h+=`<p class="small muted" style="margin:10px 4px">Draw rooms or zones to clean just part of the home. <button class="link" data-a="go" data-v="rooms">Set up rooms</button></p>`;
      if(st.kind==='rooms')h+=`<p class="small muted" style="margin:10px 4px">Tap rooms on the map or below.</p><div class="chips">${rooms.map(x=>`<button class="chip ${st.rooms.includes(x.id)?'on':''}" data-a="toggleRoom" data-v="${x.id}">${esc(x.name)}</button>`).join('')}</div>`;
      if(st.kind==='zone')h+=`<p class="small muted" style="margin:10px 4px">Choose a saved zone.</p><div class="chips">${zones.map(z=>`<button class="chip ${st.zone===z.id?'on':''}" data-a="setupZone" data-v="${z.id}">${esc(z.name)}</button>`).join('')}</div>`;
      const label=setupLabel();
      const nog=S.nogo.length?` No-go zones stay out.`:'';
      h+=`<div class="card" style="margin-top:16px"><p style="font-size:15px;line-height:1.5">The robot will clean <b>${esc(label.toLowerCase()==='entire home'?'the entire home':label||'no rooms yet')}</b>.${nog}</p>`;
      if(parts.length>5)h+=`<p class="small" style="color:var(--stop)">The robot can clean at most 5 rectangles at once. Choose fewer rooms.</p>`;
      const sending=!!(S.cmd&&S.cmd.state==='sending')||!!HA.pending;
      const offline=S.conn!=='connected'; // Home Assistant can't reach the robot: a start would go nowhere
      h+=`<button class="btn primary block" style="margin-top:14px" data-a="startTask" ${(st.kind==='rooms'&&!st.rooms.length)||parts.length>5||sending||offline?'disabled':''}>${sending?'Sending…':'Start'}</button>${offline?`<p class="small" style="margin:10px 2px 0;color:var(--warn)">The robot is offline right now, so it can’t start. Check that it’s on and connected (the Roborock app shows this), then try again.</p>`:''}</div>`;
      return h;
    };
    const setupParts=()=>{const st=S.ui.setup;return st.kind==='rooms'?HA.rooms.filter(x=>st.rooms.includes(x.id)).flatMap(x=>x.parts):st.kind==='zone'?(HA.savedZones.find(z=>z.id===st.zone)?.parts||[]):[]};
    const setupLabel=()=>{const st=S.ui.setup;return st.kind==='rooms'?HA.rooms.filter(x=>st.rooms.includes(x.id)).map(x=>x.name).join(', '):st.kind==='zone'?(HA.savedZones.find(z=>z.id===st.zone)?.name||''):'Entire home'};
    wrap('scrMap',h=>h.replace(/(<div class="sec-h">Objects found<small>\d+<\/small><\/div>)/,'$1<p class="small muted" style="margin:-4px 4px 10px">From the robot’s saved map. Labels you fix are kept in this app.</p>'));
    wrap('scrReport',h=>h.replace('<span>Of the plan</span>','<span>Of a full clean (est.)</span>'));
    wrap('scrRules',h=>{let i=0;return h.replace(/\. Every cleaning\.<\/span>/g,()=>{const z=S.nogo[i++];return '. Every cleaning. '+(onRobot(z)?'Saved on the robot.':'Sent to the robot; waiting for its map to show it.')+'</span>'})});
    wrap('scrActivity',h=>S.task||S.history.length?h:h+`<div class="calm">${ic('robot',20)}<span>No cleanings recorded yet. Cleanings appear here once the robot runs with this app open.</span></div>`);
    wrap('scrSettings',h=>{
      const map=HA.map?.source_updated_at?'Updated '+hhmm(secOf(HA.map.source_updated_at)):'—';
      const running=S.task&&!S.task.done;
      h=h.replace('<div class="sec-h">Notifications</div>','<div class="sec-h">Notifications</div><p class="small muted" style="margin:-4px 4px 8px">Sent to Home Assistant, and to your phone if the Home Assistant app is installed, while this app is open.</p>');
      return h.replace('</div>','</div>'+modeRows(true))+`<div class="sec-h">Home Assistant</div><div class="group">
        <button class="row" data-a="go" data-v="align">Align map with the robot<span class="v">${HA.align?.auto?'Automatic':HA.align?'By hand':'Off'}</span>${ic('chev',18)}</button>
        <button class="row" data-a="go" data-v="rooms">Rooms and zones<span class="v">${HA.rooms.length+HA.savedZones.length}</span>${ic('chev',18)}</button>
        <button class="row" data-a="haConnect">Connection<span class="v">${S.conn==='connected'?'Connected':'Not connected'}</span>${ic('chev',18)}</button>
        <div class="row">Robot map<span class="v">${map}</span></div></div>
        <div class="sec-h">Retries</div><p class="small muted" style="margin:-4px 4px 8px">When the robot goes back to a spot during a cleaning. Used when it decides by itself; you’re asked each time you choose.</p>
        <div class="group"><button class="row" data-a="haRetryDefault" data-v="now">Go right away<span class="v">${HA.retryWhen==='now'?ic('check',18):''}</span></button>
        <button class="row" data-a="haRetryDefault" data-v="after">After the cleaning ends<span class="v">${HA.retryWhen==='after'?ic('check',18):''}</span></button></div>
        <div class="sec-h">Study scenario</div><p class="small muted" style="margin:-4px 4px 8px">Simulated events shown during real cleanings, at the robot’s position. For facilitators.</p>
        <div class="group">${Object.entries(SCEN).map(([k,x])=>`<button class="row" data-a="haScenario" data-v="${k}">${esc(x.label)}<span class="v">${S.ctl.scenario===k?ic('check',18):''}</span></button>`).join('')}</div>
        <button class="btn soft block" style="margin-top:12px" data-a="haFire" ${running&&S.sim.pending.length&&dev().status==='cleaning'?'':'disabled'}>Show next study event now${running?` (${S.sim.pending.length} left)`:''}</button>`;
    });

    // Robot commands
    window.mapUpdateRow=()=>`<div class="small muted" style="margin:6px 6px 0;display:flex;align-items:center;gap:8px"><span style="flex:1">${S.mapNews?esc(S.mapNews)+'. ':''}The robot updates its map as it cleans.</span><button class="link" data-a="updateMap">Update map</button></div>`;
    A.updateMap=()=>{S.ui.modal={title:'Update the map',body:'<p>The robot rescans the rooms during every cleaning. Home Assistant can’t start a scan without cleaning, so the way to refresh the map is to run a cleaning, ideally after moving furniture.</p>',buttons:[{label:'Start a cleaning',a:'haMapClean',cls:'primary'},{label:'Close',a:'closeModal'}]};commit()};
    A.haMapClean=()=>{S.ui.modal=null;S.ui.setup.kind='home';go('setup')};
    window.onAskLaterResume=()=>liveCommand('start',{label:'Carry on',done:'Cleaning continues',expect:['cleaning']},()=>{S.waitEv=null;tl('robot','Carrying on. It will ask again later')});
    // vacuum-and-mop with an empty tank or no mop: ask before starting
    A.haStartVacOnly=async()=>{S.ui.modal=null;const prev=M().value(HA.snap,'cleaning_mode');
      try{await api('command',{action:'mode',mode:'vacuum'});HA.restoreMode=prev;tl('robot','Vacuum only for this cleaning')}catch(e){flash(e.message);return}
      S.ui.mopOk=true;A.startTask()};
    A.haStartAnyway=()=>{S.ui.modal=null;S.ui.mopOk=true;A.startTask()};
    A.startTask=()=>{
      const mode=M().value(HA.snap,'cleaning_mode'),dry=M().value(HA.snap,'water_shortage')==='on',noMop=M().value(HA.snap,'mop_attached')==='off';
      if(mode==='vac_and_mop'&&(dry||noMop)&&!S.ui.mopOk){
        S.ui.modal={title:dry?'The water tank is empty':'No mop attached',body:`<p>The robot is set to vacuum and mop. ${dry?'Fill the water tank first, or':'Attach the mop first, or'} vacuum only this time.</p>`,
          buttons:[{label:'Vacuum only this time',a:'haStartVacOnly',cls:'primary'},{label:'Start anyway',a:'haStartAnyway'},{label:'Cancel',a:'closeModal'}]};return commit();
      }
      S.ui.mopOk=false;
      const kind=S.ui.setup.kind,parts=setupParts(),label=setupLabel();
      if(kind!=='home'&&(!parts.length||parts.length>5))return;
      HA.expectStart={label,at:Date.now(),kind,parts};
      liveCommand(kind==='home'?'start':'zones',{label:'Start cleaning',done:'Cleaning started',expect:['cleaning'],body:kind==='home'?null:{zones:parts.map(b=>M().robotBox(HA.align?.al,b))},onFail:()=>{HA.expectStart=null}},
        ()=>{S.ui.stack=[];S.ui.tab='map';forceTop=true});
    };
    // Drawing rooms, zones and no-go zones
    A.haEditArea=v=>{
      const [type,id]=v.split('|'),src=type==='room'?HA.rooms.find(x=>x.id===id):type==='zone'?HA.savedZones.find(x=>x.id===id):null;
      S.ui.edit={type,id:src?src.id:null,name:src?src.name:'',parts:src?src.parts.map(b=>[...b]):[]};go('roomEdit');
    };
    A.haAlignByHand=()=>{S.ui.alignByHand=true;commit()};
    A.haAlignShift=()=>{if(HA.alignDraft)saveAlign(HA.alignDraft.a,null)};
    A.haAlignRestart=()=>{HA.alignDraft=null;commit()};
    A.haAlignReset=()=>{HA.align=null;HA.alignDraft=null;if(HA.poseRaw)HA.pose={...HA.pose,x:HA.poseRaw.x,y:HA.poseRaw.y};autoAlign();persist();HA.sig='';commit();flash(HA.align?'Back to automatic alignment':'Alignment removed')};
    A.haUndoPart=()=>{S.ui.edit.parts.pop();commit()};
    A.haSaveArea=()=>{
      const e=S.ui.edit,name=(document.getElementById('ha-area-name')?.value??e.name).trim();
      if(!e.parts.length){flash('Drag on the map first.');return}
      if(e.type!=='nogo'&&!name){const i=document.getElementById('ha-area-name');if(i){i.focus();i.placeholder='Type a name first'}return}
      if(e.type==='nogo'){
        e.parts.forEach((b,i)=>{const zid='z'+(++seq);const c={x:(b[0]+b[2])/2,y:(b[1]+b[3])/2};
          ZONES[zid]={name:'No-go zone '+(S.nogo.length+1),room:roomKey(c),cells:[],keys:[],box:b};S.nogo.push(zid)});
        S.ui.edit=null;back();saveNogo('Save no-go zone on the robot','No-go zone saved on the robot');return;
      }
      const list=e.type==='room'?HA.rooms:HA.savedZones,old=list.find(x=>x.id===e.id);
      if(old)Object.assign(old,{name,parts:e.parts});
      else list.push({id:Date.now().toString(36),name,parts:e.parts,color:e.type==='room'?HA.rooms.length:0});
      registerRooms();S.ui.edit=null;persist();back();flash((e.type==='room'?'Room':'Zone')+' saved');
    };
    A.haDeleteArea=()=>{
      const e=S.ui.edit;S.ui.modal={title:'Delete '+(e.name||'this')+'?',body:'<p>It is removed from this app. The robot’s own map isn’t changed.</p>',
        buttons:[{label:'Delete',a:'haDeleteGo',cls:'danger'},{label:'Cancel',a:'closeModal'}]};commit();
    };
    A.haDeleteGo=()=>{const e=S.ui.edit;if(e.type==='room')HA.rooms=HA.rooms.filter(x=>x.id!==e.id);else HA.savedZones=HA.savedZones.filter(x=>x.id!==e.id);
      S.ui.edit=null;S.ui.modal=null;persist();back()};
    document.addEventListener('input',ev=>{if(ev.target.dataset&&ev.target.dataset.haName!==undefined&&S.ui.edit)S.ui.edit.name=ev.target.value});
    A.pause=()=>liveCommand('pause',{label:'Pause',done:'Paused',expect:['paused','idle']},()=>tl('you','You paused cleaning'));
    A.resume=()=>liveCommand('start',{label:'Resume',done:'Cleaning resumed',expect:['cleaning']},()=>{S.checkEv=null;S.waitEv=null;tl('you','You resumed cleaning')});
    A.endReturn=()=>{S.ui.modal={title:'End cleaning and return?',body:'<p>The robot stops and goes back to its dock. Places it hasn’t reached yet stay uncleaned this time.</p>',buttons:[{label:'End and return to dock',a:'confirmEnd',cls:'danger'},{label:'Keep cleaning',a:'closeModal'}]};commit()};
    A.confirmEnd=()=>{S.ui.modal=null;stopAll();liveCommand('return_to_base',{label:'End and return',done:'Returning to dock',expect:['returning','docked'],force:true},()=>{if(S.task&&!S.task.done){S.task.endedEarly=true;tl('you','You ended cleaning early')}S.sim.pending=[]})};
    A.haDock=()=>{stopAll();liveCommand('return_to_base',{label:'Send to dock',done:'Returning to dock',expect:['returning','docked'],force:true})};
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
    st.textContent='.map.tilted{transform:perspective(900px) rotateX(52deg) rotateZ(-32deg) scale(.84) translateY(-10px)}.map.ha-editing{touch-action:none;cursor:crosshair}.map.ha-aligning{cursor:crosshair}.map .ha-part{fill:var(--primary-soft);stroke:var(--primary);stroke-width:1.5}.map .ha-draft{fill:var(--primary-soft);stroke:var(--primary);stroke-width:1.5;stroke-dasharray:4 3;pointer-events:none}.pill.recorded{background:var(--primary-soft);color:var(--primary)}.map .ha-floor{fill:var(--surface)}.map .ha-floor.sel{fill:var(--primary-soft)}.map .ha-wall{fill:none;stroke:var(--skip);stroke-width:2.2;stroke-linecap:square;vector-effect:non-scaling-stroke;pointer-events:none}.map .ha-swept{fill:none;stroke:var(--clean);stroke-linecap:round;stroke-linejoin:round;pointer-events:none}';
    document.head.appendChild(st);
  }

  window.HA_INIT=()=>{restore();loadGoodMap();patch();registerRooms();
    S.events.concat(...S.history.map(h=>h.snap.events||[])).forEach(e=>{if(e.problem&&e.info&&!DEFS[e.key])defineProblem(e.key,e.info,e.zone)});
   refresh();loadSchedules();setInterval(refresh,4000);setInterval(loadSchedules,60000)};
  window.HA_TICK=()=>{S.clock=now();fireDue();checkTemp();checkReminders();updateLive()};
})();
