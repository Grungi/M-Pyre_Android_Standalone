/* Real USB-MIDI port discovery for Windows/Android. Probe only plausibly
 * matching port pairs; genuine M-PYRE INFO response validates candidates. */
const FM1_PORT = /fm-1|m-pyre|felucca|sloop|clipper|ota|composite|sinco|usb[ _-]*midi|android|peripheral|xiaomi|poco|midi[ _-]*(?:in|out|interface|device)/i;
function fm1Ports(access) {
  const live = p => p.state !== "disconnected";
  const ins = [...access.inputs.values()].filter(live);
  const outs = [...access.outputs.values()].filter(live);
  const title = p => (p.name || "") + " " + (p.manufacturer || "");
  const recognized = p => FM1_PORT.test(title(p));
  const normalized = p => String(p.name || "").toLowerCase()
    .replace(/\bmidi(?:in|out)(?=\W|\d|$)/g, "midi")
    .replace(/\bmidi[ _-]+(?:input|output)\b/g, "midi")
    .replace(/\b(?:input|output)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
  const candidates = [];
  for (const input of ins) for (const output of outs) {
    const sameName = !!input.name && input.name === output.name;
    const sameFamily = normalized(input).length > 3 && normalized(input) === normalized(output);
    // Unknown/unmatched ports are probed ONLY when exactly one in/out exists.
    const lonePair = ins.length === 1 && outs.length === 1;
    const knownBoth = recognized(input) && recognized(output);
    if (!(sameName || sameFamily || knownBoth || lonePair)) continue;
    let rank = sameName ? 130 : sameFamily ? 100 : knownBoth ? 65 : 10;
    if (/m-pyre|felucca|sloop|fm-1/i.test(title(input) + title(output))) rank += 120;
    if (/android|poco|xiaomi|peripheral/i.test(title(input) + title(output))) rank += 90;
    if (recognized(input) && recognized(output)) rank += 30;
    candidates.push({input, output, rank});
  }
  candidates.sort((a,b)=>b.rank-a.rank);
  return candidates.map(({input,output})=>({input,output}));
}