// Firmware-backed sequencer range/brush regression for PC and Android editor.
// Includes NOTE -> TIE -> REST, rapid repeated notes, x2-x4 ratchet,
// range transpose, copy/paste/shift, and actual DRUM_STEP ratchet.
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
async function main(){
 const js=fs.readFileSync("android/seq-brush-core.js","utf8");
 const gui=fs.readFileSync("android/seq-brush-ui.js","utf8");
 new vm.Script(js,{filename:"seq-brush-core.js"});
 new vm.Script(gui,{filename:"seq-brush-ui.js"});
 const ctx={window:{}};
 vm.runInNewContext(js,ctx);
 const C=ctx.window.MPyreSeqCore;
 assert(C&&typeof C.paint==="function");
 const html=fs.readFileSync("app/src/main/assets/index.html","utf8");
 const match=html.match(/const WASM_B64 = "([A-Za-z0-9+/=]+)";/);
 assert(match,"real firmware in generated emulator");
 const {instance}=await WebAssembly.instantiate(Buffer.from(match[1],"base64"),{});
 const E=instance.exports;E.emu_init();
 function frame(id,args=[]){
   const bytes=[0xf0,0x7d,0x46,0x4c,id,...args,0xf7];
   assert(bytes.length<=640);
   new Uint8Array(E.memory.buffer,E.emu_buffer(),bytes.length).set(bytes);
   E.emu_editor_send(bytes.length);
   const n=E.emu_editor_pull();assert(n>=8,"firmware responded");
   const buf=new Uint8Array(E.memory.buffer,E.emu_buffer(),n);
   const len=buf[0]|buf[1]<<8;assert(len<=n-2);
   const reply=Array.from(buf.subarray(2,2+len));
   assert.deepEqual(reply.slice(0,5),[0xf0,0x7d,0x46,0x4c,id]);
   return reply.slice(5,-1);
 }
 function encodeStep(i,s){
   return [i,s.n,...s.notes.slice(0,4),s.time,s.flags&3,s.vel&127,
     (s.lvl||0)&127,(((s.lvl||0)>>7)&1)|((((s.rat||0)>>7)&1)<<1),(s.rat||0)&127];
 }
 function readStep(i){
   const a=frame(6,[i]);assert.equal(a[0],i);
   return {n:a[1],notes:a.slice(2,6),time:a[6],flags:a[7],vel:a[8],
     lvl:(a[9]||0)|(((a[10]||0)&1)<<7),
     rat:(a[11]||0)|((a[10]||0)&2)<<6};
 }
 function apply(changes,steps){
   for(const [i,s] of changes){
     const reply=frame(7,encodeStep(i,s));
     assert.equal(reply[0],i);
     steps[i]=readStep(i);
   }
 }
 frame(27,[0]);
 let steps=Array.from({length:16},()=>C.rest());
 // Drag TIE starting on C4 over four steps, as a single held note.
 const ties=C.paint(steps,16,2,5,"tie",{pitch:60,forcePitch:true});
 assert.equal(ties.get(2).n,1);
 assert.equal(ties.get(2).notes[0],60);
 for(let i=3;i<=5;i++)assert.equal(ties.get(i).time,1);
 apply(ties,steps);
 assert.equal(readStep(2).time,0);assert.equal(readStep(2).notes[0],60);
 for(let i=3;i<=5;i++){const s=readStep(i);assert.equal(s.time,1);assert.equal(s.n,0);}
 // Quick session/riff repeated G4 at every step, x4 ratchet on each note.
 const rapid=C.paint(steps,16,0,7,"repeat",{pitch:67,forcePitch:true,spacing:1,ratchet:4});
 apply(rapid,steps);
 for(let i=0;i<=7;i++){
   const s=readStep(i);
   assert.equal(s.n,1);assert.equal(s.notes[0],67);
   assert.equal(s.time,0);assert.equal(s.rat&3,3,"x4 firmware ratchet encoded");
 }
 // Longer rhythm from repeated steps every 2 steps.
 const spaced=C.paint(steps,16,0,7,"repeat",{pitch:64,forcePitch:true,spacing:2,ratchet:2});
 apply(spaced,steps);
 for(let i=0;i<=7;i++){
   const s=readStep(i);
   if(i%2===0){assert.equal(s.notes[0],64);assert.equal(s.rat&3,1);}
   else {assert.equal(s.time,2);assert.equal(s.n,0);}
 }
 // Bulk transpose + octave changes the firmware's actual stored pitches.
 const up=C.transform(steps,16,0,7,"octave-up");
 apply(up,steps);
 for(let i=0;i<8;i+=2)assert.equal(readStep(i).notes[0],76);
 const copied=C.copy(steps,16,0,3);
 const pasted=C.paste(steps,16,8,copied);
 apply(pasted,steps);
 assert.equal(readStep(8).notes[0],76);
 const shifted=C.shift(steps,16,8,11,1);
 apply(shifted,steps);
 assert.equal(readStep(8).time,2);
 assert.equal(readStep(9).notes[0],76);
 const cleared=C.transform(steps,16,0,7,"clear");
 apply(cleared,steps);
 for(let i=0;i<8;i++)assert.equal(readStep(i).time,2);
 // The drum track has genuine per-lane ratchets: x4 on hi-hat, x1 kick.
 frame(27,[7]);
 const g7=(n,k)=>Array.from({length:k},(_,i)=>Math.floor(n/2**(7*i))&127);
 const on=(1<<0)|(1<<3),rat=3*(4**3);
 const drum=frame(33,[0,...g7(on,3),...g7(0,5),...g7(rat,5)]);
 assert.equal(drum[0],0);
 const hit=frame(33,[0]);
 const mask=hit[1]|hit[2]<<7|(hit[3]&3)<<14;
 assert.equal(mask,on);
 const r35=hit.slice(9,14).reduce((v,b,i)=>v+b*2**(7*i),0);
 assert.equal(Math.floor(r35/4**3)%4,3,"x4 on hi-hat stored in real drum firmware");
 // The generated PC editor and in-app editor both have the new view.
 for(const path of ["app/src/main/assets/pc-usb-editor.html","app/src/main/assets/editor.html"]){
   const file=fs.readFileSync(path,"utf8");
   assert(file.includes('id="pitchgrid"'),path+" pitch grid present");
   assert(file.includes('data-v="notes"'),path+" third mode");
   assert(file.includes('id="seqbrush"'),path+" bulk tools");
   assert(file.includes('window.MPyreSeqBrush'),path+" brush code");
   assert(file.includes('renderPitchGrid()'),path+" pitch view rendering");
 }
 console.log("PASS expressive sequencer: real WASM note TIE, x4 repeated notes, x2 spacing, transposition, copy/paste/shift, clear, drum ratchets, dual editor UI.");
}
main().catch(e=>{console.error(e);process.exit(1);});
