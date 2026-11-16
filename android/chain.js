/* Accessible touchscreen quick-chaining of the real FM-1 sections A–D. */
(() => {
  "use strict";
  const view=document.getElementById("android-studio");
  const side=view?.querySelector(".studio-side");if(!side)return;
  const panel=document.createElement("section");
  panel.id="studio-chain";
  panel.innerHTML='<div class="studio-title">PATTERN CHAIN · A–D</div>'+
    '<div class="studio-help">Sections A–D speichern, dann Reihenfolge tippen. Max. 8, Wiederholungen möglich.</div>'+
    '<div class="chain-pad">'+[0,1,2,3].map(i=>'<button type="button" data-add="'+i+'">'+String.fromCharCode(65+i)+'</button>').join("")+'</div>'+
    '<div id="chain-order">Noch keine Sections</div>'+
    '<div class="chain-tools"><button data-act="undo">↶ ZURÜCK</button><button data-act="clear">LEEREN</button>'+
    '<button data-act="play" class="studio-accent">▶ CHAIN LOOP</button><button data-act="stop">■ CHAIN AUS</button></div>'+
    '<div class="studio-help" id="chain-state" aria-live="polite">Originale FM-1-Pattern-Verkettung.</div>';
  side.appendChild(panel);
  const chosen=[];let state=null;
  const el=id=>document.getElementById(id),letter=i=>String.fromCharCode(65+i);
  function render(){
    el("chain-order").textContent=chosen.length?chosen.map(letter).join(" → "):"Noch keine Sections";
    for(const b of panel.querySelectorAll("[data-add]"))
      b.disabled=chosen.length>=8 || !!(state&&!(state[0]&(1<<Number(b.dataset.add))));
    if(state&&state.length===16){
      el("chain-state").textContent="Aktive Section: "+(state[2]?letter(state[2]-1):"—")+
        (state[1]?" · PLAY":" · STOP")+(state[3]?" · Chain "+(state[4]+1)+"/"+state[3]:"")+
        " · Gespeichert: "+[0,1,2,3].filter(i=>state[0]&(1<<i)).map(letter).join(", ");
    }
  }
  panel.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b||b.disabled)return;
    const a=b.dataset.act;
    if(b.dataset.add!==undefined){if(chosen.length<8)chosen.push(Number(b.dataset.add));}
    else if(a==="undo")chosen.pop();
    else if(a==="clear")chosen.splice(0);
    else if(a==="play"){
      if(!chosen.length){el("chain-state").textContent="Bitte Sections auswählen.";return;}
      if(!node){el("chain-state").textContent="POWER einschalten.";return;}
      send({t:"chainSet",bytes:chosen.slice()});
      el("chain-state").textContent="Starte Chain...";
    } else if(a==="stop")send({t:"chainSet",bytes:[]});
    render();
  });
  window.MPyrePatternChain={
    receive(b){state=b instanceof Uint8Array?b:new Uint8Array(b);render();},
    failed(){el("chain-state").textContent="Section leer oder SONG läuft: Chain nicht möglich.";}
  };
  setInterval(()=>{if(node&&!view.hidden)send({t:"chainGet"});},1150);
  render();
})();