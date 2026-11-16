#!/usr/bin/env python3
"""Verify Note Grid and touch brush integration in both actual editor bundles."""
from pathlib import Path
core=Path("android/seq-brush-core.js").read_text("utf8")
ui=Path("android/seq-brush-ui.js").read_text("utf8")
for fn in ("paint(","transform(","paste(","shift(","ratBits("):
    assert fn in core,fn
for token in ('renderPitchGrid()', 'brushBindGrid("stepgrid")',
              'brushBindGrid("drumgrid",true)', 'brushBindGrid("pitchgrid")',
              'touch-action must be set BEFORE pointerdown', 'brushWriteDrums(',
              'await brushWrite(', 'getElementById(id)'):
    assert token in ui,token
for path in ("app/src/main/assets/pc-usb-editor.html",
             "app/src/main/assets/editor.html"):
    s=Path(path).read_text("utf8")
    for token in ('data-v="grid"', 'data-v="roll"', 'data-v="notes"',
                  'id="seqbrush"', 'id="pitchgrid"', 'id="pitchgrid-matrix"',
                  'id="seqbrush-from"', 'id="seqbrush-to"',
                  'id="seqbrush-ratchet"', 'id="pc-song-play"' if "pc-usb" in path else 'id="mpyre-virtual-midi-shim"',
                  'brush-selected','pitch-cell','MPyreSeqCore','MPyreSeqBrush',
                  'if (!$("pitchgrid").hidden) renderPitchGrid();'):
        assert token in s,f"{path}: missing {token}"
assert "brush-active button{touch-action:none" in Path("android/seq-brush.css").read_text()
print("Both original editor variants: Notes view, pointer brushes, bulk editing, firmware writes present")
