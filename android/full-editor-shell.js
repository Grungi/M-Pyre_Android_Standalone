/* Offline official M-PYRE editor, connected to the same AudioWorklet.
 * Song Studio v7 stays available as a simple, fast touch-pattern editor.
 */
(function() {
  const overlay = document.createElement("section");
  overlay.id = "mpyre-full-editor";
  overlay.hidden = true;
  overlay.setAttribute("aria-label","M-PYRE Advanced Editor");
  overlay.innerHTML =
    '<div class="mpyre-editor-bar">' +
      '<button type="button" id="mpyre-editor-close">← RIFFBOX</button>' +
      '<strong>FULL M-PYRE EDITOR</strong>' +
      '<span>Offline · real firmware</span>' +
    '</div>' +
    '<iframe id="mpyre-editor-iframe" title="Full M-PYRE Editor" loading="eager" ' +
      'referrerpolicy="same-origin" allow="autoplay"></iframe>';
  document.body.appendChild(overlay);
  const frame = document.getElementById("mpyre-editor-iframe");
  const openButton = document.createElement("button");
  openButton.id = "open-full-editor";
  openButton.type = "button";
  openButton.textContent = "🎚 FULL EDITOR · Sound / Piano Roll / Song / Mixer";
  const studioButton = document.getElementById("open-studio");
  studioButton.insertAdjacentElement("afterend",openButton);
  let opened = false;
  const open = () => {
    if (window.MPyreUsbMidi?.isConnected()) {
      const el=document.getElementById("audio-diagnostics");
      if(el)el.textContent="USB-Webeditor aktiv. Für den internen Editor zuerst USB-MIDI trennen.";
      closeOptions?.();
      return;
    }
    if (!node) {
      const el = document.getElementById("audio-diagnostics");
      if (el) el.textContent = "Turn POWER on before opening the full editor.";
      closeOptions?.();
      return;
    }
    closeOptions?.();
    overlay.hidden = false;
    opened = true;
    if (!frame.src) frame.src = "editor.html";
  };
  const close = () => {
    if (!opened) return false;
    overlay.hidden = true;
    opened = false;
    return true;
  };
  openButton.addEventListener("click",open);
  document.getElementById("mpyre-editor-close").addEventListener("click",close);
  window.MPyreCloseFullEditor = close;
  window.MPyreFullEditor = {
    receive(bytes) {
      if (!frame.contentWindow || !Array.isArray(bytes)) return;
      frame.contentWindow.postMessage({
        type:"mpyre-midi-from-firmware",bytes:bytes
      },location.origin);
    }
  };
  window.addEventListener("message",event=>{
    if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
    if (event.data?.type !== "mpyre-midi-to-firmware") return;
    // A physical USB connection and an embedded editor must not compete for
    // the one SysEx request/reply channel in the real FM-1 firmware.
    if (window.MPyreUsbMidi?.isConnected()) return;
    const bytes=event.data.bytes;
    if (!Array.isArray(bytes) || bytes.length>640 || !bytes.length) return;
    if (!bytes.every(n=>Number.isInteger(n)&&n>=0&&n<=255)) return;
    if (node) node.port.postMessage({t:"officialEditorMidi",bytes});
  });
})();
