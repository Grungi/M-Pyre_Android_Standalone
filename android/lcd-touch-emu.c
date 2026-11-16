/* LCD interaction for the Android-only emulation. Runs on the AudioWorklet
 * thread, together with emu_ui(): no separate instrument, transport or state.
 * All coordinates are original 240x240 LCD pixels, independent of CSS zoom.
 * SPDX-License-Identifier: GPL-3.0-only.
 */
enum { LCD_TAP = 0, LCD_TURN = 1, LCD_HOLD = 2, LCD_PAINT = 3 };
static void lcd_touch_knob(uint32_t col, uint32_t kind, uint32_t x, int32_t n)
{
    if (col >= 4u) return;
    if (kind == LCD_TURN)
        emu_knob(EN_K1 + col, clamp(n, -12, 12));
    else if (kind == LCD_TAP)
        emu_knob(EN_K1 + col, (x % 60u) < 30u ? -1 : 1);
}
/* A single tap/drag dispatch. Refuse dangerous hardware calibration / MIDI
 * learn clearing: a phone has no FM-1 switch matrix to calibrate. */
uint32_t emu_lcd_touch(uint32_t kind, uint32_t x, uint32_t y, int32_t steps)
{
    uint32_t col, i;
    if (x >= 240u || y >= 240u || kind > LCD_PAINT) return 0u;
    col = x / 60u;
    if (kind == LCD_TURN && !steps) return 0u;

    if (ui.menu) {
        if (kind == LCD_TAP && y < 21u) {
            if (ui.menu == 2u) { ui.menu = 1u; ui.force = 1u; }
            else menu_close();
            return 1u;
        }
        if (ui.menu == 2u) return 0u;
        if (y >= 21u && y < 46u && kind == LCD_TAP) {
            int32_t xx = 4;
            for (i = 0; i < MS_COUNT; i++) {
                int32_t w = text_w(&FONT_S, MS_NAME[i]);
                if ((int32_t)x >= xx - 2 && (int32_t)x < xx + w + 3) {
                    ui.menu_sel = MS_FIRST[i];
                    ui.force = 1;
                    return 1u;
                }
                xx += w + 6;
            }
        }
        if (y >= 47u && y < 235u) {
            uint32_t sec = mi_sec(ui.menu_sel % MI_COUNT);
            uint32_t row = (y - 47u) / MI_DY;
            uint32_t idx = MS_FIRST[sec] + row;
            if (idx >= MS_FIRST[sec + 1u]) return 0u;
            ui.menu_sel = (uint8_t)idx;
            ui.force = 1u;
            if (idx == MI_PANEL || idx == MI_LCLEAR) {
                ui_message("USE CLASSIC CONTROLS");
                return 1u;
            }
            if (kind == LCD_TAP) mi_set(idx, 0);
            else if (kind == LCD_TURN) mi_set(idx, clamp(steps, -8, 8));
            return 1u;
        }
        return 0u;
    }
    /* Long-press the display header to open the firmware's system menu.
     * A short tap still goes to the normal screen item. */
    if (kind == LCD_HOLD && y < 42u) {
        if (ui.layer != LY_PLAY || ui.hold_kind) return 0u;
        ui.menu = 1u;
        ui.menu_sel = MI_COLOR;
        ui.force = 1u;
        return 1u;
    }
    if (ui.hold_kind) return 0u;

    /* The function layers draw 16 4x4 tiles. Their sequencer, key/scale,
     * mix and Song actions already live in layer_key(); invoke those once
     * rather than inventing another sequencer implementation. The audio
     * punch/roll/erase layers still use their existing physical key path. */
    if (ui.layer != LY_PLAY) {
        if (y >= 40u && y < 184u && kind == LCD_TAP &&
            (ui.layer == LY_STEP || (kind == LCD_TAP && (ui.layer == LY_SCALE ||
             ui.layer == LY_MIX || ui.layer == LY_SONG)))) {
            uint32_t w = ((y - 40u) / 36u) * 4u + col;
            uint32_t key = key_of_white(w);
            layer_key(ui.layer, key, 1u);
            layer_key(ui.layer, key, 0u);
            ui.layer_used = 1u;
            ui.force = 1u;
            return 1u;
        }
        if (y >= 184u) {
            lcd_touch_knob(col, kind, x, steps);
            return 1u;
        }
        return 0u;
    }

    if (on_song_page()) {
        if (y < 40u && kind == LCD_TAP) {
            if (x < 85u && !song.playing && !transport_req) {
                arrangement_enabled ^= 1u; ui.force = 1u; return 1u;
            }
            if (x > 175u) {
                if (!song.playing && arrangement_enabled &&
                    !arr_valid(&arrangement, arrangement_ready()))
                    ui_message("EMPTY SECTION: REC");
                else transport_req = song.playing ? 2 : 1;
                ui.force = 1;
                return 1u;
            }
        }
        if (y >= 42u && y < 172u && kind == LCD_TAP) {
            uint32_t first = song_cursor > 3u ? song_cursor - 3u : 0u;
            uint32_t idx = first + (y - 42u) / 26u;
            if (idx < arrangement.count) {
                song_cursor = (uint8_t)idx; ui.force = 1u; return 1u;
            }
        }
        if (y >= 184u) {
            lcd_touch_knob(col, kind, x, steps);
            return 1u;
        }
        return 0u;
    }

    /* All M-PYRE performance/parameter pages have a 40px status bar:
     * the left shows BPM, the middle playback, the right page/title. */
    if (y < 40u) {
        if (on_drum_page() && x >= 188u && kind == LCD_TAP) {
            drum_page = (uint8_t)clamp((int32_t)y / 14, 0, 2);
            ui.sheet = 0; ui.force = 1u; return 1u;
        }
        if (kind == LCD_TURN && x < 95u) {
            song.g[G_BPM] = (int16_t)clamp(song.g[G_BPM] + steps, 40, 240);
            ui.bpm_t = 40; ui.force = 1u; return 1u;
        }
        if (kind == LCD_TAP && x >= 98u && x < 145u) {
            if (!song.playing && arrangement_enabled &&
                !arr_valid(&arrangement, arrangement_ready()))
                ui_message("EMPTY SECTION: REC");
            else transport_req = song.playing ? 2u : 1u;
            ui.force = 1u; return 1u;
        }
        if (!on_drum_page() && kind == LCD_TAP && x >= 190u) {
            if (!page_walk(1)) {
                if (ui.home) go_home();
            }
            ui.force = 1u; return 1u;
        }
        if (kind == LCD_TAP && x < 37u) {
            go_home(); return 1u;
        }
        if (kind == LCD_TURN && x > 175u && !on_drum_page()) {
            page_walk(steps > 0 ? 1 : -1);
            ui.force = 1; return 1u;
        }
        return 0u;
    }

    /* TRACKS screen: tap the eight real tracks to select them. The status
     * box on the right toggles mute; sliding there adjusts the level. */
    if (!ui.home && cur_page()->scope == SC_TRK &&
        y >= 40u && y < 184u) {
        uint32_t tr = (y - 40u) / 18u;
        if (tr >= NTRK) return 0u;
        if (kind == LCD_HOLD && x < 198u) {
            track_select(tr);
            if (tr == TRK_DRUM) studio_open(SC_DRUM);
            else open_family(FAM_SEQ);
            ui.force = 1u; return 1u;
        }
        if (kind == LCD_TAP) {
            if (x >= 198u) trk[tr].p[P_MUTE] ^= 1;
            else track_select(tr);
            ui.force = 1u; return 1u;
        }
        if (kind == LCD_TURN && x >= 198u) {
            int16_t *p = tr == TRK_DRUM ? &song.g[G_DRLVL] : &trk[tr].p[P_LEVEL];
            *p = (int16_t)clamp(*p + steps, 0, 127);
            ui.force = 1u; return 1u;
        }
    }

    if (on_drum_page() && y >= 84u && y < 184u) {
        uint32_t lane;
        if (!drum_page) {
            uint32_t rowh = ui.sheet ? 5u : 6u;
            lane = ((y - 84u) > 1u ? (y - 84u - 2u) : 0u) / rowh;
            if (lane >= DRUM_LANES) return 0u;
            if (kind != LCD_TAP && kind != LCD_PAINT) return 0u;
            if (kind == LCD_PAINT && ui.sheet) return 0u;
            drum_lane = (uint8_t)lane;
            if (x >= 12u && x < 236u) {
                uint32_t idx = (uint32_t)(drum_cursor / 16u) * 16u + (x - 12u) / 14u;
                if (idx >= trk_len(TDRUM)) return 0u;
                drum_cursor = (uint8_t)idx;
                if (song.playing && arrangement_enabled) {
                    ui_message("STOP THE SONG FIRST"); return 1u;
                }
                undo_mark(TDRUM, ui.step_sess ? ui.step_sess : (ui.step_sess = (undo_sess += 4u) | 3u));
                fm1_irq_off();
                if (dstep_has(&TDRUM->dstep[idx], lane)) {
                    dstep_clr(&TDRUM->dstep[idx], lane);
                    if (!dstep_mask(&TDRUM->dstep[idx])) {
                        lock_del(TDRUM, idx, P_COUNT);
                        TDRUM->micro[idx] = 0;
                        step_fill_set(TDRUM, idx, FC_NORM);
                    }
                } else {
                    dstep_set(&TDRUM->dstep[idx], lane, LV_NORM, 0u);
                    TDRUM->seq_active = 1;
                }
                fm1_irq_on();
                sync_reload = 1;
            }
            ui.force = 1u; return 1u;
        }
        lane = (y - 84u) / 25u * 4u + x / 60u;
        if (lane >= DRUM_LANES) return 0u;
        if (kind == LCD_TAP) {
            drum_lane = (uint8_t)lane;
            audition_lane(lane);
            ui.force = 1u; return 1u;
        }
        return 0u;
    }

    /* Direct manipulation of the actual drawn FX sends and scale keyboard.
     * These are graphics backed by firmware parameters, not image guessing. */
    if (!ui.home && cur_page()->graph == GR_FX &&
        y >= 103u && y < 193u && kind != LCD_HOLD && kind != LCD_PAINT) {
        static const uint8_t P[4] = {P_DIST, P_IMIX, P_DLY, P_REV};
        uint32_t par = P[col];
        if (kind == LCD_TAP)
            TSEL->p[par] = (int16_t)clamp((188 - (int32_t)y) * 127 / 80, 0, 127);
        else
            TSEL->p[par] = (int16_t)clamp(TSEL->p[par] + steps, 0, 127);
        sync_reload = 1;
        ui.force = 1u; return 1u;
    }
    if (!ui.home && cur_page()->graph == GR_SCALE &&
        y >= 103u && y < 180u && x >= 6u && kind == LCD_TAP) {
        uint32_t root = (x - 6u) / 19u;
        if (root >= 12u) return 0u;
        TSEL->p[P_ROOT] = (int16_t)root;
        sync_reload = 1;
        ui.force = 1u; return 1u;
    }
    if (!ui.home && cur_page()->graph == GR_STEPS &&
        y >= 104u && y < 198u && kind == LCD_TAP) {
        uint32_t row = (y - 104u) / 24u, nearest = 0u, dist = 240u;
        for (i = 0; i < 16u; i++) {
            uint32_t px = 6u + i * 14u + (i / 4u) * 4u;
            uint32_t d = x > px ? x - px : px - x;
            if (d < dist) { dist = d; nearest = i; }
        }
        if (row < 4u && row * 16u + nearest < trk_len(TSEL)) {
            cursor_set((int32_t)(row * 16u + nearest));
            ui.force = 1u; return 1u;
        }
    }

    /* Piano-roll taps select the real sequence cursor; editing it can then
     * be done through the four parameter columns or the Full Editor. */
    if (!ui.home && cur_page()->graph == GR_ROLL &&
        x >= 22u && y >= 88u && y < 198u && kind == LCD_TAP) {
        uint32_t nv = NV_ZOOM[clamp(1 + (int8_t)ui.zoom, 0, 3)];
        uint32_t len = trk_len(TSEL), first, idx;
        if (nv > len) nv = len;
        first = (ui.cursor / nv) * nv;
        idx = first + (x - 22u) * nv / 216u;
        if (idx < len) {
            cursor_set((int32_t)idx);
            ui.force = 1u;
            return 1u;
        }
    }

    /* M-PYRE's large 2x2 sound/effect parameter pages: each quadrant
     * represents the corresponding physical knob, same as the footer. */
    if (!ui.home && (big_page(cur_page()) || amp_view_on()) &&
        y >= 42u && y < 198u) {
        uint32_t q = (y >= 120u ? 2u : 0u) + (x >= 120u ? 1u : 0u);
        lcd_touch_knob(q, kind, (q % 2u) * 60u + (x % 120u) / 2u, steps);
        return 1u;
    }
    /* Four large on-screen values above the waveform/effects. */
    if (y >= 42u && y < 97u && (ui.home || cur_page()->graph == GR_FX)) {
        lcd_touch_knob(col, kind, x, steps);
        return 1u;
    }
    /* Browser/slot views can be scrolled directly over their graphics. */
    if (!ui.home && y >= 74u && y < 198u &&
        (cur_page()->graph == GR_BROWSE || cur_page()->graph == GR_SLOTS ||
         cur_page()->graph == GR_USER) && kind != LCD_HOLD) {
        emu_knob(EN_K1, kind == LCD_TAP ? (x < 120u ? -1 : 1) : clamp(steps, -12, 12));
        return 1u;
    }
    /* The four drawn dials are the same controls on TRACKS, SONG, DRUMS
     * and the older four-column parameter view. */
    if (y >= 202u || (y >= 184u &&
        (ui.home || cur_page()->scope == SC_TRK || on_drum_page()))) {
        lcd_touch_knob(col, kind, x, steps);
        return 1u;
    }
    return 0u;
}

