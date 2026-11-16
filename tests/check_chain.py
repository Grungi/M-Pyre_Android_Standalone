#!/usr/bin/env python3
"""Check that Android's generated emulator contains native arranger & touch chain UI."""
from pathlib import Path
p=Path("app/src/main/assets/index.html").read_text(encoding="utf-8")
requirements=[
    'panel.id="studio-chain"',
    "PATTERN CHAIN",
    "CHAIN LOOP",
    'm.t === "chainSet"',
    'm.t === "songOrderPut"',
    "E.emu_chain_set",
    "E.emu_chain_get",
    "E.emu_song_order_get",
    "E.emu_song_order_put",
    'lsSet("song-order"',
    "restoreSongOrder();",
    "window.MPyrePatternChain",
    "latencyHint: \"interactive\"",
    "F3 – G5 · 27 Tasten",
]
for v in requirements:
    assert v in p, f"Missing chain feature: {v}"
source=Path("android/arranger-emu.c").read_text(encoding="utf-8")
assert '#include "../src/arranger_scene.c"' in source
assert 'static void arrangement_apply(uint32_t s) { (void)s; }' not in source
assert 'arrangement_ready()' in source and 'emu_chain_set(' in source
print("Full original song arranger, quick-chain UI and persistent song order present")
