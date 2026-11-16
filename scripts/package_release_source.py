#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Build a complete, exact-version source bundle for the paired APK/WebEditor.

No network fetch is used. Both the Android checkout and upstream M-PYRE
checkout have already been obtained by the same CI job that compiled the APK.
The original *unpatched* upstream sources are included, together with the
downstream patching scripts; a full git diff of the CI-patched upstream is
included for audit. External audio assets and generated legal notices travel
with the source instead of relying on a temporary download.
"""
from __future__ import annotations
import hashlib
import io
import os
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / ".generated/m-pyre"
OUT = ROOT / "build/release/M-PYRE-v18-corresponding-source.tar.gz"
PREFIX = "M-PYRE-v18-corresponding-source"


def git(*args: str, cwd: Path = ROOT) -> bytes:
    return subprocess.check_output(["git", *args], cwd=cwd)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def add_data(out: tarfile.TarFile, name: str, data: bytes) -> None:
    meta = tarfile.TarInfo(name)
    meta.mode = 0o644
    meta.size = len(data)
    out.addfile(meta, io.BytesIO(data))


def add_file(out: tarfile.TarFile, source: Path, name: str) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    out.add(source, arcname=name, recursive=False)


def main() -> None:
    if not (UPSTREAM / "tools/build_emu.py").is_file():
        raise RuntimeError("Run scripts/prepare_emulator.py before packaging")
    apk = ROOT / "app/build/outputs/apk/debug/app-debug.apk"
    pc = ROOT / "app/src/main/assets/pc-usb-editor.html"
    sound = UPSTREAM / "build/mpyre/soundpack.bin"
    for f in (apk, pc, sound, ROOT / "app/src/main/assets/index.html"):
        if not f.is_file():
            raise FileNotFoundError(f)
    commit = git("rev-parse", "HEAD").decode().strip()
    up_commit = git("rev-parse", "HEAD", cwd=UPSTREAM).decode().strip()
    version_info = f"""M-PYRE Android v18 – complete corresponding source
Android git commit: {commit}
Original upstream M-PYRE commit: {up_commit}
APK SHA-256: {sha256(apk)}
PC WebEditor SHA-256: {sha256(pc)}
Original M-PYRE CC BY soundpack SHA-256: {sha256(sound)}

Release these source bytes alongside the APK/PC WebEditor from this same CI run.
The archive includes the Android build scripts and the pinned pristine M-PYRE
v1.0.3 sources. The upstream changes are made by scripts/prepare_emulator.py
and android/eight_track_firmware.py, with their resulting git diff also present.

To regenerate after extraction (with Python, LLVM, Android SDK/Gradle installed):
  cd android-app
  export MPYRE_SOURCE="$(pwd)/../upstream-m-pyre-v1.0.3"
  python -m pip install -r requirements.txt
  python scripts/prepare_emulator.py
  gradle :app:assembleDebug

The original soundpack and processed CC0 drum mapping are supplied in the
upstream checkout's build/mpyre/ directory so this preparation can run
offline. Read LICENSING.md and RELEASING.md before redistribution.
"""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(OUT, "w:gz") as out:
        add_data(out, PREFIX + "/SOURCE-INFO.txt", version_info.encode())
        # Exact downstream source files, including all build and test scripts.
        tracked = git("ls-files", "-z").split(b"\0")
        paths = set()
        for raw in tracked:
            if not raw:
                continue
            rel = os.fsdecode(raw)
            paths.add(rel)
            add_file(out, ROOT / rel, PREFIX + "/android-app/" + rel)
        # Generated offline assets are part of this release and aid inspection.
        generated = ROOT / "app/src/main/assets"
        for path in sorted(generated.rglob("*")):
            if not path.is_file():
                continue
            rel = str(path.relative_to(ROOT))
            if rel not in paths:
                add_file(out, path, PREFIX + "/android-app/" + rel)
        # Pristine pinned upstream tracked source, including original audio
        # asset sources, preserved from HEAD even though CI patches the working
        # tree for the v18 WASM build.
        data = git("archive", "--format=tar", "HEAD", cwd=UPSTREAM)
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as pristine:
            for member in pristine:
                if not member.isfile():
                    continue
                stream = pristine.extractfile(member)
                if stream is None:
                    raise RuntimeError("Unreadable upstream archive member: " + member.name)
                add_data(out, PREFIX + "/upstream-m-pyre-v1.0.3/" + member.name,
                         stream.read())
        # External licensed soundpack and processed CC0 percussion samples
        # used during compilation, not generally tracked in upstream git.
        add_file(out, sound, PREFIX + "/upstream-m-pyre-v1.0.3/build/mpyre/soundpack.bin")
        drums = UPSTREAM / "build/mpyre/sets.json"
        add_file(out, drums, PREFIX + "/upstream-m-pyre-v1.0.3/build/mpyre/sets.json")
        diff = git("diff", "--binary", "HEAD", cwd=UPSTREAM)
        add_data(out, PREFIX + "/UPSTREAM-PATCH.diff", diff)
    print(f"Version-matched source archive: {OUT} ({OUT.stat().st_size} bytes)")
    print(version_info)


if __name__ == "__main__":
    main()
