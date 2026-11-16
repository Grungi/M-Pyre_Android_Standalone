#!/usr/bin/env python3
"""Check the actual generated PC + Android editor support for native 7+1 tracks."""
from pathlib import Path
for path in (
    Path("app/src/main/assets/pc-usb-editor.html"),
    Path("app/src/main/assets/editor.html"),
):
    text=path.read_text(encoding="utf-8")
    expected=(
        'id="mpyre-eight-track-editor"',
        'FM6_NPART = 7;',
        'i < 3 ? lvGv(g.ch[i]) : i < 7 ? i + 1 : 0',
        'overflow-x:auto',
        'm.tracks.forEach((_, i) => updateStrip(i))',
        'const drumTrack = (i) => !!dev && !!dev.mix && i === dev.mix.ntrk - 1',
        'const ntrk = hasTracks() ? dev.info.ntrk : 0',
        'data-v="notes"',
        'window.MPyreSeqBrush',
    )
    for feature in expected:
        assert feature in text, f"{path.name}: missing {feature}"
    print(path.name, "8-track selector, Live MIDI, mixer, and note grid OK")
