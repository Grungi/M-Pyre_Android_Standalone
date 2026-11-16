/* Lists the exact Web MIDI ports seen by the browser, so an actual missing
 * Windows MIDI gadget can be distinguished from an editor name-filter bug. */
function showMidiPorts(reason = "", detail = "") {
  let box = document.getElementById("mpyre-usb-diagnostics");
  if (!box) {
    box = document.createElement("details");
    box.id = "mpyre-usb-diagnostics";
    box.innerHTML = '<summary>USB / MIDI diagnostics (click to expand)</summary>' +
      '<pre id="mpyre-usb-log"></pre>';
    document.querySelector("main.main").prepend(box);
  }
  const list = (items, type) => {
    if (!items.length) return '  ' + type + ': none\n';
    return items.map((p,i)=>'  '+type+' '+(i+1)+': "'+(p.name||'(unnamed)')+
      '" | '+(p.manufacturer||'unknown manufacturer')+' | '+(p.state||'unknown')+'\n').join('');
  };
  const ins=access ? [...access.inputs.values()] : [];
  const outs=access ? [...access.outputs.values()] : [];
  const pairs=access ? fm1Ports(access) : [];
  const lines = [
    'M-PYRE USB-MIDI diagnostics',
    'Result: ' + (reason || 'idle') + (detail ? ' ('+detail+')' : ''),
    'Web MIDI API: ' + (typeof navigator.requestMIDIAccess === 'function' ? 'available' : 'NOT available'),
    'Browser secure context: '+(window.isSecureContext ? 'yes' : 'no'),
    'Inputs: '+ins.length+', outputs: '+outs.length+', candidate pairs: '+pairs.length,
    list(ins, 'IN'), list(outs, 'OUT'),
    !ins.length || !outs.length ?
      'No bidirectional port in the browser. Check phone USB mode MIDI, cable, Windows MIDI device and Chrome/Edge SysEx permission.' :
    !pairs.length ?
      'Ports found, but no safe input/output match. Check Android USB-MIDI is present as BOTH input and output.' :
      'Port(s) found. If INFO gets no reply, turn on POWER in Android and verify USB MIDI connected.',
    'PC editor: M-PYRE v1.0.3 with USB discovery fix.'
  ];
  document.getElementById('mpyre-usb-log').textContent = lines.join('\n');
  if (reason && reason !== 'ready') box.open = true;
}