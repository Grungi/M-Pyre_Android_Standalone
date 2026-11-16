/* ---- Android touch knobs: horizontal swipe, vertical swipe, and +/- steps ---- */
const knobEls = {};
function knob(name, big) {
  const el = document.createElement("div");
  el.className = "knob" + (big ? " big" : "");
  el.innerHTML =
    '<div class="dial-controls">' +
      '<button type="button" class="knob-step minus" aria-label="' + name + ' verringern">−</button>' +
      '<div class="dial" role="slider" tabindex="0" aria-label="' + name + '" ' +
        'aria-valuetext="Mit dem Finger links oder rechts wischen"></div>' +
      '<button type="button" class="knob-step plus" aria-label="' + name + ' erhöhen">+</button>' +
    '</div><label>' + name + '</label>';
  const dial = el.querySelector(".dial");
  let angle = 0, activeId = null, x0 = 0, y0 = 0, accX = 0, accY = 0;
  const turn = (steps) => {
    steps = Math.max(-20, Math.min(20, steps | 0));
    if (!steps) return;
    angle += steps * 12;
    dial.style.setProperty("--a", angle + "deg");
    send({ t: "knob", r: EN[name], s: steps });
  };
  const clear = (e) => {
    if (activeId === e.pointerId) activeId = null;
  };
  dial.addEventListener("pointerdown", (e) => {
    if (activeId !== null) return;
    e.preventDefault();
    activeId = e.pointerId;
    x0 = e.clientX; y0 = e.clientY;
    accX = 0; accY = 0;
    try { dial.setPointerCapture(e.pointerId); } catch (_) {}
  });
  dial.addEventListener("pointermove", (e) => {
    if (activeId !== e.pointerId) return;
    e.preventDefault();
    accX += e.clientX - x0;
    accY += y0 - e.clientY;
    x0 = e.clientX; y0 = e.clientY;
    // Horizontal is the intended playing gesture; vertical still works.
    const vertical = Math.abs(accY) > Math.abs(accX) * 1.6;
    const acc = vertical ? accY : accX;
    const steps = Math.trunc(acc / 12);
    if (!steps) return;
    turn(steps);
    if (vertical) accY -= steps * 12;
    else accX -= steps * 12;
  });
  dial.addEventListener("pointerup", clear);
  dial.addEventListener("pointercancel", clear);
  dial.addEventListener("lostpointercapture", clear);
  dial.addEventListener("wheel", (e) => {
    e.preventDefault();
    turn(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  dial.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); turn(1); }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); turn(-1); }
  });
  el.querySelector(".minus").addEventListener("click", () => turn(-1));
  el.querySelector(".plus").addEventListener("click", () => turn(1));
  document.getElementById("encs1").appendChild(el);
  knobEls[name] = { el, turn };
}
["SELECT", "ALGORITHM", "PRESETS"].forEach((name) => knob(name, true));
["KNOB 1", "KNOB 2", "KNOB 3", "KNOB 4"].forEach((name) => knob(name, false));
