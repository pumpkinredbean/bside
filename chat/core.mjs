/**
 * Shared ChatJev logic — every reply word is one jev `choice` decision
 * over a bounded vocabulary, sampled from the model's probability
 * distribution (softmax + temperature + repetition penalty).
 */
import { VOCAB, GROUPS, CRITERIA, GROUP_CRITERIA } from "./vocab.mjs";
import { SKELETONS, SKELETON_CRITERIA, END_PUNCT } from "./skeletons.mjs";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";

export function createDecider(token) {
  async function jev(state, questions) {
    const res = await fetch(JEV_URL, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "jev-latest", state, questions }),
    });
    if (!res.ok) throw new Error("jev " + res.status + ": " + (await res.text()).slice(0, 200));
    return res.json();
  }

  const d = { jev, chunked: null };
  d.nextWord = async (user, draft, onEvent = () => {}) => {
    const state = {
      role: "You are ChatJev. Every word of your reply is decided individually from a fixed vocabulary — answer in one complete, natural sentence. Do not attempt words outside the vocabulary.",
      user_message: user,
      reply_so_far: draft || "(nothing yet)",
    };
    const q = {
      type: "choice",
      instructions: "Pick the next word so the reply stays grammatically correct and natural. Read reply_so_far — the next word must continue it without breaking grammar. Choose <end> only once the sentence is complete.",
    };
    if (d.chunked !== true) {
      try {
        const r = await jev(state, { next_word: { ...q, criteria: CRITERIA } });
        d.chunked = false;
        return { ans: r.answers.next_word, usage: r.usage || {} };
      } catch {
        d.chunked = true;
        onEvent({ e: "chunked" });
      }
    }
    const r1 = await jev(state, {
      group: { ...q, instructions: "Which word group most likely contains the best next word?", criteria: GROUP_CRITERIA },
    });
    const g = r1.answers.group.choice;
    onEvent({ e: "group", g });
    const words = GROUPS[g] ? GROUPS[g].trim().split(/\s+/) : VOCAB;
    const crit = Object.fromEntries(words.map((w) => [w, null]));
    const r2 = await jev(state, { next_word: { ...q, criteria: crit } });
    const usage = {
      input_tokens: (r1.usage?.input_tokens || 0) + (r2.usage?.input_tokens || 0),
      output_tokens: (r1.usage?.output_tokens || 0) + (r2.usage?.output_tokens || 0),
    };
    return { ans: r2.answers.next_word, usage };
  };
  return d;
}

export function sample(probs, temp, repPenalty, used = {}, last = null) {
  let entries = Object.entries(probs).filter(([w, p]) => p > 0 && w !== last);
  if (!entries.length) entries = Object.entries(probs).filter(([, p]) => p > 0);
  if (!entries.length) return null;
  entries = entries.map(([w, p]) => [w, p * Math.pow(repPenalty, used[w] || 0)]);
  const logits = entries.map(([w, p]) => [w, Math.log(p + 1e-9) / Math.max(0.05, temp)]);
  const mx = Math.max(...logits.map(([, l]) => l));
  const exps = logits.map(([w, l]) => [w, Math.exp(l - mx)]);
  const sum = exps.reduce((a, [, e]) => a + e, 0);
  let r = Math.random() * sum;
  for (const [w, e] of exps) { r -= e; if (r <= 0) return w; }
  return exps[exps.length - 1][0];
}

