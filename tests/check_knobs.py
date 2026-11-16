#!/usr/bin/env python3
"""Check landscape control improvements without altering original firmware audio."""
from pathlib import Path
page = Path("app/src/main/assets/index.html").read_text(encoding="utf-8")
assert '/* ---- Android touch knobs:' in page
assert 'id="encs1"' in page and 'id="encs2"' in page
assert 'getElementById("encs1").appendChild(el)' in page
assert 'class="knob-step minus"' in page and 'class="knob-step plus"' in page
assert 'dial.setPointerCapture(e.pointerId)' in page
assert 'accX += e.clientX - x0' in page
assert 'accY += y0 - e.clientY' in page
assert 'send({ t: "knob", r: EN[name], s: steps })' in page
assert 'height:min(46dvh,300px)' in page
assert '#encs2 { display:none !important; }' in page
assert 'VISIBLE_WHITE = 10' in page and 'keyboardZoom = false' in page
assert 'latencyHint: "interactive"' in page
print("Landscape display size, 7 swipe knobs, +/- controls, touch keyboard and audio mode OK")
