// Exercise USB gadget <-> virtual MIDI parser <-> actual M-PYRE WASM editor.
// Fragmented SysEx, running MIDI notes, malformed frames and INFO+SET roundtrips.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
async function main() {
 const shell = fs.readFileSync("app/src/main/assets/index.html","utf8");
 const editor = fs.readFileSync("app/src/main/assets/pc-usb-editor.html","utf8");
 assert.ok(editor.length>700000,"complete original editor available on the PC");
 assert.ok(editor.includes('usb[ _-]*midi') && editor.includes('android|peripheral'),"PC recognizes Android USB MIDI port name variants");
 const match=shell.match(/const WASM_B64 = "([A-Za-z0-9+/=]+)";/);
 assert.ok(match,"compiled firmware WASM present");
 const {instance}=await WebAssembly.instantiate(Buffer.from(match[1],"base64"),{});
 const E=instance.exports;E.emu_init();
 const toPc=[],messages=[];
 let scanCalls=0, hostModeCalls=[];
 const host={
   sendUsbMidi(base64){toPc.push(Array.from(Buffer.from(base64,"base64")));},
   scanUsbMidi(){scanCalls++;},
   setUsbHostMode(value){hostModeCalls.push(value);}
 };
 const elements=new Map();
 const element=id=>{
   if(!elements.has(id)) elements.set(id,{
     id, innerHTML:"", textContent:"", firstChild:null,nextSibling:null,
     events:new Map(),
     addEventListener(event,fn){this.events.set(event,fn);}, insertBefore(){}, appendChild(){}
   });
   return elements.get(id);
 };
 const sandbox={
   window:{MPyreAndroid:host,MPyreCloseFullEditor:()=>true},
   document:{createElement:()=>({innerHTML:"",id:""}),getElementById:element},
   console,btoa,atob,Uint8Array,String,Number,Array,Error,
   node:{port:{postMessage(msg){
     messages.push(msg);
     if(msg.t!=="officialEditorMidi" || !msg.usb) return;
     const bytes=msg.bytes;
     new Uint8Array(E.memory.buffer,E.emu_buffer(),bytes.length).set(bytes);
     E.emu_editor_send(bytes.length);
     const n=E.emu_editor_pull();
     if(n){
       const data=new Uint8Array(E.memory.buffer,E.emu_buffer(),n);
       let p=0;
       while(p+2<=n){
         const m=data[p]|(data[p+1]<<8);p+=2;
         if(m>n-p)throw Error("Firmware returned invalid frame");
         sandbox.window.MPyreUsbMidi.fromFirmware(Array.from(data.subarray(p,p+m)));
         p+=m;
       }
     }
   }}}
 };
 const src=fs.readFileSync("android/usb-midi.js","utf8");
 vm.runInNewContext(src,sandbox,{filename:"android/usb-midi.js"});
 const usb=sandbox.window.MPyreUsbMidi;
 assert.ok(usb);
 assert.equal(scanCalls,1,"USB device scan on startup");
 assert.deepEqual(hostModeCalls,[false],"PC gadget remains the default");
 const mode=element("usb-midi-mode");
 assert.equal(typeof mode.events.get("change"),"function","host mode switch exists");
 mode.value="host";mode.events.get("change")();
 assert.equal(hostModeCalls.at(-1),true,"USB-B MIDI option activates host mode");
 assert.match(element("usb-midi-help").textContent,/USB-MIDI-1.0/,"host help explains class-compliant USB MIDI");
 mode.value="pc";mode.events.get("change")();
 assert.equal(hostModeCalls.at(-1),false,"switching back restores PC mode");
 assert.ok(src.indexOf('<button id="usb-midi-refresh"') < src.indexOf('<p id="usb-midi-help"'),
   "refresh button is above long help text, away from the bottom gesture region");
 const refresh=element("usb-midi-refresh"), status=element("usb-midi-status");
 assert.equal(typeof refresh.events.get("click"),"function","refresh registers a click listener");
 const poweredNode=sandbox.node;
 sandbox.node=null;  // The user's screenshot shows USB online with POWER off.
 usb.status(true,"USB-MIDI verbunden");
 assert.match(status.textContent,/POWER noch aus/,"USB online, firmware off hint");
 sandbox.node=poweredNode;
 refresh.events.get("click")();
 assert.equal(scanCalls,2,"manual click calls native scan even with a connected port");
 assert.match(refresh.textContent,/WIRD GESUCHT/,"visible immediate button feedback");
 assert.match(status.textContent,/Gerätesuche/,"visible immediate status feedback");
 usb.status(true,"USB-MIDI verbunden: USB-Port für Android-Peripheriegeräte");
 assert.equal(refresh.textContent,"USB-MIDI NEU SUCHEN","button resets after native result");
 assert.match(status.textContent,/USB-MIDI verbunden/,"connection status comes back");
 const chunk=data=>usb.receive(Buffer.from(data).toString("base64"));
 // Editor INFO command is deliberately split at arbitrary USB packet positions.
 const info=[0xF0,0x7D,0x46,0x4C,1,0xF7];
 chunk(info.slice(0,2));
 chunk(info.slice(2,4));
 assert.equal(toPc.length,0,"fragmented INFO must not be dispatched early");
 chunk(info.slice(4));
 assert.equal(toPc.length,1,"INFO response routed back to native Android MIDI port");
 assert.deepEqual(toPc[0].slice(0,5),[0xF0,0x7D,0x46,0x4C,1]);
 assert.equal(toPc[0][toPc[0].length-1],0xF7);
 // SET BPM=143 over the same actual firmware SysEx protocol
 const value=143+8192, set=[0xF0,0x7D,0x46,0x4C,3,1,0,value&127,(value>>7)&127,0xF7];
 chunk(set.slice(0,6));chunk(set.slice(6));
 assert.equal(toPc.length,2,"SET response routed to PC");
 const bpm=()=>{
   const n=E.emu_studio_snapshot();assert.equal(n,5192);
   const b=new Uint8Array(E.memory.buffer,E.emu_buffer(),n);
   return b[4] | (b[5]<<8);
 };
 assert.equal(bpm(),143,"PC SET changed the running Android firmware!");
 chunk([0xF0,0x7D,0x01,0x02,0xF7]);
 assert.equal(toPc.length,2,"unrelated MIDI SysEx not forwarded");
 usb._test.reset();
 chunk([0xF0,0x7D,0x46,0x4C,1,...Array(650).fill(1),0xF7]);
 assert.equal(toPc.length,2,"oversized SysEx rejected without crashes");
 chunk([0x90,60,100,62,100]);
 assert.ok(messages.filter(m=>m.t==="officialEditorMidi").some(m=>
    m.bytes.length===3 && m.bytes[0]===0x90 && m.bytes[1]===62
 ),"running MIDI note status preserved");
 usb.status(false,"USB getrennt");
 chunk(info);
 assert.equal(toPc.length,2,"disconnect disables forwarding");
 console.log("USB ↔ PC editor: split SysEx INFO, BPM live SET, malformed frames, running MIDI, disconnect all pass.");
}
main().catch(err=>{console.error(err);process.exit(1);});
