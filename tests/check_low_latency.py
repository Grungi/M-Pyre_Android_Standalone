#!/usr/bin/env python3
"""Verify audio configuration and original sample pack in the generated offline page."""
import base64, hashlib, re
from pathlib import Path
page = Path("app/src/main/assets/index.html").read_text(encoding="utf-8")
assert 'latencyHint: "interactive"' in page, "Interactive AudioContext missing"
assert 'latencyHint: "playback"' not in page, "High-latency playback AudioContext remained"
assert 'new AC({ sampleRate: 44100' not in page, "Forced output sample rate remained"
assert 'ctx.baseLatency' in page and 'ctx.outputLatency' in page, "Audio metrics missing"
assert 'id="audio-diagnostics"' in page, "Audio diagnostics UI missing"
assert 'WebAssembly.instantiate(' in page, "Emulator worklet missing"
wasm = re.search(r'const WASM_B64 = "([A-Za-z0-9+/=]+)";', page)
pack = re.search(r'const PACK_B64 = "([A-Za-z0-9+/=]+)";', page)
assert wasm and pack, "Missing firmware WASM or soundpack"
wasm_bytes = base64.b64decode(wasm.group(1))
pack_bytes = base64.b64decode(pack.group(1))
assert wasm_bytes[:4] == bytes([0, 97, 115, 109]), "Not a WebAssembly binary"
assert len(pack_bytes) == 4 * 0x14000
assert hashlib.sha256(pack_bytes).hexdigest() == "a5ce2cdc28601891dfeec3c5d58387f24ee3ee4e19901a55c429bb891f2dbd34"
print(f"Low-latency patch OK; WASM {len(wasm_bytes)} B; verified original soundpack {len(pack_bytes)} B")

# Android v5: default is all original 27 keys; 10-white-key zoom is optional.
assert 'id="android-keybar"' in page and 'id="key-prev"' in page and 'id="key-next"' in page
assert 'id="android-menu-btn"' in page and 'id="android-performance-styles"' in page
assert 'height:100dvh' in page and 'height:100% !important' in page
assert 'VISIBLE_WHITE = 10' in page and 'fingerKeys = new Map()' in page
assert 'let whiteStart = 0, keyboardZoom = false' in page
assert 'const visibleCount = () => keyboardZoom ? VISIBLE_WHITE : WHITE.length' in page
assert 'F3 – G5 · 27 Tasten' in page and 'id="key-zoom"' in page
assert 'prev.hidden = next.hidden = !keyboardZoom' in page
assert 'setPointerCapture(e.pointerId)' in page and 'lostpointercapture' in page
assert 'optionsPanel.id = "android-options-panel"' in page
print("27 original keys by default, optional zoom, and multitouch pointer tracking OK")