/* The HOME screen draws the *existing* kit picture using kv_kit(-1)
 * from ui_studio.c. Map finger positions on those real shapes to its 16
 * native drum lanes. Coordinates below are inside the 240x124 picture;
 * the picture begins at LCD row Y_GRAPH (74 in the pinned firmware).
 * Split the shared hat/snare shapes so all 16 sounds are reachable,
 * without adding any visible HTML or changing sequencer state.
 */
UI_SMALL static int32_t home_kit_lane(uint32_t sx, uint32_t sy)
{
    uint32_t y;
    if (sx >= 240u || sy < Y_GRAPH || sy >= Y_GRAPH + H_GRAPH) return -1;
    y = sy - Y_GRAPH;
    if (y >= 103u && y < 124u && sx >= 42u && sx < 82u) return 14; /* reverse crash pad */
    if (y >= 103u && y < 124u && sx >= 205u) return 15;            /* drop pad */
    if (y >= 103u && y < 120u && sx >= 12u && sx < 35u) return 5;  /* hi-hat pedal */
    if (y >= 50u && y < 64u && sx >= 190u && sx < 211u) return 7;  /* ride bell */
    if (y >= 4u && y < 30u && sx >= 121u && sx < 181u) return 12;  /* crash 2 */
    if (y >= 13u && y < 34u && sx >= 184u && sx < 239u) return 13; /* china */
    if (y >= 5u && y < 32u && sx >= 17u && sx < 81u) return 11;   /* crash */
    if (y >= 43u && y < 69u && sx >= 165u && sx < 236u) return 6;  /* ride */
    if (y >= 40u && y < 61u && sx < 46u) return y < 50u ? 3 : 4; /* closed/open hat */
    if (y >= 36u && y < 66u && sx >= 78u && sx < 117u) return 8;  /* high tom */
    if (y >= 36u && y < 66u && sx >= 121u && sx < 160u) return 9; /* mid tom */
    if (y >= 68u && y < 102u && sx >= 34u && sx < 84u)
        return sx >= 72u ? 2 : 1;                                  /* ghost/snare */
    if (y >= 75u && y < 114u && sx >= 160u && sx < 210u) return 10; /* floor tom */
    if (y >= 63u && y < 122u && sx >= 87u && sx < 150u) return 0; /* kick drum */
    return -1; /* black/background area; don't sound invisible pads */
}

/* Only the HOME/LIVE screen with DRUMS selected can trigger these.
 * The same native audition_lane() powers the normal KIT-page preview.
 * An unhandled tap may be routed to the existing LCD Touch actions.
 */
uint32_t emu_home_drum_touch(uint32_t x, uint32_t y)
{
    int32_t lane;
    if (!ui.home || !is_drum(TSEL) || ui.menu ||
        ui.layer != LY_PLAY || ui.hold_kind) return 0u;
    lane = home_kit_lane(x, y);
    if (lane < 0) return 0u;
    audition_lane((uint32_t)lane);
    ui.force = 1u; /* existing picture lights with the real drum hit */
    return 1u;
}
