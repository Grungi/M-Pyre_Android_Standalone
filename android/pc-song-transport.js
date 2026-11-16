/* Song-page Play/Stop for the original M-PYRE USB-MIDI PC editor.
 * Talks to the real firmware (LIVE + BK_PUT) through the existing rq queue.
 * Sends the edited arrangement before starting, not just a browser preview.
 * SPDX-License-Identifier: GPL-3.0-only
 */
(() => {
  "use strict";
  const play = document.getElementById("pc-song-play");
  const stop = document.getElementById("pc-song-stop");
  const status = document.getElementById("pc-song-status");
  if (!play || !stop || !status) return;

  let generation = 0;
  let preparing = false;
  const statusText = (s, tone = "") => {
    status.textContent = s;
    status.dataset.tone = tone;
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function command(op, ...args) {
    if (!dev || !(dev.info.proto >= 12))
      throw new Error("LIVE control requires M-PYRE firmware protocol 12.");
    return parse[CMD.LIVE](await rq(req.live(op, ...args), {
      front: true, retries: 0, timeout: 1500
    }));
  }
  async function waitFor(predicate, generationAtStart, description) {
    for (let i = 0; i < 24; i++) {
      if (generationAtStart !== generation) return null;
      const s = await command(LIVE.STATE);
      if (predicate(s)) return s;
      await sleep(65);
    }
    throw new Error(description + " did not complete. Check that POWER is on.");
  }

  function missingSections(song, mask) {
    return [...new Set(song.entries.map(e => e.scene))]
      .filter(i => !(mask & (1 << i)))
      .map(i => "ABCD"[i]);
  }

  async function startSong() {
    const token = ++generation;
    if (preparing) {
      // A second press while preparing is ignored; Stop may still cancel.
      return;
    }
    if (!dev || !SG.rows || !SG.bytes) {
      statusText("Connect the FM-1 and read the Song first.", "error");
      return;
    }
    if (!dev.info || dev.info.proto < 12) {
      statusText("Song playback needs LIVE support (protocol v12).", "error");
      return;
    }
    const arrangement = { loop: SG.loop, entries: ARR.expand(SG.rows) };
    if (!ARR.valid(arrangement)) {
      statusText("Invalid arrangement. Check section, bar count and number of entries.", "error");
      return;
    }

    preparing = true;
    play.disabled = true;
    statusText("Preparing Song playback …");
    try {
      await op(async () => {
        let s = await command(LIVE.STATE);
        // Restarting should begin at entry 1, even if the loop was already playing.
        if (s.playing || s.asked) {
          statusText("Stopping current playback …");
          await command(LIVE.PLAY, 0);
          s = await waitFor(v => !v.playing && !v.asked, token, "STOP");
          if (!s || token !== generation) return;
        }
        const missing = missingSections(arrangement, s.ready);
        if (missing.length) {
          statusText("Save section " + missing.join(", ") +
            " on the Android FM-1 before playing the Song.", "error");
          return;
        }
        if (token !== generation) return;
        statusText("Sending the current Song arrangement to Android …");
        // Uses the original, CRC-checked BK_PUT & readback implementation.
        // sendSong() was adapted to return true ONLY on a successful commit.
        if (await sendSong() !== true) {
          statusText("Song could not be saved. Stop playback and try again.", "error");
          return;
        }
        if (token !== generation) return;
        s = await command(LIVE.STATE);
        if (s.songRec) {
          statusText("Turn off SONG REC before playing a Song.", "error");
          return;
        }
        if (!s.songMode) {
          statusText("Switching FM-1 to SONG mode …");
          await command(LIVE.KEY, LIVE.LY_SONG, LIVE.SONG, 1);
          s = await command(LIVE.KEY, LIVE.LY_SONG, LIVE.SONG, 0);
          if (!s.songMode) {
            statusText("Couldn't enable SONG mode on the FM-1.", "error");
            return;
          }
        }
        if (token !== generation) return;
        statusText("Starting Song from the first section …");
        await command(LIVE.PLAY, 1);
        s = await waitFor(v => v.playing && v.songRuns, token, "SONG PLAY");
        if (s && token === generation)
          statusText("▶ Song playing · " + arrangement.entries.length +
            " sections · " + (arrangement.loop ? "loop" : "stop at end"), "ok");
      });
    } catch (error) {
      if (token === generation)
        statusText("Play Song failed: " + error.message, "error");
    } finally {
      preparing = false;
      play.disabled = false;
    }
  }

  async function stopSong() {
    const token = ++generation; // prevents a pending Play from starting later
    statusText("Stopping …");
    try {
      await op(async () => {
        await command(LIVE.PLAY, 0);
        const s = await waitFor(v => !v.playing && !v.asked, token, "STOP");
        if (s && token === generation)
          statusText("■ Stopped. Song mode is still selected.", "ok");
      });
    } catch (error) {
      if (token === generation)
        statusText("Stop failed: " + error.message, "error");
    }
  }

  play.addEventListener("click", startSong);
  stop.addEventListener("click", stopSong);
  window.MPyrePcSongTransport = { play: startSong, stop: stopSong };
})();
