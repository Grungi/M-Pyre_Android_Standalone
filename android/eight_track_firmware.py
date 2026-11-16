#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Android/WebAssembly-only expansion of pinned FM-1 to 7 synths + 1 drum.

Never patch the physical FM-1 source checkout. Fails closed if any expected
v1.0.3 source anchor changes. Four-track project imports are remapped, with
the legacy drum track moved from slot 3 to slot 7.
"""
from pathlib import Path

def patch_eight_tracks(source: Path):
    def change(path, old, new, count=1):
        p = source / "firmware/src" / path
        s = p.read_text(encoding="utf-8")
        if s.count(old) != count:
            raise RuntimeError(f"8-track source drift: {path}: {old[:95]!r}: {s.count(old)} vs {count}")
        p.write_text(s.replace(old, new, count), encoding="utf-8")

    change("core.h",
           "#define NPART 3                  /* synth parts: tracks 1..3 */\n#define NTRK 4                   /* + the drum track */\n#define TRK_DRUM 3",
           "#define NPART 7                  /* Android WASM: 7 independent synth parts */\n#define NTRK 8                   /* plus drum track 8 */\n#define TRK_DRUM 7")
    change("ui.c",
           "static const uint8_t TRK_DEF[NPART][2] = {{4, 10}, {4, 12}, {4, 16}};",
           "static const uint8_t TRK_DEF[NPART][2] = {{4, 10}, {4, 12}, {4, 16}, {4, 10}, {4, 12}, {4, 16}, {4, 10}};")
    change("seq.c",
           "int32_t c = i < NPART ? song.g[G_CH1 + i] : song.g[G_DRCH];",
           "int32_t c = i < 3u ? song.g[G_CH1 + i] : i < NPART ? (int32_t)i + 1 : song.g[G_DRCH];")
    change("seq.c",
           "if (ch + 1u == (uint32_t)song.g[G_CH1 + i])",
           "if (ch == trk_midi_ch(i))")

    # Firmware project format on physical FM-1 occupies a 3,840-byte flash
    # slot. Android has no flash limit: enlarge only its host-compiled format.
    # Historical formats must remain exactly FOUR tracks for import.
    change("project.c", "#define PROJ_MAGIC 0x3159504Du",
           "#define PROJ_MAGIC_ANDROID8 0x3859504Du /* MPY8 */\n#define PROJ_MAGIC 0x3159504Du")
    change("project.c", "proj_trk_v5_t t[NTRK];", "proj_trk_v5_t t[4];")
    change("project.c", "proj_trk_v4_t t[NTRK];", "proj_trk_v4_t t[4];")
    change("project.c", "proj_trk_v3_t t[NTRK];", "proj_trk_v3_t t[4];")
    change("project.c", "proj_trk_v2_t t[NTRK];", "proj_trk_v2_t t[4];")
    change("project.c",
           '_Static_assert(sizeof(project_t) <= 3840u, "format 6 fits one flash object (storage.c ST_PAYLOAD_MAX)");',
           '#ifndef MPYRE_ANDROID_8TRK\n_Static_assert(sizeof(project_t) <= 3840u, "format 6 fits one flash object (storage.c ST_PAYLOAD_MAX)");\n#endif')

    old_anchor = "/* ---- old formats -> format 5 */"
    converter = r"""
/* The released MPY1 v1.0.3 (4-track) project bytes remain importable.
 * Format 7 is Android-only, with the same parameter and step encoding but
 * eight real tracks. Its checksum covers all eight.
 */
typedef struct {
    uint32_t magic, size;
    int16_t g[PROJ_NG];
    uint8_t sel, drdly, rsv[2];
    proj_trk_t t[4];
    uint32_t sum;
} project_legacy4_t;
_Static_assert(sizeof(project_legacy4_t) == 3832u,
               "released M-PYRE four-track project layout must remain readable");

