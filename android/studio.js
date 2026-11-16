/* Touch-first M-PYRE Song Studio, GPL-3.0-only.
 * Edits the real running WASM firmware via the AudioWorklet; no mock device.
 * The native 8-track, 64-step patterns and in-memory slots remain authoritative.
 */
(function () {
  "use strict";
  const labels = ["GUITAR 1", "GUITAR 2", "BASS", "GUITAR 3", "LEAD 2", "BASS 2", "INSTRUMENT 7", "DRUMS"];
  const DRUM_TRACK = labels.length - 1;
  const drums = ["KICK","SNARE","GHOST","HAT","OPEN HAT","PEDAL","RIDE","BELL",
    "HI TOM","MID TOM","FLOOR","CRASH","CRASH 2","CHINA","REV CRASH","DROP"];
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const midiName = n => names[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  const byId = id => document.getElementById(id);
  let snapshot = null, track = 0, page = 0, step = 0, note = 53, lane = 0;
  let polling = 0, visible = false;

  // This is deliberately a separate fullscreen surface, not a second WebView:
  // the AudioWorklet continues to render the existing song in the background.
  const view = document.createElement("section");
  view.id = "android-studio";
  view.hidden = true;
  view.setAttribute("aria-label", "M-PYRE Song Studio");
  view.innerHTML =
    '<header class="studio-bar">' +
      '<button type="button" id="studio-back">← RIFFBOX</button>' +
      '<strong>SONG STUDIO</strong>' +
      '<span id="studio-status" class="studio-status">Live firmware editor</span>' +
      '<button type="button" id="studio-play" class="studio-accent">▶ PLAY</button>' +
    '</header>' +
    '<nav class="studio-tabs" aria-label="Tracks">' +
      labels.map((label, i) => '<button type="button" data-track="' + i + '">' +
        (i + 1) + ' · ' + label + '</button>').join("") +
    '</nav>' +
    '<div class="studio-main">' +
      '<div class="studio-steps-panel">' +
        '<div class="studio-pager">' +
          '<button type="button" data-act="page-prev" aria-label="Previous 16 steps">◀</button>' +
          '<span id="studio-page">STEPS 1–16</span>' +
          '<button type="button" data-act="page-next" aria-label="Next 16 steps">▶</button>' +
        '</div>' +
        '<div id="studio-grid" aria-label="16-step pattern grid"></div>' +
      '</div>' +
      '<section class="studio-side" aria-label="Step and song settings">' +
        '<div id="studio-step-title" class="studio-title">STEP 01</div>' +
        '<div class="studio-row"><label>Tempo</label>' +
          '<button type="button" data-act="bpm-down">−</button>' +
          '<strong id="studio-bpm">120</strong>' +
          '<button type="button" data-act="bpm-up">+</button>' +
          '<label>Steps</label>' +
          '<button type="button" data-act="len-down">−</button>' +
          '<strong id="studio-length">16</strong>' +
          '<button type="button" data-act="len-up">+</button>' +
        '</div>' +
        '<div class="studio-row">' +
          '<button type="button" id="studio-mute" data-act="mute">MUTE OFF</button>' +
          '<span id="studio-step-detail" class="studio-help">Select a step.</span>' +
        '</div>' +
        '<div id="studio-synth-controls">' +
          '<div class="studio-row"><label>Note</label>' +
            '<button type="button" data-act="note-oct-down">−12</button>' +
            '<button type="button" data-act="note-down">−</button>' +
            '<strong id="studio-note">F3</strong>' +
            '<button type="button" data-act="note-up">+</button>' +
            '<button type="button" data-act="note-oct-up">+12</button>' +
          '</div>' +
          '<div class="studio-row">' +
            '<button type="button" class="studio-accent" data-act="note-toggle">+ / − NOTE</button>' +
            '<button type="button" data-act="tie">TIE</button>' +
            '<button type="button" data-act="clear">REST</button>' +
            '<button type="button" data-act="accent">ACCENT</button>' +
            '<button type="button" data-act="slide">SLIDE</button>' +
          '</div>' +
          '<div class="studio-row"><label>Velocity</label>' +
            '<button type="button" data-act="vel-down">−</button>' +
            '<strong id="studio-velocity">100</strong>' +
            '<button type="button" data-act="vel-up">+</button>' +
          '</div>' +
        '</div>' +
        '<div id="studio-drum-controls" hidden>' +
          '<div id="studio-lanes" class="studio-lanes" aria-label="16 drum sounds"></div>' +
          '<div class="studio-row">' +
            '<button type="button" class="studio-accent" data-act="drum-toggle">+ / − HIT</button>' +
            '<button type="button" data-act="drum-accent">ACCENT</button>' +
            '<button type="button" data-act="drum-clear">CLEAR STEP</button>' +
          '</div>' +
        '</div>' +
        '<div class="studio-help">Tap a step to select. Tap the same step again to toggle its note/hit.' +
        ' All changes update the running riffbox.</div>' +
        '<div class="studio-title">Project slots (stop playback first)</div>' +
        '<div id="studio-slots" class="studio-row studio-slots"></div>' +
        '<div id="studio-message" role="status" aria-live="polite"></div>' +
      '</section>' +
    '</div>';
  document.body.appendChild(view);
  const message = s => { byId("studio-message").textContent = s; };
  const req = data => { if (node && node.port) node.port.postMessage(data); };
  const get = () => req({ t: "studioGet" });

  function decode(data) {
    const a = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (a.length !== 8 + 8 * (8 + 64 * 10) || a[0] !== 2 || a[6] !== 8 || a[7] !== 64) {
      message("Firmware data version mismatch.");
      return null;
    }
    const result = { selected:a[1], playing:!!a[2], bpm:a[4] | (a[5] << 8), tracks:[] };
    let p = 8;
    for (let k = 0; k < labels.length; k++) {
      const t = { engine:a[p], preset:a[p+1], length:a[p+2], mute:!!a[p+3],
        level:a[p+4], pan:a[p+5], steps:[] };
      p += 8;
      for (let s = 0; s < 64; s++) { t.steps.push(a.slice(p,p+10)); p += 10; }
      result.tracks.push(t);
    }
    return result;
  }
  function stepSummary(t, idx) {
    const s = t.steps[idx];
    if (track === DRUM_TRACK) {
      const mask = s[0] | (s[1] << 8);
      const count = mask.toString(2).replace(/0/g,"").length;
      return count ? count + " hits" : "—";
    }
    if (s[5] === 1) return "TIE";
    if (s[5] !== 0 || !s[4]) return "—";
    const notes = Array.from(s.slice(0,Math.min(4,s[4]))).map(midiName);
    return notes.join("+");
  }
  function render() {
    if (!snapshot || !visible) return;
    track = Math.max(0,Math.min(DRUM_TRACK,track));
    const t = snapshot.tracks[track], s = t.steps[step];
    view.querySelectorAll("[data-track]").forEach(b => {
      b.classList.toggle("studio-selected", Number(b.dataset.track) === track);
    });
    byId("studio-status").textContent = "Live · " + (snapshot.playing ? "PLAYING" : "STOPPED");
    byId("studio-play").textContent = snapshot.playing ? "■ STOP" : "▶ PLAY";
    byId("studio-bpm").textContent = String(snapshot.bpm);
    byId("studio-length").textContent = String(t.length);
    byId("studio-mute").textContent = t.mute ? "MUTED" : "MUTE OFF";
    byId("studio-mute").classList.toggle("studio-selected",t.mute);
    byId("studio-note").textContent = midiName(note);
    byId("studio-velocity").textContent = String(s[7] || 100);
    byId("studio-synth-controls").hidden = track === DRUM_TRACK;
    byId("studio-drum-controls").hidden = track !== DRUM_TRACK;
    byId("studio-page").textContent = "STEPS " + (page*16+1) + "–" + (page*16+16) + " / 64";
    byId("studio-step-title").textContent = labels[track] + " · STEP " + String(step+1).padStart(2,"0");
    byId("studio-step-detail").textContent = stepSummary(t,step);
    const grid = byId("studio-grid");
    grid.replaceChildren();
    for (let i = page * 16; i < page * 16 + 16; i++) {
      const item = document.createElement("button");
      item.type = "button";
      item.dataset.step = String(i);
      item.setAttribute("aria-label", "Step " + (i+1) + " " + stepSummary(t,i));
      const active = stepSummary(t,i) !== "—";
      item.classList.toggle("selected",i===step);
      item.classList.toggle("occupied",active);
      if (i >= t.length) item.style.opacity=".48";
      item.innerHTML = '<span>' + String(i+1).padStart(2,"0") + '</span>' +
        '<small>' + stepSummary(t,i) + '</small>';
      grid.appendChild(item);
    }
    if (track===DRUM_TRACK) {
      const laneButtons = byId("studio-lanes");
      laneButtons.replaceChildren();
      const mask = s[0] | (s[1] << 8);
      drums.forEach((name,i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.lane = String(i);
        b.classList.toggle("studio-selected",i===lane);
        b.classList.toggle("studio-active",!!(mask & (1<<i)));
        b.textContent = (i+1)+". "+name + ((mask & (1<<i)) ? " ●" : "");
        laneButtons.appendChild(b);
      });
    }
    const slots = byId("studio-slots");
    if (!slots.hasChildNodes()) {
      for (let i=0;i<4;i++) {
        const save=document.createElement("button"), load=document.createElement("button");
        save.textContent="SAVE "+(i+1); save.dataset.slotSave=String(i);
        load.textContent="LOAD "+(i+1); load.dataset.slotLoad=String(i);
        slots.append(save,load);
      }
    }
  }
  function mutation(data) {
    if (!node) { message("Switch on POWER in the riffbox first."); return; }
    req(data);
  }
  function toggle() {
    if (!snapshot) return;
    if (track===DRUM_TRACK) mutation({t:"studioDrum",step:step,lane:lane,action:0});
    else mutation({t:"studioStep",track:track,step:step,action:1,value:note});
  }
  function open() {
    if (typeof closeOptions === "function") closeOptions();
    view.hidden = false;
    visible = true;
    message(node ? "Editing the running firmware." : "Return to the riffbox and turn POWER on first.");
    if (node) get();
    if (polling) clearInterval(polling);
    polling = setInterval(() => { if (visible && node) get(); }, 900);
    render();
  }
  function close() {
    if (!visible) return false;
    visible = false;
    view.hidden = true;
    clearInterval(polling); polling=0;
    return true;
  }
  window.MPyreCloseStudio = close;
  window.MPyreStudio = {
    receive(data, ok) {
      if (!visible) return;
      const state=decode(data);
      if (state) {
        snapshot=state;
        if (typeof ok === "number" && !ok) message("Operation refused. Stop playback for project slots.");
        render();
      }
    }
  };
  byId("studio-back").addEventListener("click",close);
  byId("studio-play").addEventListener("click", () => {
    if (snapshot) mutation({t:"studioSet",track:track,code:5,value:snapshot.playing?0:1});
  });
  const openButton=byId("open-studio");
  if (openButton) openButton.addEventListener("click",open);
  view.addEventListener("click",(e) => {
    const b=e.target.closest("button");
    if(!b || b.id==="studio-back" || b.id==="studio-play") return;
    if (b.dataset.track!==undefined) {
      track=Number(b.dataset.track); page=0; step=0;
      mutation({t:"studioSet",track:track,code:2,value:track});
      render();
      return;
    }
    if (b.dataset.step!==undefined) {
      const chosen=Number(b.dataset.step);
      if (step===chosen) toggle(); else { step=chosen; render(); }
      return;
    }
    if (b.dataset.lane!==undefined) {
      lane=Number(b.dataset.lane); render(); return;
    }
    if (b.dataset.slotSave!==undefined || b.dataset.slotLoad!==undefined) {
      const isSave=b.dataset.slotSave!==undefined;
      const slot=Number(isSave?b.dataset.slotSave:b.dataset.slotLoad);
      mutation({t:"studioSlot",action:isSave?1:0,slot:slot});
      message((isSave?"Saving":"Loading")+" slot "+(slot+1)+"...");
      return;
    }
    if (!b.dataset.act) return;
    const action=b.dataset.act;
    if (action==="page-prev" || action==="page-next") {
      page=Math.max(0,Math.min(3,page+(action==="page-prev"?-1:1)));
      step=page*16;
      render();return;
    }
    if (action==="note-down" || action==="note-up" ||
        action==="note-oct-down" || action==="note-oct-up") {
      const inc=action==="note-down"?-1:action==="note-up"?1:action==="note-oct-down"?-12:12;
      note=Math.max(0,Math.min(127,note+inc));render();return;
    }
    if (!snapshot) return;
    const t=snapshot.tracks[track];
    if(action==="bpm-down" || action==="bpm-up") {
      mutation({t:"studioSet",track:track,code:1,
        value:Math.max(40,Math.min(240,snapshot.bpm+(action==="bpm-down"?-1:1)))});
    } else if(action==="len-down" || action==="len-up") {
      mutation({t:"studioSet",track:track,code:0,
        value:Math.max(1,Math.min(64,t.length+(action==="len-down"?-1:1)))});
    } else if(action==="mute") {
      mutation({t:"studioSet",track:track,code:3,value:t.mute?0:1});
    } else if(action==="note-toggle") {
      toggle();
    } else if(action==="tie" || action==="clear" ||
              action==="accent" || action==="slide") {
      const code=action==="clear"?0:action==="tie"?2:action==="accent"?3:4;
      mutation({t:"studioStep",track:track,step:step,action:code,value:0});
    } else if(action==="vel-up" || action==="vel-down") {
      const current=t.steps[step][7] || 100;
      mutation({t:"studioStep",track:track,step:step,action:5,
        value:Math.max(1,Math.min(127,current+(action==="vel-down"?-8:8)))});
    } else if(action==="drum-toggle") {
      toggle();
    } else if(action==="drum-accent") {
      mutation({t:"studioDrum",step:step,lane:lane,action:1});
    } else if(action==="drum-clear") {
      // Clear each currently-active drum lane, one at a time.
      const s=t.steps[step],mask=s[0]|(s[1]<<8);
      for(let i=0;i<16;i++) if(mask&(1<<i)) mutation({t:"studioDrum",step:step,lane:i,action:0});
    }
  });
})();
