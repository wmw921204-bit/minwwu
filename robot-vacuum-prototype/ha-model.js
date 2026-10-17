/* Home Assistant data → the prototype's own state shapes. No DOM; tested with node --test. */
(function(root){
  /* Affine map from robot coordinates (mm) to map-image pixels, from three calibration points. */
  function transform(calibration){
    if(!Array.isArray(calibration)||calibration.length<3)return null;
    const [a,b,c]=calibration;
    if(![a,b,c].every(p=>p&&p.vacuum&&p.map))return null;
    const ux=b.vacuum.x-a.vacuum.x,uy=b.vacuum.y-a.vacuum.y,vx=c.vacuum.x-a.vacuum.x,vy=c.vacuum.y-a.vacuum.y;
    const det=ux*vy-uy*vx;
    if(!Number.isFinite(det)||Math.abs(det)<1e-9)return null;
    return p=>{
      if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
      const dx=p.x-a.vacuum.x,dy=p.y-a.vacuum.y,u=(dx*vy-dy*vx)/det,v=(ux*dy-uy*dx)/det;
      return {x:a.map.x+u*(b.map.x-a.map.x)+v*(c.map.x-a.map.x),y:a.map.y+u*(b.map.y-a.map.y)+v*(c.map.y-a.map.y)};
    };
  }
  /* The reverse: map-image pixels back to robot millimetres, for drawing rooms and zones on the map. */
  function inverse(calibration){
    if(!Array.isArray(calibration))return null;
    return transform(calibration.map(p=>p&&p.vacuum&&p.map?{vacuum:p.map,map:p.vacuum}:p));
  }
  /* Two dragged points → a rectangle snapped outward to the cell grid, [x1,y1,x2,y2] in mm. */
  function snapBox(a,b,cell=500){
    const x1=Math.floor(Math.min(a.x,b.x)/cell)*cell,y1=Math.floor(Math.min(a.y,b.y)/cell)*cell;
    return [x1,y1,Math.max(x1+cell,Math.ceil(Math.max(a.x,b.x)/cell)*cell),Math.max(y1+cell,Math.ceil(Math.max(a.y,b.y)/cell)*cell)];
  }
  function boxCells(box,cell=500){
    const out=[];for(let i=box[0]/cell;i<box[2]/cell;i++)for(let j=box[1]/cell;j<box[3]/cell;j++)out.push(i+','+j);return out;
  }
  const inBox=(p,b)=>p&&p.x>=b[0]&&p.x<b[2]&&p.y>=b[1]&&p.y<b[3];
  function roomAt(rooms,p){return (rooms||[]).find(r=>r.parts.some(b=>inBox(p,b)))||null}
  /* Map alignment: when the robot's live coordinates drift from the saved map (after a failed
     relocalisation), two pairs of (live point, true point on the map) give a rotation and shift.
     One pair gives a shift only. */
  function alignFrom(a,b){
    if(!a)return null;
    let c=1,s=0;
    if(b){
      const t=Math.atan2(b.map.y-a.map.y,b.map.x-a.map.x)-Math.atan2(b.live.y-a.live.y,b.live.x-a.live.x);
      c=Math.cos(t);s=Math.sin(t);
    }
    return {c,s,tx:a.map.x-(c*a.live.x-s*a.live.y),ty:a.map.y-(s*a.live.x+c*a.live.y)};
  }
  const toMap=(al,p)=>al&&p?{x:al.c*p.x-al.s*p.y+al.tx,y:al.s*p.x+al.c*p.y+al.ty}:p;
  const toRobot=(al,q)=>{if(!al||!q)return q;const x=q.x-al.tx,y=q.y-al.ty;return {x:al.c*x+al.s*y,y:-al.s*x+al.c*y}};
  /* A map-frame box as the robot sees it: its corners moved back, then the box around them. */
  function robotBox(al,b){
    if(!al)return b;
    const q=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].map(([x,y])=>toRobot(al,{x,y}));
    const xs=q.map(p=>p.x),ys=q.map(p=>p.y);
    return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)].map(Math.round);
  }
  /* Pixels per mm along x, used to size the robot, its swept path and spot zones. */
  function pxPerMm(calibration){
    const t=transform(calibration);if(!t)return null;
    const a=t({x:0,y:0}),b=t({x:1000,y:0});return Math.hypot(b.x-a.x,b.y-a.y)/1000;
  }

  const ERRORS={
    lidar_blocked:'The laser sensor is blocked. Clear anything around the top of the robot.',
    bumper_stuck:'The bumper is stuck. Tap it a few times to free it.',
    wheels_suspended:'A wheel is off the floor. Put the robot on flat floor.',
    cliff_sensor_error:'A floor sensor is dirty or blocked. Wipe the sensors underneath.',
    main_brush_jammed:'The main brush is jammed. Remove and clean it.',
    side_brush_jammed:'The side brush is jammed. Remove and clean it.',
    wheels_jammed:'A wheel is jammed. Check the wheels for hair or debris.',
    robot_trapped:'The robot is trapped. Move it to open floor.',
    no_dustbin:'The dustbin is missing. Put it back in.',
    low_battery:'Battery too low. Put the robot on the dock.',
    charging_error:'Charging problem. Check the dock contacts.',
  };
  const errorText=code=>!code||code==='none'?null:(ERRORS[code]||'The robot reports a problem: '+String(code).replace(/_/g,' ')+'.');

  /* entity suffix lookup, e.g. value(snap,'battery') reads sensor.<robot>_battery */
  function entity(snap,suffix){return (snap&&snap.entities||[]).find(e=>e.entity_id.endsWith('_'+suffix))||null}
  function value(snap,suffix){const v=entity(snap,suffix)?.state;return v==null||v==='unknown'||v==='unavailable'?null:v}
  function number(snap,suffix){const v=value(snap,suffix);return v!==null&&Number.isFinite(Number(v))?Number(v):null}

  /* The app's device model: status is one of cleaning, paused, returning, docked, idle, error. null means offline. */
  function device(snap){
    const robot=snap&&snap.vacuum;
    if(!robot||robot.state==='unavailable'||robot.state==='unknown')return null;
    const detail=value(snap,'status');
    const err=errorText(value(snap,'vacuum_error'));
    let status=({cleaning:'cleaning',paused:'paused',returning:'returning',docked:'docked',idle:'idle',error:'error'})[robot.state]||'idle';
    if(['spot_cleaning','zoned_cleaning','segment_cleaning','room_clean'].includes(detail))status='cleaning';
    if(detail==='returning_home')status='returning';
    if(status==='error'||(err&&status!=='docked'))status='error';
    const battery=number(snap,'battery')??robot.attributes?.battery_level??null;
    return {status,battery,error:status==='error'?(err||'The robot needs attention.'):null,detail,
      room:value(snap,'current_room'),area:number(snap,'cleaning_area'),minutes:number(snap,'cleaning_time'),
      charging:value(snap,'status')==='charging'};
  }

  /* Roborock descriptions → the prototype's object types. */
  const LABELS={shoe:'shoe',shoes:'shoe',sock:'sock',socks:'sock',clothes:'clothes',cloth:'clothes',
    cable:'cable',cables:'cable',wire:'cable','power cord':'cable','power strip':'cable',
    'pet waste':'waste',poop:'waste',feces:'waste',scale:'scale','weighing scale':'scale',chair:'chair','chair leg':'chair',
    bowl:'bowl','pet bowl':'bowl',toy:'toy',bag:'bag',box:'box'};
  const GUESSES=['sock','cable','shoe','toy','clothes','bag'];
  function objectId(robot,mapId,o){return ['ha',robot,mapId,o.x,o.y,o.type_code].join(':')}
  function selectedMap(snap){
    const maps=snap?.geometry?.maps||[];
    const sel=value(snap,'selected_map');const n=sel&&sel.match(/\d+/)?.[0];
    return (n!=null?maps.find(m=>String(m.map_id)===n):null)||(maps.length===1?maps[0]:null);
  }
  /* Obstacles from the robot's map cache. Known types keep the robot's label; unknown types ask the user. */
  function objects(robot,map,notes={}){
    const out=[],seen=new Set();
    for(const raw of map?.obstacles||[]){
      if(!Number.isFinite(raw.x)||!Number.isFinite(raw.y))continue;
      const id=objectId(robot,map.map_id,raw);if(seen.has(id))continue;seen.add(id);
      const note=notes[id];if(note&&note.dismissed)continue;
      const known=LABELS[String(raw.description||'').toLowerCase()];
      const orig=known||'unknown';
      const o={id,k:'live',mm:{x:raw.x,y:raw.y},orig,label:orig,guesses:known?[]:GUESSES.slice(),
        status:known?'auto':'pending',typeCode:raw.type_code,description:raw.description||null,
        ignored:/^ignored/.test(raw.group||''),source:map.source_updated_at||null};
      if(note&&note.label){o.label=note.label;o.status=note.label===orig?'confirmed':'corrected';o.customName=note.name||null}
      out.push(o);
    }
    return out;
  }

  /* Path from the map reader, thinned to points at least minMm apart. */
  function simplifyPath(segments,minMm=80){
    const out=[];
    for(const seg of segments||[]){
      const line=[];let last=null;
      for(const p of seg||[]){
        if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
        if(last&&Math.hypot(p.x-last.x,p.y-last.y)<minMm)continue;
        line.push([Math.round(p.x),Math.round(p.y)]);last=p;
      }
      if(line.length>1)out.push(line);
    }
    return out;
  }

  /* Mapped floor footprint from the map image: opaque pixels, as row runs on a coarse grid.
     It shows where the robot has mapped. It does not claim walls, rooms or furniture. */
  function footprint(rgba,width,height,step=6){
    const cols=Math.ceil(width/step),rows=Math.ceil(height/step),mask=new Uint8Array(cols*rows);
    for(let cy=0;cy<rows;cy++)for(let cx=0;cx<cols;cx++){
      let n=0,t=0;
      for(let y=cy*step;y<Math.min(height,cy*step+step);y++)for(let x=cx*step;x<Math.min(width,cx*step+step);x++){t++;if(rgba[(y*width+x)*4+3]>=200)n++}
      mask[cy*cols+cx]=n>=t/2?1:0;
    }
    const on=(cx,cy)=>cx>=0&&cy>=0&&cx<cols&&cy<rows&&mask[cy*cols+cx]===1;
    const runs=[],segs=[];let d='',edge='',x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(let cy=0;cy<rows;cy++){
      let cx=0;
      while(cx<cols){
        if(!on(cx,cy)){cx++;continue}
        const b=cx;while(on(cx,cy))cx++;
        d+=`M${b*step} ${cy*step}h${(cx-b)*step}v${step}h${-(cx-b)*step}Z`;runs.push([b*step,cy*step,(cx-b)*step]);
        x0=Math.min(x0,b*step);x1=Math.max(x1,cx*step);y0=Math.min(y0,cy*step);y1=Math.max(y1,cy*step+step);
      }
    }
    // Boundary between mapped and unmapped cells, merged into straight runs.
    for(let cy=0;cy<=rows;cy++){let run=-1;for(let cx=0;cx<=cols;cx++){const e=cx<cols&&on(cx,cy)!==on(cx,cy-1);if(e&&run<0)run=cx;if(!e&&run>=0){edge+=`M${run*step} ${cy*step}H${cx*step}`;segs.push([run*step,cy*step,cx*step,cy*step]);run=-1}}}
    for(let cx=0;cx<=cols;cx++){let run=-1;for(let cy=0;cy<=rows;cy++){const e=cy<rows&&on(cx,cy)!==on(cx-1,cy);if(e&&run<0)run=cy;if(!e&&run>=0){edge+=`M${cx*step} ${run*step}V${cy*step}`;segs.push([cx*step,run*step,cx*step,cy*step]);run=-1}}}
    return d?{d,edge,runs,segs,step,bbox:{x0,y0,x1,y1},width,height}:null;
  }
  /* Fit a pixel box into the original map's 320-unit frame so the app's marker sizes still apply. */
  function view(bbox,width=320){
    const bw=Math.max(1,bbox.x1-bbox.x0),bh=Math.max(1,bbox.y1-bbox.y0),s=width/bw;
    return {s,w:width,h:bh*s,x:p=>(p.x-bbox.x0)*s,y:p=>(p.y-bbox.y0)*s};
  }

  const api={alignFrom,toMap,toRobot,robotBox,transform,inverse,snapBox,boxCells,roomAt,inBox,pxPerMm,errorText,entity,value,number,device,objectId,selectedMap,objects,simplifyPath,footprint,view,LABELS};
  root.HAModel=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
