/* M-PYRE Android Studio bridge: same firmware instance as live riffbox.
 * Added to firmware/host/emu.c at build time. SPDX-License-Identifier: GPL-3.0-only.
 * Never mirror the sequencer in JavaScript: snapshots and edits are in the WASM audio thread.
 */
uint32_t emu_studio_snapshot(void)
{
    uint32_t t;
    uint8_t *p = transfer;
    *p++ = 2u;                        /* 8-track binary protocol version */
    *p++ = song.sel;
    *p++ = song.playing;
    *p++ = 0u;
    *p++ = (uint8_t)song.g[G_BPM];
    *p++ = (uint8_t)((uint32_t)song.g[G_BPM] >> 8);
    *p++ = NTRK;                      /* eight real firmware tracks */
    *p++ = 64u;                       /* maximum pattern steps */
    for (t = 0; t < NTRK; t++) {
        track_t *tr = &trk[t];
        *p++ = t == TRK_DRUM ? 255u : tr->eng_req;
        *p++ = tr->preset;
        *p++ = (uint8_t)clamp(tr->p[P_SLEN], 1, NSTEP);
        *p++ = tr->p[P_MUTE] ? 1u : 0u;
        *p++ = (uint8_t)clamp(tr->p[P_LEVEL], 0, 127);
        *p++ = (uint8_t)clamp(tr->p[P_PAN], 0, 127);
        *p++ = 0u;
        *p++ = 0u;
        memcpy(p, tr->step, NSTEP * sizeof(step_t)); /* drum union also 10 bytes/step */
        p += NSTEP * sizeof(step_t);
    }
    return (uint32_t)(p - transfer);
}

/* SET: 0 pattern length, 1 BPM, 2 selected track, 3 mute,
 *      4 level, 5 transport request (start/stop). */
uint32_t emu_studio_set(uint32_t track, uint32_t id, int32_t value)
{
    track_t *t;
    if (track >= NTRK) return 0u;
    t = &trk[track];
    switch (id) {
    case 0: t->p[P_SLEN] = (int16_t)clamp(value, 1, NSTEP); break;
    case 1: song.g[G_BPM] = (int16_t)clamp(value, 40, 240); break;
    case 2: song.sel = (uint8_t)track; break;
    case 3: t->p[P_MUTE] = value ? 1 : 0; break;
    case 4: t->p[P_LEVEL] = (int16_t)clamp(value, 0, 127); break;
    case 5: transport_req = value ? 1u : 2u; break;
    default: return 0u;
    }
    ui.force = 1;
    return 1u;
}

/* NOTE STEP: 0 clear, 1 add/toggle note, 2 tie, 3 accent, 4 slide, 5 velocity.
 * Original note IDs are absolute MIDI notes, the exact sequencer representation.
 */
uint32_t emu_studio_step(uint32_t track, uint32_t idx, uint32_t action, uint32_t value)
{
    step_t *s;
    uint32_t i, k;
    if (track >= NPART || idx >= NSTEP) return 0u;
    s = &trk[track].step[idx];
    switch (action) {
    case 0:
        memset(s, 0, sizeof(*s));
        s->time = ST_REST;
        break;
    case 1:
        if (value > 127u) return 0u;
        for (i = 0; i < s->n && s->time == ST_NOTE && s->note[i] != value; i++) {}
        if (s->time == ST_NOTE && i < s->n) {
            for (k = i; k + 1u < s->n; k++) s->note[k] = s->note[k + 1u];
            s->n--;
            if (!s->n) { memset(s, 0, sizeof(*s)); s->time = ST_REST; }
            else { s->lvl = 0u; s->rat = 0u; }
        } else {
            if (s->time != ST_NOTE || !s->n) { memset(s, 0, sizeof(*s)); s->time = ST_NOTE; s->vel = 100u; }
            if (s->n >= 4u) return 0u;
            s->note[s->n++] = (uint8_t)value;
            if (!s->vel) s->vel = 100u;
        }
        break;
    case 2:
        memset(s, 0, sizeof(*s));
        s->time = ST_TIE;
        break;
    case 3: s->flags ^= SF_ACCENT; break;
    case 4: s->flags ^= SF_SLIDE; break;
    case 5: s->vel = (uint8_t)clamp((int32_t)value, 1, 127); break;
    default: return 0u;
    }
    ui.force = 1;
    return 1u;
}

/* Drum step: 0 toggle selected lane, 1 set hard/normal (only on active lanes). */
uint32_t emu_studio_drum(uint32_t idx, uint32_t lane, uint32_t action)
{
    dstep_t *s;
    if (idx >= NSTEP || lane >= DRUM_LANES) return 0u;
    s = &trk[TRK_DRUM].dstep[idx];
    if (action == 0u) {
        if (dstep_has(s, lane)) dstep_clr(s, lane);
        else dstep_set(s, lane, LV_NORM, 0u);
    } else if (action == 1u) {
        if (!dstep_has(s, lane)) return 0u;
        dstep_set(s, lane, dstep_lvl(s, lane) == LV_HARD ? LV_NORM : LV_HARD, 0u);
    } else return 0u;
    ui.force = 1;
    return 1u;
}

/* The emulator owns four in-memory project slots; save signals the Web page
 * to persist them in localStorage through the existing project message path. */
uint32_t emu_studio_slot(uint32_t op, uint32_t slot)
{
    if (slot >= 4u || song.playing) return 0u;
    if (op == 1u) {
        proj_capture(&emu_proj[slot]);
        emu_proj_gen++;
    } else if (op == 0u) {
        if (!proj_ok(&emu_proj[slot])) return 0u;
        emu_apply(&emu_proj[slot]);
    } else return 0u;
    ui.force = 1;
    return 1u;
}