export function render(words) {
  let s = words.join(" ");
  s = s.replace(/ ([.,!?;:])/g, "$1").replace(/ n't/g, "n't").replace(/ '(s|re|ll|d)/g, "'$1");
  s = s.replace(/(^\w)|([.!?]\s+\w)/g, (m) => m.toUpperCase());
  return s.replace(/\bi\b/g, "I");
}

const pick = (arr, rng) => arr[(rng() * arr.length) | 0];
const shuffle = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/**
 * Enumeration-based generation — the faithful analog of the browser pilot:
 * a dumb grammar mechanically enumerates complete candidate sentences (the
 * "DOM of language"), Jev only decides which one is the reply. One choice +
 * one noul verify per attempt; resamples a fresh pool on failure.
 */
// Morphology for the enumerator — a grammar should only emit grammatical
// candidates, the same way the DOM only lists real clickable elements.
const VLIST = GROUPS.verb.trim().split(/\s+/);
const VSET = new Set(VLIST);
const ING = VLIST.filter((w) => w.endsWith("ing"));
const SFORM = VLIST.filter((w) => /(es|s)$/.test(w) && w.length > 2 &&
  (VSET.has(w.slice(0, -1)) || VSET.has(w.slice(0, -2)) ||
   (w.endsWith("ies") && VSET.has(w.slice(0, -3) + "y"))));
const PAST_ONLY = new Set("went came got made took saw knew thought said told gave found ran built wrote felt kept spent chose chosen".split(" "));
const ED = VLIST.filter((w) => w.endsWith("ed") &&
  (VSET.has(w.slice(0, -2)) || VSET.has(w.slice(0, -1)) || VSET.has(w.slice(0, -3)) ||
   (w.endsWith("ied") && VSET.has(w.slice(0, -3) + "y"))));
const BASEV = VLIST.filter((w) => !ING.includes(w) && !SFORM.includes(w) && !ED.includes(w) && !PAST_ONLY.has(w));
const SG = new Set(["it", "he", "she"]);
const BARE_MODAL = new Set("do does did will would can could shall should may might must".split(" "));
const BE_FORMS = new Set("am is are was were be been being".split(" "));
const AUX_I = "am do did will can could should must was".split(" ");
const AUX_PL = "are do did will can could should must were".split(" ");
const AUX_SG = "is does did will can could should must was".split(" ");
const BE_PL = ["are", "were"], BE_I = ["am", "was"], BE_SG = ["is", "was"];
const DEGREE = "very too so really pretty quite almost nearly just still even literally basically simply mostly".split(" ");
const MIDADV = "always never often sometimes usually really just still already also even probably maybe actually literally basically simply".split(" ");
const OPENERS = "yes actually maybe probably really just also still always often sometimes usually indeed basically simply".split(" ");
const PREP = "to for from by with about into over under in on at of like as via".split(" ");
const MASS = new Set("information data money research work code web internet speed latency power text".split(" "));
const singular = (n) => !n.endsWith("s") && !MASS.has(n) && n !== "people";

export function enumeratePool(userMsg, K, rng = Math.random) {
  const echo = [...new Set(
    userMsg.toLowerCase().replace(/[^a-z'-]+/g, " ").split(/\s+/)
      .filter((w) => w.length > 2 && VOCAB.includes(w)),
  )];
  const CONTENT = new Set(["noun", "verb", "adjective", "adverb", "tech"]);
  const m = userMsg.toLowerCase();
  const subject = () => (/\byou(r|rs)?\b/.test(m) ? (rng() < 0.8 ? "i" : "we")
    : /\b(i|me|my)\b/.test(m) ? "you"
    : pick(["i", "it", "we", "they"], rng));
  const skNames = shuffle(Object.keys(SKELETONS), rng);
  const pool = new Set();
  for (let si = 0; pool.size < K && si < skNames.length * 6; si++) {
    const name = skNames[si % skNames.length];
    const words = [];
    let subj = null, aux = null;
    let adjIdx = -1;
    for (const slot of SKELETONS[name]) {
      if (slot.w) {
        words.push(slot.w);
        if (slot.w === "it" || slot.w === "there") subj = "it";
        if (slot.w === "because") aux = null;
        continue;
      }
      const hint = slot.h || "";
      let w;
      if (slot.g === "pronoun") w = subj = subj && rng() < 0.5 ? subj : subject();
      else if (slot.g === "aux") {
        const list = hint === "be-verb"
          ? (SG.has(subj) ? BE_SG : subj === "i" ? BE_I : BE_PL)
          : (SG.has(subj) ? AUX_SG : subj === "i" ? AUX_I : AUX_PL);
        w = aux = pick(list, rng);
      } else if (slot.g === "verb") {
        const list = hint.includes("infinitive") || (aux && BARE_MODAL.has(aux)) ? BASEV
          : aux && BE_FORMS.has(aux) ? ING
          : aux ? BASEV
          : SG.has(subj) ? SFORM : BASEV;
        w = pick(list, rng);
      } else if (slot.g === "adverb") {
        w = pick(hint.includes("degree") ? DEGREE : hint.includes("opener") ? OPENERS : MIDADV, rng);
      } else if (slot.g === "function") w = pick(PREP, rng);
      else {
        let list = (GROUPS[slot.g] || "").trim().split(/\s+/);
        if (slot.g === "adjective") list = list.filter((x) => x !== "own");
        if (hint.includes("identity")) list = [...new Set([...list.filter((x) => !x.endsWith("s") && x !== "people"), "chatbot", "ai", "jev", "llm"])];
        const echoable = CONTENT.has(slot.g) ? echo.filter((e) => list.includes(e)) : [];
        w = echoable.length && rng() < 0.45 ? pick(echoable, rng) : pick(list, rng);
      }
      if (slot.g === "adjective" && hint.includes("modifier")) adjIdx = words.length;
      if (slot.g === "noun" && /object|thing|noun/.test(hint) && singular(w) && !/^(jev|typesafe|aside|bside|gpt)$/.test(w)) {
        const head = adjIdx === words.length - 1 ? words[adjIdx] : w;
        const an = /^[aeio]/.test(head) || (/^u/.test(head) && !/^(user|useful)/.test(head)) || /^(hour|honest|llm)/.test(head);
        words.splice(adjIdx === words.length - 1 ? adjIdx : words.length, 0, an ? "an" : "a");
      }
      words.push(w);
    }
    if (words[0] === "there" && /^(is|was)$/.test(words[1])) {
      const last = words[words.length - 1];
      if (last.endsWith("s") || last === "people") words[1] = words[1] === "is" ? "are" : "were";
    }
    words.push(".");
    pool.add(render(words));
  }
  return [...pool];
}

export async function enumerateReply(d, userMsg, { K = 24, maxAttempts = 3, onEvent = () => {} } = {}) {
  let inTok = 0, outTok = 0;
  const bill = (u) => { inTok += u?.input_tokens || 0; outTok += u?.output_tokens || 0; };
  const base = {
    role: "You are ChatJev. Candidate replies are mechanically enumerated by a grammar — your job is only to decide which one is the best reply.",
    user_message: userMsg,
  };
  const failed = new Set();
  let lastPick = "";

  for (let att = 0; att < maxAttempts; att++) {
    if (att) onEvent({ e: "resample", att });
    const pool = enumeratePool(userMsg, K).filter((s) => !failed.has(s));
    onEvent({ e: "enum", k: pool.length });
    const r = await d.jev(base, {
      reply: {
        type: "choice",
        instructions: "Which candidate is the best reply to the user message? Judge relevance first, then grammar — pick one candidate exactly as written.",
        criteria: Object.fromEntries(pool.map((s) => [s, null])),
      },
    });
    bill(r.usage);
    const probs = r.answers.reply.probabilities || {};
    const ranked = pool.map((s) => ({ s, p: probs[s] ?? 0 })).sort((a, b) => b.p - a.p);
    onEvent({ e: "cands", list: ranked.slice(0, 12) });
    const sentence = pool.includes(r.answers.reply.choice) ? r.answers.reply.choice : ranked[0].s;
    lastPick = sentence;
    onEvent({ e: "pick", s: sentence, p: probs[sentence] ?? 0 });

    const rv = await d.jev({ ...base, candidate: sentence }, {
      ok: {
        type: "noul",
        instructions: `Is "${sentence}" a grammatical English sentence that appropriately answers the user message? Judge whether it addresses what the user asked — not factual accuracy.`,
        criteria: { true: "appropriate reply", false: "wrong or inappropriate reply" },
      },
    });
    bill(rv.usage);
    const ok = rv.answers.ok?.noul ?? 0.5;
    onEvent({ e: "verify", ok });
    if (ok >= 0.5) {
      onEvent({ e: "stats", words: sentence.split(/\s+/).length, inTok, outTok, text: sentence, ok });
      return { text: sentence, inTok, outTok, ok };
    }
    failed.add(sentence);
  }

  onEvent({ e: "stats", words: lastPick.split(/\s+/).length, inTok, outTok, text: lastPick, ok: 0 });
  return { text: lastPick, inTok, outTok, ok: 0 };
}

/**
 * Structured generation — multi-stage decisions instead of word-by-word:
 *   plan   pick a sentence skeleton (choice over slot patterns)
 *   fill   each open slot is a choice inside its vocab group
 *   verify noul: is the assembled sentence complete & grammatical?
 *   repair locate the broken slot (choice) and re-decide it, up to 2x
 * Same observe→decide→verify loop as the browser pilot, applied to syntax.
 */
export async function structuredReply(d, userMsg, { temp = 0.9, rep = 0.3, maxRepairs = 2, onEvent = () => {} } = {}) {
  let inTok = 0, outTok = 0;
  const bill = (u) => { inTok += u?.input_tokens || 0; outTok += u?.output_tokens || 0; };
  const base = {
    role: "You are ChatJev. Your reply is assembled word-by-word from a fixed vocabulary using staged decisions — keep it one short, natural, grammatical sentence.",
    user_message: userMsg,
  };

  // 1. plan — which sentence pattern fits a reply to this message?
  const r0 = await d.jev(base, {
    skeleton: {
      type: "choice",
      instructions: "Pick the sentence pattern that best fits a short, natural reply to the user message.",
      criteria: SKELETON_CRITERIA,
    },
  });
  bill(r0.usage);
  const skName = r0.answers.skeleton.choice;
  const slots = [...(SKELETONS[skName] || SKELETONS["S + aux + adj"]), { g: "end" }];
  onEvent({ e: "plan", name: skName });

  // 2. fill — one choice per open slot, inside that slot's group only
  const words = [], used = {}, slotGroups = [];
  const fill = async (i, ban = null) => {
    const g = slots[i].g;
    const crit = g === "end" ? { ...END_PUNCT } : Object.fromEntries((GROUPS[g] || "").trim().split(/\s+/).filter((w) => w !== ban).map((w) => [w, null]));
    const r = await d.jev({ ...base, pattern: skName, reply_so_far: render(words.slice(0, i)) || "(nothing yet)", slot: slots[i].h || g }, {
      word: {
        type: "choice",
        instructions: `For the ${slots[i].h || g} slot of a "${skName}" reply, pick the word that keeps the sentence grammatical and answers the user naturally.`,
        criteria: crit,
      },
    });
    bill(r.usage);
    const probs = r.answers.word.probabilities || {};
    const w = g === "end"
      ? r.answers.word.choice
      : (sample(probs, temp, rep, used, words[i - 1]) ?? r.answers.word.choice);
    if (g !== "end") used[w] = (used[w] || 0) + 1;
    words[i] = w;
    slotGroups[i] = g;
    onEvent({ e: "word", w, i, g, p: probs[w] ?? r.answers.word.confidence ?? 0 });
    return w;
  };

  for (let i = 0; i < slots.length; i++) {
    if (slots[i].w) { words[i] = slots[i].w; slotGroups[i] = "fixed"; onEvent({ e: "word", w: slots[i].w, i, g: "fixed" }); continue; }
    onEvent({ e: "slot", i, g: slots[i].g });
    await fill(i);
  }

  // 3. verify — noul judge on the assembled sentence
  const verify = async () => {
    const sentence = render(words);
    const rv = await d.jev({ ...base, assembled_sentence: sentence }, {
      ok: {
        type: "noul",
        instructions: `Is "${sentence}" a complete, grammatical English sentence that naturally answers the user message? Judge grammar and completeness only — not factual accuracy.`,
        criteria: { true: "complete and grammatical", false: "broken grammar or incomplete" },
      },
    });
    bill(rv.usage);
    return rv.answers.ok?.noul ?? 0.5;
  };

  let ok = await verify();
  onEvent({ e: "verify", ok });

  // 4. repair — locate the broken slot, re-decide it (old word banned),
  //    re-verify; roll back if the swap made things worse
  for (let rp = 0; ok < 0.5 && rp < maxRepairs; rp++) {
    const crit = {};
    words.forEach((w, i) => { if (slotGroups[i] !== "fixed" && slotGroups[i] !== "end") crit[i] = `'${w}' (${slotGroups[i]} slot)`; });
    const rb = await d.jev({ ...base, assembled_sentence: render(words) }, {
      bad_slot: {
        type: "choice",
        instructions: `The sentence "${render(words)}" is ungrammatical or incomplete. Which word position is most responsible?`,
        criteria: crit,
      },
    });
    bill(rb.usage);
    const bi = +rb.answers.bad_slot.choice;
    if (Number.isNaN(bi) || !crit[bi]) break;
    const old = words[bi];
    onEvent({ e: "repair", i: bi, old });
    await fill(bi, old);
    const prev = ok;
    ok = await verify();
    onEvent({ e: "verify", ok });
    if (ok < prev) { words[bi] = old; onEvent({ e: "revert", i: bi, w: old }); break; }
  }

  onEvent({ e: "stats", words: words.length, inTok, outTok, text: render(words), ok });
  return { text: render(words), words, inTok, outTok, ok };
}
