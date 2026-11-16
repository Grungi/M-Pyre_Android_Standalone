// Regressions for the native M-PYRE quick-chain and SONG arranger.
// Tests the actual pinned WebAssembly firmware: no mocking or UI substitutes.
const assert=require("node:assert/strict");
const fs=require("node:fs");
async function main(){
 const html=fs.readFileSync("app/src/main/assets/index.html","utf8");
 const b=html.match(/const WASM_B64 = "([A-Za-z0-9+/=]+)";/);
 assert(b,"real firmware is embedded");
 const {instance}=await WebAssembly.instantiate(Buffer.from(b[1],"base64"),{});
 const E=instance.exports;
 for(const n of ["emu_init","emu_render","emu_rate","emu_block_frames","emu_studio_snapshot",
                  "emu_studio_set","emu_studio_step","emu_studio_slot","emu_song_order_get",
                  "emu_song_order_put","emu_chain_set","emu_chain_get","emu_section_bars"]) {
   assert.equal(typeof E[n],"function","native "+n+" exported");
 }
 E.emu_init();
 function state(){
   const n=E.emu_chain_get();assert.equal(n,16);
   return Array.from(new Uint8Array(E.memory.buffer,E.emu_buffer(),n));
 }
 function first(){
   const n=E.emu_studio_snapshot();assert.equal(n,5192);
   return new Uint8Array(E.memory.buffer,E.emu_buffer(),n)[16];
 }
 function soundBlocks(n){
   for(let i=0;i<n;i++)E.emu_render();
 }
 function until(predicate,maxSec,label){
   const max=Math.ceil(E.emu_rate()*maxSec/E.emu_block_frames());
   for(let i=0;i<max;i++){
     E.emu_render();
     if(!(i%18)&&predicate()) return i;
   }
   assert.fail(label+" not reached within "+maxSec+" seconds of real firmware time");
 }
 assert.equal(state()[0],0,"no saved sections on empty emulator");
 assert.equal(E.emu_studio_set(0,1,240),1,"tempo max to speed testing");
 function setFirst(n){
   assert.equal(E.emu_studio_step(0,0,0,0),1);
   assert.equal(E.emu_studio_step(0,0,1,n),1);
 }
 setFirst(53);assert.equal(E.emu_studio_slot(1,0),1,"save A");
 setFirst(57);assert.equal(E.emu_studio_slot(1,1),1,"save B");
 assert.equal(state()[0]&3,3,"arrangement_ready sees stored A and B");
 assert.ok(E.emu_section_bars(0)>=1&&E.emu_section_bars(1)>=1,"real section lengths");
 const slowDuration=E.emu_section_bars(0);
 assert.equal(E.emu_studio_set(0,0,64),1,"increase one pattern to 64 steps");
 assert.equal(E.emu_studio_slot(1,2),1,"save long section C");
 assert.ok(E.emu_section_bars(2)>=slowDuration,"section_bars depends on track pattern length");
 assert.equal(E.emu_studio_slot(0,0),1,"load A as starting loop");
 // In LOOP mode, a 2-section quick chain starts playing automatically.
 const transfer=new Uint8Array(E.memory.buffer,E.emu_buffer(),16);
 transfer.set([0,1]);
 assert.equal(E.emu_chain_set(2),1,"quick-chain A→B accepted");
 assert.equal(state()[3],2,"real firmware stores two quick-chain entries");
 until(()=>state()[2]===1,3,"first scene A applied");
 assert.equal(first(),53,"A sounds its original pattern");
 until(()=>state()[2]===2,12,"quick-chain advances to B");
 assert.equal(first(),57,"B sounds its own pattern");
 until(()=>state()[2]===1,12,"quick-chain loops back to A");
 assert.equal(first(),53,"A is restored when chain loops");
 assert.equal(E.emu_studio_set(0,5,0),1,"stop transport");
 until(()=>!state()[1],2,"quick chain stopped");
 assert.equal(E.emu_chain_set(0),1,"clear chain");
 // SONG mode should follow explicit arranger durations then restore the
 // user's working pattern at STOP, rather than leaving the last section.
 setFirst(60); assert.equal(first(),60);
 let n=E.emu_song_order_get();assert.equal(n,37,"36B song order + mode");
 const song=Uint8Array.from(new Uint8Array(E.memory.buffer,E.emu_buffer(),n));
 song[0]=2; song[1]=0; song[2]=song[3]=0;
 song[4]=0; song[5]=1; song[6]=1; song[7]=1; song[36]=1;
 new Uint8Array(E.memory.buffer,E.emu_buffer(),song.length).set(song);
 assert.equal(E.emu_song_order_put(37),1,"song order A(1bar)→B(1bar) accepted");
 const saved=E.emu_song_order_get();
 assert.equal(saved,37);
 assert.deepEqual(Buffer.from(new Uint8Array(E.memory.buffer,E.emu_buffer(),saved)),Buffer.from(song));
 assert.equal(E.emu_studio_set(0,5,1),1,"start SONG transport");
 until(()=>state()[6]===1&&first()===53,4,"song loads A");
 until(()=>first()===57,4,"song advances to B after 1 bar");
 until(()=>state()[1]===0,5,"song ends after B");
 assert.equal(first(),60,"song mode restores working pattern after stopping");
 // Persisted song order may be reloaded only while stopped.
 new Uint8Array(E.memory.buffer,E.emu_buffer(),song.length).set(song);
 assert.equal(E.emu_song_order_put(song.length),1);
 new Uint8Array(E.memory.buffer,E.emu_buffer(),2).set([3,0]);
 assert.equal(E.emu_chain_set(2),0,"unsaved section D cannot be chained");
 console.log("Native FM-1 pattern chaining passed: A→B→A quick loop, duration, SONG A→B, end/restore, saved order.");
}
main().catch(e=>{console.error(e);process.exit(1);});