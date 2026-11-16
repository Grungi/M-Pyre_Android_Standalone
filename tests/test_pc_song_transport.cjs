// Real firmware E2E regression: Play Song saves A-B-A over BK_PUT,
// switches to SONG mode, starts transport, and Stop halts transport.
// Uses the exact worklet WebAssembly, never a mocked song engine.
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm");
async function main(){
 const html=fs.readFileSync("app/src/main/assets/index.html","utf8");
 const m=html.match(/const WASM_B64 = "([A-Za-z0-9+/=]+)";/);
 assert(m,"compiled real emulator firmware");
 const {instance}=await WebAssembly.instantiate(Buffer.from(m[1],"base64"),{});
 const E=instance.exports;E.emu_init();
 assert.equal(E.emu_studio_slot(1,0),1,"save Section A");
 assert.equal(E.emu_studio_slot(1,1),1,"save Section B");
 const live=77,backup=36;
 const CMD={LIVE:live};
 const LIVE={STATE:0,PLAY:1,KEY:2,LY_SONG:7,SONG:12};
 const u35=n=>[0,7,14,21,28].map(s=>(n>>>s)&127);
 const crc32=data=>{let crc=0xffffffff;for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;};
 const pack7=data=>{let a=[];for(let i=0;i<data.length;i+=7){const chunk=data.slice(i,i+7);a.push(chunk.reduce((v,b,j)=>v|((b>>7)<<j),0),...chunk.map(b=>b&127));}return a;};
 let sends=0;
 async function rq([id,args]){
   const bytes=[0xf0,0x7d,0x46,0x4c,id,...args,0xf7];
   assert(bytes.length<=640);
   new Uint8Array(E.memory.buffer,E.emu_buffer(),bytes.length).set(bytes);
   E.emu_editor_send(bytes.length);
   const n=E.emu_editor_pull();
   assert(n>=8,"firmware returned reply");
   const raw=new Uint8Array(E.memory.buffer,E.emu_buffer(),n);
   const length=raw[0]|raw[1]<<8;
   const payload=Array.from(raw.subarray(2+5,2+length-1));
   sends++;
   for(let i=0;i<6;i++)E.emu_render();
   return payload;
 }
 const req={
   live:(op,...a)=>[live,[op,...a.length?a:[0]]],
   bkBegin:(id,len,crc)=>[backup,[0,id,...u35(len),...u35(crc)]],
   bkData:(id,off,b)=>[backup,[1,id,...u35(off),...pack7(b)]],
   bkCommit:(id)=>[backup,[2,id]]
 };
 const parse={
   [CMD.LIVE](a){const f=a[1];return {
    playing:!!(f&1),asked:!!(f&2),songMode:!!(f&4),songRuns:!!(f&8),
    songRec:!!(f&64),ready:a[19],songAt:a[15],songLen:a[16]
   };},
   [backup](a){return{op:a[0],id:a[1],rc:a[2]};}
 };
 const SG={
   rows:[{scene:0,bars:1,times:1},{scene:1,bars:2,times:1},{scene:0,bars:1,times:1}],
   loop:false,bytes:new Uint8Array(84),dirty:true
 };
 const initial=E.emu_song_order_get();
 assert.equal(initial,37);
 const original=Uint8Array.from(new Uint8Array(E.memory.buffer,E.emu_buffer(),37));
 SG.bytes.set([0x33,0x52,0x45,0x50]);
 SG.bytes.set(original.slice(0,36),48);
 const ARR={
  expand:rows=>rows.flatMap(r=>Array.from({length:r.times},()=>({scene:r.scene,bars:r.bars}))),
  valid:s=>s.entries.length>0&&s.entries.length<=16&&s.entries.every(e=>e.scene>=0&&e.scene<4&&e.bars>=1&&e.bars<=64)
 };
 async function sendSong(){
   const a={loop:SG.loop,entries:ARR.expand(SG.rows)};
   assert(ARR.valid(a));
   const data=Uint8Array.from(SG.bytes);
   data[48]=a.entries.length;data[49]=a.loop?1:0;
   for(let i=0;i<16;i++){
     data[52+2*i]=i<a.entries.length?a.entries[i].scene:i%4;
     data[53+2*i]=i<a.entries.length?a.entries[i].bars:4;
   }
   let out=parse[backup](await rq(req.bkBegin(1,data.length,crc32(data))));
   assert.equal(out.rc,0,"begin song BK_PUT");
   out=parse[backup](await rq(req.bkData(1,0,data)));
   assert.equal(out.rc,0,"song BK_PUT data");
   out=parse[backup](await rq(req.bkCommit(1)));
   assert.equal(out.rc,0,"song BK_PUT commit");
   SG.bytes=data;
   SG.dirty=false;
   return true;
 }
 const elements=new Map();
 const el=id=>{
   if(!elements.has(id))elements.set(id,{
    textContent:"",dataset:{},disabled:false,handlers:{},
    addEventListener(name,cb){this.handlers[name]=cb;}
   });
   return elements.get(id);
 };
 const sandbox={
   window:{},document:{getElementById:el},SG,ARR,dev:{info:{proto:12}},
   req,parse,CMD,LIVE,rq,sendSong,op:async fn=>await fn(),
   setTimeout,Promise,console,Set,Array,Error
 };
 const src=fs.readFileSync("android/pc-song-transport.js","utf8");
 vm.runInNewContext(src,sandbox,{filename:"pc-song-transport.js"});
 const ctl=sandbox.window.MPyrePcSongTransport;
 assert.equal(typeof ctl.play,"function");
 assert.equal(typeof el("pc-song-play").handlers.click,"function");
 assert.equal(typeof el("pc-song-stop").handlers.click,"function");
 await ctl.play();
 let flags=parse[77](await rq(req.live(0)));
 assert(flags.playing&&flags.songMode&&flags.songRuns,"real firmware now plays SONG mode");
 const count=E.emu_song_order_get();
 const order=new Uint8Array(E.memory.buffer,E.emu_buffer(),count);
 assert.equal(order[0],3,"A-B-A saved, 3 entries");
 assert.deepEqual(Array.from(order.slice(4,10)),[0,1,1,2,0,1],"song section order committed");
 assert.match(el("pc-song-status").textContent,/Song playing/);
 await ctl.stop();
 flags=parse[77](await rq(req.live(0)));
 assert(!flags.playing,"real firmware STOP halted SONG");
 assert.match(el("pc-song-status").textContent,/Stopped/);
 // Invalid unrecorded D slot must NEVER send or start.
 SG.rows=[{scene:3,bars:1,times:1}];
 const before=sends;
 await ctl.play();
 assert.match(el("pc-song-status").textContent,/Save section D/);
 assert.equal(sends-before,1,"only state read, no backup commands or PLAY");
 console.log("PC SONG Play/Stop passed on real M-PYRE firmware: A-B-A save, SONG mode, playing, STOP, unsaved-section safety.");
}
main().catch(e=>{console.error(e);process.exit(1);});