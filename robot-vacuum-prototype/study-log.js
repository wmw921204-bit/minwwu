/* Study log for usability sessions, run like a moderator.
   1 Free exploration: the participant uses the app freely; every task goal they reach on their own is noted with the time.
   2 Guided tasks: when exploration ends, the app shows the tasks they didn't reach, one at a time, on the phone.
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
  const ensureCleaning=()=>{if(!S.task||S.task.done){startTask({...S.ui.setup,kind:'home',rooms:[]});S.ui.stack=[];S.ui.tab='home'}};
  const setLevel=m=>{S.autonomy=m;S.temp=null;if(window.levelNotif)levelNotif(m)};
  const clicked=(t,a,v)=>t.log.some(x=>x.type==='click'&&x.action===a&&(v===undefined||x.value===v));

  /* The tasks from the test plan. ask: what the participant reads. ok: screens on the expected path (others count as detours).
     best: fewest taps. setup: puts the simulation in the right state for a guided task. done(base,t): the goal is reached. */
  const TASKS=[
    {id:'T1',name:'First setup',ask:'You just got the robot. Set up the app.',best:3,ok:['onboarding','home'],
      setup(){A.ctlRestart()},done:()=>!S.onboarding},
    {id:'T2',name:'Clean the living room',ask:'Clean only the living room.',best:4,ok:['home','setup'],
      done:()=>!!S.task&&!S.task.done&&/living/i.test(S.task.scopeLabel||'')},
    {id:'T3',name:'Answer the robot (Assist)',ask:'The robot found something near the sofa and asks what to do. Deal with it.',best:2,ok:['home','event','map','activity'],
      setup(){setLevel('assist');ensureCleaning();fire('cable')},base:()=>evs('cable').map(e=>e.id),
      done:b=>evs('cable').some(e=>!b.includes(e.id)&&e.lastAct&&!(e.autonomous&&!e.changed))},
    {id:'T4',name:'Change a robot decision',ask:'The robot decided something by itself. You think it was wrong. Change it.',best:2,ok:['home','event','map','activity'],
      setup(){setLevel('autoNotify');ensureCleaning();fire('cable')},base:()=>(S.events||[]).filter(e=>e.changed).map(e=>e.id),
      done:b=>(S.events||[]).some(e=>e.changed&&!b.includes(e.id))},
    {id:'T5',name:'Undo a choice',ask:'Make a choice for the robot, then take it back straight away.',best:2,ok:['home','event','map','activity'],
      setup(){setLevel('assist');ensureCleaning();fire('cable')},done:(b,t)=>clicked(t,'undoAct')},
    {id:'T6',name:'Full auto for an hour',ask:'You have a meeting for an hour. Let the robot decide on its own until then.',best:4,ok:['home','settings','autonomy'],
      done:()=>S.autonomy==='fullAuto'&&!!S.temp&&!S.temp.task},
    {id:'T7',name:'Check found objects',ask:'After a cleaning, check the objects the robot wasn’t sure about.',best:2,ok:['home','map','activity','report'],
      done:(b,t)=>{const n=pendingObjs().length;if(n&&S.task&&S.task.done)t.seen=true;return !!t.seen&&n===0}},
    {id:'T8',name:'Retry keeps failing',ask:'The robot can’t get under the bed. Try to get it cleaned.',best:4,ok:['home','event','map','activity'],
      setup(){setLevel('assist');S.ctl.retry='fail';ensureCleaning();fire('bed')},
      done:()=>evs('bed').some(e=>(e.retryFails||0)>=2&&e.status!=='needsReview'&&e.status!=='inProgress')},
    {id:'T9',name:'Find what needs you',ask:'Find everything that still needs you.',best:1,ok:['home','activity'],
      done:(b,t)=>clicked(t,'toNeeds')||clicked(t,'tab','activity')},
    {id:'T10',name:'Stop now',ask:'You have to leave. Stop the robot right now.',best:2,ok:['home','map'],
      setup(){ensureCleaning()},done:(b,t)=>!!(S.task&&S.task.done&&S.task.endedEarly)||clicked(t,'confirmEnd')},
  ];
  const byId=id=>TASKS.find(x=>x.id===id);

  const screen=()=>{
    if(S.onboarding)return 'onboarding';
    if(S.ui.away)return 'lockscreen';
    const c=S.ui.stack[S.ui.stack.length-1]||{name:S.ui.tab};
    return S.ui.modal?(c.name||'')+'+sheet':c.name;
  };
  const label=el=>(el.getAttribute('aria-label')||el.textContent||'').replace(/\s+/g,' ').trim().slice(0,48);
  const mmss=ms=>{const s=Math.max(0,Math.floor(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
  const secs=ms=>Math.round(ms/100)/10;

  /* the log: one list per participant; the guided task that is running also keeps its own copy */
  const push=x=>{const p=P();if(!p)return;const r=p.run&&p.run.start?p.run:null;
    x={t:now(),phase:p.phase,task:r?r.id:'',ms:r?now()-r.start:p.phase==='explore'?now()-p.explore.start:null,screen:screen(),...x};
    p.log.push(x);if(r)r.log.push(x);if(p.phase==='explore')p.explore.log.push(x);save()};

  document.addEventListener('click',e=>{
    const p=P();if(!p||p.phase==='done'||e.target.closest('#study,#study-card'))return;
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
    if(p.phase==='explore')checkExplore(p);
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
    D.people[pid]={mode:live()?'real robot':'simulation',started:new Date().toISOString(),phase:'explore',
      explore:{start:now(),end:null,log:[],path:[],achieved:{},ctx},queue:[],run:null,tasks:[],log:[]};
    lastScreen=null;save();draw();
  }
  function checkExplore(p){
    const ex=p.explore;
    TASKS.forEach(T=>{
      if(ex.achieved[T.id])return;
      const c=ex.ctx[T.id];c.log=ex.log; // done() reads taps from here
      let ok=false;try{ok=T.done(c.base,c)}catch(e){}
      if(ok){const ms=now()-ex.start;ex.achieved[T.id]={ms,clicks:ex.log.filter(x=>x.type==='click').length,path:ex.path.slice(-8).join(' > ')};
        push({type:'mark',action:'achieved',value:T.id,label:T.name})}
    });
  }
  function endExplore(){
    const p=P();if(!p||p.phase!=='explore')return;
    checkExplore(p);
    const ex=p.explore;ex.end=now();
    p.tasks.push({phase:'explore',task:'',name:'Free exploration',result:'',seconds:secs(ex.end-ex.start),clicks:ex.log.filter(x=>x.type==='click').length,
      dead:ex.log.filter(x=>x.type==='tap').length,path:''});
    TASKS.forEach(T=>{const a=ex.achieved[T.id];if(a)p.tasks.push({phase:'explore',task:T.id,name:T.name,result:'achieved',seconds:secs(a.ms),clicks:a.clicks,best:T.best,path:a.path})});
    ex.log=[];Object.values(ex.ctx).forEach(c=>delete c.log); // the full log stays in p.log
    p.queue=TASKS.filter(T=>!ex.achieved[T.id]).map(T=>T.id);
    push({type:'mark',action:'exploration ended',value:String(p.queue.length),label:p.queue.length+' tasks left'});
    p.phase=p.queue.length?'guided':'done';p.run=null;save();
    if(p.queue.length)offer();else card('thanks');
    draw();
  }

  /* 2 guided tasks: the phone shows each one; the participant starts it */
  function offer(){
    const p=P();if(!p)return;const id=p.queue[0];if(!id){p.phase='done';save();card('thanks');draw();return}
    p.run={id,start:null,base:null,log:[],path:[],result:null};save();card('task');draw();
  }
  function startTask_(){
    const p=P();const r=p&&p.run;if(!r||r.start)return;
    const T=byId(r.id);
    if(T.setup&&!live()){try{T.setup()}catch(e){console.warn('study setup',e)}commit(true)}
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
    const doneN=p?p.tasks.filter(x=>x.phase==='guided').length:0,total=doneN+(p?p.queue.length:0),n=doneN+1;
    c.removeAttribute('role');c.removeAttribute('aria-label');
    if(kind==='task'){c.className='sc-full';c.setAttribute('role','dialog');c.setAttribute('aria-label','Task '+n);
      c.innerHTML=`<div class="sc-box"><div class="sc-eyebrow">${n===1?'A few more things to try · ':''}Task ${n} of ${total}</div><div class="sc-ask">${h(T.ask)}</div>
      <div class="sc-sub">Take your time and think out loud. Tap “I’m done” at the top when you think you’ve finished.</div><button class="sc-go" data-sc="start">Start task</button></div>`}
    if(kind==='strip'){c.className='sc-strip';c.setAttribute('role','status');
      c.innerHTML=`<span>Task ${n}/${total} · ${h(T.ask)}</span><button data-sc="done">I’m done</button><button data-sc="skip">Skip</button>`}
    if(kind==='done'){c.className='sc-full';c.innerHTML=`<div class="sc-box" style="text-align:center"><div class="sc-done">Done</div><div class="sc-sub" style="margin-top:6px">Nice. On to the next one.</div></div>`}
    if(kind==='thanks'){c.className='sc-full';c.innerHTML=`<div class="sc-box" style="text-align:center"><div class="sc-ask">That’s everything. Thank you!</div><div class="sc-sub">The researcher will take it from here.</div></div>`}
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('#study-card [data-sc]');if(!b)return;
    const k=b.dataset.sc;
    if(k==='start')startTask_();
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
    if(p.phase==='explore')c.textContent=mmss(now()-p.explore.start);else if(p.run)c.textContent=p.run.start?mmss(now()-p.run.start):'waiting'}
  function draw(){
    if(box.hidden)return;const p=P();
    let s=`<div style="display:flex;justify-content:space-between;align-items:start"><div><h2>Study log</h2><div class="st-m">For the facilitator. Shift+S hides it.</div></div><button data-s="hide" aria-label="Hide the study log">Hide</button></div>`;
    if(!p){
      s+=`<div class="st-row"><input id="study-pid" value="P${Object.keys(D.people).length+1}" aria-label="Participant ID" autocomplete="off"><button class="st-p" data-s="new">Begin</button></div>
      <p class="st-m" style="margin-top:6px">Starts free exploration. Tasks they reach on their own are noted. When you end exploration, the phone shows the rest one by one.</p>`;
      const n=Object.keys(D.people).length;
      if(n)s+=`<p class="st-m" style="margin-top:8px">${n} participant${n>1?'s':''} saved in this browser.</p>`+exportRow();
    }else{
      s+=`<div class="st-row" style="margin-top:6px"><b>${h(D.pid)}</b><span class="st-m">· ${live()?'Real robot':'Simulation'}</span><span style="flex:1"></span><button data-s="end">End session</button></div>`;
      if(p.phase==='explore'){const k=Object.keys(p.explore.achieved).length;
        s+=`<div class="st-run"><div style="display:flex;justify-content:space-between;align-items:center"><b>Free exploration</b><span class="st-clock">${mmss(now()-p.explore.start)}</span></div>
        <div class="st-m" style="margin-top:4px">${k} of ${TASKS.length} tasks reached on their own · ${p.explore.log.filter(x=>x.type==='click').length} taps</div>
        <div class="st-row"><button class="st-p" data-s="endx">End exploration</button></div></div>`}
      if(p.phase==='guided'&&p.run){const T=byId(p.run.id);const r=p.run;const c=r.log.filter(x=>x.type==='click').length;
        s+=`<div class="st-run"><div style="display:flex;justify-content:space-between;align-items:center"><b>${T.id} ${h(T.name)}</b><span class="st-clock">${r.start?mmss(now()-r.start):'waiting'}</span></div>
        ${r.start?`<div class="st-m" style="margin-top:4px">${c} tap${c===1?'':'s'} (best ${T.best}) · ${detours(r)} detour${detours(r)===1?'':'s'} · ${r.log.filter(x=>x.type==='tap').length} dead taps</div>`:'<div class="st-m" style="margin-top:4px">The phone is showing this task. Waiting for them to press Start task.</div>'}
        <div class="st-row"><button class="st-g" data-s="ok">Success</button><button class="st-r" data-s="fail">Failed</button><button data-s="skip">Skip</button></div></div>`}
      if(p.phase==='done')s+=`<div class="st-run" style="background:var(--ok-soft)"><b>Session complete.</b> Copy or download the results, then End session.</div>`;
      s+=`<div class="st-tl">${TASKS.map(T=>{
        const a=p.explore.achieved[T.id],g=[...p.tasks].reverse().find(x=>x.phase==='guided'&&x.task===T.id);
        const st=a?`<span class="st-ok">✓ explored ${mmss(a.ms)}</span>`:g?`<span class="${g.result==='done (auto)'||g.result==='success'?'st-ok':'st-bad'}">${h(g.result)} ${g.seconds}s</span>`:
          p.run&&p.run.id===T.id?'<span class="st-m">now</span>':p.phase==='explore'?'<span class="st-todo">—</span>':'<span class="st-todo">to do</span>';
        return `<span title="${h(T.ask)}">${T.id} ${h(T.name)}</span>${st}`}).join('')}</div>`;
      if(live())s+=`<p class="st-m" style="margin-top:8px">Real robot: guided tasks aren’t set up for you, and tasks that start a cleaning move the robot.</p>`;
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
    if(k==='end'){const p=P();if(p&&p.run&&p.run.start&&!p.run.result)endTask('stopped');if(P())P().phase='done';card(null);D.pid=null;save();draw()}
    if(k==='ok')endTask('success');if(k==='fail')endTask('failed');if(k==='skip')endTask('skipped');
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
  {const p=P();if(p&&p.phase==='guided'&&p.run)card(p.run.start?'strip':'task');else if(p&&p.phase==='done'){D.pid=null;save()}}
  window.STUDY={toggle,begin,endExplore,startTask:startTask_,endTask,tasks:TASKS,data:()=>D,summaryCSV,logCSV};
  if(typeof A!=='undefined')A.studyLog=()=>toggle(true);
})();
