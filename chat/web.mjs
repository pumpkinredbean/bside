#!/usr/bin/env node
/**
 * chatjev web demo — watch a decision-only model "talk" one word at a
 * time. Serves a chat page; replies stream over SSE as each word is
 * decided (and sampled) by jev.
 *
 * usage: node chat/web.mjs [--port 4317]  →  http://localhost:4317
 */
import { createServer } from "node:http";
import { resolveTypesafeToken } from "../src/pilot.js";
import { createDecider, structuredReply, enumerateReply } from "./core.mjs";
import { VOCAB } from "./vocab.mjs";

const pi = process.argv.indexOf("--port");
const PORT = pi >= 0 ? +process.argv[pi + 1] : 4317;

const d = createDecider(await resolveTypesafeToken());

const PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ChatJev — every word is a decision</title>
<style>
*{box-sizing:border-box;margin:0}
body{background:#0a0a10;color:#e8e8f0;font:15px/1.55 ui-monospace,"SF Mono",Menlo,monospace;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:40px 20px}
h1{font-size:22px;font-weight:800;letter-spacing:-.5px}.h1 b{color:#7c5cff}
.sub{color:#777;font-size:12px;margin:6px 0 30px}
#log{width:min(640px,100%);flex:1;display:flex;flex-direction:column;gap:14px;margin-bottom:20px}
.msg{max-width:85%;padding:10px 14px;border-radius:12px;white-space:pre-wrap;word-break:break-word}
.user{align-self:flex-end;background:#232338}
.bot{align-self:flex-start;background:#12121c;border:1px solid #232338;min-height:44px}
.bot .w{opacity:0;animation:fade .3s forwards;cursor:default}
.bot .w:hover{color:#7c5cff}
@keyframes fade{to{opacity:1}}
.meta{font-size:10.5px;color:#555;margin-top:6px}
.grp{font-size:10.5px;color:#5a5a78;font-style:italic}
.cand{font-size:11.5px;color:#4a4a66;padding:1px 8px;border-left:2px solid #232338;margin:1px 0;white-space:pre-wrap}
.cand b{color:#7c5cff;font-weight:400}
.cand.hit{color:#9d97ff;border-left-color:#7c5cff}
.mode{font-size:11px;color:#555;margin-top:2px}
.mode a{color:#7c5cff;text-decoration:none}
.bar{width:min(640px,100%);display:flex;gap:10px}
input{flex:1;background:#12121c;border:1px solid #232338;border-radius:10px;color:#e8e8f0;font:inherit;padding:12px 14px;outline:none}
input:focus{border-color:#7c5cff}
button{background:#7c5cff;border:none;border-radius:10px;color:#fff;font:inherit;font-weight:700;padding:12px 20px;cursor:pointer}
button:disabled{opacity:.4;cursor:default}
.cur{display:inline-block;width:.5em;height:1em;background:#7c5cff;vertical-align:text-bottom;animation:blink .7s infinite}
@keyframes blink{50%{opacity:0}}
</style>
<h1><b>chat</b>jev</h1>
<div class="sub">no text generation — a dumb grammar enumerates candidates, Jev decides · ${VOCAB.length}-word vocab</div>
<div class="mode" id="mode"></div>
<div id="log"></div>
<div class="bar"><input id="inp" placeholder="say something…" autofocus><button id="go">send</button></div>
<script>
const MODE = new URLSearchParams(location.search).get("mode") || "enum";
document.getElementById("mode").innerHTML = MODE === "enum"
  ? 'mode: <b>enum</b> (grammar enumerates, jev picks) · <a href="?mode=struct">struct</a>'
  : 'mode: <b>struct</b> (plan→fill→verify→repair) · <a href="?">enum</a>';
const log = document.getElementById("log"), inp = document.getElementById("inp"), go = document.getElementById("go");
function add(cls, html) { const m = document.createElement("div"); m.className = "msg " + cls; m.innerHTML = html; log.appendChild(m); m.scrollIntoView({block:"end"}); return m; }
const esc = (s) => s.replace(/</g,"&lt;");
async function send() {
  const msg = inp.value.trim(); if (!msg) return;
  inp.value = ""; go.disabled = true;
  add("user", esc(msg));
  const bot = add("bot", '<span class="cur"></span>');
  const stage = (t) => bot.insertAdjacentHTML("beforeend", '<div class="grp">' + t + "</div>");
  let t0 = Date.now(), cands = null;
  const es = new EventSource("/api/chat?mode=" + MODE + "&msg=" + encodeURIComponent(msg));
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    const cur = bot.querySelector(".cur");
    if (ev.e === "enum") {
      stage("enumerating " + ev.k + " candidate sentences — grammar only, zero intelligence");
      cands = document.createElement("div");
      bot.insertBefore(cands, cur);
    } else if (ev.e === "cands") {
      if (cands) cands.innerHTML = ev.list.map((c) => '<div class="cand" data-s="' + esc(c.s) + '"><b>' + (c.p * 100).toFixed(0) + "%</b>  " + esc(c.s) + "</div>").join("");
      bot.scrollIntoView({block:"end"});
    } else if (ev.e === "pick") {
      if (cands) { const el = cands.querySelector('[data-s="' + CSS.escape(ev.s) + '"]'); if (el) el.className = "cand hit"; }
      cur.insertAdjacentHTML("beforebegin", '<span class="w" title="picked · p=' + (ev.p != null ? ev.p.toFixed(2) : "?") + '">' + esc(ev.s) + " </span>");
    } else if (ev.e === "resample") {
      if (cands) cands.innerHTML = "";
      stage("verify failed — resampling a fresh candidate pool");
    } else if (ev.e === "plan") {
      stage("plan → '" + esc(ev.name) + "' sentence");
    } else if (ev.e === "slot") {
      cur.insertAdjacentHTML("beforebegin", '<span class="grp">[' + ev.g + "] </span>");
    } else if (ev.e === "word") {
      const oldEl = bot.querySelector('.w[data-i="' + ev.i + '"]');
      const html = '<span class="w" data-i="' + ev.i + '" title="' + ev.g + (ev.p != null ? " · p=" + ev.p.toFixed(2) : "") + '">' + esc(ev.w) + " </span>";
      if (oldEl) oldEl.outerHTML = html; else cur.insertAdjacentHTML("beforebegin", html);
    } else if (ev.e === "verify") {
      stage(ev.ok >= 0.5 ? "verify ✓ " + ev.ok.toFixed(2) : "verify ✗ score " + ev.ok.toFixed(2));
    } else if (ev.e === "repair") {
      const el = bot.querySelector('.w[data-i="' + ev.i + '"]');
      if (el) el.style.cssText += ";color:#ff6b8a;text-decoration:line-through";
      stage("repair → slot " + ev.i + " '" + esc(ev.old) + "' was wrong");
    } else if (ev.e === "revert") {
      const el = bot.querySelector('.w[data-i="' + ev.i + '"]');
      if (el) { el.style.cssText = ""; el.textContent = ev.w + " "; }
      stage("revert → kept '" + esc(ev.w) + "', swap made it worse");
    } else if (ev.e === "stats") {
      es.close();
      cur.remove();
      const dt = (Date.now() - t0) / 1000;
      bot.insertAdjacentHTML("beforeend",
        '<div class="meta">' + (MODE === "enum" ? "picked from enumerated candidates · " : ev.words + " words · ") + dt.toFixed(1) + "s" +
        " · " + ev.inTok.toLocaleString() + " in / " + ev.outTok.toLocaleString() + " out tok · est $" + (ev.inTok*0.042/1e6).toFixed(4) +
        " · final verify " + (ev.ok != null ? ev.ok.toFixed(2) : "?") + "</div>");
      go.disabled = false; inp.focus();
    } else if (ev.e === "error") {
      es.close(); cur.remove(); stage("error: " + esc(ev.m)); go.disabled = false;
    }
  };
  es.onerror = () => { es.close(); bot.querySelector(".cur")?.remove(); go.disabled = false; };
}
go.onclick = send;
inp.onkeydown = (e) => { if (e.key === "Enter") send(); };
</script>`;

const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }
  if (u.pathname === "/api/chat") {
    const msg = (u.searchParams.get("msg") || "").slice(0, 500);
    const mode = u.searchParams.get("mode") || "enum";
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const send = (o) => res.write("data: " + JSON.stringify(o) + "\n\n");
    try {
      await (mode === "struct" ? structuredReply : enumerateReply)(d, msg, { onEvent: send });
    } catch (e) {
      send({ e: "error", m: e.message.slice(0, 200) });
    }
    res.end();
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => console.log(`chatjev → http://localhost:${PORT}`));
