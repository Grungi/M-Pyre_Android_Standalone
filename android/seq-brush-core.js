/* M-PYRE editor: pure STEP_SET-compatible brush/bulk helpers.
 * NOTE=time 0 with n>0, TIE=time 1 with n=0, REST=time 2 with n=0.
 * Ratchet is 2 bits per note (x1 .. x4), never repeated audio simulation.
 * SPDX-License-Identifier: GPL-3.0-only
 */
(function(root){
 "use strict";
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(Number(v))||0));
 const rest=()=>({n:0,notes:[0,0,0,0],time:2,flags:0,vel:0,lvl:0,rat:0});
 const tie=()=>({n:0,notes:[0,0,0,0],time:1,flags:0,vel:0,lvl:0,rat:0});
 const clone=s=>s?({...s,notes:(s.notes||[0,0,0,0]).slice(0,4)}):rest();
 const isNote=s=>!!s&&s.time===0&&s.n>0;
 const saneRange=(len,a,b)=>{
   len=clamp(len,1,64);
   return [clamp(Math.min(a,b),0,len-1),clamp(Math.max(a,b),0,len-1)];
 };
 const note=(pitch=60,velocity=96)=>({n:1,notes:[clamp(pitch,0,127),0,0,0],time:0,flags:0,vel:clamp(velocity,1,127),lvl:0,rat:0});
 const ratBits=(n,x)=>{
   const count=clamp(n,1,4),amt=clamp(x,1,4)-1;
   let out=0;for(let i=0;i<count;i++)out|=amt<<(2*i);return out;
 };
 const firstNote=(steps,at,opts={})=>{
   const s=!opts.forcePitch&&isNote(steps[at]) ? clone(steps[at]) : note(opts.pitch,opts.velocity);
   s.time=0;
   if(opts.ratchet)s.rat=ratBits(s.n,opts.ratchet);
   return s;
 };
 function paint(steps,len,start,end,mode,opts={}){
   const [a,b]=saneRange(len,start,end),out=new Map();
   if(mode==="tie"){
     out.set(a,firstNote(steps,a,opts));
     for(let i=a+1;i<=b;i++)out.set(i,tie());
   }else if(mode==="repeat"){
     const s=firstNote(steps,a,opts),spacing=clamp(opts.spacing||1,1,16);
     for(let i=a;i<=b;i++)out.set(i,(i-a)%spacing===0?clone(s):rest());
   }else if(mode==="erase"){
     for(let i=a;i<=b;i++)out.set(i,rest());
   }
   if(out.size){
     // Stop tails from a note preceding this edit becoming orphan ties.
     for(let i=b+1;i<len&&steps[i]&&steps[i].time===1;i++)out.set(i,rest());
   }
   return out;
 }
 function transform(steps,len,start,end,action,opts={}){
   const [a,b]=saneRange(len,start,end),out=new Map();
   for(let i=a;i<=b;i++){
     const s=clone(steps[i]);
     switch(action){
       case "clear":out.set(i,rest());continue;
       case "semitone-up":case "semitone-down":
       case "octave-up":case "octave-down":
         if(!isNote(s))continue;
         {const diff=action==="semitone-up"?1:action==="semitone-down"?-1:action==="octave-up"?12:-12;
           for(let j=0;j<s.n;j++)s.notes[j]=clamp(s.notes[j]+diff,0,127);}
         break;
       case "velocity-up":case "velocity-down":
         if(!isNote(s))continue;
         s.vel=clamp(s.vel+(action==="velocity-up"?10:-10),1,127);break;
       case "accent-on":case "accent-off":
         if(!isNote(s))continue;
         s.flags=action==="accent-on"?s.flags|1:s.flags&~1;break;
       case "ratchet":
         if(!isNote(s))continue;
         s.rat=ratBits(s.n,opts.ratchet||2);break;
       default:return new Map();
     }
     out.set(i,s);
   }
   return out;
 }
 const copy=(steps,len,a,b)=>{
   const [lo,hi]=saneRange(len,a,b);
   return steps.slice(lo,hi+1).map(clone);
 };
 function paste(steps,len,at,clipboard){
   const out=new Map(),start=clamp(at,0,Math.max(0,len-1));
   for(let j=0;j<clipboard.length&&start+j<len;j++){
     const s=clone(clipboard[j]);
     // A copied TIE without a predecessor becomes a REST at a new location.
     out.set(start+j,j===0&&s.time===1&&
       (start===0||!isNote(steps[start-1]))?rest():s);
   }
   return out;
 }
 function shift(steps,len,a,b,dir){
   const [lo,hi]=saneRange(len,a,b),out=new Map();
   const original=copy(steps,len,lo,hi);
   for(let j=0;j<original.length;j++){
     const src=j-dir;
     out.set(lo+j,src<0||src>=original.length?rest():clone(original[src]));
   }
   // Shift may create a TIE at the start with no owner.
   if(out.get(lo).time===1)out.set(lo,rest());
   return out;
 }
 root.MPyreSeqCore={clamp,rest,tie,clone,note,isNote,ratBits,saneRange,paint,transform,copy,paste,shift};
})(window);
