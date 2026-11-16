#!/usr/bin/env python3
"""Check that Classic input is preserved and LCD Touch is connected end-to-end."""
from pathlib import Path
page = Path("app/src/main/assets/index.html").read_text(encoding="utf8")
c = Path("android/lcd-touch-emu.c").read_text(encoding="utf8")
for bit in (
    'toggle.id = "lcd-touch-toggle"', 'mpyre-lcd-input', '"touch"', '"classic"',
    '.fm1.lcd-touch-mode .top', 'height:min(72dvh,520px)',
    'lcdCanvas.addEventListener("pointerdown"',
    'lcdCanvas.addEventListener("pointermove"',
    'lcdCanvas.addEventListener("pointerup"',
    'lcdCanvas.setPointerCapture(ev.pointerId)',
    'send({ t: "lcdTouch", kind, x: point.x, y: point.y, steps })',
    'else if (m.t === "lcdTouch") E.emu_lcd_touch',
    'latencyHint: "interactive"', 'const WASM_B64 = ',
    'studioLaunch.id = "open-studio"',
    'else if (m.t === "homeDrumTouch")',
    'E.emu_home_drum_touch(m.x | 0, m.y | 0)',
    'send({ t: "homeDrumTouch", x: pt.x, y: pt.y, fallback: false })',
    'send({ t: "homeDrumTouch", x: pt.x, y: pt.y, fallback: true })',
):
    assert bit in page, f"LCD touch or preserved feature missing: {bit}"
for symbol in ('emu_lcd_touch', 'menu_close', 'mi_set', 'track_select',
               'studio_open(SC_DRUM)', 'GR_ROLL', 'dstep_set', 'layer_key',
               'undo_mark', 'LCD_PAINT', 'LCD_HOLD',
               'emu_home_drum_touch', 'home_kit_lane',
               'audition_lane((uint32_t)lane)'):
    assert symbol in c, symbol
assert 'id="drum-pads-toggle"' not in page and 'id="drum-pads"' not in page
assert page.index('toggle.id = "lcd-touch-toggle"') > 0
print("Classic default, persistent toggle, enlarged LCD, pointer gestures and native bridge OK")
