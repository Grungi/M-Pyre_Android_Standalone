// Exercise real M-PYRE firmware LCD actions in the same WebAssembly module
// as audio, sequencing and the original physical controls.
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const html = fs.readFileSync("app/src/main/assets/index.html", "utf8");
  const match = html.match(/const WASM_B64 = "([A-Za-z0-9+/=]+)";/);
  assert.ok(match, "real pinned firmware WASM is embedded");
  const { instance } = await WebAssembly.instantiate(Buffer.from(match[1], "base64"), {});
  const E = instance.exports;
  assert.equal(typeof E.emu_lcd_touch, "function", "LCD bridge exported by WASM");
  assert.equal(typeof E.emu_studio_snapshot, "function", "original Studio bridge retained");
  E.emu_init();
  // Allow the firmware's own boot splash and initial page selection to complete.
  for (let i = 0; i < 90; i++) E.emu_ui();
  const snap = () => {
    const n = E.emu_studio_snapshot();
    return Buffer.from(new Uint8Array(E.memory.buffer, E.emu_buffer(), n));
  };
  const tr = t => 8 + t * (8 + 64 * 10);
  assert.equal(E.emu_lcd_touch(0, 50, 64, 0), 1, "tap second track");
  assert.equal(snap()[1], 1, "LCD selected the actual firmware track");
  const beforeMute = snap()[tr(1) + 3];
  assert.equal(E.emu_lcd_touch(0, 215, 64, 0), 1, "tap mute status");
  assert.notEqual(snap()[tr(1) + 3], beforeMute, "LCD changed firmware mute state");
  const bpm = s => s[4] | s[5] << 8;
  const originalBpm = bpm(snap());
  assert.equal(E.emu_lcd_touch(1, 25, 10, 3), 1, "swipe tempo");
  assert.equal(bpm(snap()), Math.min(240, originalBpm + 3), "LCD tempo swipe changes real firmware");
  assert.equal(E.emu_lcd_touch(2, 200, 8, 0), 1, "long press opens firmware menu");
  assert.equal(E.emu_lcd_touch(0, 8, 8, 0), 1, "tap header closes firmware menu");
  assert.equal(E.emu_lcd_touch(0, 48, 173, 0), 1, "select drum track");
  assert.equal(snap()[1], 7, "drums selected");
  assert.equal(E.emu_lcd_touch(2, 48, 173, 0), 1, "long press opens real drum page");
  E.emu_ui();
  const drum0 = snap()[tr(7) + 8] & 1;
  assert.equal(E.emu_lcd_touch(0, 19, 88, 0), 1, "tap real drum-grid cell");
  assert.notEqual(snap()[tr(7) + 8] & 1, drum0, "LCD toggled real kick step");
  assert.equal(E.emu_lcd_touch(0, 19, 88, 0), 1, "tap grid cell again");
  assert.equal(snap()[tr(7) + 8] & 1, drum0, "second tap restored the step");
  const drum1 = snap()[tr(7) + 8 + 10] & 1;
  assert.equal(E.emu_lcd_touch(3, 33, 88, 0), 1, "drag-paint next drum cell");
  assert.notEqual(snap()[tr(7) + 8 + 10] & 1, drum1, "drag painting edits the native second step");
  assert.equal(E.emu_lcd_touch(3, 33, 88, 0), 1, "paint same cell again");
  assert.equal(snap()[tr(7) + 8 + 10] & 1, drum1, "second paint restores the step");
  assert.equal(E.emu_lcd_touch(0, 240, 0, 0), 0, "out-of-range taps ignored");

  // Existing 240x124 home LIVE drum picture, not any new HTML controls.
  assert.equal(typeof E.emu_home_drum_touch, "function", "home drum hot spots exported");
  assert.equal(E.emu_home_drum_touch(118, 164), 0, "kit taps ignored outside HOME/LIVE");
  assert.equal(E.emu_lcd_touch(0, 8, 8, 0), 1, "return to TRACKS screen");
  // HOME button is label 6 in the *real* pinned panel mapping.
  // Short press from TRACKS opens LIVE with the existing kit picture.
  E.emu_button(6, 1); E.emu_ui();
  E.emu_button(6, 0); E.emu_ui();
  const originalKit = snap();
  const picturedSounds = [
    [118, 164],  // kick
    [58, 152],   // snare
    [78, 154],   // ghost snare, same drawn shell
    [22, 119],   // closed hat
    [22, 128],   // open hat
    [22, 186],   // hat pedal
    [176, 129],  // ride cymbal
    [200, 130],  // ride bell
    [96, 118],   // hi tom
    [140, 118],  // mid tom
    [184, 160],  // floor tom
    [48, 90],    // crash
    [150, 86],   // crash 2
    [210, 96],   // china
    [55, 186],   // reverse crash
    [220, 186]   // drop
  ];
  for (const [x,y] of picturedSounds) {
    assert.equal(E.emu_home_drum_touch(x, y), 1,
      `home screen image must play pictured kit at ${x},${y}`);
  }
  assert.equal(E.emu_home_drum_touch(3, 181), 0,
    "empty image background is not an invisible drum pad");
  assert.deepEqual(snap(), originalKit,
    "live drum preview does not edit sequencer steps or project data");
  console.log("LCD touch integration passed: tracks, mute, BPM, drum editor and 16 live home kit touch zones.");
})().catch(e => { console.error(e); process.exit(1); });
