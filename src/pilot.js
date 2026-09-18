import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export async function resolveTypesafeToken() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  return (await readFile(join(homedir(), ".config/typesafe/api-key"), "utf8")).trim();
}

/**
 * LLM engine config — any OpenAI Responses-compatible endpoint.
 * task fields override env vars: llmUrl / BSIDE_LLM_URL,
 * llmToken / BSIDE_LLM_API_KEY (or OPENAI_API_KEY), model / BSIDE_LLM_MODEL.
 */
export function resolveLlmConfig(task = {}) {
  const url = task.llmUrl ?? process.env.BSIDE_LLM_URL ?? "https://api.openai.com/v1/responses";
  const token = task.llmToken ?? process.env.BSIDE_LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  const model = task.model ?? process.env.BSIDE_LLM_MODEL;
  if (!model) throw new Error("engine=llm needs a model: pass task.model or set BSIDE_LLM_MODEL");
  if (!token) throw new Error("engine=llm needs an API key: set BSIDE_LLM_API_KEY or OPENAI_API_KEY");
  return { url, token, model };
}

/**
 * Build the self-contained REPL program: observe via snapshot() -> typed
 * decision (Jev or a chat LLM) -> execute via Playwright locators.
 * Runs entirely inside one `aside repl` call; session tabs die on exit.
 */
