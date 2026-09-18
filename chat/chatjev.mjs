#!/usr/bin/env node
/**
 * chatjev — a chat demo for a decision-only model.
 * Jev never generates text, so every word of the reply is an individual
 * `choice` decision over a bounded vocabulary (~500 words). The answer's
 * probability distribution is sampled with a temperature, exactly like
 * next-token sampling in an LLM.
 *
 * usage: node chat/chatjev.mjs ["first message"] [--temp 0.8] [--max 40]
 *        (no message → interactive REPL)
 */
import { createInterface } from "node:readline";
import { resolveTypesafeToken } from "../src/pilot.js";
import { VOCAB, GROUPS, CRITERIA, GROUP_CRITERIA } from "./vocab.mjs";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? +args[i + 1] : d;
};
const TEMP = flag("--temp", 0.9);
const MAX_WORDS = flag("--max", 40);
const REP_PENALTY = flag("--rep", 0.3); // prob multiplier per prior use
const FLAGS = new Set(["--temp", "--max", "--rep"]);
const firstMsg = args.filter((a, i) => !FLAGS.has(a) && !FLAGS.has(args[i - 1])).join(" ");

const TOK = await resolveTypesafeToken();

async function jev(state, questions) {
  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOK, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
  });
  if (!res.ok) throw new Error("jev " + res.status + ": " + (await res.text()).slice(0, 200));
  return res.json();
}

// softmax sampling over jev's probability distribution, like next-token
// sampling — with a repetition penalty so already-used words decay
function sample(probs, temp, used = {}, last = null) {
  let entries = Object.entries(probs).filter(([w, p]) => p > 0 && w !== last);
  if (!entries.length) entries = Object.entries(probs).filter(([, p]) => p > 0);
  if (!entries.length) return null;
  entries = entries.map(([w, p]) => [w, p * Math.pow(REP_PENALTY, used[w] || 0)]);
  const logits = entries.map(([w, p]) => [w, Math.log(p + 1e-9) / Math.max(0.05, temp)]);
  const mx = Math.max(...logits.map(([, l]) => l));
  const exps = logits.map(([w, l]) => [w, Math.exp(l - mx)]);
  const sum = exps.reduce((a, [, e]) => a + e, 0);
  let r = Math.random() * sum;
  for (const [w, e] of exps) { r -= e; if (r <= 0) return w; }
  return exps[exps.length - 1][0];
}

const stateFor = (user, draft) => ({
  role: "You are ChatJev. Every word of your reply is decided individually from a fixed vocabulary — answer in one complete, natural sentence. Do not attempt words outside the vocabulary.",
  user_message: user,
  reply_so_far: draft || "(nothing yet)",
});

// two-pass fallback for providers that cap criteria size: group -> word
let chunked = null; // null = undecided
async function nextWord(user, draft) {
  const q = {
    type: "choice",
    instructions: "Pick the next word so the reply stays grammatically correct and natural. Read reply_so_far — the next word must continue it without breaking grammar. Choose <end> only once the sentence is complete.",
  };
  if (chunked !== true) {
    try {
      const r = await jev(stateFor(user, draft), { next_word: { ...q, criteria: CRITERIA } });
      chunked = false;
      return { r, ans: r.answers.next_word };
    } catch (e) {
      chunked = true;
    }
  }
  const r1 = await jev(stateFor(user, draft), {
    group: { ...q, instructions: "Which word group most likely contains the best next word?", criteria: GROUP_CRITERIA },
  });
  const g = r1.answers.group.choice;
  const words = GROUPS[g] ? GROUPS[g].trim().split(/\s+/) : VOCAB;
  const crit = Object.fromEntries(words.map((w) => [w, null]));
  const r2 = await jev(stateFor(user, draft), { next_word: { ...q, criteria: crit } });
  const usage = {
    input_tokens: (r1.usage?.input_tokens || 0) + (r2.usage?.input_tokens || 0),
    output_tokens: (r1.usage?.output_tokens || 0) + (r2.usage?.output_tokens || 0),
  };
  return { r: r2, ans: r2.answers.next_word, usage };
}

function render(words) {
  let s = words.join(" ");
  s = s.replace(/ ([.,!?;:])/g, "$1").replace(/ n't/g, "n't").replace(/ '(s|re|ll|d)/g, "'$1");
  s = s.replace(/(^\w)|([.!?]\s+\w)/g, (m) => m.toUpperCase());
  return s.replace(/\bi\b/g, "I");
}

async function reply(userMsg) {
  const words = [];
  const used = {};
  let inTok = 0, outTok = 0;
  const t0 = Date.now();
  process.stdout.write("\x1b[36mchatjev>\x1b[0m ");
  for (let i = 0; i < MAX_WORDS; i++) {
    const { r, ans, usage } = await nextWord(userMsg, words.join(" "));
    const u = usage || r.usage || {};
    inTok += u.input_tokens || 0;
    outTok += u.output_tokens || 0;
    const probs = ans.probabilities || {};
    const w = sample(probs, TEMP, used, words[words.length - 1]) ?? ans.choice;
    if (!w || w === "<end>") break;
    words.push(w);
    used[w] = (used[w] || 0) + 1;
    process.stdout.write(w + " ");
  }
  const dt = (Date.now() - t0) / 1000;
  const out = render(words);
  process.stdout.write(
    `\n\x1b[1m→ ${out}\x1b[0m\n` +
    `\x1b[2m${words.length} words · ${dt.toFixed(1)}s · ${(dt / Math.max(1, words.length)).toFixed(2)}s/word` +
    ` · ${inTok.toLocaleString()} in / ${outTok.toLocaleString()} out tok` +
    ` · est $${(inTok * 0.042 / 1e6).toFixed(4)}${chunked ? " · two-pass" : ""}\x1b[0m\n`,
  );
  return out;
}

if (firstMsg) {
  await reply(firstMsg);
} else {
  console.log(`\x1b[2mchatjev — every word is a jev decision · vocab ${VOCAB.length} · temp ${TEMP} · ctrl-c to quit\x1b[0m`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => rl.question("\x1b[32myou>\x1b[0m ", async (msg) => {
    if (msg.trim()) await reply(msg.trim());
    ask();
  });
  ask();
}
