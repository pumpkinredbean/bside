#!/usr/bin/env node
/**
 * Regenerate bench/player.html from bench/results.json + bench/frames/*\/list.json
 * without rerunning the benchmark. Also callable from run.mjs via writePlayer().
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const JEV_COLOR = "#7c5cff";
const PALETTE = ["#3aa0ff", "#ff9f43", "#5dff8f", "#ff6b8a", "#ffd166"];

export async function writePlayer(BENCH, task, results) {
  results = [...results].sort((a, b) => (a.elapsedMs ?? a.wall ?? 0) - (b.elapsedMs ?? b.wall ?? 0));
  const colors = {};
  let pi = 0;
  for (const r of results) colors[r.name] = r.name === "jev" ? JEV_COLOR : PALETTE[pi++ % PALETTE.length];
  const frameLists = {};
  for (const r of results) {
    try {
      frameLists[r.name] = JSON.parse(
        await readFile(join(BENCH, "frames", r.name, "list.json"), "utf8"),
      );
    } catch { frameLists[r.name] = []; }
  }
  const player = `<!doctype html><meta charset="utf-8"><title>bside — the browser-agent race</title>
<style>
*{box-sizing:border-box}
body{background:#0a0a10;color:#e8e8f0;font:15px/1.4 ui-monospace,"SF Mono",Menlo,monospace;margin:0;padding:28px 32px}
.hdr{display:flex;align-items:baseline;gap:18px;margin-bottom:6px}
.logo{font-size:26px;font-weight:800;letter-spacing:-1px}
.logo b{color:#7c5cff}
.task{font-size:22px;font-weight:700;color:#fff;margin:2px 0 4px}
.sub{color:#777;font-size:12.5px;margin-bottom:22px}
.grid{display:grid;grid-template-columns:repeat(${results.length},1fr);gap:18px}
.col{background:#12121c;border:1px solid #232338;border-radius:14px;padding:14px;transition:border-color .3s,box-shadow .3s}
.col .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.badge{font-size:13px;font-weight:800;letter-spacing:.5px;text-transform:uppercase}
.badge .kind{display:block;font-size:10px;font-weight:600;color:#888;letter-spacing:1px;margin-top:1px}
.clock{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;color:#666}
.col.done .clock{color:#fff}
.col.done{border-color:#5dff8f;box-shadow:0 0 24px #5dff8f22}
.shot{position:relative;border-radius:10px;overflow:hidden;background:#000;aspect-ratio:16/10}
.shot img{width:100%;height:100%;object-fit:cover;display:block}
.bar{height:6px;background:#1d1d2e;border-radius:3px;margin-top:12px;overflow:hidden}
.bar i{display:block;height:100%;width:0;border-radius:3px}
.stat{display:flex;justify-content:space-between;font-size:11px;color:#777;margin-top:8px}
.stat b{color:#aaa;font-weight:600;font-variant-numeric:tabular-nums}
.cost{font-size:16px;color:#ffd166 !important}
.od{display:inline-flex;height:1.15em;overflow:hidden;vertical-align:text-bottom}
.od .rail{display:flex;flex-direction:column;will-change:transform}
.od .rail i{display:block;height:1.15em;line-height:1.15em;font-style:normal}
.status{font-size:11px;height:16px;margin-bottom:8px;color:#555}
.status.deciding{color:#ffd166}
.status.deciding::before{content:"● ";animation:pulse .8s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
.winner .badge::after{content:" 🏁"}
.fin{font-size:12px;color:#5dff8f;font-weight:700;margin-top:8px;display:none}
.col.done .fin{display:block}
</style>
<div class="hdr"><div class="logo"><b>bside</b> race</div><div class="sub">same task · same browser · real-time replay · captured @700ms intervals</div></div>
<div class="task">${task.goal.replace(/</g, "&lt;")}</div>
<div class="sub">no chat LLM on the left — one typed decision per step. frontier &amp; lightweight GPT on the right.</div>
<div class="grid">
${results.map((r) => `<div class="col" data-col="${r.name}">
  <div class="top"><div class="badge" style="color:${colors[r.name] || "#ccc"}">${r.name}<span class="kind">${r.name === "jev" ? "decision model · no text gen" : "llm text-gen loop"}</span></div><div class="clock" data-clock="${r.name}">0.0s</div></div>
  <div class="shot"><img data-name="${r.name}"></div>
  <div class="status" data-st="${r.name}"></div>
  <div class="bar"><i data-bar="${r.name}" style="background:${colors[r.name] || "#ccc"}"></i></div>
  <div class="stat"><span>tokens in / out</span><b data-tok="${r.name}">0 / 0</b></div>
  <div class="stat"><span>est. cost (list price)</span><b class="cost" data-cost="${r.name}">$0.00000</b></div>
  <div class="stat"><span>decision latency</span><b>${r.decAvg != null ? "avg " + (r.decAvg >= 1000 ? (r.decAvg / 1000).toFixed(1) + "s" : r.decAvg + "ms") : "—"}</b></div>
  <div class="stat"><span>steps</span><b>${r.ticks ?? "—"}</b></div>
  <div class="fin">FINISHED <span data-ft="${r.name}"></span></div>
</div>`).join("")}
</div>
<script>
const lists = ${JSON.stringify(frameLists)};
const doneAt = ${JSON.stringify(Object.fromEntries(results.map((r) => [r.name, r.elapsedMs ?? r.wall])))};
const evs = ${JSON.stringify(Object.fromEntries(results.map((r) => [r.name, r.evs || []])))};
// est. USD per 1M tokens (list price) — adjust to your provider's pricing.
// jev bills input tokens only; unknown models fall back to 0/0.
const rates = ${JSON.stringify(Object.fromEntries(results.map((r) => [r.name, r.price ?? (r.name === "jev" ? { i: 0.042, o: 0 } : { i: 0, o: 0 })])))};
function setOdo(el, str) {
  if (!el._strips || el._len !== str.length) {
    el.innerHTML = ""; el._strips = []; el._pos = []; el._anim = []; el._len = str.length;
    for (const ch of str) {
      if (ch >= "0" && ch <= "9") {
        const w = document.createElement("span"); w.className = "od";
        const r = document.createElement("span"); r.className = "rail";
        for (let n = 0; n < 10; n++) { const s = document.createElement("i"); s.textContent = n; r.appendChild(s); }
        r.style.transform = "translateY(-" + (+ch * 1.15) + "em)";
        w.appendChild(r); el.appendChild(w);
        el._strips.push(r); el._pos.push(+ch); el._anim.push(+ch);
      } else {
        const s = document.createElement("span"); s.textContent = ch; el.appendChild(s);
        el._strips.push(null); el._pos.push(0); el._anim.push(0);
      }
    }
    return;
  }
  for (let i = 0; i < str.length; i++) {
    const r = el._strips[i];
    if (!r) continue;
    const cur = el._pos[i] % 10;
    el._pos[i] += (+str[i] - cur + 10) % 10;
    while (r.children.length <= el._pos[i] + 1) {
      for (let n = 0; n < 10; n++) { const s = document.createElement("i"); s.textContent = n; r.appendChild(s); }
    }
    let a = el._anim[i];
    const diff = el._pos[i] - a;
    if (diff < 0.015) {
      a = el._pos[i];
      if (a >= 20) {
        // settled deep down the rail — reset to the second 0-9 block (same
        // digit shown) so translateY stays small and pixel-aligned
        while (r.children.length > 20) r.removeChild(r.lastChild);
        a = el._anim[i] = el._pos[i] = a % 10 + 10;
      }
    } else {
      a += Math.max(0.015, diff * 0.2);
    }
    el._anim[i] = a;
    r.style.transform = "translateY(-" + a * 1.15 + "em)";
  }
}
const maxT = Math.max(...Object.values(doneAt));
let start = 0;
function frame() {
  const t = performance.now() - start;
  for (const name in lists) {
    const l = lists[name]; if (!l || !l.length) continue;
    const img = document.querySelector('img[data-name="' + name + '"]');
    let fi = 0;
    for (let k = 0; k < l.length; k++) { if (l[k].t <= t) fi = k; else break; }
    img.src = "frames/" + name + "/" + l[fi].file;
    const col = document.querySelector('[data-col="' + name + '"]');
    const clock = document.querySelector('[data-clock="' + name + '"]');
    const bar = document.querySelector('[data-bar="' + name + '"]');
    const st = document.querySelector('[data-st="' + name + '"]');
    const d = doneAt[name];
    const shown = Math.min(t, d);
    clock.textContent = (shown / 1000).toFixed(1) + "s";
    bar.style.width = Math.min(100, shown / maxT * 100) + "%";
    let open = 0, openT = 0, inT = 0, outT = 0;
    const ev = evs[name] || [];
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.e !== "call_start" || e.t > t) continue;
      let end = null;
      for (let k = i + 1; k < ev.length; k++) { if (ev[k].e === "call_end") { end = ev[k]; break; } }
      const eT = end ? end.t : t;
      const frac = Math.max(0, Math.min(1, (t - e.t) / Math.max(1, eT - e.t)));
      // input tokens are billed at request time; output accrues over the call
      inT += (end && end.in) || 0;
      outT += ((end && end.out) || 0) * frac;
      if (!end || end.t > t) { open++; openT = e.t; }
    }
    if (open > 0) { st.textContent = "deciding… " + ((t - openT) / 1000).toFixed(1) + "s"; st.className = "status deciding"; }
    else if (t >= d) { st.textContent = "done"; st.className = "status"; }
    else {
      let phase = "booting…";
      for (const e of ev) {
        if (e.t > t) break;
        if (e.e === "snap_start") phase = "reading page…";
        else if (e.e === "snap_end") phase = "thinking setup…";
        else if (e.e === "act_start") phase = "acting…";
        else if (e.e === "act_end") phase = "page settling…";
        else if (e.e === "call_end") phase = "acting…";
      }
      st.textContent = phase; st.className = "status";
    }
    setOdo(document.querySelector('[data-tok="' + name + '"]'), Math.round(inT).toLocaleString() + " / " + Math.round(outT).toLocaleString());
    const r = rates[name] || { i: 0, o: 0 };
    setOdo(document.querySelector('[data-cost="' + name + '"]'), "$" + (inT * r.i / 1e6 + outT * r.o / 1e6).toFixed(5));
    if (t >= d && !col.classList.contains("done")) {
      col.classList.add("done");
      document.querySelector('[data-ft="' + name + '"]').textContent = "in " + (d / 1000).toFixed(1) + "s";
      const minD = Math.min(...Object.values(doneAt));
      if (d === minD) col.classList.add("winner");
    }
  }
  if (t < maxT + 5000) requestAnimationFrame(frame);
  else setTimeout(() => { start = performance.now(); requestAnimationFrame(frame); }, 4000);
}
requestAnimationFrame(frame);
</script>`;
  await writeFile(join(BENCH, "player.html"), player);
}

// standalone: node bench/gen-player.mjs
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const BENCH = dirname(fileURLToPath(import.meta.url));
  const data = JSON.parse(await readFile(join(BENCH, "results.json"), "utf8"));
  await writePlayer(BENCH, data.task || { goal: "" }, data.results || data);
  console.log("player.html regenerated");
}
