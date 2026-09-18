#!/usr/bin/env node
/**
 * chatjev — a chat demo for a decision-only model.
 * Jev never generates text, so every word of the reply is an individual
 * `choice` decision over a bounded vocabulary (~500 words). The answer's
 * probability distribution is sampled with a temperature, exactly like
 * next-token sampling in an LLM.
 *
 * usage: node chat/chatjev.mjs ["first message"] [--temp 0.9] [--max 40]
 *        (no message → interactive REPL)
 */
import { createInterface } from "node:readline";
import { resolveTypesafeToken } from "../src/pilot.js";
import { createDecider, sample, render, structuredReply } from "./core.mjs";
import { VOCAB } from "./vocab.mjs";

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? +args[i + 1] : d;
};
const TEMP = flag("--temp", 0.9);
const MAX_WORDS = flag("--max", 40);
const REP_PENALTY = flag("--rep", 0.3); // prob multiplier per prior use
const STRUCT = args.includes("--struct");
const FLAGS = new Set(["--temp", "--max", "--rep", "--struct"]);
const firstMsg = args.filter((a, i) => !FLAGS.has(a) && !FLAGS.has(args[i - 1])).join(" ");

const d = createDecider(await resolveTypesafeToken());

async function reply(userMsg) {
  if (STRUCT) {
    const t0 = Date.now();
    process.stdout.write("\x1b[36mchatjev>\x1b[0m ");
    const dim = (s) => process.stdout.write("\x1b[2m" + s + "\x1b[0m\n");
    const r = await structuredReply(d, userMsg, { temp: TEMP, rep: REP_PENALTY, onEvent: (e) => {
      if (e.e === "plan") dim("plan → " + e.name);
      else if (e.e === "word") process.stdout.write(e.w + " ");
      else if (e.e === "verify") dim("\nverify " + (e.ok >= 0.5 ? "✓" : "✗") + " " + e.ok.toFixed(2));
      else if (e.e === "repair") dim("repair → '" + e.old + "' wrong; ");
      else if (e.e === "revert") dim("revert → kept '" + e.w + "'");
    } });
    const dt = (Date.now() - t0) / 1000;
    process.stdout.write(`\n\x1b[1m→ ${r.text}\x1b[0m\n\x1b[2m${r.words.length} words · ${dt.toFixed(1)}s · ${r.inTok.toLocaleString()} in / ${r.outTok.toLocaleString()} out tok · est $${(r.inTok * 0.042 / 1e6).toFixed(4)}\x1b[0m\n`);
    return r.text;
  }
  const words = [];
  const used = {};
  let inTok = 0, outTok = 0;
  const t0 = Date.now();
  process.stdout.write("\x1b[36mchatjev>\x1b[0m ");
  for (let i = 0; i < MAX_WORDS; i++) {
    const { ans, usage } = await d.nextWord(userMsg, words.join(" "));
    inTok += usage.input_tokens || 0;
    outTok += usage.output_tokens || 0;
    const w = sample(ans.probabilities || {}, TEMP, REP_PENALTY, used, words[words.length - 1]) ?? ans.choice;
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
    ` · est $${(inTok * 0.042 / 1e6).toFixed(4)}${d.chunked ? " · two-pass" : ""}\x1b[0m\n`,
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
