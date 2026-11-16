/* ---- Android keyboard: all 27 original notes, with optional enlarged zoom ---- */
const NAMES = ["F", "F#", "G", "G#", "A", "A#", "B", "C", "C#", "D", "D#", "E"];
const keysEl = document.getElementById("keys"), keyEls = [];
let held = 0, touchHeld = 0;
const WHITE = [];
for (let k = 0; k < 27; k++) if (!NAMES[k % 12].includes("#")) WHITE.push(k);
// Default: all original 27 chromatic keys F3..G5, like the original emulator.
// Zoom is optional for larger individual touch targets, not a note remapping.
const VISIBLE_WHITE = 10;
const MAX_START = WHITE.length - VISIBLE_WHITE;
let whiteStart = 0, keyboardZoom = false;
const visibleCount = () => keyboardZoom ? VISIBLE_WHITE : WHITE.length;
const fingerKeys = new Map(), fingerCounts = new Uint8Array(27);
const keyName = (k) => NAMES[k % 12] + (3 + Math.floor((k + 5) / 12));
const setKeys = () => send({ t: "keys", v: held | touchHeld });
function refreshKey(k) {
  if (keyEls[k]) keyEls[k].classList.toggle("down", !!((held | touchHeld) & (1 << k)));
}
function layoutKeys() {
  const count = visibleCount();
  const start = keyboardZoom ? whiteStart : 0;
  const width = keysEl.clientWidth / count;
  keyEls.forEach((el, k) => {
    const black = NAMES[k % 12].includes("#");
    const predecessor = black ? WHITE.indexOf(k - 1) : WHITE.indexOf(k);
    const visible = black ?
      (predecessor >= start && predecessor < start + count - 1) :
      (predecessor >= start && predecessor < start + count);
    el.style.display = visible ? "block" : "none";
    if (!visible) return;
    el.style.left = black ?
      ((predecessor - start + 1) * width - width * 0.32) + "px" :
      ((predecessor - start) * width) + "px";
    el.style.width = (black ? width * 0.64 : width - 2) + "px";
  });
  document.getElementById("key-range").textContent = keyboardZoom ?
    keyName(WHITE[start]) + " – " + keyName(WHITE[start + count - 1]) :
    "F3 – G5 · 27 Tasten";
  const prev = document.getElementById("key-prev");
  const next = document.getElementById("key-next");
  prev.hidden = next.hidden = !keyboardZoom;
  prev.disabled = (whiteStart === 0);
  next.disabled = (whiteStart === MAX_START);
  const zoom = document.getElementById("key-zoom");
  zoom.textContent = keyboardZoom ? "NORMAL" : "ZOOM";
  zoom.setAttribute("aria-pressed", keyboardZoom ? "true" : "false");
}
function assignFinger(pointerId, next) {
  const old = fingerKeys.has(pointerId) ? fingerKeys.get(pointerId) : -1;
  if (old === next) return;
  if (old >= 0) {
    fingerCounts[old]--;
    if (!fingerCounts[old]) touchHeld &= ~(1 << old);
    refreshKey(old);
  }
  if (next >= 0) {
    fingerCounts[next]++;
    touchHeld |= 1 << next;
    fingerKeys.set(pointerId, next);
    refreshKey(next);
  } else {
    fingerKeys.delete(pointerId);
  }
  setKeys();
}
function releaseAllFingers() {
  for (const pointerId of [...fingerKeys.keys()]) assignFinger(pointerId, -1);
}
function keyAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const key = el && el.closest && el.closest(".key");
  if (!key || !keysEl.contains(key)) return -1;
  return Number(key.dataset.key);
}
for (let k = 0; k < 27; k++) {
  const el = document.createElement("div");
  const black = NAMES[k % 12].includes("#");
  el.className = "key " + (black ? "b" : "w");
  el.dataset.key = String(k);
  const note = keyName(k);
  const show = NAMES[k % 12] === "C" || NAMES[k % 12] === "F";
  el.innerHTML = '<div class="lab">' + (show ? note : "") + '</div><div class="led"></div>';
  keysEl.appendChild(el);
  keyEls.push(el);
}
keysEl.addEventListener("pointerdown", (e) => {
  const key = e.target.closest && e.target.closest(".key");
  if (!key || !keysEl.contains(key)) return;
  e.preventDefault();
  // Capturing each touch on the entire keyboard keeps two or more fingers
  // independent and allows glissando over the keys.
  try { keysEl.setPointerCapture(e.pointerId); } catch (_) {}
  assignFinger(e.pointerId, Number(key.dataset.key));
});
keysEl.addEventListener("pointermove", (e) => {
  if (!fingerKeys.has(e.pointerId)) return;
  e.preventDefault();
  const next = keyAt(e.clientX, e.clientY);
  if (next >= 0) assignFinger(e.pointerId, next);
});
const endFinger = (e) => { if (fingerKeys.has(e.pointerId)) { e.preventDefault(); assignFinger(e.pointerId, -1); } };
keysEl.addEventListener("pointerup", endFinger);
keysEl.addEventListener("pointercancel", endFinger);
keysEl.addEventListener("lostpointercapture", endFinger);
document.getElementById("key-zoom").addEventListener("click", () => {
  releaseAllFingers();
  keyboardZoom = !keyboardZoom;
  whiteStart = 0;
  layoutKeys();
});
document.getElementById("key-prev").addEventListener("click", () => {
  if (whiteStart > 0) { releaseAllFingers(); whiteStart = 0; layoutKeys(); }
});
document.getElementById("key-next").addEventListener("click", () => {
  if (whiteStart < MAX_START) { releaseAllFingers(); whiteStart = MAX_START; layoutKeys(); }
});
addEventListener("resize", layoutKeys);
layoutKeys();
// The menu is a modal overlay: a visible close button, click-outside,
// Escape and Android Back all close it without interrupting audio.
const optionsPanel = document.createElement("div");
optionsPanel.id = "android-options-panel";
optionsPanel.setAttribute("role", "dialog");
optionsPanel.setAttribute("aria-modal", "true");
optionsPanel.setAttribute("aria-label", "M-PYRE Optionen");

