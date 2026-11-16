#!/usr/bin/env python3
"""Check new Studio UI code in the generated app and our pinned C firmware bridge."""
import re
from pathlib import Path
p = Path("app/src/main/assets/index.html").read_text(encoding="utf-8")
for symbol in [
    'view.id = "android-studio"',
    'id="studio-grid"', 'id="studio-lanes"', 'id="studio-back"',
    'id="studio-play"', 'studioLaunch.id = "open-studio"',
    'window.MPyreStudio', 'window.MPyreCloseStudio',
    'studioGet', 'studioSet', 'studioStep', 'studioDrum', 'studioSlot',
    'E.emu_studio_snapshot()', 'E.emu_studio_step', 'E.emu_studio_drum',
    'E.emu_studio_set', 'E.emu_studio_slot',
    'a.length !== 8 + 8 * (8 + 64 * 10)', 'min-height:44px',
    'grid-template-columns:repeat(4,minmax(0,1fr))',
    '#encs1 { grid-row:2; }', 'grid-template-rows:minmax(24px,.34fr)',
    'latencyHint: "interactive"', 'F3 – G5 · 27 Tasten'
]:
    assert symbol in p, f"Song Studio feature missing: {symbol}"
s = Path("android/studio-emu.c").read_text(encoding="utf-8")
for name in ['emu_studio_snapshot', 'emu_studio_set', 'emu_studio_step',
             'emu_studio_drum', 'emu_studio_slot']:
    assert re.search(r"uint32_t\s+" + name + r"\s*\(",s)
assert 'memcpy(p, tr->step' in s
print("Touch-first Studio, 64 steps, 8 tracks, drum lanes, lowered knobs and real WASM bridge OK")
