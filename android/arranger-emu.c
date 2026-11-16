/* Restore native M-PYRE LIVE sections, quick chains and SONG arranger.
 * The pinned browser emulator shipped placeholders for these functions:
 * arrangement_ready()=0, arrangement_apply() no-op, section_bars()=1.
 * Reuse the firmware's real arranger_scene.c with its project storage
 * redirected to the browser's existing four emu_proj RAM slots.
 * SPDX-License-Identifier: GPL-3.0-only.
 */
#define proj_slot emu_proj
#include "../src/arranger_scene.c"
#undef proj_slot

/* The browser persists song order separately from .mpyre project slots. */
static void arrangement_save(void)
{
    emu_song_changed++;
    ui.force = 1;
}

/* SAVE+section stores a complete snapshot while stopped OR playing.
 * The normal browser project generation counter causes persistent storage. */
static void section_store(uint32_t scene)
{
    scene &= 3u;
    fm1_irq_off();
    proj_capture(&emu_proj[scene]);
    live_sec = (int8_t)scene;
    fm1_irq_on();
    emu_proj_gen++;
    ui.force = 1;
}

/* SAVE+section while stopped replaces the current working loop. */
static void section_load(uint32_t scene)
{
    scene &= 3u;
    if (!proj_ok(&emu_proj[scene])) return;
    emu_apply(&emu_proj[scene]);
    live_sec = (int8_t)scene;
}

/* A song is NOT an individual .mpyre section. Persist 36 bytes of arrangement
 * settings plus one byte of the SONG/LOOP mode in the browser's own storage. */
uint32_t emu_song_order_get(void)
{
    memcpy(transfer, &arrangement, sizeof arrangement);
    transfer[sizeof arrangement] = arrangement_enabled ? 1u : 0u;
    return sizeof arrangement + 1u;
}

uint32_t emu_song_order_put(uint32_t n)
{
    arr_config_t incoming;
    if (n != sizeof arrangement + 1u || song.playing || transport_req) return 0u;
    memcpy(&incoming, transfer, sizeof incoming);
    /* The setting can be loaded before all four stored sections have arrived,
     * so use a full availability mask for structural validation. Playback
     * independently checks the real ready mask through arrangement_ready(). */
    if (!arr_valid(&incoming, 15u)) return 0u;
    arrangement = incoming;
    arrangement_enabled = transfer[sizeof arrangement] ? 1u : 0u;
    emu_song_changed++;
    ui.force = 1;
    return 1u;
}

/* Touch-friendly quick-chain action. Payload: 1..8 scene IDs (0..3).
 * A list containing one scene makes a live jump; 2+ loops those scenes.
 * Can start transport directly when stopped, without a fragile second tap. */
uint32_t emu_chain_set(uint32_t count)
{
    uint32_t i, ready = arrangement_ready();
    if (count == 0u) {
        chain_n = 0u;
        chain_i = 0u;
        live_req = -1;
        ui.force = 1;
        return 1u;
    }
    if (count > CHAIN_MAX || arrangement_clock.running) return 0u;
    for (i = 0; i < count; i++)
        if (transfer[i] >= ARR_SCENES || !(ready & (1u << transfer[i])))
            return 0u;
    arrangement_enabled = 0u;        /* Quick chain belongs to LOOP mode. */
    emu_song_changed++;
    for (i = 0; i < count; i++)
        chain_sec[i] = transfer[i];
    chain_i = 0u;
    chain_n = count < 2u ? 0u : (uint8_t)count;
    chain_bars = (uint8_t)section_bars(transfer[0]);
    live_req = (int8_t)transfer[0]; /* First scene on the next bar. */
    if (!song.playing) transport_req = 1u;
    ui.force = 1;
    return 1u;
}

/* For the Android touch UI: available stored scenes, playback and chain state.
 * The recorded scene IDs are included so a user can see the actual chain. */
uint32_t emu_chain_get(void)
{
    uint32_t i;
    transfer[0] = (uint8_t)arrangement_ready();
    transfer[1] = song.playing ? 1u : 0u;
    transfer[2] = (uint8_t)(live_sec + 1);
    transfer[3] = chain_n;
    transfer[4] = chain_i;
    transfer[5] = arrangement_enabled;
    transfer[6] = arrangement_clock.running;
    transfer[7] = arrangement_clock.index;
    for (i=0; i<CHAIN_MAX; i++) transfer[8+i]=chain_sec[i];
    return 8u + CHAIN_MAX;
}

/* Exact native section-length formula, exposed for regression tests. */
uint32_t emu_section_bars(uint32_t scene)
{
    return scene < ARR_SCENES && proj_ok(&emu_proj[scene]) ? section_bars(scene) : 0u;
}