export function buildPilotCode(task, { jevToken, llm } = {}) {
  return String.raw`
var TASK = ${JSON.stringify(task)};
var JEV_TOK = ${JSON.stringify(jevToken ?? "")};
var LLM_TOK = ${JSON.stringify(llm?.token ?? "")};
var JEV_URL = "https://api.typesafe.ai/v1/systemone";
var LLM_URL = ${JSON.stringify(llm?.url ?? "")};
var CONF_FLOOR = 0.35;
var MAX_ELEMENTS = 80;

function els(tree) {
  var out = [], seen = {};
  var lines = tree.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/\[ref=([a-z0-9]+)\]/i);
    if (!m || seen[m[1]]) continue;
    seen[m[1]] = 1;
    var desc = lines[i].replace(/\[ref=[a-z0-9]+\]/i, "").replace(/^\s*-\s*/, "").trim().slice(0, 140);
    out.push({ ref: m[1], desc: desc });
    if (out.length >= MAX_ELEMENTS) break;
  }
  return out;
}

async function jev(state, questions) {
  var res = await fetch(JEV_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + JEV_TOK, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state: state, questions: questions }),
  });
  if (!res.ok) throw new Error("jev " + res.status + ": " + (await res.text()).slice(0, 300));
  return await res.json();
}

var LLM_SYS = "You pilot a web browser. Given the state JSON, return STRICT JSON only (no markdown fences): " +
  "{\"action\":\"<one of available_actions>\",\"ref\":\"<element ref or empty>\",\"arg\":\"<string or empty>\",\"done\":true|false,\"reason\":\"<10 words>\"}. " +
  "'click'/'type' need ref from interactive_elements; 'type' arg must be one of candidates.inputs; 'navigate' arg must be one of candidates.urls; " +
  "action=done only when the goal is fully achieved considering action_history; 'escalate' if impossible. Never invent refs, urls, or values.";

function llmExtract(j) {
  var out = (j.output || []);
  for (var i = 0; i < out.length; i++) {
    var c = out[i].content || [];
    for (var k = 0; k < c.length; k++) if (c[k].type === "output_text" && c[k].text) return c[k].text;
  }
  if (typeof j.output_text === "string") return j.output_text;
  throw new Error("llm: no output_text in response");
}

async function llm(state) {
  var res = await fetch(LLM_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + LLM_TOK, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TASK.model,
      instructions: LLM_SYS,
      input: JSON.stringify(state),
    }),
  });
  if (!res.ok) throw new Error("llm " + res.status + ": " + (await res.text()).slice(0, 300));
  var j = await res.json();
  var txt = llmExtract(j).trim();
  var i0 = txt.indexOf("{"), i1 = txt.lastIndexOf("}");
  if (i0 < 0 || i1 <= i0) throw new Error("llm: no JSON object in output: " + txt.slice(0, 200));
  return { decision: JSON.parse(txt.slice(i0, i1 + 1)), usage: j.usage || j.copilot_usage };
}

function __ev(e) { console.log("__EV__" + JSON.stringify(Object.assign({ t: Date.now() - __t0 }, e))); }

var __frames = [];
var __t0 = Date.now();
var __shotIv = null;
if (TASK.shots) {
  var __shotBusy = false;
  __shotIv = setInterval(async function () {
    if (__shotBusy || typeof page === "undefined" || !page) return;
    __shotBusy = true;
    try {
      var b = await page.screenshot({ type: "jpeg", quality: 60 });
      __frames.push([Date.now() - __t0, b.toString("base64")]);
    } catch (e) {}
    __shotBusy = false;
  }, 700);
}

if (TASK.targetId) { await attachBrowserTab(TASK.targetId); }
else if (TASK.mode === "active_tab") { await attachActiveBrowserTab(); }
else { await openTab("about:blank"); }
__ev({ e: "tab_ready" });

async function postOk() {
  var ok = true;
  if (TASK.doneUrlContains) ok = page.url().indexOf(TASK.doneUrlContains) >= 0;
  if (ok && TASK.doneEval) { try { ok = !!(await page.evaluate(TASK.doneEval)); } catch (e) { ok = false; } }
  return ok;
}
var hasPost = !!(TASK.doneUrlContains || TASK.doneEval);

var history = [];
var repeats = {};
var visited = {};
var fails = 0;
var lowConf = 0;
for (var tick = 0; tick < TASK.maxTicks; tick++) {
  __ev({ e: "snap_start" });
  var __st0 = Date.now();
  var s = await snapshot(page, { interactive: true });
  __ev({ e: "snap_end", ms: Date.now() - __st0 });
  var el = els(s.tree);
  visited[page.url().replace(/\/+$/, "")] = 1;
  var urlsAvail = TASK.urls.filter(function (u) { return !visited[u.replace(/\/+$/, "")]; });

  var action, ref, arg, gm = -1, bl = -1, conf = -1, tokIn = "?", engineMs;
  var urlOk = await postOk();
  var doneDesc = TASK.doneUrlContains ? "url contains " + TASK.doneUrlContains : "dom eval";

  var last = history[history.length - 1];
  var state = {
    goal: TASK.goal,
    page: { url: page.url(), title: await page.title() },
    last_action_effect: last ? { action: last.action, ref: last.ref, url_before: last.urlBefore, url_after: page.url() } : null,
    interactive_elements: el.length <= 300 ? el.map(function (e) { return e.ref + ": " + e.desc; }) : el.length + " interactive elements (see region question for grouped descriptions)",
    page_tree_excerpt: s.tree.slice(0, 12000),
    action_history: history.slice(-8),
    visited_urls: Object.keys(visited),
    candidates: { urls: urlsAvail, inputs: TASK.inputs },
  };

  var t0 = Date.now();
  if (TASK.engine === "llm") {
    var actionsL = ["click", "press_enter", "done", "escalate"];
    if (TASK.inputs.length) actionsL.push("type");
    if (urlsAvail.length) actionsL.push("navigate");
    state.available_actions = actionsL;
    __ev({ e: "call_start" });
    var rl = await llm(state);
    engineMs = Date.now() - t0;
    __ev({ e: "call_end", ms: engineMs, in: (rl.usage || {}).input_tokens || 0, out: (rl.usage || {}).output_tokens || 0 });
    var d = rl.decision;
    action = d.action; ref = d.ref || ""; arg = d.arg || undefined;
    tokIn = ((rl.usage || {}).input_tokens || (rl.usage || {}).total_tokens || "?");
    console.log("[tick " + tick + "] " + page.url().slice(0, 70) + " | action=" + action +
      " ref=" + (ref || "-") + " done=" + d.done + " | " + TASK.model + " " + engineMs + "ms tok=" + tokIn + " | " + (d.reason || ""));
    if (d.done || action === "done") {
      if (urlOk) { console.log("DONE " + (await page.title()) + " -- " + page.url()); break; }
      console.log("premature done — postcondition (" + doneDesc + ") not met; resnapshot");
      await sleep(1000); continue;
    }
    if (action === "escalate") { console.log("ESCALATE: " + (d.reason || "")); break; }
    if (actionsL.indexOf(action) < 0) { console.log("invalid action '" + action + "'; retry"); continue; }
    if (action === "click" || action === "type") {
      var okRef = false;
      for (var i = 0; i < el.length; i++) if (el[i].ref === ref) okRef = true;
      if (!okRef) { console.log("ref " + ref + " not in elements; retry"); continue; }
    }
  } else {
    var actions = {
      click: "Click an element (link, button, checkbox, tab)",
      press_enter: "Submit the currently focused form field",
      done: "The goal is already achieved; no further action needed",
      escalate: "Cannot progress with available actions (needs free text, login, captcha, or out-of-scope)",
    };
    if (TASK.inputs.length) actions.type = "Fill a text field with one of the candidate input values";
    if (urlsAvail.length) actions.navigate = "Navigate the tab to one of the candidate URLs";

    var questions = {
      action: {
        type: "choice",
        instructions: "Goal: " + TASK.goal + ". Given the current page and the steps already taken in action_history, what single next action moves toward the goal? If the required steps are already completed and the current page is the intended end state, choose done — do not repeat steps just because the goal text mentions them.",
        criteria: actions,
      },
      goal_met: {
        type: "noul",
        instructions: "You are driving a browser to accomplish: " + TASK.goal + ". Review action_history (steps already taken) and the current page url/title. Have all required steps been completed such that nothing remains to do? For a 'navigate/open page X' goal, being on page X after taking the steps counts as achieved even if the current page no longer mentions the original site.",
        criteria: { true: "Every required step completed; current page is the intended end state", false: "At least one required step remains" },
      },
      blocked: {
        type: "noul",
        instructions: "Is progress blocked by a captcha, login wall, paywall, or something outside the available actions?",
      },
    };
    var chunks = null;
    if (el.length) {
      if (el.length <= 120) {
        var crit = {};
        for (var i = 0; i < el.length; i++) crit[el[i].ref] = el[i].desc || el[i].ref;
        questions.target = {
          type: "choice",
          instructions: "If the next action is click or type, which element is the best target? Pick the most relevant element ref.",
          criteria: crit,
        };
      } else {
        chunks = [];
        for (var ci = 0; ci < el.length; ci += 60) chunks.push(el.slice(ci, ci + 60));
        var rc = {};
        chunks.forEach(function (c, gi) {
          rc["g" + gi] = c[0].desc.slice(0, 50) + " ... " + c[c.length - 1].desc.slice(0, 50) + " (" + c.length + " elements)";
        });
        questions.region = {
          type: "choice",
          instructions: "The page has " + el.length + " interactive elements, grouped in reading order. If the next action is click or type, which group most likely contains the right element?",
          criteria: rc,
        };
      }
    }
    if (TASK.inputs.length) {
      var ic = {}; for (var i = 0; i < TASK.inputs.length; i++) ic[TASK.inputs[i]] = null;
      questions.text_value = { type: "choice", instructions: "If the action is type, which candidate value should be entered?", criteria: ic };
    }
    if (urlsAvail.length) {
      var uc = {}; for (var i = 0; i < urlsAvail.length; i++) uc[urlsAvail[i]] = null;
      questions.dest_url = { type: "choice", instructions: "If the action is navigate, which URL should be opened?", criteria: uc };
    }

    __ev({ e: "call_start" });
    var r = await jev(state, questions);
    engineMs = Date.now() - t0;
    __ev({ e: "call_end", ms: engineMs, in: (r.usage || {}).input_tokens || 0, out: (r.usage || {}).output_tokens || 0 });
    var a = r.answers;
    action = a.action.choice;
    conf = a.action.confidence || 0;
    gm = (a.goal_met && a.goal_met.noul) || 0;
    bl = (a.blocked && a.blocked.noul) || 0;
    tokIn = ((r.usage || {}).input_tokens || "?");
    console.log("[tick " + tick + "] " + page.url().slice(0, 70) + " | action=" + action +
      " p=" + ((a.action.probabilities || {})[action] || 0).toFixed(2) +
      " conf=" + conf.toFixed(2) + " goal_met=" + gm.toFixed(2) + " blocked=" + bl.toFixed(2) +
      " | jev " + engineMs + "ms in_tok=" + tokIn);

    if (action === "done" || gm >= 0.5) {
      if (urlOk) { console.log("DONE (goal_met=" + gm.toFixed(2) + ") " + (await page.title()) + " -- " + page.url()); break; }
      console.log("premature done (gm=" + gm.toFixed(2) + ") — postcondition (" + doneDesc + ") not met; resnapshot");
      await sleep(1000); continue;
    }
    if (action === "escalate" || bl >= 0.8) { console.log("ESCALATE conf=" + conf.toFixed(2) + " blocked=" + bl.toFixed(2)); break; }
    if (conf < CONF_FLOOR) {
      lowConf++;
      if (lowConf >= 3) { console.log("LOW CONFIDENCE x" + lowConf + " — escalate"); break; }
      if (lowConf === 1) { console.log("low conf " + conf.toFixed(2) + " — transient, resnapshot"); await sleep(800); continue; }
      console.log("low conf " + conf.toFixed(2) + " — best-effort argmax step");
    } else lowConf = 0;

    if (chunks && (action === "click" || action === "type")) {
      var gi = parseInt((a.region && a.region.choice || "g0").slice(1)) || 0;
      var g = chunks[gi] || chunks[0];
      var tc = {}; for (var i = 0; i < g.length; i++) tc[g[i].ref] = g[i].desc || g[i].ref;
      var t2 = Date.now();
      __ev({ e: "call_start" });
      var r2 = await jev(state, { target: { type: "choice", instructions: "Which element is the best target to " + action + " for goal: " + TASK.goal + "?", criteria: tc } });
      __ev({ e: "call_end", ms: Date.now() - t2, in: (r2.usage || {}).input_tokens || 0, out: (r2.usage || {}).output_tokens || 0 });
      ref = r2.answers.target.choice;
      console.log("  [2nd-pass target in group " + gi + " → " + ref + " | jev " + (Date.now() - t2) + "ms]");
    } else {
      ref = a.target && a.target.choice;
    }
    arg = action === "type" ? (a.text_value && a.text_value.choice)
        : action === "navigate" ? (a.dest_url && a.dest_url.choice) : undefined;
    if ((action === "click" || action === "type") && !ref) { console.log("no target; stop"); break; }
  }

  var refDesc = "";
  if (ref) { for (var i = 0; i < el.length; i++) { if (el[i].ref === ref) { refDesc = el[i].desc; break; } } }

  var urlBefore = page.url();
  __ev({ e: "act_start" });
  try {
    if (action === "click") await page.locator(ref).click();
    else if (action === "type") await page.locator(ref).fill(arg);
    else if (action === "press_enter") await page.keyboard.press("Enter");
    else if (action === "navigate") await page.goto(arg);
  } catch (e) {
    __ev({ e: "act_end" });
    console.log("action failed (will retry with fresh snapshot): " + e.message.slice(0, 120));
    fails++;
    if (fails >= 3) { console.log("too many failures; stop"); break; }
    history.push({ tick: tick, action: action, ref: ref, element: refDesc, arg: arg, urlBefore: urlBefore, error: e.message.slice(0, 120) });
    continue;
  }
  fails = 0;
  __ev({ e: "act_end" });
  await sleep(1200);
  var postDone = false;
  if (hasPost) {
    for (var pi = 0; pi < 6; pi++) {
      if (await postOk()) { postDone = true; break; }
      await sleep(700);
    }
  }
  var key = action + ":" + (arg || ref || "");
  repeats[key] = (repeats[key] || 0) + 1;
  history.push({ tick: tick, action: action, ref: ref, element: refDesc, arg: arg, conf: conf, urlBefore: urlBefore });
  if (postDone) { console.log("DONE (postcondition verified) " + page.url()); break; }
  if (repeats[key] >= 2) { console.log("loop detected (" + key + "); stop"); break; }
}
if (__shotIv) { clearInterval(__shotIv); }
for (var fi = 0; fi < __frames.length; fi++) {
  console.log("__FRAME__" + __frames[fi][0] + "__" + __frames[fi][1]);
}
if (TASK.lingerMs) { console.log("lingering " + TASK.lingerMs + "ms so you can see the tab"); await sleep(TASK.lingerMs); }
console.log("__OUT__" + JSON.stringify({ ticks: history.length, history: history, url: page.url(), title: await page.title(), elapsedMs: Date.now() - __t0 }));
`;
}

