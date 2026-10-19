/* Study log for usability sessions: a facilitator panel that times each task, records every tap and screen,
   marks a task done when its goal is reached, and exports CSV. Hidden from participants: Shift+S, ?study,
   or Settings → Testing → Study log. Data stays in this browser (localStorage) until exported. */
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

  /* The tasks from the test plan. ok: screens on the expected path (anything else counts as a detour).
     best: fewest taps. setup: puts the simulation in the right state (simulation only). done: the goal is reached. */
  const TASKS=[
    {id:'T1',name:'First setup',ask:'You just got the robot. Set up the app.',best:3,ok:['onboarding'],
      setup(){A.ctlRestart()},done:()=>!S.onboarding},
    {id:'T2',name:'Clean the living room',ask:'Clean only the living room.',best:4,ok:['home','setup'],
      done:()=>S.task&&!S.task.done&&/living/i.test(S.task.scopeLabel||'')},
    {id:'T3',name:'Answer the robot (Assist)',ask:'The robot found something near the sofa. Deal with it.',best:2,ok:['home','event','map','activity'],
      setup(){setLevel('assist');ensureCleaning();fire('cable')},base:()=>evs('cable').map(e=>e.id),
      done:b=>evs('cable').some(e=>!b.includes(e.id)&&e.lastAct)},
    {id:'T4',name:'Change a robot decision',ask:'The robot decided by itself. You think it was wrong. Make it clean that spot.',best:2,ok:['home','event','map','activity'],
      setup(){setLevel('autoNotify');ensureCleaning();fire('cable')},base:()=>(S.events||[]).filter(e=>e.changed).map(e=>e.id),
      done:b=>(S.events||[]).some(e=>e.changed&&!b.includes(e.id))},
    {id:'T5',name:'Undo a choice',ask:'Make a choice, then take it back straight away.',best:2,ok:['home','event','map','activity'],
      setup(){setLevel('assist');ensureCleaning();fire('cable')},done:(b,t)=>clicked(t,'undoAct')},
    {id:'T6',name:'Full auto for an hour',ask:'You have a meeting for an hour. Let the robot decide on its own until then.',best:4,ok:['home','settings','autonomy'],
      done:()=>S.autonomy==='fullAuto'&&!!S.temp&&!S.temp.task},
    {id:'T7',name:'Check found objects',ask:'The cleaning is done. Check what the robot found.',best:2,ok:['home','map','activity','report'],
      base:()=>pendingObjs().length,done:b=>b>0&&pendingObjs().length===0},
    {id:'T8',name:'Retry keeps failing',ask:'The robot can’t get under the bed. Try to get it cleaned.',best:4,ok:['home','event','map','activity'],
      setup(){setLevel('assist');S.ctl.retry='fail';ensureCleaning();fire('bed')},
      done:()=>evs('bed').some(e=>(e.retryFails||0)>=2&&e.status!=='needsReview'&&e.status!=='inProgress')},
    {id:'T9',name:'Find what needs you',ask:'You just got home. What still needs you?',best:1,ok:['home','activity'],
      done:(b,t)=>clicked(t,'toNeeds')||clicked(t,'tab','activity')},
    {id:'T10',name:'Stop now',ask:'You have to leave. Stop the robot right now.',best:2,ok:['home','map'],
      setup(){ensureCleaning()},done:(b,t)=>!!(S.task&&S.task.done&&S.task.endedEarly)||clicked(t,'confirmEnd')},
  ];
  const cur_t=()=>{const p=P();return p&&p.run||{log:[]}};

  const screen=()=>{
    if(S.onboarding)return 'onboarding';
    if(S.ui.away)return 'lockscreen';
    const c=S.ui.stack[S.ui.stack.length-1]||{name:S.ui.tab};
    return S.ui.modal?(c.name||'')+'+sheet':c.name;
  };
  const label=el=>(el.getAttribute('aria-label')||el.textContent||'').replace(/\s+/g,' ').trim().slice(0,48);
  const rel=()=>{const r=cur_t();return r.start?now()-r.start:0};
  const push=x=>{const p=P();if(!p)return;const r=p.run;x={t:now(),tt:r?now()-r.start:null,task:r?r.id:'',screen:screen(),...x};
    (r?r.log:p.free).push(x);save()};

  /* taps: logged before the app acts on them */
  document.addEventListener('click',e=>{
    if(!P()||e.target.closest('#study'))return;
    if(!e.target.closest('#app'))return;
    const el=e.target.closest('[data-a]');
    if(el&&!el.disabled)push({type:'click',action:el.dataset.a,value:el.dataset.v||'',label:label(el)});
    else push({type:'tap',action:'',value:'',label:el?'(disabled) '+label(el):(e.target.className&&String(e.target.className).slice(0,30))||e.target.tagName.toLowerCase()});
  },true);

  /* screens and goals, checked a few times a second while a task runs */
  let lastScreen=null;
  setInterval(()=>{
    const p=P();if(!p||!p.run)return;
    const r=p.run,sc=screen();
    if(sc!==lastScreen){const first=lastScreen===null;lastScreen=sc;r.path.push(sc);push({type:'screen',action:'',value:'',label:sc});
      // a detour: moving to a screen that isn't on this task's path (sheets over an allowed screen are fine)
      if(!first&&!TASKS.find(x=>x.id===r.id).ok.includes(sc.replace('+sheet','')))r.detours++}
    const T=TASKS.find(x=>x.id===r.id);
    let ok=false;try{ok=T.done(r.base,r)}catch(e){}
    if(ok)finish('done (auto)');
    draw();
  },300);
  setInterval(()=>{if(P()&&P().run)drawClock()},1000);

  function start(id){
    const p=P();if(!p)return;if(p.run)finish('stopped');
    const T=TASKS.find(x=>x.id===id);
    if(T.setup&&!live()){try{T.setup()}catch(e){console.warn('study setup',e)}commit(true)}
    let base=null;try{base=T.base?T.base():null}catch(e){}
    p.run={id,start:now(),base,log:[],path:[],detours:0};lastScreen=null;
    push({type:'mark',action:'start',value:'',label:T.name});draw();
  }
  function finish(result){
    const p=P();if(!p||!p.run)return;const r=p.run,T=TASKS.find(x=>x.id===r.id);
    push({type:'mark',action:'end',value:result,label:T.name});
    const clicks=r.log.filter(x=>x.type==='click').length;
    p.tasks.push({task:r.id,name:T.name,result,seconds:Math.round((now()-r.start)/100)/10,clicks,best:T.best,extra:Math.max(0,clicks-T.best),
      detours:r.detours,backs:r.log.filter(x=>x.type==='click'&&['back','closeModal','closeModalBg'].includes(x.action)).length,
      dead:r.log.filter(x=>x.type==='tap').length,path:r.path.join(' > ')});
    p.log.push(...r.log);p.run=null;save();draw();
  }

  /* CSV */
  const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  const csv=(rows,cols)=>[cols.join(',')].concat(rows.map(r=>cols.map(c=>esc(r[c])).join(','))).join('\n');
  function summaryCSV(){
    const rows=[];Object.entries(D.people).forEach(([pid,p])=>p.tasks.forEach(t=>rows.push({participant:pid,mode:p.mode,...t})));
    return csv(rows,['participant','mode','task','name','result','seconds','clicks','best','extra','detours','backs','dead','path']);
  }
  function logCSV(){
    const rows=[];Object.entries(D.people).forEach(([pid,p])=>p.log.concat(p.free).forEach(x=>rows.push({participant:pid,time:new Date(x.t).toISOString(),task_ms:x.tt,...x})));
    return csv(rows,['participant','time','task','task_ms','type','action','value','label','screen']);
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

  /* panel */
  const css=document.createElement('style');
  css.textContent=`#study{position:fixed;z-index:9999;top:max(12px,env(safe-area-inset-top,0px));left:max(12px,env(safe-area-inset-left,0px));width:300px;max-height:calc(100% - 24px);overflow:auto;
    background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);font:13px/1.4 Manrope,system-ui,sans-serif;padding:14px}
  #study[hidden]{display:none}#study h2{font-size:15px;margin:0 0 2px}#study .st-m{color:var(--muted);font-size:12px}
  #study .st-row{display:flex;gap:6px;align-items:center;margin-top:8px}#study input{flex:1;min-width:0;border:1px solid var(--line);border-radius:10px;padding:7px 9px;background:var(--bg)}
  #study button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:7px 10px;background:var(--primary-soft);color:var(--primary);cursor:pointer}
  #study button.st-p{background:var(--primary);color:var(--primary-ink)}#study button.st-g{background:var(--ok-soft);color:var(--ok)}#study button.st-r{background:var(--stop-soft);color:var(--stop)}
  #study .st-tl{display:grid;grid-template-columns:1fr auto;gap:4px 8px;margin-top:10px;align-items:center}
  #study .st-tl span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#study .st-tl .st-d{color:var(--ok);font-weight:700}#study .st-tl .st-f{color:var(--stop);font-weight:700}
  #study .st-run{margin-top:10px;padding:10px;border-radius:12px;background:var(--warn-soft)}#study .st-clock{font:700 22px/1 "Barlow Condensed",Manrope,sans-serif;font-variant-numeric:tabular-nums}
  #study .st-ask{margin-top:4px;font-style:italic}#study .st-note{color:var(--ok);font-weight:700;min-height:1.4em;margin-top:6px}
  @media (max-width:760px){#study{top:auto;bottom:max(12px,env(safe-area-inset-bottom,0px));width:auto;right:max(12px,env(safe-area-inset-right,0px));max-height:55%}}`;
  document.head.appendChild(css);
  const box=document.createElement('div');box.id='study';box.hidden=true;box.setAttribute('aria-label','Study log');document.body.appendChild(box);
  let msg='';const note=t=>{msg=t;draw();setTimeout(()=>{msg='';draw()},2000)};
  const h=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
  // the published web version can't save files, so it offers copying only
  const dlBtn=()=>window.STUDY_NO_DOWNLOAD?'':'<button data-s="dl">Download CSV</button>';
  const mmss=ms=>{const s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
  function drawClock(){const c=box.querySelector('.st-clock');const r=cur_t();if(c&&r.start)c.textContent=mmss(rel())}
  function draw(){
    if(box.hidden)return;const p=P();
    let s=`<div style="display:flex;justify-content:space-between;align-items:start"><div><h2>Study log</h2><div class="st-m">For the facilitator. Shift+S hides it.</div></div><button data-s="hide" aria-label="Hide the study log">Hide</button></div>`;
    if(!p){
      s+=`<div class="st-row"><input id="study-pid" placeholder="Participant, e.g. P8" autocomplete="off"><button class="st-p" data-s="new">Start</button></div>`;
      const n=Object.keys(D.people).length;
      if(n)s+=`<p class="st-m" style="margin-top:8px">${n} participant${n>1?'s':''} saved in this browser.</p><div class="st-row">${dlBtn()}<button data-s="cp">Copy summary</button><button data-s="cpl">Copy taps</button></div>`;
    }else{
      const r=p.run;
      s+=`<div class="st-row" style="margin-top:6px"><b>${h(D.pid)}</b><span class="st-m">· ${live()?'Real robot':'Simulation'}</span><span style="flex:1"></span><button data-s="end">End session</button></div>`;
      if(r){const T=TASKS.find(x=>x.id===r.id);const c=r.log.filter(x=>x.type==='click').length;
        s+=`<div class="st-run"><div style="display:flex;justify-content:space-between;align-items:center"><b>${T.id} ${h(T.name)}</b><span class="st-clock">${mmss(rel())}</span></div>
        <div class="st-ask">“${h(T.ask)}”</div><div class="st-m" style="margin-top:4px">${c} tap${c===1?'':'s'} (best ${T.best}) · ${r.detours} detour${r.detours===1?'':'s'} · ${r.log.filter(x=>x.type==='tap').length} dead taps</div>
        <div class="st-row"><button class="st-g" data-s="ok">Success</button><button class="st-r" data-s="fail">Failed</button><button data-s="gave">Gave up</button></div></div>`}
      s+=`<div class="st-tl">${TASKS.map(T=>{const last=[...p.tasks].reverse().find(x=>x.task===T.id);
        const res=last?`<span class="${/fail|gave/.test(last.result)?'st-f':'st-d'}">${last.seconds}s</span>`:'';
        return `<span title="${h(T.ask)}">${T.id} ${h(T.name)} ${res}</span><button ${r&&r.id===T.id?'disabled':''} data-s="go" data-v="${T.id}">${last?'Again':'Start'}</button>`}).join('')}</div>`;
      if(live())s+=`<p class="st-m" style="margin-top:8px">Real robot: set each task up by hand. Tasks that start a cleaning move the robot.</p>`;
      s+=`<div class="st-row">${dlBtn()}<button data-s="cp">Copy summary</button><button data-s="cpl">Copy taps</button></div>`;
    }
    s+=`<div class="st-note" role="status">${h(msg)}</div>`;
    const keep=document.activeElement&&document.activeElement.id==='study-pid'?document.activeElement.value:null;
    box.innerHTML=s;if(keep!==null){const i=box.querySelector('#study-pid');i.value=keep;i.focus()}
  }
  box.addEventListener('click',e=>{
    const b=e.target.closest('[data-s]');if(!b)return;const k=b.dataset.s;
    if(k==='hide')toggle(false);
    if(k==='new'){const v=(box.querySelector('#study-pid').value||'').trim();if(!v){note('Enter a participant ID first');return}
      D.pid=v;D.people[v]=D.people[v]||{mode:live()?'real robot':'simulation',started:new Date().toISOString(),tasks:[],log:[],free:[]};save();draw()}
    if(k==='end'){finish('stopped');D.pid=null;save();draw()}
    if(k==='go')start(b.dataset.v);
    if(k==='ok')finish('success');if(k==='fail')finish('failed');if(k==='gave')finish('gave up');
    if(k==='dl'){const d=new Date().toISOString().slice(0,10);download(`study-summary-${d}.csv`,summaryCSV());setTimeout(()=>download(`study-taps-${d}.csv`,logCSV()),400)}
    if(k==='cp')copy(summaryCSV());
    if(k==='cpl')copy(logCSV());
  });
  box.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='study-pid'){e.preventDefault();box.querySelector('[data-s="new"]').click()}});
  function toggle(on){box.hidden=on===undefined?!box.hidden:!on;try{localStorage.setItem(KEY+'-open',box.hidden?'':'1')}catch(e){}draw()}
  document.addEventListener('keydown',e=>{if(e.shiftKey&&(e.key==='S'||e.key==='s')&&!/input|textarea/i.test(e.target.tagName)){e.preventDefault();toggle()}});
  let open=false;try{open=!!localStorage.getItem(KEY+'-open')}catch(e){}
  if(open||new URLSearchParams(location.search).has('study'))toggle(true);
  window.STUDY={toggle,start,finish,tasks:TASKS,data:()=>D,summaryCSV,logCSV};
  if(typeof A!=='undefined')A.studyLog=()=>toggle(true);
})();
