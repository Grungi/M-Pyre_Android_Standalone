// Exercise the OFFICIAL editor's SysEx protocol against the actual audio firmware WASM.
// No mocked MIDI device, no UI-only assertion. Uses the same exposed C entrypoints
// as the Android WebView's virtual MIDI adapter.
const assert = require("node:assert/strict");
const fs = require("node:fs");
async function main() {
  const html = fs.readFileSync("app/src/main/assets/index.html","utf8");
  const match = html.match(/const WASM_B64 = "([A-Za-z0-9+/=]+)";/);
  assert.ok(match, "bundled emulator has WASM");
  const {instance} = await WebAssembly.instantiate(Buffer.from(match[1],"base64"),{});
  const E = instance.exports;
  for(const symbol of ["emu_editor_send","emu_editor_poll","emu_editor_pull","emu_editor_midi",
                       "emu_studio_snapshot","emu_init","emu_buffer"])
    assert.equal(typeof E[symbol],"function","real WASM entrypoint "+symbol);
  E.emu_init();
  function frame(cmd,args=[]) {
    const bytes=[0xF0,0x7D,0x46,0x4C,cmd,...args,0xF7];
    assert.ok(bytes.length<=640);
    new Uint8Array(E.memory.buffer,E.emu_buffer(),bytes.length).set(bytes);
    E.emu_editor_send(bytes.length);
    const n=E.emu_editor_pull();
    if(!n) return null;
    const data=new Uint8Array(E.memory.buffer,E.emu_buffer(),n);
    const size=data[0]|data[1]<<8;
    assert.ok(size>=6 && size<=n-2,"valid editor response");
    const out=Array.from(data.subarray(2,2+size));
    assert.equal(out[0],0xF0);assert.equal(out[1],0x7D);
    assert.equal(out[4],cmd);assert.equal(out[out.length-1],0xF7);
    return out.slice(5,-1);
  }
  const encodeValue=n=>[(n+8192)&127,((n+8192)>>7)&127];
  const decodeValue=(a,i=0)=>a[i]+(a[i+1]<<7)-8192;
  let info=frame(1);
  assert.ok(info && info.length>=6,"INFO identifies actual firmware");
  assert.equal(info[0],70,"Felucca/MPYRE firmware version ASCII F");
  const getBpm=()=>decodeValue(frame(2,[1,0]).slice(2));
  assert.ok(getBpm()>=40);
  let v=frame(3,[1,0,...encodeValue(143)]);
  assert.equal(decodeValue(v,2),143,"SET BPM applied to real firmware");
  assert.equal(getBpm(),143);
  let track=frame(27,[0]);
  assert.ok(track && track[1]===8,"eight firmware tracks");
  const desc=frame(5,[0,29]);
  assert.ok(desc && desc[0]===0 && desc[1]===29,"track param descriptor");
  const current=frame(6,[0]);
  assert.ok(current && current[0]===0,"native sequencer step fetched");
  let micro=frame(40,[0,0,72]);
  assert.deepEqual(micro?.slice(0,3),[0,0,72],"nudge applied");
  let microRead=frame(39,[0]);
  assert.equal(microRead[1],72,"nudge read back");
  let fill=frame(42,[0,0,1]);
  assert.deepEqual(fill?.slice(0,3),[0,0,1],"step fill set");
  let fills=frame(41,[0]);
  assert.ok(fills && fills[0]===0,"read step conditions");
  let locks=frame(37,[0]);
  assert.ok(locks && locks[0]===0,"parameter locks accessible");
  let live=frame(77,[0]);
  assert.ok(live && live.length>12,"LIVE performance state");
  let d=frame(33,[0]);assert.ok(d,"drum editor step");
  let ds=frame(72);assert.ok(ds,"drum synthesizer list");
  let presets=frame(16,[0,1]);assert.ok(presets,"user preset listing");
  let kit=frame(15);assert.ok(kit && kit[0]===4,"sample slot status");
  let fm6=frame(70);assert.ok(fm6,"FM6 patches");
  let watch=frame(22,[3]);assert.ok(watch,"live WATCH support");
  E.emu_editor_poll();E.emu_editor_pull();
  // User sound banks and synthesised kits now survive Android app restarts.
  // These are real firmware exports; the client stores the bytes in localStorage.
  for (const symbol of ["emu_extra_get","emu_extra_put"]) {
    assert.equal(typeof E[symbol],"function","real WASM "+symbol);
  }
  let sampleLen=E.emu_extra_get(0,0);
  assert.equal(sampleLen,0x14000,"whole user sample slot");
  let sample=Uint8Array.from(new Uint8Array(E.memory.buffer,E.emu_buffer(),sampleLen));
  assert.equal(E.emu_extra_put(0,0,sampleLen),1,"restore original sample slot");
  let check=E.emu_extra_get(0,0);
  assert.equal(check,sampleLen);
  assert.deepEqual(Buffer.from(new Uint8Array(E.memory.buffer,E.emu_buffer(),check)),Buffer.from(sample));
  const name = frame(19,[0,0]); // UP_STORE 0 with generated/default name.
  assert.ok(name && name.length >= 2 && name[1] === 0,"user preset slot stored in emulator RAM");
  let bankLen=E.emu_extra_get(1,0);
  assert.ok(bankLen>2000 && bankLen<=0x14000,"RAM user preset bank is available");
  const bank=Uint8Array.from(new Uint8Array(E.memory.buffer,E.emu_buffer(),bankLen));
  assert.equal(E.emu_extra_put(1,0,bankLen),1,"restore user preset bank");
  assert.deepEqual(Buffer.from(new Uint8Array(E.memory.buffer,E.emu_buffer(),bankLen)),Buffer.from(bank));
  let kitLen=E.emu_extra_get(2,0);
  assert.ok(kitLen>0 && kitLen<0x14000,"synth drum kit serialization available");
  assert.equal(E.emu_extra_put(2,0,kitLen),1,"restore synth drum kit");
  console.log("Official editor SysEx integration: INFO, DESC, GET/SET, TRACK, STEP, MICRO, FILL, LOCK, LIVE, DRUM, SYNTH, USER, SAMPLES, FM6 and WATCH passed.");
}
main().catch(err=>{console.error(err);process.exit(1);});
