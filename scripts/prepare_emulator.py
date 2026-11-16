#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Build official M-PYRE v1.0.3 WASM with the published guitar soundpack.
Original drum recordings and cabinet IRs are not public: use CC0/generic replacements.
"""
from __future__ import annotations
import base64, hashlib, html as html_escape, json, math, os, re, shutil, subprocess, sys, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".generated/m-pyre"
OUT = ROOT / "app/src/main/assets/index.html"
TAG = "v1.0.3"
COMMIT = "f50926b251c49a67df882cc8d33d1044005cf9d8"
PACK_SHA = "a5ce2cdc28601891dfeec3c5d58387f24ee3ee4e19901a55c429bb891f2dbd34"
PACK_LEN = 4 * 0x14000
GENERATORS = [
    ("gen_font.py", "felucca_font.h"),
    ("gen_icons.py", "felucca_icons.h"),
    ("gen_tables.py", "felucca_tables.h"),
    ("gen_samples.py", "felucca_samples.h"),
    ("gen_drumkits.py", "felucca_drumkits.h"),
    ("gen_fm6_patches.py", "felucca_fm6.h"),
    ("gen_mpyre_splash.py", "sloop_logo.h"),
    ("gen_mpyre_amp.py", "mpyre_amp.h"),
    ("gen_mpyre_amplogo.py", "mpyre_amplogo.h")
]
def run(*args, cwd=None):
    print("+", " ".join(str(a) for a in args), flush=True)
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)

def checkout():
    override = os.environ.get("MPYRE_SOURCE")
    if override:
        source = Path(override).resolve()
        if not (source / "tools/build_emu.py").exists():
            raise RuntimeError("Invalid MPYRE_SOURCE")
        return source
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    if not (SOURCE / ".git").exists():
        run("git", "clone", "--depth=1", "--branch", TAG,
            "https://github.com/HistoryOfSky/m-pyre.git", SOURCE)
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=SOURCE, text=True).strip()
    if commit != COMMIT:
        raise RuntimeError(f"Unexpected upstream commit {commit}, expected {COMMIT}")
    return SOURCE

def original_soundpack(source):
    target = source / "build/mpyre/soundpack.bin"
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != PACK_SHA:
        url = "https://github.com/HistoryOfSky/m-pyre/releases/download/v1.0.3/soundpack.bin"
        req = urllib.request.Request(url, headers={"User-Agent": "MPyre-Android-Build/1"})
        with urllib.request.urlopen(req, timeout=90) as response:
            data = response.read(PACK_LEN + 1)
        if len(data) != PACK_LEN or hashlib.sha256(data).hexdigest() != PACK_SHA:
            raise RuntimeError("Unverified soundpack - build refused")
        target.write_bytes(data)
    print("Original guitar/bass/palm-mute soundpack SHA256:", PACK_SHA)

def fallback_drums(source):
    """Create 16 GM drum lanes from CC0 assets (not the official HEAVY KIT)."""
    dest = source / "build/mpyre/sets.json"
    if dest.exists():
        return
    import numpy as np
    from scipy.signal import resample_poly
    sys.path.insert(0, str(source / "tools"))
    from sampleio import read_any_wav
    directory = source / "assets/samples-cc0/KIT"
    mapping = [
        (36,"10_kick",.65),(38,"11_snare",.65),(40,"11_snare",.26),
        (42,"14_hihat",.48),(46,"15_ohat",.50),(44,"14_hihat",.25),
        (51,"19_ride",.40),(53,"19_ride",.40),
        (48,"17_tomhi",.62),(47,"17_tomhi",.55),(43,"16_tomlo",.60),
        (49,"18_crash",.42),(57,"18_crash",.42),(52,"18_crash",.42),
        (84,"18_crash",.42),(83,None,.52)
    ]
    cache, zones = {}, []
    for midi, key, gain in mapping:
        if key:
            if key not in cache:
                matches = sorted(directory.glob(key + "*.wav"))
                if not matches:
                    raise RuntimeError("Missing public CC0 sample: " + key)
                sr, pcm = read_any_wav(matches[0])
                x = np.asarray(pcm, dtype=np.float64)
                if sr != 22050:
                    divisor = math.gcd(sr, 22050)
                    x = resample_poly(x, 22050//divisor, sr//divisor)
                cache[key] = x
            samples = cache[key].copy()
        else:
            t = np.arange(17640, dtype=np.float64) / 22050
            phase = 2*np.pi*np.cumsum(36+78*np.exp(-t*5))/22050
            samples = np.sin(phase) * np.exp(-t*6)
        samples = np.clip(samples[:33075], -1, 1)
        if midi == 84:
            samples = samples[::-1].copy()
        if len(samples) < 16:
            raise RuntimeError("Invalid drum sample")
        tail = min(len(samples)//4, 4000)
        if tail:
            samples[-tail:] *= np.linspace(1, 0, tail)
        peak = max(float(np.max(np.abs(samples))), 1e-8)
        pcm = np.clip(np.rint(samples / peak * gain * 32767), -32768, 32767).astype("<i2")
        zones.append(dict(name=f"CC0 GM {midi}", root=midi, lo=midi, hi=midi,
                          loop=None, deemph=False, pcm=base64.b64encode(pcm.tobytes()).decode("ascii")))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps({"PERC": zones}))
    print("Prepared CC0 fallback drums (not original M-PYRE HEAVY KIT)")

def patch_studio_firmware(source):
    """Add both the native Song Studio and real official-editor SysEx protocol."""
    target = source / "firmware/host/emu.c"
    original = target.read_text(encoding="utf-8")
    usb_include = '#include "../src/usb.c"'
    if original.count(usb_include) != 1:
        raise RuntimeError("Upstream USB/MIDI bridge changed")
    original = original.replace(usb_include,
        '#define FELUCCA_OTA 1\n' + usb_include, 1)
    # Restore upstream song/chain entrypoints, without the original host's
    # "always empty" placeholders. Their implementations are appended after
    # the emulator's memory/project storage and the full SysEx bridge.
    stubs = ('static void arrangement_save(void) {}\n'
             'static uint32_t arrangement_ready(void) { return 0; }\n'
             'static void arrangement_apply(uint32_t s) { (void)s; }\n'
             'static uint32_t section_bars(uint32_t s) { (void)s; return 1u; }\n'
             'static void song_backup(void) {}\n'
             'static void song_restore(void) {}\n'
             'static void section_store(uint32_t s) { live_sec = (int8_t)s; }\n'
             'static void section_load(uint32_t s) { live_sec = (int8_t)s; }')
    prototypes = ('static void arrangement_save(void);\n'
                  'static void section_store(uint32_t s);\n'
                  'static void section_load(uint32_t s);')
    if original.count(stubs) != 1:
        raise RuntimeError("Upstream arrangement/section host stubs changed")
    original = original.replace(stubs, prototypes, 1)
    # Avoid using uninitialized all-zero song order on a fresh emulator.
    init_anchor = '    panel = PANEL_DEFAULT;'
    if original.count(init_anchor) != 1:
        raise RuntimeError("Upstream emulator initialisation changed")
    original = original.replace(init_anchor,
        '    arr_defaults(&arrangement);\n'
        '    arrangement_enabled = 0;\n'
        '    arrangement_clock.running = 0;\n'
        + init_anchor, 1)
    # Scene erasure must also evict references from the saved song order.
    erased = ('static void project_erase(uint32_t i) { '
              'memset(&emu_proj[i & 3u], 0, sizeof emu_proj[0]); '
              'emu_proj_gen++; }')
    erase_new = ('''static void project_erase(uint32_t i)
{
    uint32_t scene = i & 3u;
    if (song.playing || transport_req) return;
    memset(&emu_proj[scene], 0, sizeof emu_proj[0]);
    if (live_sec == (int8_t)scene) live_sec = -1;
    if (arr_drop_scene(&arrangement, scene)) emu_song_changed++;
    emu_proj_gen++;
}''')
    if original.count(erased) != 1:
        raise RuntimeError("Upstream browser project erase changed")
    original = original.replace(erased, erase_new, 1)
    original = original.replace('static volatile uint32_t emu_proj_gen;',
        'static uint32_t emu_song_changed;\nstatic volatile uint32_t emu_proj_gen;', 1)

    # The upstream browser emulator had no user-preset persistence. Replace
    # the deliberate 'not in emulator' functions with the real preset code,
    # backed by an in-memory bank rather than inaccessible FM-1 NOR flash.
    stubs_start = "static int up_used(uint32_t k)"
    stubs_end = "static void settings_save(void) {}"
    if stubs_start not in original or stubs_end not in original:
        raise RuntimeError("Host user-preset stubs changed")
    a = original.index(stubs_start)
    b = original.index(stubs_end)
    if a >= b:
        raise RuntimeError("Unexpected host preset organization")
    original = original[:a] + '#include "../src/upreset.c"\n' + original[b:]

    up_file = source / "firmware/src/upreset.c"
    up = up_file.read_text(encoding="utf-8")
    old_bank = 'static const up_bank_t *up_bank_xip[UP_SLOTS / UP_PER_BANK];'
    if up.count(old_bank) != 1:
        raise RuntimeError("Upstream preset bank storage changed")
    up = up.replace(old_bank, old_bank +
        '\nstatic up_bank_t emu_up_banks[UP_SLOTS / UP_PER_BANK];', 1)
    up = up.replace('static void *up_stage(void);',
        'static up_bank_t emu_up_stage;\n'
        'static void *up_stage(void) { return &emu_up_stage; }', 1)
    find_anchor = '#if FELUCCA_FLASH\n    p = flash_ok ? st_xip(OBJ_UPRESET0 + b, &len) : 0;\n#endif'
    if up.count(find_anchor) != 1:
        raise RuntimeError("Preset bank find strategy changed")
    up = up.replace(find_anchor, find_anchor.replace('#endif',
        '#else\n    p = &emu_up_banks[b % NELEM(emu_up_banks)];\n'
        '    len = sizeof(emu_up_banks[0]);\n#endif'), 1)
    store_anchor = '#endif\n    up_bank_find(b);\n    return rc;'
    if up.count(store_anchor) != 1:
        raise RuntimeError("Preset bank store strategy changed")
    up = up.replace(store_anchor,
        '#else\n    emu_up_banks[b] = *bk;\n    rc = 0;\n#endif\n'
        '    up_bank_find(b);\n    return rc;', 1)
    up_file.write_text(up, encoding="utf-8")
    # Browser builds have no NOR flash. The original firmware's no-flash
    # ED_BK_LIST fallback returns only one byte, breaking the PC Song page.
    # Connect its existing BK_LIST/GET/PUT SysEx commands to the host's
    # project slots and native 36-byte song order instead.
    editor_file = source / "firmware/src/editor.c"
    editor_source = editor_file.read_text(encoding="utf-8")
    no_flash = '''#else
UI_SMALL static int ed_backup(uint32_t cmd, const uint8_t *a, uint32_t na)   /* no flash: nothing to back up */
{
    (void)a;
    (void)na;
    if (cmd < ED_BK_LIST || cmd > ED_BK_PUT)
        return 0;
    ed_b(4);
    return 1;
}
#endif'''
    host_backup = '''#else
UI_SMALL static int ed_backup(uint32_t cmd, const uint8_t *a, uint32_t na)
{
    if (cmd < ED_BK_LIST || cmd > ED_BK_PUT)
        return 0;
    return emu_ed_backup(cmd, a, na);
}
#endif'''
    if editor_source.count(no_flash) != 1:
        raise RuntimeError("Pinned firmware's no-flash editor backup stub has changed")
    editor_file.write_text(editor_source.replace(no_flash, host_backup, 1),
                           encoding="utf-8")
    bridge = ((ROOT / "android/studio-emu.c").read_text(encoding="utf-8")
             + "\n" + (ROOT / "android/full-editor-emu.c").read_text(encoding="utf-8")
             + "\n" + (ROOT / "android/arranger-emu.c").read_text(encoding="utf-8")
             + "\n" + (ROOT / "android/backup-emu.c").read_text(encoding="utf-8")
             + "\n" + (ROOT / "android/lcd-touch-emu.c").read_text(encoding="utf-8"))
    target.write_text(original + "\n" + bridge, encoding="utf-8")

    build = source / "tools/build_emu.py"
    script = build.read_text(encoding="utf-8")
    old = '"proj_changed"]'
    new = ('"proj_changed", "studio_snapshot", "studio_set", "studio_step", '
           '"studio_drum", "studio_slot", "editor_send", "editor_poll", '
           '"editor_pull", "editor_midi", "extra_get", "extra_put", '
           '"song_order_get", "song_order_put", "chain_set", "chain_get", "section_bars", "lcd_touch", "home_drum_touch"]')
    if script.count(old) != 1:
        raise RuntimeError("Upstream WebAssembly exports changed")
    build.write_text(script.replace(old, new, 1), encoding="utf-8")


def patch_html(html):
    wasm = re.search(r'const WASM_B64 = "([A-Za-z0-9+/=]+)";', html)
    pack = re.search(r'const PACK_B64 = "([A-Za-z0-9+/=]+)";', html)
    if not wasm or not pack:
        raise RuntimeError("Embedded WASM or soundpack missing")
    if len(base64.b64decode(wasm.group(1))) < 10000:
        raise RuntimeError("Suspicious WASM")
    if len(base64.b64decode(pack.group(1))) != PACK_LEN:
        raise RuntimeError("Bad embedded soundpack")
    # Preserve the firmware's 44.1-kHz DSP clock, but request Android's
    # low-latency audio path and its preferred output sample rate. Forcing a
    # 44.1-kHz AudioContext on 48-kHz Android hardware may add resampling.
    legacy_audio = '''    try { ctx = new AC({ sampleRate: 44100, latencyHint: "playback" }); }
    catch (err) { ctx = new AC({ latencyHint: "playback" }); }        // (the worklet resamples from 44.1 kHz)'''
    live_audio = '''    try { ctx = new AC({ latencyHint: "interactive" }); }
    catch (err) { ctx = new AC(); }  // browser default is interactive; use device output rate'''
    if html.count(legacy_audio) != 1:
        raise RuntimeError("Unexpected upstream AudioContext implementation")
    html = html.replace(legacy_audio, live_audio)
    # WebAudio metrics are NOT full touch-to-speaker latency. They help
    # distinguish output buffering from the firmware's 16-ms input scan.
    metrics_marker = '    node.connect(ctx.destination);'
    if html.count(metrics_marker) != 1:
        raise RuntimeError("Unexpected output graph")
    html = html.replace(metrics_marker, metrics_marker + '''
    const diag = document.getElementById("audio-diagnostics");
    if (diag) {
      const ms = v => Number.isFinite(v) ? Math.round(v * 1000) + " ms" : "n/v";
      diag.textContent = "Live Audio · " + ctx.sampleRate + " Hz" +
        " · Basis-Latenz: " + ms(ctx.baseLatency) +
        " · Ausgabe: " + ms(ctx.outputLatency) +
        " (WebAudio-Werte, nicht die gesamte Spielverzögerung)";
    }''')
    if 'latencyHint: "playback"' in html:
        raise RuntimeError("Low-latency audio patch did not remove playback hint")

    needle = "document.body.appendChild(a); a.click(); a.remove();"
    if html.count(needle) != 1:
        raise RuntimeError("Upstream export code changed")
    html = html.replace(needle,
        'if (window.MPyreAndroid) window.MPyreAndroid.exportProject(toB64(proj)); '
        'else { document.body.appendChild(a); a.click(); a.remove(); }')
    html = html.replace('songMsg("Exportiert: m-pyre-song.mpyre");',
                        'songMsg(window.MPyreAndroid ? "Android-Speicherdialog geöffnet" : "Exported: m-pyre-song.mpyre");')
    html, count = re.subn(r'<p class="note links">.*?</p>',
        '<p class="note links">Standalone Android-Riffbox · Kein FM-1 erforderlich · Original Gitarren-Soundpack</p>',
        html, count=1, flags=re.S)
    if count != 1:
        # The published v1.0.3 page has no promotional links paragraph.
        marker = '<div class="fm1" id="fm1">'
        if html.count(marker) != 1:
            raise RuntimeError("Could not find emulator panel")
        html = html.replace(marker,
            '<p class="note links">Standalone Android-Riffbox · Kein FM-1 erforderlich · '
            'Original Gitarren-Soundpack</p>\n' + marker, 1)
    html, count = re.subn(r'<p class="note">iPhone:.*?</p>',
        '<p class="note">M-PYRE von History Of Sky · GPLv3 / Gitarrensamples CC BY 4.0 · '
        'Ersatz-Drums CC0, generische Cabinet-Filter</p>',
        html, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError("Upstream note changed")
    # Connect the Song Studio to the *same* WASM AudioWorklet, not to a
    # second mock instrument or an external USB/MIDI device.
    input_old = '    } else if (m.t === "projGet") this.sendProj(m.i, true);'
    input_new = '''    } else if (m.t === "projGet") this.sendProj(m.i, true);
    else if (m.t === "lcdTouch") E.emu_lcd_touch(m.kind | 0, m.x | 0, m.y | 0, m.steps | 0);
    else if (m.t === "homeDrumTouch") {
      const done = E.emu_home_drum_touch(m.x | 0, m.y | 0);
      if (!done && m.fallback) E.emu_lcd_touch(0, m.x | 0, m.y | 0, 0);
    }
    else if (m.t === "studioGet") this.sendStudio();
    else if (m.t === "studioSet") this.sendStudio(E.emu_studio_set(m.track, m.code, m.value));
    else if (m.t === "studioStep") this.sendStudio(E.emu_studio_step(m.track, m.step, m.action, m.value));
    else if (m.t === "studioDrum") this.sendStudio(E.emu_studio_drum(m.step, m.lane, m.action));
    else if (m.t === "studioSlot") {
      const ok = E.emu_studio_slot(m.action, m.slot);
      if (ok && m.action === 1) this.sendProj(m.slot, false);
      this.sendStudio(ok);
    }
    else if (m.t === "extraPut") {
      if (m.bytes && m.bytes.length && m.bytes.length <= 0x14000) {
        new Uint8Array(E.memory.buffer, E.emu_buffer(), m.bytes.length).set(m.bytes);
        E.emu_extra_put(m.kind, m.index, m.bytes.length);
      }
    }
    else if (m.t === "usbConnected") {
      this.usbActive = !!m.connected;
      if (!this.usbActive) this.officialReplyUsb = false;
    }
    else if (m.t === "officialEditorMidi") {
      this.officialReplyUsb = !!m.usb;
      const bytes = m.bytes;
      if (!bytes || !bytes.length || bytes.length > 640) return;
      this.officialEditorActive = true;
      if (bytes[0] === 0xF0) {
        new Uint8Array(E.memory.buffer, E.emu_buffer(), bytes.length).set(bytes);
        E.emu_editor_send(bytes.length);
        this.sendOfficialReplies();
        // Persist a user sample when its header is committed, a user preset
        // after a bank modification, or a synth drum kit after live editing.
        const cmd = bytes[4], slot = bytes[5] || 0;
        if (cmd === 13 || cmd === 14) this.sendExtra(0, slot);
        if (cmd === 18 || cmd === 19 || cmd === 21) this.sendExtra(1, slot >>> 4);
        if (cmd === 74 || cmd === 75) this.sendExtra(2, 0);
      } else if (bytes.length >= 2) {
        E.emu_editor_midi(bytes[0], bytes[1], bytes.length > 2 ? bytes[2] : 0);
      }
    }'''
    if html.count(input_old) != 1:
        raise RuntimeError("Upstream project handler changed")
    html = html.replace(input_old, input_new, 1)
    official_method = '''  sendExtra(kind, index) {
    const E = this.E, n = E.emu_extra_get(kind, index);
    if (!n) return;
    const bytes = new Uint8Array(E.memory.buffer, E.emu_buffer(), n).slice();
    this.port.postMessage({ extra:bytes, kind, index }, [bytes.buffer]);
  }
  sendOfficialReplies() {
    const E = this.E, n = E.emu_editor_pull();
    if (!n || n > 8192) return;
    const bytes = new Uint8Array(E.memory.buffer, E.emu_buffer(), n);
    let at = 0;
    while (at + 2 <= n) {
      const length = bytes[at] | bytes[at + 1] << 8;
      at += 2;
      if (!length || at + length > n) break;
      this.port.postMessage({
        officialMidi: Array.from(bytes.subarray(at, at + length)),
        usb: !!this.officialReplyUsb
      });
      at += length;
    }
  }
'''
    method = '  sendProj(i, ask) {'
    studio_method = '''  sendStudio(ok) {
    const E = this.E, len = E.emu_studio_snapshot();
    const bytes = new Uint8Array(E.memory.buffer, E.emu_buffer(), len).slice();
    this.port.postMessage({ studio: bytes, studioOK: ok === undefined ? null : ok }, [bytes.buffer]);
  }
'''
    if html.count(method) != 1:
        raise RuntimeError("Upstream project serializer changed")
    html = html.replace(method, official_method + studio_method + method, 1)
    dispatch = '      else if ("loaded" in data) songMsg(data.loaded ? "Geladen." : "Keine M-PYRE-Song-Datei.");'
    if html.count(dispatch) != 1:
        raise RuntimeError("Upstream worklet message handler changed")
    html = html.replace(dispatch, dispatch +
        '\n      else if ("studio" in data) window.MPyreStudio?.receive(data.studio, data.studioOK);', 1)
    # The official editor's WATCH subscriptions send parameter/step changes
    # while the physical-style panel remains active.
    tick_old = '    if (++this.frames % 300 === 0) this.keep();'
    tick_new = '''    if (++this.frames % 300 === 0) this.keep();
    if (this.officialEditorActive && this.frames % 3 === 0) {
      E.emu_editor_poll();
      this.sendOfficialReplies();
    }'''
    if html.count(tick_old) != 1:
        raise RuntimeError("Worklet frame loop changed")
    html = html.replace(tick_old, tick_new, 1)
    official_out = '      else if ("studio" in data) window.MPyreStudio?.receive(data.studio, data.studioOK);'
    if html.count(official_out) != 1:
        raise RuntimeError("Worklet response dispatcher changed")
    html = html.replace(official_out, official_out +
        '\n      else if ("officialMidi" in data) {' +
        ' if (data.usb) window.MPyreUsbMidi?.fromFirmware(data.officialMidi);' +
        ' else window.MPyreFullEditor?.receive(data.officialMidi); }' +
        '\n      else if ("extra" in data) saveFullEditorExtra(data);', 1)
    # Persist the official editor's user samples and sound banks to the same
    # per-app localStorage as the .mpyre projects. The original packed
    # guitar/bass soundpack remains the immutable default until edited.
    helper = '''function saveFullEditorExtra({ extra, kind, index }) {
  const key = "full-" + kind + "-" + index;
  if (extra?.length) lsSet(key, toB64(extra));
}
function restoreFullEditorExtras() {
  for (let kind = 0; kind < 3; kind++) {
    const n = kind === 0 ? 4 : kind === 1 ? 2 : 1;
    for (let index = 0; index < n; index++) {
      const saved = lsGet("full-" + kind + "-" + index);
      if (saved) {
        try { send({ t:"extraPut", kind, index, bytes:b64(saved) }); }
        catch (err) { console.warn("Invalid saved M-PYRE bank",kind,index,err); }
      }
    }
  }
}
'''
    msg_old = '      else if (data.ready) restoreSongs();'
    msg_new = '      else if (data.ready) { restoreSongs(); restoreFullEditorExtras(); }'
    if html.count(msg_old) != 1:
        raise RuntimeError("Upstream project restore lifecycle changed")
    html = html.replace(msg_old, msg_new, 1)
    entry = '/* ---- power */'
    if html.count(entry) != 1:
        raise RuntimeError("Upstream power section changed")
    html = html.replace(entry, helper + entry, 1)
    # Native 4-section arranger and quick-chain UI control messages.
    chain_input = '''    else if (m.t === "songOrderPut") {
      if (m.bytes && m.bytes.length === 37) {
        new Uint8Array(E.memory.buffer,E.emu_buffer(),37).set(m.bytes);
        E.emu_song_order_put(37);
      }
    }
    else if (m.t === "chainSet") {
      if (!m.bytes || m.bytes.length > 8) return;
      if (m.bytes.length) new Uint8Array(E.memory.buffer,E.emu_buffer(),m.bytes.length).set(m.bytes);
      if (!E.emu_chain_set(m.bytes.length)) this.port.postMessage({chainError:true});
      this.sendChain();
    }
    else if (m.t === "chainGet") this.sendChain();'''
    input_hook='    else if (m.t === "officialEditorMidi") {'
    if html.count(input_hook) != 1: raise RuntimeError("MIDI bridge changed")
    html=html.replace(input_hook,chain_input+'\n'+input_hook,1)
    chain_methods = '''  sendSongOrder() {
    const E=this.E,n=E.emu_song_order_get();
    const b=new Uint8Array(E.memory.buffer,E.emu_buffer(),n).slice();
    this.port.postMessage({songOrder:b},[b.buffer]);
  }
  sendChain() {
    const E=this.E,n=E.emu_chain_get();
    const b=new Uint8Array(E.memory.buffer,E.emu_buffer(),n).slice();
    this.port.postMessage({chainState:b},[b.buffer]);
  }
'''
    if html.count(method) != 1: raise RuntimeError("Method anchor changed")
    html=html.replace(method,chain_methods+method,1)
    keep_hook='    this.sendProj(4, false);'
    if html.count(keep_hook) != 1: raise RuntimeError("Autosave changed")
    html=html.replace(keep_hook,keep_hook+'\n    this.sendSongOrder();',1)
    dispatch='      else if ("extra" in data) saveFullEditorExtra(data);'
    if html.count(dispatch) != 1: raise RuntimeError("Worklet messages changed")
    html=html.replace(dispatch,dispatch+
        '\n      else if ("songOrder" in data) gotSongOrder(data.songOrder);'+
        '\n      else if ("chainState" in data) window.MPyrePatternChain?.receive(data.chainState);'+
        '\n      else if (data.chainError) window.MPyrePatternChain?.failed();',1)
    order_helpers = '''function gotSongOrder(b) {
  if (b && b.length === 37) lsSet("song-order",toB64(b));
}
function restoreSongOrder() {
  const old=lsGet("song-order");
  if (old) {
    try { const b=b64(old); if(b.length===37)send({t:"songOrderPut",bytes:b}); }
    catch(e) { console.warn("Bad song arrangement",e); }
  }
}
'''
    restore='  document.getElementById("exp").disabled = document.getElementById("imp").disabled = false;'
    if html.count(restore) != 1: raise RuntimeError("Song restore changed")
    html=html.replace(restore,'  restoreSongOrder();\n'+restore,1)
    hook='/* ---- power */'
    if html.count(hook) != 1: raise RuntimeError("Power marker changed")
    html=html.replace(hook,order_helpers+hook,1)
    # Replace the tiny two-row desktop knobs with seven touch-friendly
    # horizontal gestures + discrete step buttons. The FM-1 control IDs and
    # the firmware's audio/rendering routines stay unchanged.
    knob_start = '/* ---- knobs */'
    knob_end = '/* ---- buttons */'
    if html.count(knob_start) != 1 or html.count(knob_end) != 1:
        raise RuntimeError("Upstream knob implementation changed")
    knob_a, knob_b = html.index(knob_start), html.index(knob_end)
    if knob_a >= knob_b:
        raise RuntimeError("Unexpected knob placement")
    html = html[:knob_a] + (ROOT / "android/knobs.js").read_text(encoding="utf-8") + "\n" + html[knob_b:]
    # Replace the fixed-width 27-note desktop keyboard with a wide, touch-optimized
    # full 27-note performance viewport with optional ten-white-key zoom.
    key_start = '/* ---- the keyboard: 27 keys, F3 (key 0) .. G5 */'
    key_end = '/* ---- the computer keyboard */'
    if html.count(key_start) != 1 or html.count(key_end) != 1:
        raise RuntimeError("Upstream keyboard changed: refuse unsafe patch")
    a, b = html.index(key_start), html.index(key_end)
    if a >= b:
        raise RuntimeError("Unexpected keyboard position")
    html = html[:a] + (ROOT / "android/keyboard.js").read_text(encoding="utf-8") + "\n" + html[b:]
    key_markup = '<div class="keys" id="keys"></div>'
    if html.count(key_markup) != 1:
        raise RuntimeError("Could not find keyboard anchor")
    html = html.replace(key_markup,
        '<div id="android-keybar">'
        '<button type="button" id="key-prev" aria-label="Tiefere Tasten" hidden>◀ TIEF</button>'
        '<span id="key-range" aria-live="polite">F3 – G5 · 27 Tasten</span>'
        '<button type="button" id="key-next" aria-label="Höhere Tasten" hidden>HOCH ▶</button>'
        '<button type="button" id="key-zoom" aria-pressed="false">ZOOM</button>'
        '<button type="button" id="android-menu-btn" aria-expanded="false">☰ Optionen</button>'
        '</div>\n' + key_markup, 1)
    css = """
