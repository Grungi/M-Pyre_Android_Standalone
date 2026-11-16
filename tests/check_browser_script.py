#!/usr/bin/env python3
"""Syntax-check the bundled browser UI JavaScript in GitHub Actions."""
import re
import subprocess
import tempfile
from pathlib import Path

html = Path("app/src/main/assets/index.html").read_text(encoding="utf-8")
scripts = re.findall(r"<script(?:\\s[^>]*)?>(.*?)</script>", html, flags=re.S | re.I)
if len(scripts) != 1:
    raise SystemExit(f"Expected one inline emulator script, found {len(scripts)}")
with tempfile.TemporaryDirectory() as directory:
    f = Path(directory) / "emulator.js"
    f.write_text(scripts[0], encoding="utf-8")
    subprocess.run(["node", "--check", str(f)], check=True)
print("Browser UI JavaScript syntax valid")
