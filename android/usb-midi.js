/* Native USB-MIDI ↔ M-PYRE firmware SysEx protocol.
 * PC gadget mode requires Android's system MIDI USB mode.
 * USB host mode accepts class-compliant external MIDI devices on USB-C → USB-B.
 * The PC browser must recognize the phone port and verify M-PYRE INFO.
 * SPDX-License-Identifier: GPL-3.0-only
 */
(function () {
  "use strict";
  const bridge = window.MPyreAndroid;
  const statusLine = document.createElement("div");
  statusLine.id = "usb-midi-controls";
  statusLine.innerHTML =
    '<strong>USB-MIDI VERBINDUNG</strong>' +
    '<label for="usb-midi-mode">VERBINDUNGSTYP</label>' +
    '<select id="usb-midi-mode">' +
    '<option value="pc">PC-WebEditor (Telefon als MIDI-Gerät)</option>' +
    '<option value="host">USB-B MIDI-Gerät (Telefon als USB-Host)</option>' +
    '</select>' +
    '<p id="usb-midi-status" role="status" aria-live="polite">USB-MIDI wird geprüft …</p>' +
    '<button id="usb-midi-refresh" type="button">USB-MIDI NEU SUCHEN</button>' +
    '<p id="usb-midi-help">USB-Kabel mit dem PC verbinden und am POCO USB-Verwendung <b>MIDI</b> wählen. ' +
    'Anschließend am PC den M-PYRE-Editor verbinden. POWER muss eingeschaltet sein.</p>';
  const menu = document.getElementById("android-options-panel");
  const full = document.getElementById("open-full-editor");
  if (menu) menu.insertBefore(statusLine, full?.nextSibling || menu.firstChild);
  const modeSelector = document.getElementById("usb-midi-mode");
  const help = document.getElementById("usb-midi-help");
  const savedMode = (() => {
    try { return window.localStorage?.getItem("mpyre-usb-mode") === "host" ? "host" : "pc"; }
    catch (_) { return "pc"; }
  })();
  if (modeSelector) modeSelector.value = savedMode;
  function applyMode() {
    const hostMode = modeSelector?.value === "host";
    if (help) help.textContent = hostMode ?
      "USB-C ans Handy, USB-B ans MIDI-Instrument anschließen. Das Gerät muss USB-MIDI-1.0-kompatibel sein. POWER einschalten; kein PC-USB-MIDI-Modus nötig." :
      "USB-Kabel mit dem PC verbinden und am Handy USB-Verwendung MIDI wählen. Am PC den M-PYRE-Editor öffnen. POWER einschalten.";
    try { window.localStorage?.setItem("mpyre-usb-mode", hostMode ? "host" : "pc"); }
    catch (_) {}
    try { bridge?.setUsbHostMode?.(hostMode); }
    catch (error) { if (help) help.textContent = "USB-Modus konnte nicht gesetzt werden: " + error; }
  }
  modeSelector?.addEventListener("change", applyMode);
  applyMode();
  const refreshButton = document.getElementById("usb-midi-refresh");
  const info = document.getElementById("usb-midi-status");
  const refreshLabel = "USB-MIDI NEU SUCHEN";
  refreshButton.addEventListener("click", () => {
    // Immediate visible response to the touch, even when Android currently
    // reports the SAME USB MIDI device (the previous version returned silently).
    refreshButton.textContent = "USB-MIDI WIRD GESUCHT …";
    if (info) info.textContent = "Erneute USB-MIDI-Gerätesuche gestartet …";
    try {
      if (bridge?.scanUsbMidi) bridge.scanUsbMidi();
      else {
        refreshButton.textContent = refreshLabel;
        if (info) info.textContent = "USB-MIDI-Brücke nicht verfügbar.";
      }
    } catch (error) {
      refreshButton.textContent = refreshLabel;
      if (info) info.textContent = "USB-MIDI-Suche fehlgeschlagen: " + String(error);
    }
  });
  let connected = false, chunked = [], running = 0, expected = 0, current = [];
  let dropping = false;
  let pending = [];
  const maxFrame = 640;
  const makeBase64 = a => {
    let s = "";
    for (let i = 0; i < a.length; i += 8192) {
      s += String.fromCharCode(...a.slice(i,i+8192));
    }
    return btoa(s);
  };
  function sendToFirmware(bytes) {
    if (!node) return;
    if (!bytes.length || bytes.length > maxFrame) return;
    node.port.postMessage({t:"officialEditorMidi", bytes, usb:true});
  }
  function emitShort(message) {
    if(message.length>=2 && message.length<=3 &&
       (message[0]>=0x80 && message[0]<0xf0)) sendToFirmware(message);
  }
  function dataLength(status) {
    const hi=status&0xf0;
    return (hi===0xc0 || hi===0xd0) ? 2 : 3;
  }
  // MIDI streams can split a SysEx across arbitrary USB packets. The editor
  // expects intact F0 7D 46 4C ... F7, so assemble and validate here.
  function decodeChunk(input) {
    for (const b of input) {
      if (b>=0xf8) continue; // MIDI realtime inside sysex is allowed.
      if (b===0xf0) {
        chunked=[0xf0]; dropping=false; current=[]; running=0; continue;
      }
      if (chunked.length || dropping) {
        if (b===0xf7) {
          if (!dropping && chunked.length && chunked.length<maxFrame) {
            chunked.push(b);
            if (chunked.length>=6 && chunked[1]===0x7d &&
                chunked[2]===0x46 && chunked[3]===0x4c) sendToFirmware(chunked.slice());
          }
          chunked=[]; dropping=false;
          continue;
        }
        if(b&0x80) { chunked=[]; dropping=false; }
        else if(!dropping) {
          if(chunked.length>=maxFrame) { chunked=[]; dropping=true; }
          else chunked.push(b);
          continue;
        } else continue;
      }
      if (b&0x80) {
        if(b>=0x80 && b<=0xef) {
          running=b; current=[b]; expected=dataLength(b);
        } else {
          running=0;current=[];expected=0;
        }
        continue;
      }
      if(!running)continue;
      if(!current.length) current=[running];
      current.push(b);
      if (current.length===expected) {
        emitShort(current.slice());
        current=[running]; // MIDI running status
      }
    }
  }
  function setStatus(on, detail) {
    connected=!!on;
    if(info) info.textContent=(detail || (on?"USB-MIDI verbunden":"USB-MIDI nicht verbunden")) +
      (on && !node ? " · POWER noch aus: Firmware zuerst einschalten." : "");
    refreshButton.textContent = refreshLabel;
    if (on && modeSelector?.value !== "host") window.MPyreCloseFullEditor?.();
    if(node) node.port.postMessage({t:"usbConnected",connected});
    if(!on) {chunked=[];dropping=false;running=0;current=[];}
  }
  window.MPyreUsbMidi={
    status:setStatus,
    receive(base64) {
      if(!connected || !node || !base64 || typeof base64!=="string")return;
      try { decodeChunk(Uint8Array.from(atob(base64),c=>c.charCodeAt(0))); }
      catch(e){ console.warn("USB MIDI rejected",e); }
    },
    fromFirmware(bytes) {
      if(!connected || !bytes || !bytes.length || !bridge?.sendUsbMidi)return;
      if(bytes[0]!==0xf0 || bytes[bytes.length-1]!==0xf7) return;
      bridge.sendUsbMidi(makeBase64(bytes));
    },
    isConnected:()=>connected,
    // Pure parser hooks for deterministic Node tests; not needed by UI.
    _test:{decodeChunk,reset(){chunked=[];dropping=false;running=0;current=[];}}
  };
  if(bridge?.scanUsbMidi)bridge.scanUsbMidi();
})();
