/* Full official M-PYRE editor protocol over the existing WASM AudioWorklet.
 * The official editor's SysEx requests are dispatched to firmware/src/editor.c,
 * NOT to a mock, and replies return over the same worklet.
 * SPDX-License-Identifier: GPL-3.0-only
 */
/* The sample slots already live in RAM in the upstream emulator. The
 * physical editor's USB flash commands can therefore write those samples
 * directly without accessing any real Android flash hardware. */
static int flash_ok = 1;
static uint32_t ed_flash_busy(void) { return song.playing || transport_req; }
static void fl_inval(uint32_t off, uint32_t n) { (void)off; (void)n; }
static int fl_erase4k_quiet(uint32_t off, uint32_t *took)
{
    uint32_t k;
    if (took) *took = 0;
    for (k = 0; k < SMP_USER_SLOTS; k++) {
        uint32_t base = SMP_USER_OFF(k);
        if (off >= base && off - base <= SMP_USER_SIZE - 4096u) {
            memset(user_flash[k] + off - base, 0xFF, 4096u);
            return 0;
        }
    }
    return -1;
}
static int fl_write(uint32_t off, const void *data, uint32_t n)
{
    uint32_t k, i;
    const uint8_t *b = (const uint8_t *)data;
    for (k = 0; k < SMP_USER_SLOTS; k++) {
        uint32_t base = SMP_USER_OFF(k), rel;
        if (off < base || off - base > SMP_USER_SIZE) continue;
        rel = off - base;
        if (n > SMP_USER_SIZE - rel) return -1;
        for (i = 0; i < n; i++) user_flash[k][rel+i] &= b[i];
        return 0;
    }
    return -1;
}
static uint32_t ota_now_ms(void) { return fm1_ms; }
static void ota_idle(void) {}
#define EMU_EDITOR_WIRE_CAP 8192u
static uint8_t emu_editor_wire[EMU_EDITOR_WIRE_CAP];
static uint32_t emu_editor_wire_len;

/* Capture complete MIDI SysEx response frames. Packet sizes are little endian
 * uint16_t; each payload contains full F0...F7 bytes. No USB endpoint needed. */
static int emu_editor_wire_send(const uint8_t *p, uint32_t n)
{
    uint32_t k = emu_editor_wire_len;
    if (!n || n > 600u || k + 2u + n > EMU_EDITOR_WIRE_CAP)
        return -1;
    emu_editor_wire[k++] = (uint8_t)n;
    emu_editor_wire[k++] = (uint8_t)(n >> 8);
    memcpy(emu_editor_wire + k, p, n);
    emu_editor_wire_len = k + n;
    return 0;
}
/* Prototype used by firmware/src/editor.c's no-flash host branch. */
static int emu_ed_backup(uint32_t cmd, const uint8_t *a, uint32_t na);
#define ota_wire_send emu_editor_wire_send
#include "../src/editor.c"
#undef ota_wire_send

/* Every request is an intact SysEx F0 7D 46 4C <cmd> ... F7 in transfer.
 * Requests longer than the firmware's original 640-byte frame are rejected. */
uint32_t emu_editor_send(uint32_t n)
{
    uint8_t saved;
    const uint8_t *f = transfer;
    emu_editor_wire_len = 0;
    if (n < 6u || n > 640u || f[0] != 0xF0 || f[1] != 0x7D ||
        f[2] != 0x46 || f[3] != 0x4C || f[n - 1u] != 0xF7)
        return 0;
    saved = usb.config;
    usb.config = 1;
    ed_w.last_ms = fm1_ms;
    ed_handle(f + 1, n - 2);
    usb.config = saved;
    return emu_editor_wire_len;
}

/* The original firmware emits live WATCH pushes as the FM-1 is played.
 * Use a separate poll so the normal 16-ms UI/audio control path is unchanged. */
uint32_t emu_editor_poll(void)
{
    uint8_t saved = usb.config;
    emu_editor_wire_len = 0;
    usb.config = 1;
    ed_sync();
    usb.config = saved;
    return emu_editor_wire_len;
}

/* Copy packed response frames to the existing shared transfer buffer. */
uint32_t emu_editor_pull(void)
{
    uint32_t n = emu_editor_wire_len;
    if (n && n <= sizeof transfer)
        memcpy(transfer, emu_editor_wire, n);
    emu_editor_wire_len = 0;
    return n;
}

/* Plain MIDI NOTE events from the editor's LIVE keyboard. Send them into the
 * firmware's own MIDI input ring, like USB-MIDI packets on the physical FM-1. */
uint32_t emu_editor_midi(uint32_t status, uint32_t data1, uint32_t data2)
{
    uint32_t cin = (status >> 4) & 15u, pkt;
    if (status > 255u || data1 > 127u || data2 > 127u || cin < 8u || cin > 14u)
        return 0;
    pkt = cin | status << 8 | data1 << 16 | data2 << 24;
    midi_in_event(pkt);
    return 1;
}

/* Persist edited RAM user sample slots, user preset banks, and synthesised drum kits
 * through browser localStorage. One transfer buffer is reused; all calls occur
 * in the AudioWorklet, which owns this single-threaded firmware. */
uint32_t emu_extra_get(uint32_t kind, uint32_t idx)
{
    if (kind == 0u && idx < SMP_USER_SLOTS) {
        memcpy(transfer, user_flash[idx], SMP_USER_SIZE);
        return SMP_USER_SIZE;
    }
    if (kind == 1u && idx < UP_SLOTS / UP_PER_BANK) {
        memcpy(transfer, &emu_up_banks[idx], sizeof emu_up_banks[0]);
        return sizeof emu_up_banks[0];
    }
    if (kind == 2u && idx == 0u) {
        memcpy(transfer, &dsu, sizeof dsu);
        return sizeof dsu;
    }
    return 0u;
}
uint32_t emu_extra_put(uint32_t kind, uint32_t idx, uint32_t n)
{
    if (kind == 0u && idx < SMP_USER_SLOTS && n == SMP_USER_SIZE) {
        memcpy(user_flash[idx], transfer, n);
        smp_user_scan(idx);
        return 1u;
    }
    if (kind == 1u && idx < UP_SLOTS / UP_PER_BANK &&
        n == sizeof emu_up_banks[0] && up_bank_ok((const up_bank_t *)transfer, (int)n)) {
        memcpy(&emu_up_banks[idx], transfer, n);
        up_bank_find(idx);
        return 1u;
    }
    if (kind == 2u && idx == 0u && n == sizeof dsu &&
        dsu_valid((const dsu_bank_t *)transfer)) {
        memcpy(&dsu, transfer, n);
        return 1u;
    }
    return 0u;
}
