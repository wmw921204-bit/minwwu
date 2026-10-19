/* Study log for usability sessions, run like a moderator.
   1 Free exploration: the participant sets up, starts a cleaning and uses the app freely; every task goal they reach on
     their own is noted with the time. It ends when the cleaning ends; if they start another, the clock carries on.
   2 Guided tasks: the phone then shows the after-cleaning tasks they didn't reach, one at a time.
     Each is timed from "Start task" and ends when its goal is reached (or "I'm done" / "Skip").
   Every tap and screen is logged; results export as CSV. The facilitator panel is hidden from participants:
   Shift+S, ?study, or Settings → Testing → Study log. Data stays in this browser (localStorage) until exported. */
(function(){
  const KEY='robot-study-v1';
  const live=()=>!!window.HA_LIVE;
  const now=()=>Date.now();
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch(e){return {}}};
  let D=load();D.people=D.people||{};
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(D))}catch(e){}};
  const P=()=>D.people[D.pid];
  const evs=k=>(S.events||[]).filter(e=>e.key===k);
  const clicked=(t,a,v)=>t.log.some(x=>x.type==='click'&&x.action===a&&(v===undefined||x.value===v));

  /* The tasks from the test plan. ask: what the participant reads. ok: screens on the expected path (others count as detours).
     best: fewest taps. after: can be done once the cleaning is over, so it's offered as a guided task if not reached while exploring.
     can(): the app is in a state where the task makes sense. done(base,t): the goal is reached. */
  const anyClick=(t,list)=>t.log.some(x=>x.type==='click'&&list.includes(x.action));
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
    {id:'T8',name:'Find what the robot did',ask:'The cleaning is done. Find out what the robot did on its own.',best:2,after:true,ok:['home','report','timeline','activity'],
      done:()=>['report','timeline'].includes(screen().replace('+sheet',''))},
    {id:'T9',name:'Check found objects',ask:'Check the objects the robot wasn’t sure about.',best:2,after:true,ok:['home','map','activity','report'],
      can:()=>pendingObjs().length>0,done:(b,t)=>{const n=pendingObjs().length;if(n&&S.task&&S.task.done)t.seen=true;return !!t.seen&&n===0}},
    {id:'T10',name:'Full auto for an hour',ask:'Next time you’ll be in a meeting for an hour. Let the robot decide on its own until then.',best:4,after:true,ok:['home','settings','autonomy'],
      done:()=>S.autonomy==='fullAuto'&&!!S.temp&&!S.temp.task},
    {id:'T11',name:'Find what needs you',ask:'Find everything that still needs you.',best:1,after:true,ok:['home','activity'],
      done:(b,t)=>anyClick(t,['toNeeds'])||clicked(t,'tab','activity')},
  ];
  const byId=id=>TASKS.find(x=>x.id===id);
  /* What the participant hears first: shown on the phone, and in the panel for the facilitator to read out. */
  const SCRIPT={
    background:'Imagine this robot vacuum is yours, and this is its app. The robot cleans on its own. Sometimes it decides things by itself, and sometimes it asks you. We’re testing the app, not you, so there are no wrong answers. Please think out loud as you go.',
    opening:'Set the app up the way you’d like, then start a cleaning. While it cleans, use the app however you naturally would. The cleaning ending is the end of this part.'};

  const screen=()=>{
    if(S.onboarding)return 'onboarding';
    if(S.ui.away)return 'lockscreen';
    const c=S.ui.stack[S.ui.stack.length-1]||{name:S.ui.tab};
    return S.ui.modal?(c.name||'')+'+sheet':c.name;
  };
  const label=el=>(el.getAttribute('aria-label')||el.textContent||'').replace(/\s+/g,' ').trim().slice(0,48);
  const mmss=ms=>{const s=Math.max(0,Math.floor(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
  const secs=ms=>Math.round(ms/100)/10;

  const exploreMs=p=>{const ex=p.explore;return ex.active+(ex.since?now()-ex.since:0)};
  /* the log: one list per participant; the guided task that is running also keeps its own copy */
  const push=x=>{const p=P();if(!p)return;const r=p.run&&p.run.start?p.run:null;
    x={t:now(),phase:p.phase,task:r?r.id:'',ms:r?now()-r.start:p.phase==='explore'?exploreMs(p):null,screen:screen(),...x};
    p.log.push(x);if(r)r.log.push(x);if(p.phase==='explore')p.explore.log.push(x);save()};

  document.addEventListener('click',e=>{
    const p=P();if(!p||p.phase==='done'||p.phase==='intro'||e.target.closest('#study,#study-card'))return;
    if(!e.target.closest('#app'))return;
    const el=e.target.closest('[data-a]');
    if(el&&!el.disabled)push({type:'click',action:el.dataset.a,value:el.dataset.v||'',label:label(el)});
    else push({type:'tap',action:'',value:'',label:el?'(disabled) '+label(el):(e.target.className&&String(e.target.className).slice(0,30))||e.target.tagName.toLowerCase()});
  },true);

  /* checked a few times a second: screen changes, goals reached */
  let lastScreen=null;
  setInterval(()=>{
    const p=P();if(!p||p.phase==='done')return;
    const sc=screen();
    if(sc!==lastScreen){const first=lastScreen===null;lastScreen=sc;push({type:'screen',action:'',value:'',label:sc});
      const r=p.run;
      if(r&&r.start)r.path.push(sc);
      if(p.phase==='explore')p.explore.path.push(sc)}
    if(p.phase==='explore'){checkExplore(p);followCleaning(p)}
    if(p.phase==='guided'&&p.run&&p.run.start&&!p.run.result){let ok=false;try{ok=byId(p.run.id).done(p.run.base,p.run)}catch(e){}if(ok)endTask('done (auto)')}
    draw();
  },300);
  setInterval(()=>{const p=P();if(p&&p.phase!=='done')drawClock()},1000);

  /* 1 free exploration */
  function begin(pid){
    // in the simulation every participant starts fresh, with the study events on
    if(!live()){try{A.ctlRestart();if(S.ctl.scenario==='none')S.ctl.scenario='all';commit(true)}catch(e){}}
    D.pid=pid;
    const ctx={};TASKS.forEach(T=>{let base=null;try{base=T.base?T.base():null}catch(e){}ctx[T.id]={base,seen:false}});
    D.people[pid]={mode:live()?'real robot':'simulation',started:new Date().toISOString(),phase:'intro',
      explore:{start:null,active:0,since:null,cleaning:false,end:null,log:[],path:[],achieved:{},ctx},queue:[],run:null,tasks:[],log:[]};
    lastScreen=null;save();card('intro');draw();
  }
  /* after the background and opening task: the exploration clock starts */
  function startExplore(){
    const p=P();if(!p||p.phase!=='intro')return;
    const ex=p.explore;TASKS.forEach(T=>{try{ex.ctx[T.id].base=T.base?T.base():null}catch(e){}});
    ex.start=ex.since=now();ex.cleaning=!!(S.task&&!S.task.done);p.phase='explore';card(null);
    push({type:'mark',action:'start',value:'',label:'Free exploration'});save();draw();
  }
  function checkExplore(p){
    const ex=p.explore;
    TASKS.forEach(T=>{
      if(ex.achieved[T.id])return;
      const c=ex.ctx[T.id];c.log=ex.log; // done() reads taps from here
      let ok=false;try{ok=T.done(c.base,c)}catch(e){}
      if(ok){const ms=exploreMs(p);ex.achieved[T.id]={ms,clicks:ex.log.filter(x=>x.type==='click').length,path:ex.path.slice(-8).join(' > ')};
        push({type:'mark',action:'achieved',value:T.id,label:T.name})}
    });
  }
  /* The exploration is one cleaning: when it ends (finished or stopped), the clock pauses and the phone offers the
     tasks left. If they start another cleaning instead, the clock carries on. */
  const leftAfter=p=>TASKS.filter(T=>T.after&&!p.explore.achieved[T.id]);
  function followCleaning(p){
    const ex=p.explore,running=!!(S.task&&!S.task.done);
    if(ex.cleaning&&!running&&ex.since){ex.active+=now()-ex.since;ex.since=null;push({type:'mark',action:'cleaning ended',value:'',label:'exploration paused'});save();
      setTimeout(()=>{const q=P();if(q===p&&p.phase==='explore'&&!p.explore.since){if(leftAfter(p).length)card('after');else endExplore()}},2500)}
    if(!ex.cleaning&&running&&!ex.since){ex.since=now();card(null);push({type:'mark',action:'cleaning started again',value:'',label:'exploration continues'});save()}
    ex.cleaning=running;
  }
  function keepExploring(){const p=P();if(!p||p.phase!=='explore')return;card(null);if(!p.explore.since)p.explore.since=now();
    push({type:'mark',action:'keep exploring',value:'',label:''});save();draw()}
  function endExplore(){
    const p=P();if(!p||p.phase!=='explore')return;
    checkExplore(p);
    const ex=p.explore;ex.end=now();const total=exploreMs(p);if(ex.since){ex.active=total;ex.since=null}
    p.tasks.push({phase:'explore',task:'',name:'Free exploration',result:'',seconds:secs(total),clicks:ex.log.filter(x=>x.type==='click').length,
      dead:ex.log.filter(x=>x.type==='tap').length,path:''});
    TASKS.forEach(T=>{const a=ex.achieved[T.id];if(a)p.tasks.push({phase:'explore',task:T.id,name:T.name,result:'achieved',seconds:secs(a.ms),clicks:a.clicks,best:T.best,path:a.path})});
    ex.log=[];Object.values(ex.ctx).forEach(c=>delete c.log); // the full log stays in p.log
    p.queue=leftAfter(p).map(T=>T.id);
    push({type:'mark',action:'exploration ended',value:String(p.queue.length),label:p.queue.length+' tasks left'});
    p.phase=p.queue.length?'guided':'done';p.run=null;save();
    if(p.queue.length)offer();else card('thanks');
    draw();
  }

  /* 2 guided tasks: the phone shows each one; the participant starts it */
  function offer(){
    const p=P();if(!p)return;let id=p.queue[0];
    while(id&&byId(id).can&&!byId(id).can()){const T=byId(id);p.tasks.push({phase:'guided',task:id,name:T.name,result:'not available',seconds:0,clicks:0,best:T.best,path:''});
      push({type:'mark',action:'not available',value:id,label:T.name});p.queue.shift();id=p.queue[0]}
    if(!id){p.phase='done';save();card('thanks');draw();return}
    p.run={id,start:null,base:null,log:[],path:[],result:null};save();card('task');draw();
  }
  function startTask_(){
    const p=P();const r=p&&p.run;if(!r||r.start)return;
    const T=byId(r.id);
    try{r.base=T.base?T.base():null}catch(e){}
    r.start=now();lastScreen=null;push({type:'mark',action:'start',value:'',label:T.name});card('strip');draw();
  }
  /* screens off the task's path; where the app lands after the goal is reached doesn't count */
  function detours(r,result){const ok=byId(r.id).ok,path=r.path.slice(1,result==='done (auto)'?-1:undefined);
    return path.filter(sc=>!ok.includes(sc.replace('+sheet',''))).length}
  function endTask(result){
    const p=P();const r=p&&p.run;if(!r||r.result)return;
    const T=byId(r.id);r.result=result;
    push({type:'mark',action:'end',value:result,label:T.name});
    const clicks=r.log.filter(x=>x.type==='click').length;
    p.tasks.push({phase:'guided',task:r.id,name:T.name,result,seconds:r.start?secs(now()-r.start):0,clicks,best:T.best,extra:Math.max(0,clicks-T.best),
      detours:detours(r,result),backs:r.log.filter(x=>x.type==='click'&&['back','closeModal','closeModalBg'].includes(x.action)).length,
      dead:r.log.filter(x=>x.type==='tap').length,path:r.path.join(' > ')});
    p.queue.shift();p.run=null;save();
    if(result==='done (auto)'){card('done');setTimeout(offer,1400)}else offer();
    draw();
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

  /* styles: the facilitator panel beside the phone, the task card on the phone */
  const css=document.createElement('style');
  css.textContent=`#study{position:fixed;z-index:9999;top:max(12px,env(safe-area-inset-top,0px));left:max(12px,env(safe-area-inset-left,0px));width:300px;max-height:calc(100% - 24px);overflow:auto;
    background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);font:13px/1.4 Manrope,system-ui,sans-serif;padding:14px}
  #study[hidden]{display:none}#study h2{font-size:15px;margin:0 0 2px}#study .st-m{color:var(--muted);font-size:12px}
  #study .st-row{display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap}#study input{flex:1;min-width:0;border:1px solid var(--line);border-radius:10px;padding:7px 9px;background:var(--bg)}
  #study button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:7px 10px;background:var(--primary-soft);color:var(--primary);cursor:pointer}
  #study button.st-p{background:var(--primary);color:var(--primary-ink)}#study button.st-g{background:var(--ok-soft);color:var(--ok)}#study button.st-r{background:var(--stop-soft);color:var(--stop)}
  #study .st-tl{display:grid;grid-template-columns:1fr auto;gap:4px 8px;margin-top:10px;align-items:center}
  #study .st-tl span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#study .st-ok{color:var(--ok);font-weight:700}#study .st-bad{color:var(--stop);font-weight:700}#study .st-todo{color:var(--muted)}
  #study .st-run{margin-top:10px;padding:10px;border-radius:12px;background:var(--warn-soft)}#study .st-clock{font:700 22px/1 "Barlow Condensed",Manrope,sans-serif;font-variant-numeric:tabular-nums}
  #study .st-note{color:var(--ok);font-weight:700;min-height:1.4em;margin-top:6px}
  @media (max-width:760px){#study{top:auto;bottom:max(12px,env(safe-area-inset-bottom,0px));width:auto;right:max(12px,env(safe-area-inset-right,0px));max-height:55%}}
  #study-card{position:absolute;z-index:80;font-family:Manrope,system-ui,sans-serif;color:var(--ink)}
  #study-card.sc-full{inset:0;background:rgba(12,16,34,.42);backdrop-filter:blur(4px);display:flex;align-items:flex-end;padding:16px}
  #study-card .sc-box{width:100%;background:var(--surface);border-radius:26px;padding:22px 20px 18px;box-shadow:0 20px 50px -20px rgba(0,0,0,.5)}
  #study-card .sc-eyebrow{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
  #study-card .sc-ask{font:700 26px/1.15 "Barlow Condensed",Manrope,sans-serif;margin:8px 0 6px;text-wrap:balance}
  #study-card .sc-sub{font-size:13.5px;color:var(--muted);line-height:1.45}
  #study-card button{font:inherit;font-weight:800;border:0;border-radius:16px;cursor:pointer}
  #study-card .sc-go{display:block;width:100%;height:52px;margin-top:16px;background:var(--primary);color:var(--primary-ink);font-size:16px}
  #study-card.sc-strip{left:12px;right:12px;top:6px;background:var(--ink);color:var(--bg);border-radius:18px;padding:8px 8px 8px 14px;display:flex;gap:8px;align-items:center;font-size:13px;box-shadow:0 10px 24px -10px rgba(0,0,0,.5)}
  #study-card.sc-strip span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #study-card.sc-strip button{padding:6px 10px;font-size:12px;background:rgba(255,255,255,.16);color:inherit}
  #study-card .sc-done{font:700 30px/1 "Barlow Condensed",Manrope,sans-serif;color:var(--ok)}`;
  document.head.appendChild(css);
  const h=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);

  /* the card on the phone */
  const phone=()=>document.querySelector('.phone')||document.body;
  function card(kind){
    let c=document.getElementById('study-card');
    if(!kind){if(c)c.remove();return}
    if(!c){c=document.createElement('div');c.id='study-card';phone().appendChild(c)}
    const p=P();const r=p&&p.run;const T=r&&byId(r.id);
    const doneN=p?p.tasks.filter(x=>x.phase==='guided'&&x.result!=='not available').length:0,total=doneN+(p?p.queue.length:0),n=doneN+1;
    c.removeAttribute('role');c.removeAttribute('aria-label');
    if(kind==='task'){c.className='sc-full';c.setAttribute('role','dialog');c.setAttribute('aria-label','Task '+n);
      c.innerHTML=`<div class="sc-box"><div class="sc-eyebrow">${n===1?'A few more things to try · ':''}Task ${n} of ${total}</div><div class="sc-ask">${h(T.ask)}</div>
      <div class="sc-sub">Take your time and think out loud. Tap “I’m done” at the top when you think you’ve finished.</div><button class="sc-go" data-sc="start">Start task</button></div>`}
    if(kind==='strip'){c.className='sc-strip';c.setAttribute('role','status');
      c.innerHTML=`<span>Task ${n}/${total} · ${h(T.ask)}</span><button data-sc="done">I’m done</button><button data-sc="skip">Skip</button>`}
    if(kind==='intro'){c.className='sc-full';c.setAttribute('role','dialog');c.setAttribute('aria-label','Before we start');
      c.innerHTML=`<div class="sc-box"><div class="sc-eyebrow">Before we start</div><div class="sc-sub" style="margin-top:8px;color:var(--ink)">${h(SCRIPT.background)}</div>
      <div class="sc-eyebrow" style="margin-top:16px">Your first task</div><div class="sc-ask" style="font-size:23px">${h(SCRIPT.opening)}</div>
      <button class="sc-go" data-sc="begin">Start</button></div>`}
    if(kind==='after'){const k=leftAfter(p).length;c.className='sc-full';c.setAttribute('role','dialog');c.setAttribute('aria-label','The cleaning is done');
      c.innerHTML=`<div class="sc-box"><div class="sc-eyebrow">The cleaning is done</div><div class="sc-ask">${k} more thing${k>1?'s':''} to try</div>
      <div class="sc-sub">One at a time. Think out loud as you go.</div><button class="sc-go" data-sc="go">Continue</button>
      <button data-sc="keep" style="display:block;width:100%;margin-top:8px;padding:10px;background:none;color:var(--primary);font-size:14px">Not yet, keep exploring</button></div>`}
    if(kind==='done'){c.className='sc-full';c.innerHTML=`<div class="sc-box" style="text-align:center"><div class="sc-done">Done</div><div class="sc-sub" style="margin-top:6px">Nice. On to the next one.</div></div>`}
    if(kind==='thanks'){c.className='sc-full';c.innerHTML=`<div class="sc-box" style="text-align:center"><div class="sc-ask">That’s everything. Thank you!</div><div class="sc-sub">The researcher will take it from here.</div></div>`}
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('#study-card [data-sc]');if(!b)return;
    const k=b.dataset.sc;
    if(k==='start')startTask_();
    if(k==='begin')startExplore();
    if(k==='go')endExplore();
    if(k==='keep')keepExploring();
    if(k==='done')endTask('said done');
    if(k==='skip')endTask('skipped by participant');
  });

  /* the facilitator panel */
  const box=document.createElement('div');box.id='study';box.hidden=true;box.setAttribute('aria-label','Study log');document.body.appendChild(box);
  let msg='';const note=t=>{msg=t;draw();setTimeout(()=>{msg='';draw()},2000)};
  // the published web version can't save files, so it offers copying only
  const dlBtn=()=>window.STUDY_NO_DOWNLOAD?'':'<button data-s="dl">Download CSV</button>';
  const exportRow=()=>`<div class="st-row">${dlBtn()}<button data-s="cp">Copy summary</button><button data-s="cpl">Copy taps</button></div>`;
  function drawClock(){const c=box.querySelector('.st-clock');const p=P();if(!c||!p)return;
    if(p.phase==='explore')c.textContent=mmss(exploreMs(p))+(p.explore.since?'':' ⏸');else if(p.run)c.textContent=p.run.start?mmss(now()-p.run.start):'waiting'}
  function draw(){
    if(box.hidden)return;const p=P();
    let s=`<div style="display:flex;justify-content:space-between;align-items:start"><div><h2>Study log</h2><div class="st-m">For the facilitator. Shift+S hides it.</div></div><button data-s="hide" aria-label="Hide the study log">Hide</button></div>`;
    if(!p){
      s+=`<div class="st-row"><input id="study-pid" value="P${Object.keys(D.people).length+1}" aria-label="Participant ID" autocomplete="off"><button class="st-p" data-s="new">Begin</button></div>
      <p class="st-m" style="margin-top:6px">Begin shows the background and opening task on the phone. Free exploration runs until the cleaning ends; then the phone guides them through the after-cleaning tasks they didn’t reach.</p>`;
      const n=Object.keys(D.people).length;
      if(n)s+=`<p class="st-m" style="margin-top:8px">${n} participant${n>1?'s':''} saved in this browser.</p>`+exportRow();
    }else{
      s+=`<div class="st-row" style="margin-top:6px"><b>${h(D.pid)}</b><span class="st-m">· ${live()?'Real robot':'Simulation'}</span><span style="flex:1"></span><button data-s="end">End session</button></div>`;
      if(p.phase==='intro')s+=`<div class="st-run"><b>Read out, or let them read it on the phone</b>
        <p class="st-m" style="margin-top:6px;color:var(--ink)"><b>Background.</b> ${h(SCRIPT.background)}</p>
        <p class="st-m" style="margin-top:6px;color:var(--ink)"><b>Opening task.</b> ${h(SCRIPT.opening)}</p>
        <div class="st-m" style="margin-top:6px">The clock starts when they tap Start on the phone.</div><div class="st-row"><button class="st-p" data-s="startx">Start now</button></div></div>`;
      if(p.phase==='explore'){const k=Object.keys(p.explore.achieved).length;
        s+=`<div class="st-run"><div style="display:flex;justify-content:space-between;align-items:center"><b>Free exploration</b><span class="st-clock">${mmss(exploreMs(p))+(p.explore.since?'':' ⏸')}</span></div>
        <div class="st-m" style="margin-top:4px">“${h(SCRIPT.opening)}”</div>
        ${p.explore.since?'':'<div class="st-m" style="margin-top:4px">The cleaning ended, so the clock is paused. It carries on if they start another cleaning.</div>'}
        <div class="st-m" style="margin-top:4px">${k} of ${TASKS.length} goals reached on their own · ${p.explore.log.filter(x=>x.type==='click').length} taps</div>
        <div class="st-row"><button class="st-p" data-s="endx">End this part</button><span class="st-m">if the cleaning end wasn’t picked up</span></div></div>`}
      if(p.phase==='guided'){
        s+=`<div class="st-run"><b>Guided tasks</b><div class="st-m">Shown on the phone one by one. If the app misses the end, use End task or Skip.</div>`;
        p.queue.forEach((id,i)=>{const T=byId(id),r=p.run&&p.run.id===id?p.run:null;
          s+=`<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><b>${T.id} ${h(T.name)}</b>${r?`<span class="st-clock" style="font-size:18px">${r.start?mmss(now()-r.start):'waiting'}</span>`:''}</div>
          <div class="st-m">“${h(T.ask)}”</div>
          ${r&&r.start?`<div class="st-m">${r.log.filter(x=>x.type==='click').length} taps (best ${T.best}) · ${detours(r)} detours</div>`:r?'<div class="st-m">Waiting for them to tap Start task.</div>':''}
          <div class="st-row">${r?'<button class="st-g" data-s="ok">End task</button><button data-s="skip">Skip</button>':`<button data-s="skipq" data-v="${id}">Skip</button>`}</div></div>`});
        s+=`</div>`}
      if(p.phase==='done')s+=`<div class="st-run" style="background:var(--ok-soft)"><b>Session complete.</b> Copy or download the results, then End session.</div>`;
      s+=`<div class="st-tl">${TASKS.map(T=>{
        const a=p.explore.achieved[T.id],g=[...p.tasks].reverse().find(x=>x.phase==='guided'&&x.task===T.id);
        const st=a?`<span class="st-ok">✓ explored ${mmss(a.ms)}</span>`:g&&g.result==='not available'?'<span class="st-todo">n/a</span>':g?`<span class="${/^done/.test(g.result)?'st-ok':'st-bad'}">${h(g.result)} ${g.seconds}s</span>`:
          p.run&&p.run.id===T.id?'<span class="st-m">now</span>':p.phase==='explore'||p.phase==='intro'?'<span class="st-todo">—</span>':T.after?'<span class="st-todo">to do</span>':'<span class="st-todo">not reached</span>';
        return `<span title="${h(T.ask)}">${T.id} ${h(T.name)}</span>${st}`}).join('')}</div>`;
      if(live())s+=`<p class="st-m" style="margin-top:8px">Real robot: starting a cleaning moves the robot.</p>`;
      s+=exportRow();
    }
    s+=`<div class="st-note" role="status">${h(msg)}</div>`;
    const keep=document.activeElement&&document.activeElement.id==='study-pid'?document.activeElement.value:null;
    box.innerHTML=s;if(keep!==null){const i=box.querySelector('#study-pid');i.value=keep;i.focus()}
  }
  box.addEventListener('click',e=>{
    const b=e.target.closest('[data-s]');if(!b)return;const k=b.dataset.s;
    if(k==='hide')toggle(false);
    if(k==='new'){const v=(box.querySelector('#study-pid').value||'').trim();if(!v){note('Enter a participant ID first');return}
      if(D.people[v]){note(v+' already exists. Use another ID.');return}begin(v)}
    if(k==='endx')endExplore();
    if(k==='startx')startExplore();
    if(k==='skipq'){const p=P();const T=byId(b.dataset.v);if(p&&T){p.queue=p.queue.filter(x=>x!==T.id);p.tasks.push({phase:'guided',task:T.id,name:T.name,result:'skipped',seconds:0,clicks:0,best:T.best,path:''});save();draw()}}
    if(k==='end'){const p=P();if(p&&p.run&&p.run.start&&!p.run.result)endTask('stopped');if(P())P().phase='done';card(null);D.pid=null;save();draw()}
    if(k==='ok')endTask('done (facilitator)');if(k==='skip')endTask('skipped');
    if(k==='dl'){const d=new Date().toISOString().slice(0,10);download(`study-summary-${d}.csv`,summaryCSV());setTimeout(()=>download(`study-taps-${d}.csv`,logCSV()),400)}
    if(k==='cp')copy(summaryCSV());
    if(k==='cpl')copy(logCSV());
  });
  box.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='study-pid'){e.preventDefault();box.querySelector('[data-s="new"]').click()}});
  function toggle(on){box.hidden=on===undefined?!box.hidden:!on;try{localStorage.setItem(KEY+'-open',box.hidden?'':'1')}catch(e){}draw()}
  document.addEventListener('keydown',e=>{if(e.shiftKey&&(e.key==='S'||e.key==='s')&&!/input|textarea/i.test(e.target.tagName)){e.preventDefault();toggle()}});
  let open=false;try{open=!!localStorage.getItem(KEY+'-open')}catch(e){}
  if(open||new URLSearchParams(location.search).has('study'))toggle(true);
  // after a reload in the middle of a session, put the phone card back
  {const p=P();if(p&&p.phase==='intro')card('intro');if(p&&p.phase==='guided'&&p.run)card(p.run.start?'strip':'task');else if(p&&p.phase==='done'){D.pid=null;save()}}
  window.STUDY={toggle,begin,startExplore,endExplore,keepExploring,startTask:startTask_,endTask,tasks:TASKS,data:()=>D,summaryCSV,logCSV};
  if(typeof A!=='undefined')A.studyLog=()=>toggle(true);
})();
