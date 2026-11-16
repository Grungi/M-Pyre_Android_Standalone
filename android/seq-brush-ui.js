/* Touch- and mouse-friendly M-PYRE sequencer step painting.
 * Requires the real editor's dev / STEP_SET / DRUM_STEP / ROLL state.
 * All operations are sent to the real FM-1 firmware through the MIDI queue.
 */
const BR = {
  mode: "navigate", selected: null, drag: null, clipboard: null,
  status: "", pending: false, page: 0, pitch: 60, spacing: 1, ratchet: 1
};
const BC=window.MPyreSeqCore;
const brushNode=id=>document.getElementById(id);
const brushStatus=(msg,bad=false)=>{
  const out=brushNode("seqbrush-status");if(!out)return;
  out.textContent=msg;out.dataset.error=bad?"1":"0";
};
function brushRange() {
  if(!dev||!dev.steps.length)return null;
  const len=stepLen();
  if(!BR.selected) return [0,Math.min(15,len-1)];
  return BC.saneRange(len,BR.selected[0],BR.selected[1]);
}
function brushShowRange() {
  const r=brushRange();
  if(!r)return;
  const from=brushNode("seqbrush-from"),to=brushNode("seqbrush-to");
  if(from&&document.activeElement!==from)from.value=String(r[0]+1);
  if(to&&document.activeElement!==to)to.value=String(r[1]+1);
  for(const b of document.querySelectorAll("#stepgrid button[data-i]"))
    b.classList.toggle("brush-selected",!!BR.selected&&+b.dataset.i>=r[0]&&+b.dataset.i<=r[1]);
  for(const b of document.querySelectorAll("#drumgrid button[data-i]"))
    b.classList.toggle("brush-selected",!!BR.selected&&+b.dataset.i>=r[0]&&+b.dataset.i<=r[1]);
  for(const b of document.querySelectorAll("#pitchgrid button[data-i]"))
    b.classList.toggle("brush-selected",!!BR.selected&&+b.dataset.i>=r[0]&&+b.dataset.i<=r[1]);
}
function brushControls(){
  const synth=!!dev?.dump&&!isDrum();
  const bar=brushNode("seqbrush");if(!bar)return;
  bar.hidden=!dev;
  const pitchInput=brushNode("seqbrush-pitch");
  if(pitchInput && document.activeElement!==pitchInput)pitchInput.value=String(BR.pitch);
  const rat=brushNode("seqbrush-ratchet"),sp=brushNode("seqbrush-spacing");
  if(rat)rat.value=String(BR.ratchet);
  if(sp)sp.value=String(BR.spacing);
  for(const b of bar.querySelectorAll("[data-brush]"))
    b.setAttribute("aria-pressed",String(b.dataset.brush===BR.mode));
  // touch-action must be set BEFORE pointerdown: setting it during the drag
  // cannot prevent mobile browsers from cancelling the gesture as panning.
  for(const id of ["stepgrid","drumgrid","pitchgrid"])
    brushNode(id)?.classList.toggle("brush-active",BR.mode!=="navigate");
  for(const b of bar.querySelectorAll("[data-bulk]")){
    b.disabled=BR.pending||(!synth&&/^(?:up|down|octup|octdown|velup|veldown|accenton|accentoff)$/.test(b.dataset.bulk));
  }
  brushShowRange();
}
function brushNoteSource(i,pitch,forcePitch=false){
  let base=(dev.steps[i]&&BC.isNote(dev.steps[i])&&!forcePitch)
    ?dev.steps[i].notes[0]:pitch;
  return BC.clamp(base,0,127);
}
async function brushWrite(changes){
  if(!changes?.size||!dev||BR.pending)return;
  const d=dev,track=d.sel,idx=[...changes.keys()].sort((a,b)=>a-b);
  if(idx.some(i=>i<0||i>=stepLen()))return;
  BR.pending=true;brushControls();
  // The device is the source of truth; explicitly keep the selected track
  // unchanged for the duration of these sequential STEP_SET round-trips.
  for(const i of idx)d.steps[i]={...BC.clone(changes.get(i)),index:i};
  renderGrid();
  brushStatus("Sending "+idx.length+" edited steps to M-PYRE …");
  try{
    for(const i of idx){
      if(dev!==d || dev.sel!==track)throw new Error("Track changed during bulk write; reload steps.");
      const s=d.steps[i];stepEdit.set(i,performance.now());
      d.steps[i]=parse[CMD.STEP_SET](await rq(req.stepSet(i,{
        n:s.n,notes:s.notes,time:s.time,flags:s.flags,vel:s.vel,
        lvl:s.lvl||0,rat:s.rat||0
      })));
    }
    brushStatus("✓ "+idx.length+" step"+(idx.length===1?"":"s")+" updated on M-PYRE.");
  }catch(e){brushStatus("Write failed: "+e.message+" · Reload steps to resync.",true);report(e);}
  finally{BR.pending=false;updateStepRows();brushControls();}
}
async function brushWriteDrums(changes){
  if(!changes?.size||!dev||BR.pending)return;
  const d=dev,track=d.sel,idx=[...changes.keys()].sort((a,b)=>a-b);
  BR.pending=true;brushControls();
  for(const i of idx){
    const x=changes.get(i);
    d.dsteps[i]={...x,lvl:x.lvl.slice(),rat:x.rat.slice(),index:i};
    d.steps[i]=drumAsStep(d.dsteps[i]);
  }
  renderDrums();brushStatus("Sending "+idx.length+" drum steps …");
  try{
    for(const i of idx){
      if(dev!==d||dev.sel!==track)throw new Error("Drum track changed; reload steps.");
      stepEdit.set(i,performance.now());
      const r=parse[CMD.DRUM_STEP](await rq(req.drumStep(i,d.dsteps[i])));
      d.dsteps[i]=r;d.steps[i]=drumAsStep(r);
    }
    brushStatus("✓ "+idx.length+" drum steps updated.");
  }catch(e){brushStatus("Drum write failed: "+e.message,true);report(e);}
  finally{BR.pending=false;renderDrums();brushControls();}
}
function brushDrumChanges(a,b,lane,mode){
  const out=new Map();
  for(let i=a;i<=b;i++){
    const d=dev.dsteps[i];
    if(!d)continue;
    const x={...d,lvl:d.lvl.slice(),rat:d.rat.slice()};
    const hit=mode==="repeat"||mode==="tie";
    const selected=BR.spacing===1||(i-a)%BR.spacing===0;
    if(mode==="erase"||(hit&&!selected)){
      x.on&=~(1<<lane);x.lvl[lane]=0;x.rat[lane]=0;
    }else if(hit){
      x.on|=1<<lane;
      x.lvl[lane]=0; // NORMAL level; firmware indices 0 normal, 1 ghost, 2 soft, 3 hard
      x.rat[lane]=BR.ratchet-1;
    }
    out.set(i,x);
  }
  return out;
}
function brushApplyDrag(d){
  const a=Math.min(d.at,d.end),b=Math.max(d.at,d.end);
  if(d.mode==="select"){
    BR.selected=[a,b];brushStatus("Selected steps "+(a+1)+"–"+(b+1)+". Use Bulk Edit.");
    brushShowRange();brushControls();return;
  }
  if(d.drum){
    brushWriteDrums(brushDrumChanges(a,b,d.lane,d.mode));return;
  }
  if(d.mode==="tie"||d.mode==="repeat"||d.mode==="erase"){
    const pitch=d.pitch!=null?d.pitch:brushNoteSource(d.at,BR.pitch);
    // Tap a pitch in NOTE GRID toggles that one note; a drag draws TIE/REPEAT.
    if(d.mode==="tie"&&a===b&&d.pitch!=null){
      const chord=ROLL.owner(dev.steps,a);
      const found=chord>=0&&ROLL.isNote(dev.steps[chord])
        &&dev.steps[chord].notes.includes(pitch);
      const patch=found ? ROLL.remove(dev.steps,stepLen(),chord,pitch)
                       : ROLL.place(dev.steps,stepLen(),a,pitch,1);
      brushWrite(patch);return;
    }
    brushWrite(BC.paint(dev.steps,stepLen(),a,b,d.mode,{
      pitch,forcePitch:d.pitch!=null,ratchet:BR.ratchet,spacing:BR.spacing
    }));
  }
}
function brushHit(e,box){
  const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest("button[data-i]");
  if(!cell||!box.contains(cell))return null;
  const i=Number(cell.dataset.i);
  if(!Number.isFinite(i))return null;
  return {i,pitch:cell.hasAttribute("data-pitch")?Number(cell.dataset.pitch):null,
          lane:cell.hasAttribute("data-l")?Number(cell.dataset.l):null};
}
function brushBindGrid(id,drum=false){
  const box=brushNode(id);if(!box)return;
  box.addEventListener("click",e=>{
    if(BR.mode!=="navigate"){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  box.addEventListener("pointerdown",e=>{
    if(BR.mode==="navigate"||BR.pending||!dev?.steps?.length||e.button>0)return;
    const btn=e.target.closest("button[data-i]");if(!btn||!box.contains(btn))return;
    e.preventDefault();e.stopImmediatePropagation();
    const i=Number(btn.dataset.i);
    BR.drag={box,at:i,end:i,mode:BR.mode,drum,
      lane:drum?Number(btn.dataset.l):null,
      pitch:btn.hasAttribute("data-pitch")?Number(btn.dataset.pitch):null,
      pointer:e.pointerId};
    box.classList.add("brush-painting");
    box.setPointerCapture?.(e.pointerId);
    brushStatus("Drag across steps to "+(BR.mode==="tie"?"sustain":BR.mode==="repeat"?"repeat":BR.mode==="erase"?"erase":"select")+" …");
  },true);
  box.addEventListener("pointermove",e=>{
    const d=BR.drag;if(!d||d.box!==box||d.pointer!==e.pointerId)return;
    const hit=brushHit(e,box);if(!hit)return;
    if(hit.i!==d.end){
      d.end=hit.i;
      const range=[Math.min(d.at,d.end),Math.max(d.at,d.end)];
      BR.selected=range;
      brushShowRange();
    }
  });
  const release=e=>{
    const d=BR.drag;
    if(!d||d.box!==box||d.pointer!==e.pointerId)return;
    BR.drag=null;box.classList.remove("brush-painting");
    try{box.releasePointerCapture?.(e.pointerId);}catch(_){}
    if(e.type==="pointercancel"){brushShowRange();return;}
    brushApplyDrag(d);
  };
  box.addEventListener("pointerup",release);
  box.addEventListener("pointercancel",release);
}
function renderPitchGrid(){
  const shell=brushNode("pitchgrid");
  if(!shell||shell.hidden||!dev?.steps?.length||isDrum())return;
  const len=stepLen();
  rollFit(len);  // pitch window follows the current track's notes
  BR.page=BC.clamp(BR.page,0,Math.max(0,Math.ceil(len/16)-1));
  const start=BR.page*16,stop=Math.min(len,start+16),rows=25;
  const lo=BC.clamp(RV.lo==null?48:RV.lo,0,128-rows);
  const range=brushNode("pitchgrid-range");
  if(range)range.textContent=noteName(lo)+" – "+noteName(lo+rows-1)+
    " · steps "+(start+1)+"–"+stop+" / "+len;
  const matrix=brushNode("pitchgrid-matrix");if(!matrix)return;
  matrix.style.gridTemplateColumns="82px repeat("+(stop-start)+",minmax(33px,1fr))";
  const children=[el("span",{class:"pitch-label pitch-corner",text:"PITCH"})];
  for(let i=start;i<stop;i++)children.push(el("span",{class:"pitch-col"+(i%4===0?" barstart":""),text:String(i+1)}));
  for(let p=lo+rows-1;p>=lo;p--){
    const black=[1,3,6,8,10].includes(p%12);
    children.push(el("span",{class:"pitch-label"+(black?" black":"")+(p%12===0?" root":""),text:noteName(p)}));
    for(let i=start;i<stop;i++){
      const owner=ROLL.owner(dev.steps,i);
      const chord=owner>=0?dev.steps[owner]:null;
      const pos=chord&&ROLL.isNote(chord)?chord.notes.slice(0,chord.n).indexOf(p):-1;
      const on=pos>=0&&owner===i,held=pos>=0&&owner!==i;
      const rat=on?(((chord.rat||0)>>(2*pos))&3)+1:1;
      const btn=el("button",{type:"button","data-i":i,"data-pitch":p,
        class:["pitch-cell",black?"black":"",i%4===0?"barstart":"",on?"note":"",held?"held":""].filter(Boolean).join(" "),
        text:on?rat>1?"×"+rat:"●":held?"━":""});
      btn.title=noteName(p)+" · step "+(i+1)+(on?" · Note":held?" · Tie":" · Rest");
      btn.setAttribute("aria-label",btn.title);
      children.push(btn);
    }
  }
  matrix.replaceChildren(...children);
  brushShowRange();
}
brushNode("pitchgrid-prev")?.addEventListener("click",()=>{BR.page=Math.max(0,BR.page-1);renderPitchGrid();});
brushNode("pitchgrid-next")?.addEventListener("click",()=>{BR.page++;renderPitchGrid();});
brushNode("pitchgrid-up")?.addEventListener("click",()=>{RV.lo=BC.clamp((RV.lo??48)+12,0,103);renderPitchGrid();});
brushNode("pitchgrid-down")?.addEventListener("click",()=>{RV.lo=BC.clamp((RV.lo??48)-12,0,103);renderPitchGrid();});
brushNode("seqbrush")?.addEventListener("click",async e=>{
  const b=e.target.closest("button");if(!b||b.disabled||BR.pending)return;
  if(b.dataset.brush){
    BR.mode=b.dataset.brush;
    brushStatus("Mode: "+BR.mode.toUpperCase()+" · drag across steps to edit.");
    brushControls();return;
  }
  if(!b.dataset.bulk||!dev?.steps?.length)return;
  const act=b.dataset.bulk,len=stepLen(),r=brushRange(),[a,z]=r;
  if(act==="all"){BR.selected=[0,len-1];brushStatus("All "+len+" steps selected.");brushControls();return;}
  if(act==="copy"){
    BR.clipboard=drumGrid()&&dev.dstepsOk
      ? {drum:true,steps:dev.dsteps.slice(a,z+1).map(x=>({...x,lvl:x.lvl.slice(),rat:x.rat.slice()}))}
      : {drum:false,steps:BC.copy(dev.steps,len,a,z)};
    brushStatus("Copied "+BR.clipboard.steps.length+" steps.");return;
  }
  if(act==="paste"){
    if(!BR.clipboard){brushStatus("Copy a range first.",true);return;}
    if(BR.clipboard.drum!==(drumGrid()&&dev.dstepsOk)){
      brushStatus("Paste between matching instrument/drum tracks only.",true);return;
    }
    if(BR.clipboard.drum){
      const changes=new Map();
      BR.clipboard.steps.forEach((s,j)=>{if(a+j<len)changes.set(a+j,{...s,lvl:s.lvl.slice(),rat:s.rat.slice()});});
      await brushWriteDrums(changes);
    }else await brushWrite(BC.paste(dev.steps,len,a,BR.clipboard.steps));
    return;
  }
  if(drumGrid()&&dev.dstepsOk){
    const changes=new Map();
    for(let i=a;i<=z;i++){
      const d=dev.dsteps[i];if(!d)continue;
      const s={...d,lvl:d.lvl.slice(),rat:d.rat.slice()};
      if(act==="clear"){s.on=0;s.lvl.fill(0);s.rat.fill(0);}
      else if(act==="ratchet"){for(let l=0;l<16;l++)if(s.on&(1<<l))s.rat[l]=BR.ratchet-1;}
      else continue;
      changes.set(i,s);
    }
    await brushWriteDrums(changes);return;
  }
  const actions={
    up:"semitone-up",down:"semitone-down",octup:"octave-up",octdown:"octave-down",
    velup:"velocity-up",veldown:"velocity-down",accenton:"accent-on",
    accentoff:"accent-off",clear:"clear",ratchet:"ratchet"
  };
  if(act==="shiftleft"||act==="shiftright"){
    await brushWrite(BC.shift(dev.steps,len,a,z,act==="shiftright"?1:-1));
  }else if(actions[act]){
    await brushWrite(BC.transform(dev.steps,len,a,z,actions[act],{ratchet:BR.ratchet}));
  }
});
for(const k of ["seqbrush-from","seqbrush-to"]){
  brushNode(k)?.addEventListener("change",()=>{
    const len=stepLen();
    BR.selected=BC.saneRange(len,+brushNode("seqbrush-from").value-1,
      +brushNode("seqbrush-to").value-1);
    brushControls();renderPitchGrid();
  });
}
brushNode("seqbrush-pitch")?.addEventListener("change",e=>{
  BR.pitch=BC.clamp(+e.target.value,0,127);brushControls();
});
brushNode("seqbrush-spacing")?.addEventListener("change",e=>BR.spacing=+e.target.value);
brushNode("seqbrush-ratchet")?.addEventListener("change",e=>BR.ratchet=+e.target.value);
brushBindGrid("stepgrid");brushBindGrid("drumgrid",true);brushBindGrid("pitchgrid");
brushNode("pitchgrid")?.addEventListener("click",e=>{
  if(BR.mode!=="navigate"||BR.pending||!dev?.steps?.length)return;
  const btn=e.target.closest("button[data-pitch][data-i]");
  if(!btn)return;
  const i=Number(btn.dataset.i),pitch=Number(btn.dataset.pitch);
  const own=ROLL.owner(dev.steps,i);
  const found=own>=0 && BC.isNote(dev.steps[own]) && dev.steps[own].notes.includes(pitch);
  const changes=found
    ? ROLL.remove(dev.steps,stepLen(),own,pitch)
    : ROLL.place(dev.steps,stepLen(),i,pitch,1);
  brushWrite(changes);
});

window.MPyreSeqBrush={state:BR,render:renderPitchGrid,paint:brushApplyDrag};