UI_SMALL static void legacy4_expand(project_t *q)
{
    uint32_t i, k;
    /* The first three instruments are unchanged. Move the old fourth
     * (drums) to eighth without reinterpreting its 16-lane step union. */
    q->t[TRK_DRUM] = q->t[3];
    for (i = 3u; i < NPART; i++) {
        proj_trk_t *d = &q->t[i];
        memset(d, 0, sizeof *d);
        for (k = 0; k < P_COUNT; k++) {
            const uint32_t e = trk_def_engine(i);
            const param_desc_t *pd = k >= P_E0 ?
                &ENGINES[e]->edit[k - P_E0] : &TP[k];
            pt_set(d, k, pd->def);
        }
        d->engine = (uint8_t)trk_def_engine(i);
        d->preset = 0xFFu; /* load sound from TRK_DEF in emu_apply */
        for (k = 0; k < NSTEP; k++) d->step[k].time = ST_REST;
        for (k = 0; k < NLOCK; k++) d->lock[k].step = LOCK_FREE;
    }
    if (q->sel == 3u) q->sel = TRK_DRUM;
    q->magic = PROJ_MAGIC_ANDROID8;
    q->size = sizeof *q;
    q->sum = proj_sum(q);
}
UI_SMALL static int proj_from_legacy4(project_t *q, const void *raw, int n)
{
    const project_legacy4_t *old = (const project_legacy4_t *)raw;
    if (n != (int)sizeof *old || old->magic != 0x3159504Du ||
        old->size != sizeof *old ||
        old->sum != proj_hash(old, sizeof *old - 4u)) return 0;
    memset(q, 0, sizeof *q);
    memcpy(q->g, old->g, sizeof q->g);
    q->sel = old->sel; q->drdly = old->drdly;
    memcpy(q->rsv, old->rsv, sizeof q->rsv);
    memcpy(q->t, old->t, sizeof old->t);
    legacy4_expand(q);
    return 1;
}
"""
    # proj_trk_plain/pt_set appear later in this file, so put these
    # definitions after proj_trk_plain and before legacy converters.
    converter = converter.replace("UI_SMALL static void legacy4_expand(project_t *q)",
                                  "UI_SMALL static void legacy4_expand(project_t *q)")
    change("project.c",
        "/* a track of format 3 -> today's (by id up to P_SLDEPTH; P_E0.. moved) */",
        converter + "\n/* a track of format 3 -> today's (by id up to P_SLDEPTH; P_E0.. moved) */")
    # The new format is distinguished by magic, not just its larger size.
    change("project.c",
        "return q->magic == PROJ_MAGIC && q->size == sizeof *q && q->sum == proj_sum(q);",
        "return q->magic == PROJ_MAGIC_ANDROID8 && q->size == sizeof *q && q->sum == proj_sum(q);")
    change("project.c",
        "p->magic = PROJ_MAGIC;\n    p->size = sizeof *p;",
        "p->magic = PROJ_MAGIC_ANDROID8;\n    p->size = sizeof *p;")
    # Legacy format import paths should only read their 4 historic entries.
    change("project.c", "for (i = 0; i < NTRK; i++) {\n        uint32_t k;\n        proj_trk_plain(&q->t[i]);",
           "for (i = 0; i < 4u; i++) {\n        uint32_t k;\n        proj_trk_plain(&q->t[i]);")
    change("project.c", "for (i = 0; i < NTRK; i++) {\n        const proj_trk_v5_t *s = &v5->t[i];",
           "for (i = 0; i < 4u; i++) {\n        const proj_trk_v5_t *s = &v5->t[i];")
    change("project.c", "for (i = 0; i < NTRK; i++)\n        proj_trk_from_v3(&q->t[i], &v3->t[i], i == TRK_DRUM);",
           "for (i = 0; i < 4u; i++)\n        proj_trk_from_v3(&q->t[i], &v3->t[i], i == 3u);")
    change("project.c", "for (i = 0; i < NTRK; i++)\n        proj_trk_v2_to_v3(&v3->t[i], &v2->t[i], i == TRK_DRUM);",
           "for (i = 0; i < 4u; i++)\n        proj_trk_v2_to_v3(&v3->t[i], &v2->t[i], i == 3u);")
    # Update legacy conversion checksums after moving drums to slot 7.
    for marker in (
        "/* a format 5 project (n bytes in *v5)",
        "/* a format 3 project -> slot q as format 6 */"
    ):
        # Each preceding path is immediately after its own q->sum.
        p = source / "firmware/src/project.c"
        s = p.read_text(encoding="utf-8")
        at = s.index(marker)
        previous = s.rfind("    q->sum = proj_sum(q);", 0, at)
        if previous < 0 or at - previous > 200:  # converters end near marker
            raise RuntimeError(f"legacy format patch anchor drift: {marker}")
        s = s[:previous] + s[previous:].replace(
            "    q->sum = proj_sum(q);", "    legacy4_expand(q);", 1)
        p.write_text(s, encoding="utf-8")
    # v3 converter void path; v2 reuses it. v1 sets its other defaults after.
    change("project.c",
        "    for (i = 0; i < 4u; i++)\n        proj_trk_from_v3(&q->t[i], &v3->t[i], i == 3u);\n    q->sum = proj_sum(q);",
        "    for (i = 0; i < 4u; i++)\n        proj_trk_from_v3(&q->t[i], &v3->t[i], i == 3u);\n    legacy4_expand(q);")
    change("project.c",
        "    q->sum = proj_sum(q);\n    return 1;\n}\n\n/* n bytes of a stored project",
        "    q->sum = proj_sum(q);\n    return 1;\n}\n\n/* n bytes of a stored project")
    change("project.c",
        "return proj_from_v5(q, (const project_v5_t *)b, n) ||",
        "return proj_from_legacy4(q, b, n) || proj_from_v5(q, (const project_v5_t *)b, n) ||")
    # Format V1 legacy fills others, then recompute after creating expanded project.
    # Project V2 -> V3 uses the normal mapped path.
    change("project.c",
        '    q->sum = proj_sum(q);\n    return 1;\n}\n\n/* n bytes of a stored project (any format)',
        '    q->magic = PROJ_MAGIC_ANDROID8;\n    q->size = sizeof *q;\n    q->sum = proj_sum(q);\n    return 1;\n}\n\n/* n bytes of a stored project (any format)')
    # M-PYRE has room for 4 slots (A-D). NTRK is never the number of slots.

    # The 240x240 TRACKS display uses eight 18-pixel rows, with the same
    # 56-pixel footer. The original voice, audio and sequencer rendering
    # remain untouched.
    p = source / "firmware/src/ui_studio.c"
    text = p.read_text(encoding="utf-8")
    start = text.index("UI_SMALL static void studio_tracks_draw(void)")
    end = text.index("/* ---------------------------------------------------------------- DRUMS --- */", start)
    text = text[:start] + r"""UI_SMALL static void studio_tracks_draw(void)
{
    static uint32_t head, rows[NTRK], footer;
    uint32_t i, j;
    int32_t sect = song.playing && live_sec >= 0 ? live_sec : (int32_t)song.g[G_SLOT] - 1;
    te_header("8 tracks", C_WHITE, &head, sect);
    for (i = 0; i < NTRK; i++) {
        const track_t *t = &trk[i];
        uint32_t selected = song.sel == i, muted = trk_silent(t);
        uint32_t len = (uint32_t)clamp(t->p[P_SLEN], 1, NSTEP);
        uint32_t h = 1u + i * 31u + selected * 97u + muted * 211u;
        uint16_t color = TE_COL[i & 3u];
        char name[18], number[3] = {(char)('1' + i), 0, 0};
        if (i == TRK_DRUM) str_cpy(name, "DRUMS", sizeof name);
        else trk_short_name(i, name);
        name[13] = 0;
        h = studio_hash(h + t->p[P_LEVEL] * 17u + t->p[P_SLEN], name);
        for (j = 0; j < len; j++) h = h * 31u + (uint32_t)trk_step_on(t, j);
        if (!ui.force && h == rows[i]) continue;
        rows[i] = h;
        cv_begin(240, 18, C_BLACK);
        cv_rect(1, 1, 23, 16, selected ? color : TE_DIM[i & 3u]);
        cv_text(7, 0, &FONT_S, number, C_BLACK);
        cv_text(29, 0, &FONT_S, name, selected ? C_WHITE : TE_G3);
        if ((song.rec >> i) & 1u) cv_text(194, 0, &FONT_S, "rec", TE_RED);
        else if ((song.solo >> i) & 1u) cv_text(194, 0, &FONT_S, "solo", C_WHITE);
        else if (muted) cv_text(194, 0, &FONT_S, "mute", TE_G3);
        for (j = 0; j < 16u; j++) {
            uint32_t k, on = 0, a = j * len / 16u, z = (j + 1u) * len / 16u;
            for (k = a; k < z; k++) if (trk_step_on(t, k)) { on = 1u; break; }
            cv_rect(34 + (int32_t)j * 9, 14, 7, 3,
                    on ? (selected ? color : TE_G3) : TE_G1);
        }
        cv_blit(0, 40 + i * 18u);
    }
    {
        static char v[4][8];
        static const char *const lab[4] = {"swing", "level", "steps", "pan"};
        const char *val[4] = {v[0], v[1], v[2], v[3]};
        int32_t ratio[4];
        const track_t *t = TSEL;
        uint32_t lvl = song.sel == TRK_DRUM ? song.g[G_DRLVL] : t->p[P_LEVEL];
        swing_str(v[0], song.g[G_SWING]);
        fmt_int(v[1], t->p[P_MUTE] ? 0 : (int32_t)lvl * 100 / 127);
        fmt_int(v[2], t->p[P_SLEN]); fmt_int(v[3], t->p[P_PAN]);
        ratio[0] = song.g[G_SWING] * 10;
        ratio[1] = t->p[P_MUTE] ? 0 : (int32_t)lvl * 1000 / 127;
        ratio[2] = (t->p[P_SLEN] - 1) * 1000 / 63;
        ratio[3] = (t->p[P_PAN] + 64) * 1000 / 127;
        te_dials(184, lab, val, ratio, song.sel, &footer);
    }
}

