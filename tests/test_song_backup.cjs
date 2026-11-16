// Tests the official PC Song page's actual BK_LIST / BK_GET / BK_PUT
// SysEx protocol against the same WebAssembly firmware used over Android USB.
const assert=require('node:assert/strict'),fs=require('node:fs');
async function main() {
 const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
 const m=html.match(/const WASM_B64 = "([A-Za-z0-9+/=]+)";/);
 assert(m,'real firmware embedded');
 const {instance}=await WebAssembly.instantiate(Buffer.from(m[1],'base64'),{});
 const E=instance.exports; E.emu_init();
 const u35=n=>[0,7,14,21,28].map(k=>Math.floor(n/2**k)&127);
 const d35=(a,o=0)=>a.slice(o,o+5).reduce((v,x,i)=>v+(x*2**(i*7)),0)>>>0;
 const crc32=a=>{
  let v=0xffffffff;
  for(const byte of a){v^=byte;for(let n=0;n<8;n++)v=(v>>>1)^((v&1)?0xedb88320:0);}
  return (v^0xffffffff)>>>0;
 };
 const pack7=data=>{
   const out=[];
   for(let i=0;i<data.length;i+=7){
     const part=data.slice(i,i+7),mask=part.reduce((s,b,k)=>s|((b>>7)<<k),0);
     out.push(mask,...part.map(b=>b&127));
   }
   return out;
 };
 const unpack7=a=>{
   const out=[];
   for(let i=0;i<a.length;) {
     const high=a[i++];
     for(let j=0;j<7&&i<a.length;j++)out.push(a[i++]|(((high>>j)&1)<<7));
   }
   return Uint8Array.from(out);
 };
 function cmd(id,args=[]) {
   const bytes=[0xf0,0x7d,0x46,0x4c,id,...args,0xf7];
   assert(bytes.length<=640,'firmware request max 640 bytes');
   new Uint8Array(E.memory.buffer,E.emu_buffer(),bytes.length).set(bytes);
   E.emu_editor_send(bytes.length);
   const n=E.emu_editor_pull();
   assert(n>=8,'full response, not just a status byte');
   const view=new Uint8Array(E.memory.buffer,E.emu_buffer(),n);
   const len=view[0]|view[1]<<8;
   assert(len>=6&&len<=n-2);
   const frame=Array.from(view.slice(2,2+len));
   assert.deepEqual(frame.slice(0,5),[0xf0,0x7d,0x46,0x4c,id]);
   assert.equal(frame.at(-1),0xf7);
   return frame.slice(5,-1);
 }
 function list(){
   const a=cmd(34);
   const rc=a[0],count=a[1],items=new Map();
   assert.equal(rc,0,'BK_LIST must be supported on the emulator');
   assert(a.length>=2+count*11,'the previous stub replied only 1 byte');
   for(let i=0;i<count;i++){
     const off=2+i*11;
     items.set(a[off],{len:d35(a,off+1),crc:d35(a,off+6)});
   }
   return items;
 }
 function get(id,off,len){
   const a=cmd(35,[id,...u35(off),len&127,(len>>7)&127]);
   assert.equal(a[0],id);
   assert.equal(a[1],0,'BK_GET success');
   assert.equal(d35(a,2),off);
   assert.equal(a[7]|a[8]<<7,len);
   const result=unpack7(a.slice(9));
   assert.equal(result.length,len,'BK_GET length');
   return result;
 }
 function put(id,bytes){
   const n=bytes.length;
   let a=cmd(36,[0,id,...u35(n),...u35(crc32(bytes))]);
   assert.deepEqual(a,[0,id,0],'BK_PUT begin');
   for(let off=0;off<n;off+=256){
     a=cmd(36,[1,id,...u35(off),...pack7(bytes.slice(off,off+256))]);
     assert.deepEqual(a,[1,id,0], 'BK_PUT data '+off);
   }
   return cmd(36,[2,id]);
 }
 const available=list();
 assert(available.has(0)&&available.has(1)&&available.has(2)&&available.has(5));
 assert.equal(available.get(1).len,84,'PER3 settings size and 36 byte song order');
 const settings=get(1,0,84);
 assert.deepEqual(Array.from(settings.slice(0,4)),[0x33,0x52,0x45,0x50],'PER3 settings magic');
 assert.equal(crc32(settings),available.get(1).crc,'BK_LIST CRC must match BK_GET');
 assert.equal(settings[48],4,'firmware initial song has four entries');
 const incoming=Uint8Array.from(settings);
 incoming[48]=2;incoming[49]=1;
 incoming[52]=0;incoming[53]=1; // A for one bar
 incoming[54]=1;incoming[55]=2; // B for two bars
 assert.deepEqual(put(1,incoming),[2,1,0],'PC Song Send commits through firmware');
 let count=E.emu_song_order_get();
 assert.equal(count,37);
 let current=new Uint8Array(E.memory.buffer,E.emu_buffer(),count);
 assert.equal(current[0],2);
 assert.equal(current[1],1);
 assert.deepEqual(Array.from(current.slice(4,8)),[0,1,1,2]);
 const again=list();const back=get(1,0,84);
 assert.equal(again.get(1).crc,crc32(back),'song CRC readback');
 assert.deepEqual(Array.from(back.slice(48,84)),Array.from(incoming.slice(48,84)),
   'PC Song Read returns exactly the saved arrangement');
 // Verify section backup exists: store A in real project slot.
 assert.equal(E.emu_studio_slot(1,0),1);
 const projected=list();
 assert(projected.get(2).len>2500,'BK_LIST now includes saved section A');
 const section=new Uint8Array(projected.get(2).len);
 for(let off=0;off<section.length;off+=256){
   const n=Math.min(256,section.length-off);
   section.set(get(2,off,n),off);
 }
 assert.equal(crc32(section),projected.get(2).crc,'section snapshot/CRC valid');
 assert.deepEqual(put(2,section),[2,2,0],'PC can restore a section');
 const readAfter=list();
 assert.equal(readAfter.get(2).crc,crc32(section));
 // Bad CRC is rejected and never changes the song.
 const broken=Uint8Array.from(back);
 let rc=cmd(36,[0,1,...u35(broken.length),...u35(123)]);
 assert.deepEqual(rc,[0,1,0]);
 rc=cmd(36,[1,1,...u35(0),...pack7(broken)]);
 assert.deepEqual(rc,[1,1,0]);
 rc=cmd(36,[2,1]);
 assert.deepEqual(rc,[2,1,2],'CRC mismatch safely rejected');
 // Empty section erase is supported, not a fake response.
 assert.deepEqual(put(5,new Uint8Array(0)),[2,5,0]);
 console.log('PASS native editor BK_LIST/GET/PUT: Song Read/Send, A/B order, CRC, section backup & restore');
}
main().catch(e=>{console.error(e);process.exit(1);});