const optionsBackdrop = document.createElement("div");
optionsBackdrop.id = "android-options-backdrop";
optionsBackdrop.setAttribute("aria-hidden", "true");
document.querySelector(".page").appendChild(optionsBackdrop);

const optionsHeader = document.createElement("div");
optionsHeader.id = "android-options-header";
optionsHeader.innerHTML =
  '<strong>Optionen · Songs</strong>' +
  '<button type="button" id="android-options-close" aria-label="Optionen schließen">✕ Schließen</button>';
optionsPanel.appendChild(optionsHeader);
const studioLaunch = document.createElement("button");
studioLaunch.id = "open-studio";
studioLaunch.type = "button";
studioLaunch.textContent = "✎ SONG STUDIO · Touch Sequencer";
optionsPanel.appendChild(studioLaunch);

// Keep the original performance screen unchanged. Licenses are available
// inside the existing Options sheet, completely offline from bundled assets.
const openSourceNotices = document.createElement("details");
openSourceNotices.id = "android-open-source-notices";
openSourceNotices.innerHTML =
  '<summary style="cursor:pointer;padding:8px;font-weight:700">ⓘ Open-source licenses · Lizenzen</summary>' +
  '<iframe loading="lazy" title="M-PYRE licensing, source and third-party notices" ' +
  'src="legal/index.html" style="width:100%;height:min(50dvh,420px);border:1px solid #997255;background:#201913"></iframe>';
optionsPanel.appendChild(openSourceNotices);


document.querySelectorAll(".page > .foot").forEach(el => optionsPanel.appendChild(el));
document.querySelector(".page").appendChild(optionsPanel);
const optionsBtn = document.getElementById("android-menu-btn");
const optionsCloseBtn = document.getElementById("android-options-close");
const closeOptions = () => {
  if (!optionsPanel.classList.contains("open")) return false;
  optionsPanel.classList.remove("open");
  optionsBackdrop.classList.remove("open");
  optionsBtn.setAttribute("aria-expanded", "false");
  optionsBtn.focus({ preventScroll: true });
  return true;
};
const openOptions = () => {
  optionsPanel.classList.add("open");
  optionsBackdrop.classList.add("open");
  optionsBtn.setAttribute("aria-expanded", "true");
  optionsCloseBtn.focus({ preventScroll: true });
};
optionsBtn.addEventListener("click", () => {
  if (!closeOptions()) openOptions();
});
optionsCloseBtn.addEventListener("click", closeOptions);
optionsBackdrop.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  closeOptions();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && closeOptions()) {
    e.preventDefault();
    e.stopPropagation();
  }
});
// Exposed solely for the Android Activity's system Back handler.
// Returning true means an open menu was dismissed.
window.MPyreCloseOptions = closeOptions;
// The native file picker and save dialog do not need the options overlay left
// hanging open when they return.
["imp", "exp"].forEach(id => {
  document.getElementById(id)?.addEventListener("click", () => closeOptions());
});