""" + text[end:]
    # REC screen has only a 76 pixel-high space: display the selected bank
    # of four of the eight tracks in that region.
    old = "    for (i = 0; i < NTRK; i++) {\n        const track_t *t = &trk[i];\n        uint32_t len = (uint32_t)clamp(t->p[P_SLEN], 1, 64), armed = i == rt;"
    new = "    for (i = (rt / 4u) * 4u; i < (rt / 4u + 1u) * 4u; i++) {\n        const track_t *t = &trk[i];\n        uint32_t len = (uint32_t)clamp(t->p[P_SLEN], 1, 64), armed = i == rt;"
    if text.count(old) != 1:
        raise RuntimeError("REC 8-track paging drift")
    text = text.replace(old, new)
    old = "int32_t y = (int32_t)i * 19;"
    if text.count(old) != 1: raise RuntimeError("REC row position drift")
    text = text.replace(old, "int32_t y = (int32_t)(i % 4u) * 19;")
    text = text.replace("armed ? TE_COL[i] : TE_DIM[i]", "armed ? TE_COL[i & 3u] : TE_DIM[i & 3u]")
    p.write_text(text, encoding="utf-8")

    # Build the host-only flag before core/project.c; never touch board code.
    host = source / "firmware/host/emu.c"
    text = host.read_text(encoding="utf-8")
    anchor = '#include "../src/core.h"'
    if text.count(anchor) != 1: raise RuntimeError("host emulator source drift")
    host.write_text(text.replace(anchor, "#define MPYRE_ANDROID_8TRK 1\n" + anchor), encoding="utf-8")
