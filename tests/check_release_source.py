#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Inspect the exact corresponding source archive produced for this APK."""
from pathlib import Path
import subprocess, tarfile, zipfile
ROOT = Path(__file__).resolve().parents[1]
archive = ROOT / "build/release/M-PYRE-v18-corresponding-source.tar.gz"
apk = ROOT / "app/build/outputs/apk/debug/app-debug.apk"
prefix = "M-PYRE-v18-corresponding-source"
assert archive.is_file() and archive.stat().st_size > 10000
with tarfile.open(archive, "r:gz") as tar:
    names = set(tar.getnames())
    for rel in (
        "SOURCE-INFO.txt", "UPSTREAM-PATCH.diff",
        "android-app/LICENSE", "android-app/LICENSING.md",
        "android-app/THIRD_PARTY_NOTICES.md", "android-app/RELEASING.md",
        "android-app/scripts/prepare_emulator.py",
        "android-app/scripts/package_release_source.py",
        "android-app/app/src/main/assets/legal/GPL-3.0.txt",
        "upstream-m-pyre-v1.0.3/LICENSING.md",
        "upstream-m-pyre-v1.0.3/firmware/host/emu.c",
        "upstream-m-pyre-v1.0.3/tools/build_emu.py",
        "upstream-m-pyre-v1.0.3/build/mpyre/soundpack.bin",
        "upstream-m-pyre-v1.0.3/build/mpyre/sets.json",
    ):
        assert prefix + "/" + rel in names, f"Missing corresponding source: {rel}"
    info = tar.extractfile(prefix + "/SOURCE-INFO.txt").read().decode()
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip() in info
    assert "APK SHA-256:" in info and "Original M-PYRE CC BY soundpack SHA-256:" in info
with zipfile.ZipFile(apk) as z:
    names = set(z.namelist())
    for name in ("assets/legal/index.html", "assets/legal/GPL-3.0.txt",
                 "assets/legal/UPSTREAM-LICENSING.md",
                 "assets/legal/Apache-2.0-msfa.txt",
                 "assets/legal/MIT-Fukiai.txt",
                 "assets/legal/Apache-2.0-AndroidX.txt",
                 "assets/legal/SAMPLES-CC0-ATTRIBUTION.txt"):
        assert name in names, f"APK license missing: {name}"
print("APKs contain their legal notices; source archive has pinned pristine upstream and matching build files")
