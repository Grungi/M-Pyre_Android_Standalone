#!/usr/bin/env python3
"""Inspect the generated offline official M-PYRE editor and Android touch bridge."""
from pathlib import Path
html=Path("app/src/main/assets/editor.html").read_text(encoding="utf-8")
assert len(html)>700000, "full editor was not bundled"
for tag in ['data-tab="live"', 'data-tab="sound"', 'data-tab="sequencer"',
    'data-tab="tracks"', 'data-tab="song"', 'data-tab="library"',
    'data-tab="samples"', 'data-tab="kits"', 'data-tab="drumsynth"',
    'data-tab="projects"', 'data-tab="settings"', 'data-tab="theme"',
    'id="mpyre-virtual-midi-shim"', 'id="mpyre-editor-android-touch"',
    'navigator,"requestMIDIAccess"', 'mpyre-midi-to-firmware']:
    assert tag in html,f"Missing full editor feature: {tag}"
shell=Path("app/src/main/assets/index.html").read_text(encoding="utf-8")
for token in ["MPyreFullEditor","MPyreCloseFullEditor","open-full-editor",
              "officialEditorMidi","officialMidi","emu_editor_send",
              "emu_editor_poll","emu_editor_pull","emu_editor_midi"]:
    assert token in shell,f"Missing main-app bridge: {token}"
java=Path("app/src/main/java/dev/mpyre/standalone/MainActivity.java").read_text(encoding="utf-8")
assert 'exportFile(String b64' in java
for token in ['restoreFullEditorExtras','saveFullEditorExtra','emu_extra_get','emu_extra_put']:
    assert token in shell,f"Missing persistent editor state: {token}"
print("Official offline editor with all 12 tabs, touch UI, native export and the virtual MIDI bridge OK")
