/* Virtual Web MIDI port for the official M-PYRE editor, hosted entirely offline.
 * Same-origin postMessage ↔ Android AudioWorklet. No physical USB-FM-1 needed.
 * GPL-3.0-only, Android integration.
 */
(function () {
  "use strict";
  const ORIGIN = location.origin;
  const IN_ID = "mpyre-android-midi-input", OUT_ID = "mpyre-android-midi-output";
  const input = {
    id: IN_ID, name: "M-PYRE Android", manufacturer: "History Of Sky",
    type: "input", state: "connected", connection: "open",
    onmidimessage: null, onstatechange: null,
    open() { return Promise.resolve(this); },
    close() { return Promise.resolve(this); }
  };
  const output = {
    id: OUT_ID, name: "M-PYRE Android", manufacturer: "History Of Sky",
    type: "output", state: "connected", connection: "open",
    open() { return Promise.resolve(this); },
    close() { return Promise.resolve(this); },
    send(bytes) {
      const data = Array.from(bytes || []);
      if (!data.length || data.length > 640 || !data.every(n => Number.isInteger(n) && n >= 0 && n < 256)) return;
      parent.postMessage({type:"mpyre-midi-to-firmware",bytes:data},ORIGIN);
    }
  };
  const access = {
    sysexEnabled:true,
    inputs:new Map([[input.id,input]]),
    outputs:new Map([[output.id,output]]),
    onstatechange:null
  };
  // In a WebView, Web MIDI is normally absent. This polyfill supplies only the
  // named local firmware endpoint; no access to phone contacts or external MIDI.
  try {
    Object.defineProperty(navigator,"requestMIDIAccess",{
      configurable:true, value:async ({sysex}={})=>access
    });
  } catch(err) {
    try { navigator.requestMIDIAccess = async()=>access; } catch(_) {}
  }
  window.addEventListener("message", event => {
    if (event.source !== parent || event.origin !== ORIGIN) return;
    const m = event.data;
    if (m?.type !== "mpyre-midi-from-firmware" || !Array.isArray(m.bytes)) return;
    const data = Uint8Array.from(m.bytes);
    if (data.length && input.onmidimessage) input.onmidimessage({data,target:input});
  });
  // Android WebView does not download blob: URLs reliably. Route official
  // editor patch/MIDI/backup exports to the native Storage Access save dialog.
  // Keep the blob reference across the editor's immediate revokeObjectURL().
  const savedBlobs = new Map();
  const makeBlobUrl = URL.createObjectURL.bind(URL);
  const revokeBlobUrl = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => {
    const url = makeBlobUrl(blob);
    savedBlobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = url => {
    if (savedBlobs.has(url)) {
      setTimeout(() => { savedBlobs.delete(url); revokeBlobUrl(url); }, 3000);
    } else revokeBlobUrl(url);
  };
  const actualClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    const url = this.href;
    const blob = url && savedBlobs.get(url);
    const bridge = window.MPyreAndroid;
    if (blob && this.download && bridge?.exportFile) {
      const file = String(this.download);
      const mime = blob.type || "application/octet-stream";
      blob.arrayBuffer().then(buf => {
        const bytes = new Uint8Array(buf);
        let raw = "";
        for (let pos = 0; pos < bytes.length; pos += 8192)
          raw += String.fromCharCode(...bytes.subarray(pos,pos+8192));
        bridge.exportFile(btoa(raw),file,mime);
      }).catch(err => console.warn("Android export failed",err));
      return;
    }
    return actualClick.call(this);
  };
  window.MPyreVirtualMidi = { input, output, access };
})();
