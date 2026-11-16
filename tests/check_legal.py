#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Fail a build if license, attribution or user access is missing."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
assets = ROOT / "app/src/main/assets"
legal = assets / "legal"
required = [
    "index.html", "GPL-3.0.txt", "ANDROID-LICENSING.md",
    "THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.txt", "ANDROID-LICENSING.txt", "UPSTREAM-LICENSING.txt", "RELEASING.md",
    "UPSTREAM-LICENSING.md", "Apache-2.0-msfa.txt",
    "MIT-Fukiai.txt", "Apache-2.0-AndroidX.txt", "CC-BY-4.0-NOTICE.txt", "CC0-1.0-NOTICE.txt",
    "SAMPLES-CC0-ATTRIBUTION.txt",
    "BarlowCondensed-OFL.txt", "Terminus-LICENSE.txt",
    "OFL-blackopsone.txt", "OFL-damion.txt", "OFL-pacifico.txt",
    "OFL-racingsansone.txt", "OFL-russoone.txt"
]
for name in required:
    p = legal / name
    assert p.is_file() and p.stat().st_size >= 100, f"Missing or empty APK license: {p}"
assert "GNU GENERAL PUBLIC LICENSE" in (legal / "GPL-3.0.txt").read_text()
assert "MIT License" in (legal / "MIT-Fukiai.txt").read_text()
assert "Apache License" in (legal / "Apache-2.0-msfa.txt").read_text()
assert "additional permission" in (legal / "UPSTREAM-LICENSING.md").read_text()
assert "Versilian" in (legal / "SAMPLES-CC0-ATTRIBUTION.txt").read_text()
index = (assets / "index.html").read_text()
assert 'openSourceNotices.id = "android-open-source-notices"' in index
assert 'src="legal/index.html"' in index
for name in ("pc-usb-editor.html", "editor.html"):
    editor = (assets / name).read_text()
    for marker in ("mpyre-legal-offline", "GNU GENERAL PUBLIC LICENSE",
                   "Apache License", "MIT License", "History Of Sky",
                   "Creative Commons Attribution 4.0"):
        assert marker in editor, f"{name} missing inline notice {marker}"
source_script = (ROOT / "scripts/prepare_emulator.py").read_text()
assert "MIT-licensed, NOT SIL OFL" in source_script
assert "copy the OFL-licensed" not in source_script
print("Offline APK notices and self-contained PC/Android editors: all source licenses and attribution present")
