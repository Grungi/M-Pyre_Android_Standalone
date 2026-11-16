/* PC editor must find Android on Windows, including 'USB MIDI' with a
 * space, asymmetric MIDIIN/MIDIOUT port names and a single generic port. */
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("android/pc-midi-pairing.js","utf8");
const lookup=vm.runInNewContext(source+"\nfm1Ports",{});
function pairs(inputs,outputs){
 const mk=(labels)=>new Map(labels.map((name,i)=>[i,{name,state:"connected"}]));
 return lookup({inputs:mk(inputs),outputs:mk(outputs)});
}
assert.equal(pairs(["USB MIDI Device"],["USB MIDI Device"]).length,1);
assert.equal(pairs(["MIDIIN2 (USB MIDI Device)"],["MIDIOUT2 (USB MIDI Device)"]).length,1);
assert.equal(pairs(["Android USB Peripheral"],["Android USB Peripheral","Other Synth"]).length,1);
assert.equal(pairs(["Unknown input"],["Other Output"]).length,1,"single fallback");
assert.equal(pairs(["Other Synth"],["Synth","Keyboard"]).length,0,"don't probe arbitrary devices");
assert.equal(pairs([],["USB MIDI Device"]).length,0,"need bidirectional ports");
const html=fs.readFileSync("app/src/main/assets/pc-usb-editor.html","utf8");
for(const s of ["USB / MIDI diagnostics","MIDI ports found, but no firmware INFO response","usb[ _-]*midi","Inputs: ","No matching MIDI device"]) assert(html.includes(s),s);
console.log("Android/Windows USB MIDI port discovery and diagnostics passed");
