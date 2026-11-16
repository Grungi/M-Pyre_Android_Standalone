// Direct WebAssembly integration test: edit the very same firmware that generates sound.
// No browser simulation or mock editor. Runs after preparing the pinned M-PYRE WASM asset.
const assert = require("node:assert/strict");
const fs = require("node:fs");
async function main() {
  const html = fs.readFileSync("app/src/main/assets/index.html","utf8");
  const match=html.match(/const WASM_B64 = "([A-Za-z0-9+/=]+)";/);
  assert.ok(match,"embedded official firmware WASM exists");
  const binary=Buffer.from(match[1],"base64");
  const {instance}=await WebAssembly.instantiate(binary,{});
  const E=instance.exports;
  for(const method of ["emu_init","emu_buffer","emu_studio_snapshot","emu_studio_set",
    "emu_studio_step","emu_studio_drum","emu_studio_slot"]) {
    assert.equal(typeof E[method],"function",method+" is a real WASM export");
  }
  E.emu_init();
  function snap() {
    const n=E.emu_studio_snapshot();
    assert.equal(n,5192,"8 tracks x 64 native 10-byte steps + header");
    const bytes=Buffer.from(new Uint8Array(E.memory.buffer,E.emu_buffer(),n));
    assert.equal(bytes[0],2,"Studio bridge v2");
    assert.equal(bytes[6],8);
    assert.equal(bytes[7],64);
    return bytes;
  }
  const trackOffset = t => 8+t*(8+64*10);
  assert.equal(E.emu_studio_set(0,1,137),1);
  let state=snap();
  assert.equal(state[4]+(state[5]<<8),137,"tempo edit changed firmware");
  assert.equal(E.emu_studio_set(1,0,32),1);
  state=snap();
  assert.equal(state[trackOffset(1)+2],32,"track pattern length changed");
  const step=trackOffset(0)+8;
  assert.equal(E.emu_studio_step(0,0,1,53),1);
  state=snap();
  assert.equal(state[step],53,"F3 inserted in actual firmware sequencer");
  assert.equal(state[step+4],1,"note count");
  assert.equal(state[step+5],0,"ST_NOTE");
  assert.equal(E.emu_studio_step(0,0,3,0),1);
  state=snap();
  assert.ok(state[step+6]&1,"accent flag set");
  assert.equal(E.emu_studio_step(0,0,2,0),1);
  state=snap();
  assert.equal(state[step+5],1,"tie state");
  assert.equal(E.emu_studio_step(0,0,0,0),1);
  state=snap();
  assert.equal(state[step+5],2,"rest state");
  const d=trackOffset(7)+8;
  assert.equal(E.emu_studio_drum(0,0,0),1);
  state=snap();
  assert.equal(state[d]&1,1,"drum kick toggled on");
  assert.equal(E.emu_studio_drum(0,0,1),1);
  state=snap();
  assert.equal((state[d+2]&3),3,"hard accent for kick");
  assert.equal(E.emu_studio_drum(0,0,0),1);
  state=snap();
  assert.equal(state[d]&1,0,"drum kick toggled off");
  for (let t=3; t<7; t++) {
    assert.equal(E.emu_studio_step(t,0,1,53+t),1,"track "+(t+1)+" note added");
    state=snap();
    assert.equal(state[trackOffset(t)+8],53+t,"independent track "+(t+1)+" step");
  }
  assert.equal(E.emu_studio_slot(1,0),1,"saved working project into slot");
  assert.equal(E.emu_studio_set(0,1,180),1);
  assert.equal(E.emu_studio_slot(0,0),1,"restored working project");
  state=snap();
  assert.equal(state[4]+(state[5]<<8),137,"restored tempo from native project");
  console.log("Real WASM Studio integration passed: tempo, track length, notes, ties, accents, drums and save/load.");
}
main().catch(e=>{ console.error(e);process.exit(1); });
