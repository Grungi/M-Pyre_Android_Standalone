#!/usr/bin/env python3
"""Syntax-check the bundled browser UI JavaScript in GitHub Actions."""
import re
import subprocess
import tempfile
from pathlib import Path

html = Path("app/src/main/assets/index.html").read_text(encoding="utf-8")
# Regression: an accidentally double-escaped newline used to print a visible
# backslash-n below the performance keyboard in both Android editions.
diag_end = "Live-Modus (geringe Latenz)</div></div>"
assert diag_end + "\\n" not in html, "Visible literal \\n leaked below the keyboard"
assert diag_end + "\n" in html, "Expected a real newline after audio diagnostics"
scripts = re.findall(r"<script(?:\\s[^>]*)?>(.*?)</script>", html, flags=re.S | re.I)
if len(scripts) != 1:
    raise SystemExit(f"Expected one inline emulator script, found {len(scripts)}")
with tempfile.TemporaryDirectory() as directory:
    f = Path(directory) / "emulator.js"
    f.write_text(scripts[0], encoding="utf-8")
    subprocess.run(["node", "--check", str(f)], check=True)
print("Browser UI JavaScript syntax valid")
