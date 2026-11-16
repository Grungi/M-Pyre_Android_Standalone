// Tests the SAME 7+1 track WASM firmware used by Android and the PC editor.
// Also checks old 3+1 MPY1 projects migrate with drums moved to slot 8.
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const page = fs.readFileSync("app/src/main/assets/index.html", "utf8");
  const encoded = page.match(/const WASM_B64 = "([A-Za-z0-9+/=]+)";/);
  assert.ok(encoded);
  const {instance} = await WebAssembly.instantiate(Buffer.from(encoded[1], "base64"), {});
  const E = instance.exports;
  for (const f of ["emu_init", "emu_render", "emu_ui", "emu_studio_snapshot",
                   "emu_studio_step", "emu_studio_drum", "emu_studio_set",
                   "emu_proj_get", "emu_proj_put"]) assert.equal(typeof E[f], "function", f);
  E.emu_init();
  const size=8+8*(8+64*10);
  const offset=t => 8+t*(8+64*10);
  const snap=() => {
    const n=E.emu_studio_snapshot();
    assert.equal(n,size,"8 real tracks, 64 steps per track");
    return Buffer.from(new Uint8Array(E.memory.buffer, E.emu_buffer(), n));
  };
  let state=snap();
  assert.equal(state[0],2);
  assert.equal(state[6],8);
  assert.equal(state[7],64);
  assert.equal(state[offset(7)],255,"track 8 is real drums");
  assert.equal(state[offset(6)]!==255,true,"track 7 is melodic");
  for(let t=0;t<7;t++){
    assert.equal(E.emu_studio_step(t,2,1,53+t),1,"write synth "+(t+1));
    state=snap();
    assert.equal(state[offset(t)+8+20],53+t,"independent pitch on track "+(t+1));
  }
  assert.equal(E.emu_studio_drum(2,0,0),1);
  state=snap();
  assert.ok(state[offset(7)+8+20]&1,"independent drum pattern");
  const length=E.emu_proj_get(4);
  assert.ok(length>7000,"MPY8 project persists all eight patterns");
  const saved=Buffer.from(new Uint8Array(E.memory.buffer,E.emu_buffer(),length));
  assert.equal(saved.readUInt32LE(0),0x3859504D,"distinct MPY8 format");
  for(let t=0;t<7;t++)assert.equal(E.emu_studio_step(t,2,0,0),1);
  assert.equal(E.emu_proj_put(4,length),1,"restores eight-track project");
  state=snap();
  for(let t=0;t<7;t++)assert.equal(state[offset(t)+8+20],53+t,"restored instrument "+(t+1));
  assert.ok(state[offset(7)+8+20]&1,"restored drum step");

  // Repackage the current first 3 + last drum as a VALID old MPY1 4-track
  // project, using the unchanged historic per-track 934-byte encoding.
  const oldSize=3832, hdr=76, stepBytes=(length-80)/8;
  assert.equal(stepBytes,938,"released 4-track per-track binary layout");
  const old=Buffer.alloc(oldSize);
  saved.copy(old,0,0,hdr);
  for(let t=0;t<3;t++) saved.copy(old,hdr+t*stepBytes,hdr+t*stepBytes,hdr+(t+1)*stepBytes);
  saved.copy(old,hdr+3*stepBytes,hdr+7*stepBytes,hdr+8*stepBytes);
  old.writeUInt32LE(0x3159504D,0); // old M-PYRE MPY1
  old.writeUInt32LE(oldSize,4);
  old[72]=3; // previously selected drums
  let hash=0x811C9DC5;
  for(let i=0;i<oldSize-4;i++) hash=Math.imul(hash ^ old[i],0x01000193)>>>0;
  old.writeUInt32LE(hash,oldSize-4);
  new Uint8Array(E.memory.buffer,E.emu_buffer(),old.length).set(old);
  assert.equal(E.emu_proj_put(4,old.length),1,"accept historical MPY1 4-track project");
  state=snap();
  assert.equal(state[1],7,"old fourth (drums) remapped to eighth");
  assert.ok(state[offset(7)+8+20]&1,"original drum lane still correct");
  for(let t=3;t<7;t++)
    assert.equal(state[offset(t)+8+20+5],2,"new instrument "+(t+1)+" starts with REST");
  console.log("Eight-track firmware verified: 7 independent synths + drums, 8-track saves, and legacy MPY1 migration.");
})().catch(err=>{console.error(err);process.exit(1);});
