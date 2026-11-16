#!/usr/bin/env python3
from pathlib import Path
html=Path("app/src/main/assets/pc-usb-editor.html").read_text("utf-8")
src=Path("android/pc-song-transport.js").read_text("utf-8")
assert html.count('id="pc-song-play"')==1
assert html.count('id="pc-song-stop"')==1
assert html.count('id="pc-song-status"')==1
assert 'window.MPyrePcSongTransport' in html
assert 'return true;' in html[html.index('async function sendSong()'):html.index('const songCount =')]
assert src.index('await sendSong()') < src.index('await command(LIVE.PLAY, 1)')
assert 'await command(LIVE.KEY, LIVE.LY_SONG, LIVE.SONG, 1)' in src
assert 'await command(LIVE.PLAY, 0)' in src
assert 'missingSections' in src
assert 'role="status" aria-live="polite"' in html
assert 'pc-song-transport-style' in html
print("PC Song page Play/Stop, save-before-play, LIVE transport, section checks and status present")