<style id="android-layout">
  html,body { background:#0b0908; overscroll-behavior:none; }
  .page { padding-block:8px; gap:8px; }
  .fm1 { padding:10px; border-radius:13px; }
  .top { gap:12px; }
  .screen { width:min(240px,55vh); }
  .controls { gap:6px; }
  .row { gap:6px; }
  .knob { width:60px; touch-action:none; }
  .btn { height:42px; min-width:54px; }
  .keys { height:118px; margin-top:12px; }
  .key.w { height:118px; }
  .key.b { height:74px; }
  .foot { gap:8px; }
  @media (max-width:760px) and (orientation:landscape) {
    .top { grid-template-columns:auto minmax(0,1fr); justify-items:stretch; }
    .screen { width:min(200px,55vh); }
    .knob { width:48px; }
    .knob .dial { width:38px; height:38px; }
    .knob.big .dial { width:42px; height:42px; }
    .btn { padding:0 4px; min-width:46px; }
  }
</style>
"""
    html = html.replace("</style>", "</style>" + css + (ROOT / "android/performance.css").read_text(encoding="utf-8") + (ROOT / "android/lcd-touch.css").read_text(encoding="utf-8") + (ROOT / "android/studio.css").read_text(encoding="utf-8") + (ROOT / "android/chain.css").read_text(encoding="utf-8"), 1)
    html = html.replace("</style>",
        "</style>" + (ROOT / "android/full-editor-shell.css").read_text(encoding="utf-8")
        + (ROOT / "android/usb-midi.css").read_text(encoding="utf-8"), 1)

    diag_marker = '<div class="foot"><div id="kb2"></div></div>'
    if html.count(diag_marker) != 1:
        raise RuntimeError("Could not place audio diagnostics")
    html = html.replace(diag_marker,
        '<div class="foot"><div id="audio-diagnostics" aria-live="polite">Audio: '
        'Live-Modus (geringe Latenz)</div></div>\\n' + diag_marker, 1)
    # Insert Studio after the existing browser script, preserving the firmware
    # boot sequence, localStorage project logic, and low-latency audio path.
    if html.count("</script>") != 1:
        raise RuntimeError("Unexpected number of embedded emulator scripts")
    html = html.replace("</script>",
        (ROOT / "android/studio.js").read_text(encoding="utf-8") + "\n" +
        (ROOT / "android/chain.js").read_text(encoding="utf-8") + "\n" +
        (ROOT / "android/full-editor-shell.js").read_text(encoding="utf-8") + "\n" +
        (ROOT / "android/usb-midi.js").read_text(encoding="utf-8") + "\n" +
        (ROOT / "android/lcd-touch.js").read_text(encoding="utf-8") +
        "\n</script>", 1)
    html = html.replace('<main class="page">','</head><body>\n<main class="page">',1)
    return ('''<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<!-- M-PYRE v1.0.3, History Of Sky, GPL-3.0-only; samples CC BY 4.0 -->
''' + html + "\n</body></html>\n")

def prepare_official_editor(source):
    """Bundle the complete upstream M-PYRE editor offline, with Android touch UI
    and a virtual Web MIDI device connected to our real WASM firmware."""
    src = source / "docs/webapp/editor/m-pyre-editor.html"
    if not src.is_file():
        raise RuntimeError("Pinned upstream full web editor is missing")
    page = src.read_text(encoding="utf-8")
    # PC companion: the pinned, unchanged M-PYRE editing UI with only the
    # device-name candidate regex expanded to include the stock Android USB
    # peripheral gadget. Its INFO handshake still identifies the real firmware.
    def with_note_grid_and_brush(doc):
        """Add the SAME firmware-backed sequencer brush/pitch grid to both PC and Android editors."""
        def replace_exact(old, new, why):
            nonlocal doc
            if doc.count(old) != 1:
                raise RuntimeError("Original M-PYRE sequencer changed: " + why)
            doc = doc.replace(old, new, 1)
        replace_exact(
            '<button type="button" data-v="roll" data-t="viewRoll"></button>',
            '<button type="button" data-v="roll" data-t="viewRoll"></button>'
            '<button type="button" data-v="notes" aria-label="Chromatic note grid">Note grid</button>',
            "view switching"
        )
        replace_exact(
            '<div class="grid" id="stepgrid"></div>',
            (ROOT / "android/seq-brush-toolbar.html").read_text(encoding="utf-8")
            + '\n        <div class="grid" id="stepgrid"></div>\n'
            + (ROOT / "android/seq-pitch-grid.html").read_text(encoding="utf-8"),
            "step grid and pitch grid"
        )
        replace_exact(
            '  const rollOn = !dg && !isDrum() && RV.view === "roll";   /* (2.5) the piano roll instead of the tiles */\n'
            '  $("roll").hidden = !rollOn;\n'
            '  if (rollOn) $("stepgrid").hidden = true;',
            '  const rollOn = !dg && !isDrum() && RV.view === "roll";\n'
            '  const pitchOn = !dg && !isDrum() && RV.view === "notes";\n'
            '  $("roll").hidden = !rollOn;\n'
            '  $("pitchgrid").hidden = !pitchOn;\n'
            '  if (rollOn || pitchOn) $("stepgrid").hidden = true;',
            "sequencer view selection"
        )
        replace_exact(
            '  if (!$("roll").hidden) renderRoll();\n}',
            '  if (!$("roll").hidden) renderRoll();\n'
            '  if (!$("pitchgrid").hidden) renderPitchGrid();\n'
            '  brushShowRange();\n}',
            "sequencer note grid rerender on STEP_SET"
        )
        replace_exact(
            '  for (const b of $("viewseg").children) b.setAttribute("aria-pressed", b.dataset.v === RV.view ? "true" : "false");\n}',
            '  for (const b of $("viewseg").children) b.setAttribute("aria-pressed", b.dataset.v === RV.view ? "true" : "false");\n'
            '  brushControls();\n}',
            "brush selection and toolbar updates"
        )
        hook = 'const songCount = () => (SG.rows || []).reduce('
        js = ((ROOT / "android/seq-brush-core.js").read_text(encoding="utf-8")
              + '\n' + (ROOT / "android/seq-brush-ui.js").read_text(encoding="utf-8"))
        replace_exact(hook, js + '\n' + hook, "brush source insertion")
        replace_exact('</head>',
                      (ROOT / "android/seq-brush.css").read_text(encoding="utf-8")
                      + '\n</head>', "chromatic pitch grid styling")
        return doc

    def support_eight_tracks(doc):
        """Use all eight reported native tracks in both embedded/companion editors."""
        fixes = [
            ('FM6_NPART = 3;', 'FM6_NPART = 7;'),
            ('const own = lvDrum(i) ? lvGv(g.drCh) : lvGv(g.ch[i]);',
             'const own = lvDrum(i) ? lvGv(g.drCh) : i < 3 ? lvGv(g.ch[i]) : i < 7 ? i + 1 : 0;'),
        ]
        for old, new in fixes:
            if doc.count(old) != 1:
                raise RuntimeError("8-track companion editor source drift: " + old)
            doc = doc.replace(old, new, 1)
        if doc.count('</head>') != 1:
            raise RuntimeError("Companion editor header changed")
        return doc.replace('</head>',
            (ROOT / "android/eight-track-editor.css").read_text(encoding="utf-8")
            + '\n</head>', 1)

    pc = page
    from_pairing = '''const FM1_PORT = /fm-1|m-pyre|felucca|sloop|clipper|ota|composite|sinco|usb-midi/i;
function fm1Ports(access) {
  const live = (p) => p.state !== "disconnected" && FM1_PORT.test(p.name || "");
  const ins = [...access.inputs.values()].filter(live), outs = [...access.outputs.values()].filter(live);
  const rank = (n) => (/m-pyre|felucca|sloop/i.test(n) ? 0 : /fm-1/i.test(n) ? 1 : 2);
  const pairs = [];
  for (const input of ins) {
    const output = outs.find((o) => o.name === input.name) || (outs.length === 1 ? outs[0] : null);
    if (output) pairs.push({ input, output });
  }
  return pairs.sort((a, b) => rank(a.input.name || "") - rank(b.input.name || ""));
}'''
    if pc.count(from_pairing) != 1:
        raise RuntimeError("Original editor MIDI pairing changed")
    pc = pc.replace(from_pairing, (ROOT / "android/pc-midi-pairing.js").read_text(encoding="utf-8"), 1)
    hook = 'const $ = (id) => document.getElementById(id);'
    if pc.count(hook) != 1: raise RuntimeError("Original editor UI setup changed")
    pc = pc.replace(hook,hook + '\n' +
        (ROOT / "android/pc-midi-diagnostics.js").read_text(encoding="utf-8"),1)
    pc = pc.replace('</head>', (ROOT / "android/pc-midi-diagnostics.css").read_text(encoding="utf-8") +
        '\n</head>',1)
    # One-click PLAY SONG and STOP on the PC Song page. The new transport
    # functions share the original editor's rq queue and LIVE + BK_PUT protocol.
    song_actions = '''            <p class="bar" id="pc-song-transport">
              <button type="button" id="pc-song-play" class="pri">▶ PLAY SONG</button>
              <button type="button" id="pc-song-stop">■ STOP</button>
            </p>
            <p id="pc-song-status" role="status" aria-live="polite">Send your arrangement and play it directly in SONG mode.</p>
'''
    song_markup = '            <button type="button" id="songimp" data-t="sfLoad" data-ic="symbol_upload"></button></p>'
    if pc.count(song_markup) != 1:
        raise RuntimeError("Original PC editor Song action layout changed")
    pc=pc.replace(song_markup,song_markup+'\n'+song_actions,1)
    success_mark = '  sayK("songSent");\n}'
    if pc.count(success_mark) != 1:
        raise RuntimeError("Original Song send function changed")
    # sendSong previously returned nothing for both success and errors.
    # The new Play action must never start when BK_PUT refused the save.
    pc=pc.replace(success_mark,'  sayK("songSent");\n  return true;\n}',1)
    song_hook = 'const songCount = () => (SG.rows || []).reduce('
    if pc.count(song_hook) != 1:
        raise RuntimeError("Original Song page controller changed")
    pc=pc.replace(song_hook,
        (ROOT / "android/pc-song-transport.js").read_text(encoding="utf-8")
        + '\n' + song_hook,1)
    pc=pc.replace('</head>',(ROOT / "android/pc-song-transport.css").read_text(encoding="utf-8")
        + '\n</head>',1)

    denied = 'catch (e) { sayK("denied"); return; }'
    if pc.count(denied) != 1: raise RuntimeError("Original editor permission handler changed")
    pc = pc.replace(denied,
        'catch (e) { showMidiPorts("Web MIDI permission denied",e.name+": "+e.message); sayK("denied"); return; }',1)
    no_ports = 'if (!pairs.length) { sayK("nodevice"); return; }'
    if pc.count(no_ports) != 1: raise RuntimeError("Original editor no-device handler changed")
    pc = pc.replace(no_ports,
        'if (!pairs.length) { showMidiPorts("No matching MIDI device"); sayK("nodevice"); return; }\n    showMidiPorts("ready");',1)
    no_reply = 'if (!link) { sayK(pairs.length ? "noreply" : "nodevice"); return; }'
    if pc.count(no_reply) != 1: raise RuntimeError("Original editor no-reply handler changed")
    pc = pc.replace(no_reply,
        'if (!link) { showMidiPorts("MIDI ports found, but no firmware INFO response"); sayK("noreply"); return; }',1)
    pc = support_eight_tracks(with_note_grid_and_brush(pc))
    pc = pc.replace("</body>", offline_legal_panel() + "\n</body>", 1)
    pc_target=ROOT / "app/src/main/assets/pc-usb-editor.html"
    pc_target.parent.mkdir(parents=True,exist_ok=True)
    pc_target.write_text(pc,encoding="utf-8")
    print("Original PC editor, Android USB-MIDI compatible:",pc_target.stat().st_size,"bytes")

    page = support_eight_tracks(with_note_grid_and_brush(page))
    if page.count("</head>") != 1 or page.count("</body>") != 1:
        raise RuntimeError("Unexpected structure of full M-PYRE editor")
    shim = (ROOT / "android/virtual-midi.js").read_text(encoding="utf-8")
    css = (ROOT / "android/official-editor-touch.css").read_text(encoding="utf-8")
    page = page.replace("</head>", '<script id="mpyre-virtual-midi-shim">\n' +
        shim + '\n</script>\n' + css + '\n</head>', 1)
    auto = '''<script>
window.addEventListener("load", () => {
  setTimeout(() => {
    const connect = document.getElementById("connect");
    if (connect && !connect.disabled) connect.click();
  }, 180);
}, { once:true });
</script>'''
    page = page.replace("</body>",auto + "\n</body>", 1)
    page = page.replace("</body>", offline_legal_panel() + "\n</body>", 1)
    target = ROOT / "app/src/main/assets/editor.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(page, encoding="utf-8")
    # The Fukiai font is MIT-licensed, NOT SIL OFL. Retain the original
    # MIT notice if the font is loaded as an external fallback.
    for item in ("fukiai.ttf", "FUKIAI-LICENSE.txt"):
        path = src.parent / item
        if path.is_file():
            shutil.copyfile(path, target.parent / item)
    print("Offline official editor bundled:", target.stat().st_size, "bytes")


def offline_legal_panel():
    """Single-file PC WebEditor must carry its own license and attribution."""
    notices = [
        ("GNU GPL version 3", ROOT / "LICENSE"),
        ("Android licensing & changes", ROOT / "LICENSING.md"),
        ("Third-party credits", ROOT / "THIRD_PARTY_NOTICES.md"),
        ("Upstream licensing & Felucca additional permission", ROOT / "LICENSES/UPSTREAM-LICENSING.md"),
        ("Apache-2.0 / msfa FM6", ROOT / "LICENSES/Apache-2.0-msfa.txt"),
        ("MIT / Fukiai", ROOT / "LICENSES/MIT-Fukiai.txt"),
        ("Apache-2.0 / AndroidX WebKit", ROOT / "LICENSES/Apache-2.0-AndroidX.txt"),
        ("CC BY 4.0", ROOT / "LICENSES/CC-BY-4.0-NOTICE.txt"),
        ("CC0 source provenance", ROOT / "LICENSES/SAMPLES-CC0-ATTRIBUTION.txt"),
    ]
    blocks = []
    for title, path in notices:
        body = html_escape.escape(path.read_text(encoding="utf-8"))
        blocks.append('<details><summary>' + html_escape.escape(title) +
                      '</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;">' +
                      body + '</pre></details>')
    return ("""
<div id="mpyre-legal-offline" style="position:fixed;bottom:6px;right:6px;z-index:100000;
font:12px sans-serif;color:#f0e1d0;max-width:min(92vw,600px)">
<details style="padding:5px 9px;background:#201914;border:1px solid #a57b53;border-radius:7px">
<summary style="cursor:pointer;user-select:none">Licenses &amp; source</summary>
<div style="max-height:65vh;overflow:auto;background:#fff;color:#171717;padding:10px;
font:13px/1.5 sans-serif">
<p>GPL-3.0-only software derived from M-PYRE by History Of Sky.
Soundpack and artwork: CC BY 4.0. The exact corresponding source for a
distributed build must be available to recipients from the distributor,
not merely from a private GitHub repository.
<a href="https://github.com/Grungi/M-Pyre_Android_Standalone">Project source</a>.</p>
""" + "\n".join(blocks) + "</div></details></div>")


def install_legal_assets(source):
    """Bundle complete offline notices alongside the HTML in the APK."""
    target = ROOT / "app/src/main/assets/legal"
    target.mkdir(parents=True, exist_ok=True)
    docs = {
        "GPL-3.0.txt": ROOT / "LICENSE",
        "ANDROID-LICENSING.md": ROOT / "LICENSING.md",
        "THIRD_PARTY_NOTICES.md": ROOT / "THIRD_PARTY_NOTICES.md",
        "RELEASING.md": ROOT / "RELEASING.md",
        "UPSTREAM-LICENSING.md": ROOT / "LICENSES/UPSTREAM-LICENSING.md",
        "ANDROID-LICENSING.txt": ROOT / "LICENSING.md",
        "THIRD_PARTY_NOTICES.txt": ROOT / "THIRD_PARTY_NOTICES.md",
        "UPSTREAM-LICENSING.txt": ROOT / "LICENSES/UPSTREAM-LICENSING.md",
        "Apache-2.0-msfa.txt": ROOT / "LICENSES/Apache-2.0-msfa.txt",
        "MIT-Fukiai.txt": ROOT / "LICENSES/MIT-Fukiai.txt",
        "Apache-2.0-AndroidX.txt": ROOT / "LICENSES/Apache-2.0-AndroidX.txt",
        "CC-BY-4.0-NOTICE.txt": ROOT / "LICENSES/CC-BY-4.0-NOTICE.txt",
        "CC0-1.0-NOTICE.txt": ROOT / "LICENSES/CC0-1.0-NOTICE.txt",
        "SAMPLES-CC0-ATTRIBUTION.txt": ROOT / "LICENSES/SAMPLES-CC0-ATTRIBUTION.txt",
    }
    for name, origin in docs.items():
        if not origin.is_file():
            raise RuntimeError("Missing release license notice: " + str(origin))
        shutil.copyfile(origin, target / name)
    # Preserve precise upstream terms for all OFL-licensed fonts.
    fonts = {
        "BarlowCondensed-OFL.txt": "assets/fonts/BarlowCondensed-OFL.txt",
        "Terminus-LICENSE.txt": "assets/fonts/Terminus-LICENSE.txt",
    }
    for family in ("blackopsone", "damion", "pacifico", "racingsansone", "russoone"):
        fonts["OFL-" + family + ".txt"] = "assets/mpyre/fonts/OFL-" + family + ".txt"
    for name, rel in fonts.items():
        origin = source / rel
        if not origin.is_file():
            raise RuntimeError("Missing upstream font license: " + rel)
        shutil.copyfile(origin, target / name)
    print("Bundled GPL, CC BY, CC0, MIT, Apache, Felucca and OFL notices")


def main():
    for tool in ("git", "clang", "wasm-ld"):
        if not shutil.which(tool):
            raise RuntimeError("Missing build tool: " + tool)
    source = checkout()
    original_soundpack(source)
    fallback_drums(source)
    generated = source / "build/gen"
    generated.mkdir(parents=True, exist_ok=True)
    for tool, output in GENERATORS:
        run(sys.executable, source / "tools" / tool, generated / output, cwd=source)
    # Eight independent native tracks in WASM, with migrated four-track projects.
    sys.path.insert(0, str(ROOT / "android"))
    from eight_track_firmware import patch_eight_tracks
    patch_eight_tracks(source)
    patch_studio_firmware(source)
    run(sys.executable, source / "tools/build_emu.py", cwd=source)
    html = patch_html((source/"build/emu/m-pyre-emulator.html").read_text())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    prepare_official_editor(source)
    install_legal_assets(source)
    print(f"Embedded firmware prepared: {OUT.stat().st_size} bytes")

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("BUILD FAILED:", error, file=sys.stderr)
        sys.exit(1)
