#!/usr/bin/env python3
"""Validate the dismissable Android options popup on each generated build."""
from pathlib import Path
page = Path("app/src/main/assets/index.html").read_text(encoding="utf-8")
for required in [
    'id = "android-options-backdrop"',
    'id = "android-options-header"',
    'id="android-options-close"',
    'aria-label="Optionen schließen"',
    'const closeOptions = () => {',
    'optionsCloseBtn.addEventListener("click", closeOptions)',
    'optionsBackdrop.addEventListener("pointerdown"',
    'e.key === "Escape" && closeOptions()',
    'window.MPyreCloseOptions = closeOptions',
    'document.getElementById(id)?.addEventListener("click", () => closeOptions())',
    '#android-options-backdrop.open { display:block; }',
    '#android-options-header {',
    '#android-options-close {',
    'F3 – G5 · 27 Tasten',
    'latencyHint: "interactive"',
]:
    assert required in page, f"Missing menu/keyboard/audio feature: {required}"
java = Path("app/src/main/java/dev/mpyre/standalone/MainActivity.java").read_text(encoding="utf-8")
assert "public void onBackPressed()" in java
assert "window.MPyreCloseOptions" in java
print("Dismissable options popup: close, outside tap, Escape, Android Back, file picker OK")