export function normalizeTask(task) {
  return {
    engine: "jev",
    urls: [],
    inputs: [],
    mode: "new_tab",
    maxTicks: 10,
    shots: false,
    ...task,
  };
}

/** Run one bounded pilot loop. Returns { log, result, shots: {tick: base64} }. */
export async function runPilot(task, opts = {}) {
  const t = normalizeTask(task);
  if (!t.goal) throw new Error("task.goal is required");
  const jevToken = t.engine === "jev" ? (opts.jevToken ?? (await resolveTypesafeToken())) : undefined;
  const llm = t.engine === "llm" ? resolveLlmConfig({ ...t, ...opts.llm }) : undefined;
  if (llm) t.model = llm.model;
  const { stdout } = await execFileP("aside", ["repl", buildPilotCode(t, { jevToken, llm })], {
    timeout: opts.timeoutMs ?? 150_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const outLine = stdout.split("\n").find((l) => l.startsWith("__OUT__"));
  const result = outLine ? JSON.parse(outLine.slice(7)) : null;
  const shots = [];
  for (const l of stdout.split("\n")) {
    if (l.startsWith("__FRAME__")) {
      const rest = l.slice(9);
      const sep = rest.indexOf("__");
      shots.push({ t: +rest.slice(0, sep), b64: rest.slice(sep + 2) });
    }
  }
  const evs = [];
  for (const l of stdout.split("\n")) {
    if (l.startsWith("__EV__")) { try { evs.push(JSON.parse(l.slice(6))); } catch {} }
  }
  const log = stdout.replace(/^__FRAME__.*$/gm, "[frame]").replace(/^__EV__.*$/gm, "").trim();
  return { log, result, shots, evs };
}
