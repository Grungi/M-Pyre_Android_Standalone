/* Android-only touchscreen for the actual 240x240 M-PYRE LCD.
 * Classic mode remains the default. No image recognition, duplicate engine,
 * or Android-native input injection: all actions go to the same WASM worklet.
 * SPDX-License-Identifier: GPL-3.0-only.
 */
(() => {
  const lcdCanvas = document.getElementById("lcd");
  const panel = document.querySelector(".fm1");
  const bar = document.getElementById("android-keybar");
  if (!lcdCanvas || !panel || !bar) return;

  const toggle = document.createElement("button");
  toggle.id = "lcd-touch-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Eingabemodus wechseln: Touchscreen oder klassische FM-1-Steuerung");
  bar.insertBefore(toggle, document.getElementById("android-menu-btn"));

  let enabled = false;
  try { enabled = localStorage.getItem("mpyre-lcd-input") === "touch"; } catch (_) {}
  const pointers = new Map();
  const coords = (ev) => {
    const rect = lcdCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(239, Math.floor((ev.clientX - rect.left) * 240 / rect.width))),
      y: Math.max(0, Math.min(239, Math.floor((ev.clientY - rect.top) * 240 / rect.height)))
    };
  };
  const dispatch = (kind, point, steps = 0) =>
    send({ t: "lcdTouch", kind, x: point.x, y: point.y, steps });
  const update = () => {
    panel.classList.toggle("lcd-touch-mode", enabled);
    toggle.textContent = enabled ? "◉ LCD TOUCH" : "◯ CLASSIC";
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.title = enabled
      ? "Touch: LCD antippen/wischen. Lang auf die Kopfzeile = Firmware-Menü. Hier zu Classic wechseln."
      : "Classic: Originale FM-1-Knöpfe und Tasten. Hier LCD-Touch aktivieren.";
    lcdCanvas.setAttribute("aria-label", enabled
      ? "Interaktives M-PYRE Display; das abgebildete Drumkit lässt sich direkt antippen."
      : "Klassisches M-PYRE Display; abgebildetes Drumkit auf der LIVE-Startseite direkt spielbar.");
    // The keyboard's visible range may need recomputing after the mode changes.
    requestAnimationFrame(() => { if (typeof layoutKeys === "function") layoutKeys(); });
  };
  const cancelAll = () => {
    for (const state of pointers.values()) clearTimeout(state.timer);
    pointers.clear();
  };
  toggle.addEventListener("click", () => {
    enabled = !enabled;
    cancelAll();
    try { localStorage.setItem("mpyre-lcd-input", enabled ? "touch" : "classic"); } catch (_) {}
    update();
  });
  update();

  // The help lives in the existing Options menu; never cover the LCD or
  // intercept performance gestures with an extra overlay.
  const options = document.getElementById("android-options-panel");
  if (options) {
    const help = document.createElement("details");
    help.id = "lcd-touch-help";
    help.innerHTML = '<summary>ⓘ LCD TOUCH – Kurzanleitung</summary>' +
      '<p><strong>Oben:</strong> ▶ Play/Stop, BPM wischen, rechts nächste Seite. Kopfzeile lange halten = Firmware-Menü.</p>' +
      '<p><strong>Tracks:</strong> Antippen = wählen, rechts = Mute, lange halten = Sequencer/Drums.</p>' +
      '<p><strong>Drums:</strong> Schritte tippen oder streichen. Kit-Pads antippen zum Hören.</p>' +
      '<p><strong>Parameter:</strong> Werte und vier untere Regler wischen. Links/Rechts antippen = −/+.</p>' +
      '<p><strong>Menü:</strong> Tab wählen, Option antippen zum Weiterschalten. Classic bleibt jederzeit verfügbar.</p>';
    options.insertBefore(help, options.children[1] || null);
  }

  lcdCanvas.addEventListener("pointerdown", (ev) => {
    if (ev.button > 0) return;
    const pt = coords(ev);
    if (!enabled) {
      // In CLASSIC mode *only* the existing home-screen kit image
      // accepts taps. Firmware rejects this message on every other page
      // or when a melodic track is selected. No new UI is created.
      if (pt.y >= 74 && pt.y < 198) {
        ev.preventDefault();
        send({ t: "homeDrumTouch", x: pt.x, y: pt.y, fallback: false });
      }
      return;
    }
    ev.preventDefault();
    const state = {
      id: ev.pointerId, start: pt, last: pt,
      x: ev.clientX, y: ev.clientY, lastX: ev.clientX, lastY: ev.clientY,
      travel: 0, acc: 0, dragged: false, held: false, painted: new Set(),
      timer: null
    };
    state.timer = setTimeout(() => {
      if (!enabled || state.dragged || !pointers.has(ev.pointerId)) return;
      // The original FM-1's system menu opens from a long button hold;
      // on the phone the LCD header is the ergonomic equivalent.
      if (pt.y < 42 || (pt.y >= 40 && pt.y < 184)) {
        dispatch(2, pt);
        state.held = true;
      }
    }, 580);
    pointers.set(ev.pointerId, state);
    try { lcdCanvas.setPointerCapture(ev.pointerId); } catch (_) {}
  });

  lcdCanvas.addEventListener("pointermove", (ev) => {
    const s = pointers.get(ev.pointerId);
    if (!enabled || !s) return;
    ev.preventDefault();
    const dx = ev.clientX - s.lastX, dy = s.lastY - ev.clientY;
    s.travel += Math.hypot(dx, dy);
    const fromStart = Math.hypot(ev.clientX - s.x, ev.clientY - s.y);
    const pt = coords(ev);
    if (fromStart >= 9) {
      s.dragged = true;
      clearTimeout(s.timer);
    }
    if (s.dragged && !s.held) {
      // Brush actions send *each* new grid cell only once per gesture.
      // The native bridge accepts paint only on the actual drum step grid.
      const paint = (p) => {
        if (p.y < 84 || p.y >= 184 || p.x < 12) return;
        const key = Math.floor((p.x - 12) / 14) + ":" + Math.floor(Math.max(0, p.y - 86) / 6);
        if (!s.painted.has(key)) {
          s.painted.add(key);
          dispatch(3, p);
        }
      };
      if (s.start.y >= 84 && s.start.y < 184 && s.start.x >= 12) {
        if (s.painted.size === 0) paint(s.start);
        const n = Math.max(1, Math.ceil(Math.max(
          Math.abs(pt.x - s.last.x) / 7,
          Math.abs(pt.y - s.last.y) / 3
        )));
        for (let i = 1; i <= n; i++) {
          paint({
            x: Math.round(s.last.x + (pt.x - s.last.x) * i / n),
            y: Math.round(s.last.y + (pt.y - s.last.y) * i / n)
          });
        }
      }
      // Swipe in the main axis; one event can turn multiple detents.
      const d = Math.abs(ev.clientX - s.x) > Math.abs(ev.clientY - s.y) * 1.25 ? dx : dy;
      s.acc += d;
      const stepSize = 15; // physical CSS pixels, independent of LCD enlargement
      const n = Math.trunc(s.acc / stepSize);
      if (n) {
        s.acc -= n * stepSize;
        dispatch(1, pt, Math.max(-12, Math.min(12, n)));
      }
    }
    s.lastX = ev.clientX;
    s.lastY = ev.clientY;
    s.last = pt;
  });

  const release = (ev, cancelled) => {
    const s = pointers.get(ev.pointerId);
    if (!s) return;
    clearTimeout(s.timer);
    pointers.delete(ev.pointerId);
    if (!cancelled && enabled && !s.dragged && !s.held) {
      const pt = coords(ev);
      if (pt.y >= 74 && pt.y < 198) {
        // Try the pictured kit first. On other pages, the worklet
        // falls back to the unchanged native LCD tap implementation.
        send({ t: "homeDrumTouch", x: pt.x, y: pt.y, fallback: true });
      } else {
        dispatch(0, pt);
      }
    }
  };
  lcdCanvas.addEventListener("pointerup", (ev) => { if (pointers.has(ev.pointerId)) ev.preventDefault(); release(ev, false); });
  lcdCanvas.addEventListener("pointercancel", (ev) => release(ev, true));
  lcdCanvas.addEventListener("lostpointercapture", (ev) => release(ev, true));
  addEventListener("blur", cancelAll);
  window.MPyreLcdTouch = { isEnabled: () => enabled };
})();
