/* Study panel for usability sessions. It sits at the top left, beside the phone, and is what the participant sees:
   1 Participant and Start.
   2 The background and the opening task, with End. This part is one cleaning: it ends when the cleaning ends
     (finished or stopped); if they start another cleaning before doing anything in the next part, the clock carries on.
   3 The after-cleaning tasks they didn't reach on their own, one at a time, each with Skip and End. A task also
     ends by itself when its goal is reached.
   4 When the session is over: the results, for the researcher (times, taps, detours, paths) and CSV export.
   Every tap and screen is logged. Open the panel with ?study, Shift+S, or Settings → Testing → Study log.
   Data stays in this browser (localStorage) until exported. */
(function(){
  const KEY='robot-study-v1';
  const live=()=>!!window.HA_LIVE;
  const now=()=>Date.now();
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch(e){return {}}};
  let D=load();D.people=D.people||{};
  // sessions saved by an earlier version of this panel: keep them for export, but closed
  Object.values(D.people).forEach(p=>{if(!p.explore){p.explore={start:null,active:0,since:null,cleaning:false,end:null,path:[],achieved:{},ctx:{}};p.phase='done';p.queue=[];p.run=null}
    if(p.phase==='intro')p.phase='done';p.tasks=p.tasks||[];p.log=(p.log||[]).concat(p.free||[]);delete p.free});
  if(D.pid&&(!D.people[D.pid]||D.people[D.pid].phase==='done'))D.pid=null;
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(D))}catch(e){}};
  const P=()=>D.people[D.pid];
  const evs=k=>(S.events||[]).filter(e=>e.key===k);
  const clicked=(t,a,v)=>t.log.some(x=>x.type==='click'&&x.action===a&&(v===undefined||x.value===v));

  /* What the participant reads first. */
  const SCRIPT={
    background:'Imagine this robot vacuum is yours, and this is its app. The robot cleans on its own. Sometimes it decides things by itself, and sometimes it asks you. We’re testing the app, not you, so there are no wrong answers. Please think out loud as you go.',
    opening:'Set the app up the way you’d like, then start a cleaning. While it cleans, use the app however you naturally would. This part ends when the cleaning ends.'};

  /* Goals noted while exploring. ask: the guided task wording. after: can be done once the cleaning is over, so it's
     given as a guided task if not reached. ok: screens on the expected path (others count as detours). best: fewest taps.
     can(): the app is in a state where the task makes sense. done(base,t): the goal is reached. */
  const TASKS=[
    {id:'T1',name:'First setup',best:3,done:()=>!S.onboarding},
    {id:'T2',name:'Start a cleaning',best:2,base:()=>S.task&&S.task.id,done:b=>!!S.task&&S.task.id!==b},
    {id:'T3',name:'Answer the robot',best:2,base:()=>(S.events||[]).filter(e=>e.lastAct).map(e=>e.id),
      done:b=>(S.events||[]).some(e=>!b.includes(e.id)&&e.lastAct&&!(e.autonomous&&!e.changed))},
    {id:'T4',name:'Change a robot decision',ask:'The robot made some decisions on its own. Pick one you’d have done differently and change it.',best:3,after:true,ok:['home','event','map','activity','report','timeline'],
      can:()=>(S.events||[]).some(e=>e.autonomous&&!e.changed&&!e.archived),base:()=>(S.events||[]).filter(e=>e.changed).map(e=>e.id),
      done:b=>(S.events||[]).some(e=>e.changed&&!b.includes(e.id))},
    {id:'T5',name:'Undo a choice',best:2,done:(b,t)=>clicked(t,'undoAct')},
    {id:'T6',name:'Retry keeps failing',best:4,done:()=>evs('bed').some(e=>(e.retryFails||0)>=2&&e.status!=='needsReview'&&e.status!=='inProgress')},
    {id:'T7',name:'Stop the cleaning',best:2,base:()=>S.task&&S.task.id,done:b=>!!(S.task&&S.task.id!==b&&S.task.done&&S.task.endedEarly)},
    {id:'T8',name:'Find what the robot did',ask:'Find out what the robot did on its own during the cleaning.',best:2,after:true,ok:['home','report','timeline','activity'],
      done:()=>['report','timeline'].includes(screen().replace('+sheet',''))},
    {id:'T9',name:'Check found objects',ask:'Check the objects the robot wasn’t sure about.',best:2,after:true,ok:['home','map','activity','report'],
      can:()=>pendingObjs().length>0,done:(b,t)=>{const n=pendingObjs().length;if(n&&S.task&&S.task.done)t.seen=true;return !!t.seen&&n===0}},
    {id:'T10',name:'Full auto for an hour',ask:'Next time you’ll be in a meeting for an hour. Let the robot decide on its own until then.',best:4,after:true,ok:['home','settings','autonomy'],
      done:()=>S.autonomy==='fullAuto'&&!!S.temp&&!S.temp.task},
    {id:'T11',name:'Find what needs you',ask:'Find everything that still needs you.',best:1,after:true,ok:['home','activity'],
      done:(b,t)=>clicked(t,'toNeeds')||clicked(t,'tab','activity')},
  ];
  const byId=id=>TASKS.find(x=>x.id===id);

  const screen=()=>{
    if(S.onboarding)return 'onboarding';
    if(S.ui.away)return 'lockscreen';
    const c=S.ui.stack[S.ui.stack.length-1]||{name:S.ui.tab};
    return S.ui.modal?(c.name||'')+'+sheet':c.name;
  };
  const label=el=>(el.getAttribute('aria-label')||el.textContent||'').replace(/\s+/g,' ').trim().slice(0,48);
  const secs=ms=>Math.round(ms/100)/10;
  const exploreMs=p=>{const ex=p.explore;return ex.active+(ex.since?now()-ex.since:0)};
  const guidedDone=p=>p.tasks.filter(x=>x.phase==='guided').length;

  /* the log: one list per participant; the running guided task keeps its own copy for its counts */
  const push=x=>{const p=P();if(!p)return;const r=p.run;
    x={t:now(),phase:p.phase,task:r?r.id:'',ms:r?now()-r.start:p.phase==='explore'?exploreMs(p):null,screen:screen(),...x};
    p.log.push(x);if(r)r.log.push(x);save()};
  const exploreLog=p=>p.log.filter(x=>x.phase==='explore');

  document.addEventListener('click',e=>{
    const p=P();if(!p||p.phase==='done'||e.target.closest('#study'))return;
    if(!e.target.closest('#app'))return;
    const el=e.target.closest('[data-a]');
    if(el&&!el.disabled)push({type:'click',action:el.dataset.a,value:el.dataset.v||'',label:label(el)});
    else push({type:'tap',action:'',value:'',label:el?'(disabled) '+label(el):(e.target.className&&String(e.target.className).slice(0,30))||e.target.tagName.toLowerCase()});
  },true);

  /* checked a few times a second: screen changes, goals, the cleaning */
  let lastScreen=null;
  setInterval(()=>{
    const p=P();if(!p||p.phase==='done')return;
    const sc=screen();
    if(sc!==lastScreen){lastScreen=sc;push({type:'screen',action:'',value:'',label:sc});
      if(p.run)p.run.path.push(sc);if(p.phase==='explore')p.explore.path.push(sc)}
    if(p.phase==='explore')checkExplore(p);
    followCleaning(p);
    if(p.phase==='guided'&&p.run&&!p.run.result){let ok=false;try{ok=byId(p.run.id).done(p.run.base,p.run)}catch(e){}if(ok)endTask('done (auto)')}
  },300);

  /* 1 start: free exploration, which is one cleaning */
  function begin(pid){
    // in the simulation every participant starts fresh, with the study events on
    if(!live()){try{A.ctlRestart();if(S.ctl.scenario==='none')S.ctl.scenario='all';commit(true)}catch(e){}}
    D.pid=pid;
    const ctx={};TASKS.forEach(T=>{let base=null;try{base=T.base?T.base():null}catch(e){}ctx[T.id]={base,seen:false,log:[]}});
    D.people[pid]={mode:live()?'real robot':'simulation',started:new Date().toISOString(),phase:'explore',
      explore:{start:now(),active:0,since:now(),cleaning:!!(S.task&&!S.task.done),cleanAtEnd:null,path:[],achieved:{},ctx},queue:[],run:null,tasks:[],log:[]};
    lastScreen=null;push({type:'mark',action:'start',value:'',label:'Free exploration'});save();draw();
  }
  function checkExplore(p){
    const ex=p.explore,log=exploreLog(p);
    TASKS.forEach(T=>{
      if(ex.achieved[T.id])return;
      const c=ex.ctx[T.id];c.log=log; // done() reads taps from here
      let ok=false;try{ok=T.done(c.base,c)}catch(e){}
      if(ok){ex.achieved[T.id]={ms:exploreMs(p),clicks:log.filter(x=>x.type==='click').length,path:ex.path.slice(-8).join(' > ')};
        push({type:'mark',action:'achieved',value:T.id,label:T.name})}
    });
  }
  const leftAfter=p=>TASKS.filter(T=>T.after&&!p.explore.achieved[T.id]);
  /* the cleaning ending ends exploration; a new cleaning before anything is done in the guided part picks it up again */
  function followCleaning(p){
    const ex=p.explore,running=!!(S.task&&!S.task.done);
    if(p.phase==='explore'&&ex.cleaning&&!running){ex.cleanAtEnd=S.task&&S.task.id;push({type:'mark',action:'cleaning ended',value:'',label:''});endExplore()}
    else if(p.phase==='guided'&&!ex.cleaning&&running&&!guidedDone(p)&&!(p.run&&p.run.log.some(x=>x.type==='click'))&&S.task.id!==ex.cleanAtEnd){
      p.phase='explore';ex.since=now();p.run=null;p.queue=[];push({type:'mark',action:'cleaning started again',value:'',label:'exploration continues'});save();draw()}
    ex.cleaning=running;
  }
  function endExplore(){
    const p=P();if(!p||p.phase!=='explore')return;
    checkExplore(p);
    const ex=p.explore;if(ex.since){ex.active+=now()-ex.since;ex.since=null}
    p.queue=leftAfter(p).map(T=>T.id);p.phase='guided';
    push({type:'mark',action:'exploration ended',value:String(p.queue.length),label:p.queue.length+' tasks left'});
    save();next();
  }

  /* 2 guided tasks, one at a time; each is timed from when it's shown */
  function next(){
    const p=P();if(!p)return;let id=p.queue[0];
    while(id&&byId(id).can&&!byId(id).can()){const T=byId(id);p.tasks.push({phase:'guided',task:id,name:T.name,result:'not available',seconds:0,clicks:0,best:T.best,path:''});
      push({type:'mark',action:'not available',value:id,label:T.name});p.queue.shift();id=p.queue[0]}
    if(!id){finish();return}
    const T=byId(id);let base=null;try{base=T.base?T.base():null}catch(e){}
    p.run={id,start:now(),base,log:[],path:[],result:null};lastScreen=null;
    push({type:'mark',action:'task shown',value:id,label:T.name});save();draw();
  }
  /* screens off the task's path; where the app lands after the goal is reached doesn't count */
  function detours(r,result){const ok=byId(r.id).ok,path=r.path.slice(1,result==='done (auto)'?-1:undefined);
    return path.filter(sc=>!ok.includes(sc.replace('+sheet',''))).length}
  function endTask(result){
    const p=P();const r=p&&p.run;if(!r||r.result)return;
    const T=byId(r.id);r.result=result;
    push({type:'mark',action:'end',value:result,label:T.name});
    const clicks=r.log.filter(x=>x.type==='click').length;
    p.tasks.push({phase:'guided',task:r.id,name:T.name,result,seconds:secs(now()-r.start),clicks,best:T.best,extra:Math.max(0,clicks-T.best),
      detours:detours(r,result),backs:r.log.filter(x=>x.type==='click'&&['back','closeModal','closeModalBg'].includes(x.action)).length,
      dead:r.log.filter(x=>x.type==='tap').length,path:r.path.join(' > ')});
    p.queue.shift();p.run=null;save();
    if(result==='done (auto)'){p.justDone=true;draw();setTimeout(()=>{p.justDone=false;next()},1200)}else next();
  }

  /* 3 the end: the panel thanks them, then shows the results for the researcher */
  function finish(){
    const p=P();if(!p||p.phase==='done')return;
    if(p.run&&!p.run.result){const r=p.run,T=byId(r.id);p.tasks.push({phase:'guided',task:r.id,name:T.name,result:'stopped',seconds:secs(now()-r.start),
      clicks:r.log.filter(x=>x.type==='click').length,best:T.best,path:r.path.join(' > ')});p.run=null}
    exploreRows(p);
    p.phase='done';p.ended=new Date().toISOString();push({type:'mark',action:'session ended',value:'',label:''});save();draw();
    setTimeout(()=>{if(P()===p){D.last=D.pid;D.pid=null;save();draw()}},4000);
  }
  function exploreRows(p){
    const ex=p.explore;if(ex.since){ex.active+=now()-ex.since;ex.since=null}
    const log=exploreLog(p);
    const rows=[{phase:'explore',task:'',name:'Free exploration',result:'',seconds:secs(ex.active),clicks:log.filter(x=>x.type==='click').length,dead:log.filter(x=>x.type==='tap').length,path:''}];
    TASKS.forEach(T=>{const a=ex.achieved[T.id];if(a)rows.push({phase:'explore',task:T.id,name:T.name,result:'reached on their own',seconds:secs(a.ms),clicks:a.clicks,best:T.best,path:a.path})});
    p.tasks=rows.concat(p.tasks);
  }

  /* CSV */
  const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  const csv=(rows,cols)=>[cols.join(',')].concat(rows.map(r=>cols.map(c=>esc(r[c])).join(','))).join('\n');
  function summaryCSV(){
    const rows=[];Object.entries(D.people).forEach(([pid,p])=>(p.tasks||[]).forEach(t=>rows.push({participant:pid,mode:p.mode,...t})));
    return csv(rows,['participant','mode','phase','task','name','result','seconds','clicks','best','extra','detours','backs','dead','path']);
  }
  function logCSV(){
    const rows=[];Object.entries(D.people).forEach(([pid,p])=>(p.log||[]).forEach(x=>rows.push({participant:pid,time:new Date(x.t).toISOString(),...x})));
    return csv(rows,['participant','time','phase','task','ms','type','action','value','label','screen']);
  }
  function download(name,text){
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'}));a.download=name;
    document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
  }
  function copy(text){
    const done=()=>note('Copied');
    const fallback=()=>{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();
      try{document.execCommand('copy');done()}catch(e){note('Select and copy the text by hand')}ta.remove()};
    if(navigator.clipboard)navigator.clipboard.writeText(text).then(done,fallback);else fallback();
  }

  /* the panel */
  const css=document.createElement('style');
  css.textContent=`#study{position:fixed;z-index:9999;top:max(12px,env(safe-area-inset-top,0px));left:max(12px,env(safe-area-inset-left,0px));width:340px;max-height:calc(100% - 24px);overflow:auto;
    background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);font:14px/1.5 Manrope,system-ui,sans-serif;padding:18px}
  #study[hidden]{display:none}
  #study .st-eyebrow{font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
  #study .st-task{font:700 24px/1.15 "Barlow Condensed",Manrope,sans-serif;margin:6px 0 4px;text-wrap:balance}
  #study .st-text{margin:6px 0 0}#study .st-m{color:var(--muted);font-size:12.5px}
  #study .st-row{display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap}
  #study input{flex:1;min-width:0;font:inherit;border:1px solid var(--line);border-radius:12px;padding:9px 11px;background:var(--bg);color:var(--ink)}
  #study button{font:inherit;font-weight:700;border:0;border-radius:12px;padding:9px 14px;background:var(--primary-soft);color:var(--primary);cursor:pointer}
  #study button.st-p{background:var(--primary);color:var(--primary-ink)}
  #study button.st-quiet{background:none;color:var(--muted);padding:4px 0;font-weight:600;font-size:12.5px}
  #study .st-done{font:700 24px/1 "Barlow Condensed",Manrope,sans-serif;color:var(--ok)}
  #study .st-tbl{overflow-x:auto}#study table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12.5px;font-variant-numeric:tabular-nums}
  #study td,#study th{text-align:left;padding:4px;border-bottom:1px solid var(--line);vertical-align:top}#study th{color:var(--muted);font-weight:700}
  #study .st-note{color:var(--ok);font-weight:700;min-height:1.4em;margin-top:8px}
  @media (max-width:760px){#study{top:auto;bottom:max(12px,env(safe-area-inset-bottom,0px));width:auto;right:max(12px,env(safe-area-inset-right,0px));max-height:55%}}`;
  document.head.appendChild(css);
  const h=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
  const box=document.createElement('div');box.id='study';box.hidden=true;box.setAttribute('aria-label','Study');document.body.appendChild(box);
  let msg='';const note=t=>{msg=t;draw();setTimeout(()=>{msg='';draw()},2000)};
  // the published web version can't save files, so it offers copying only
  const dlBtn=()=>window.STUDY_NO_DOWNLOAD?'':'<button data-s="dl">Download CSV</button>';
  const exportRow=()=>`<div class="st-row">${dlBtn()}<button data-s="cp">Copy summary</button><button data-s="cpl">Copy taps</button></div>`;

  /* results, shown only once a session is over */
  function results(pid,p){
    const rows=p.tasks.map(t=>`<tr><td>${h(t.task||'—')}</td><td>${h(t.name)}</td><td>${h(t.result||'')}</td><td>${t.seconds!=null?t.seconds+'s':''}</td><td>${t.clicks??''}${t.best?' / '+t.best:''}</td><td>${t.detours??''}</td></tr>`).join('');
    return `<div class="st-eyebrow">Results · ${h(pid)} · ${h(p.mode)}</div>
      <div class="st-tbl"><table><thead><tr><th>#</th><th>Task</th><th>Result</th><th>Time</th><th>Taps / best</th><th>Detours</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function draw(){
    if(box.hidden)return;const p=P();let s='';
    if(!p){
      const last=D.last&&D.people[D.last];
      s+=`<div class="st-eyebrow">Usability session</div><div class="st-row" style="margin-top:8px"><input id="study-pid" value="P${Object.keys(D.people).length+1}" aria-label="Participant" autocomplete="off"><button class="st-p" data-s="new">Start</button></div>`;
      if(last)s+=`<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line)">${results(D.last,last)}</div>`;
      const n=Object.keys(D.people).length;
      if(n)s+=`<p class="st-m" style="margin-top:10px">${n} session${n>1?'s':''} saved in this browser.</p>`+exportRow();
    }else if(p.phase==='explore'){
      s+=`<div class="st-eyebrow">Before you start</div><p class="st-text">${h(SCRIPT.background)}</p>
        <div class="st-eyebrow" style="margin-top:16px">Your task</div><div class="st-task">${h(SCRIPT.opening)}</div>
        <div class="st-row"><button data-s="endx">End</button></div>`;
    }else if(p.phase==='guided'){
      const shown=p.tasks.filter(x=>x.phase==='guided'&&x.result!=='not available').length,total=shown+p.queue.length,n=shown+1;
      if(p.justDone)s+=`<div class="st-done">Done</div><p class="st-m">On to the next one.</p>`;
      else if(p.run){const T=byId(p.run.id);
        s+=`<div class="st-eyebrow">${n===1?'The cleaning is done · ':''}Task ${n} of ${total}</div><div class="st-task">${h(T.ask)}</div>
          <div class="st-row"><button data-s="skip">Skip</button><button class="st-p" data-s="ok">End</button></div>`}
    }else s+=`<div class="st-task">That’s everything. Thank you!</div>`;
    if(p&&p.phase!=='done')s+=`<div class="st-row" style="justify-content:space-between;margin-top:18px"><span class="st-m">${h(D.pid)}</span><button class="st-quiet" data-s="stop">End session</button></div>`;
    s+=`<div class="st-note" role="status">${h(msg)}</div>`;
    const keep=document.activeElement&&document.activeElement.id==='study-pid'?document.activeElement.value:null;
    box.innerHTML=s;if(keep!==null){const i=box.querySelector('#study-pid');i.value=keep;i.focus()}
  }
  box.addEventListener('click',e=>{
    const b=e.target.closest('[data-s]');if(!b)return;const k=b.dataset.s;
    if(k==='new'){const v=(box.querySelector('#study-pid').value||'').trim();if(!v){note('Enter a participant first');return}
      if(D.people[v]){note(v+' already exists. Use another name or number.');return}begin(v)}
    if(k==='endx')endExplore();
    if(k==='ok')endTask('ended');if(k==='skip')endTask('skipped');
    if(k==='stop'){const p=P();finish();if(P()===p){D.last=D.pid;D.pid=null;save();draw()}}
    if(k==='dl'){const d=new Date().toISOString().slice(0,10);download(`study-summary-${d}.csv`,summaryCSV());setTimeout(()=>download(`study-taps-${d}.csv`,logCSV()),400)}
    if(k==='cp')copy(summaryCSV());
    if(k==='cpl')copy(logCSV());
  });
  box.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='study-pid'){e.preventDefault();box.querySelector('[data-s="new"]').click()}});
  function toggle(on){box.hidden=on===undefined?!box.hidden:!on;try{localStorage.setItem(KEY+'-open',box.hidden?'':'1')}catch(e){}draw()}
  document.addEventListener('keydown',e=>{if(e.shiftKey&&(e.key==='S'||e.key==='s')&&!/input|textarea/i.test(e.target.tagName)){e.preventDefault();toggle()}});
  let open=false;try{open=!!localStorage.getItem(KEY+'-open')}catch(e){}
  if(open||new URLSearchParams(location.search).has('study'))toggle(true);
  window.STUDY={toggle,begin,endExplore,endTask,finish,tasks:TASKS,data:()=>D,summaryCSV,logCSV};
  if(typeof A!=='undefined')A.studyLog=()=>toggle(true);
})();
