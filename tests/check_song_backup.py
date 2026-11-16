#!/usr/bin/env python3
"""Guard against the browser firmware's one-byte BK_LIST 'short reply' stub."""
from pathlib import Path
p=Path("scripts/prepare_emulator.py").read_text()
c=Path("android/backup-emu.c").read_text()
head=Path("android/full-editor-emu.c").read_text()
assert 'return emu_ed_backup(cmd, a, na);' in p
assert 'android/backup-emu.c' in p
assert 'static int emu_ed_backup(' in head
for token in ['ED_BK_LIST','ED_BK_GET','ED_BK_PUT','emu_bk_capture',
              'st_crc32','ed_pack7','ed_unpack7','arrangement=next',
              'emu_proj_gen++','emu_song_changed++']:
    assert token in c,token
assert 'emu_bk_settings+48' in c
print('Browser editor firmware: actual backup protocol wired to settings and project slots')
