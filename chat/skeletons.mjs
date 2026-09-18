/**
 * Sentence skeletons for structured ChatJev generation.
 * Each slot is either {g:"<vocab group>"} — a word decided inside that
 * group — or {w:"<literal>"} — a fixed word. Final {g:"punct"} is the
 * sentence-ending mark (sub-choice of . ! ?).
 */
export const SKELETONS = {
  "S + V + O": [{ g: "pronoun", h: "subject" }, { g: "verb", h: "main verb" }, { g: "noun", h: "object" }],
  "S + V + prep + O": [{ g: "pronoun", h: "subject" }, { g: "verb", h: "main verb" }, { g: "function", h: "preposition" }, { g: "noun", h: "object" }],
  "S + aux + adj": [{ g: "pronoun", h: "subject" }, { g: "aux", h: "be-verb" }, { g: "adjective", h: "predicate adjective" }],
  "S + aux + N": [{ g: "pronoun", h: "subject" }, { g: "aux", h: "be-verb" }, { g: "noun", h: "identity noun" }],
  "S + aux + adj + N": [{ g: "pronoun", h: "subject" }, { g: "aux", h: "be-verb" }, { g: "adjective", h: "modifier" }, { g: "noun", h: "identity noun" }],
  "S + aux + adv + adj": [{ g: "pronoun", h: "subject" }, { g: "aux", h: "be-verb" }, { g: "adverb", h: "degree adverb" }, { g: "adjective", h: "predicate adjective" }],
  "S + aux + V": [{ g: "pronoun", h: "subject" }, { g: "aux", h: "auxiliary" }, { g: "verb", h: "main verb" }],
  "S + aux + V + O": [{ g: "pronoun", h: "subject" }, { g: "aux", h: "auxiliary" }, { g: "verb", h: "main verb" }, { g: "noun", h: "object" }],
  "S + aux + adv + V + O": [{ g: "pronoun", h: "subject" }, { g: "aux", h: "auxiliary" }, { g: "adverb", h: "adverb" }, { g: "verb", h: "main verb" }, { g: "noun", h: "object" }],
  "S + aux + V + prep + O": [{ g: "pronoun", h: "subject" }, { g: "aux", h: "auxiliary" }, { g: "verb", h: "main verb" }, { g: "function", h: "preposition" }, { g: "noun", h: "object" }],
  "S + V + adj + N": [{ g: "pronoun", h: "subject" }, { g: "verb", h: "main verb" }, { g: "adjective", h: "modifier" }, { g: "noun", h: "object noun" }],
  "S + aux + adj + and + adj": [{ g: "pronoun", h: "subject" }, { g: "aux", h: "be-verb" }, { g: "adjective", h: "first adjective" }, { w: "and" }, { g: "adjective", h: "second adjective" }],
  "S + aux + not + adj": [{ g: "pronoun", h: "subject" }, { g: "aux", h: "be-verb" }, { w: "not" }, { g: "adjective", h: "predicate adjective" }],
  "S + aux + not + V + O": [{ g: "pronoun", h: "subject" }, { g: "aux", h: "auxiliary" }, { w: "not" }, { g: "verb", h: "main verb" }, { g: "noun", h: "object" }],
  "it + aux + adj": [{ w: "it" }, { g: "aux", h: "be-verb" }, { g: "adjective", h: "predicate adjective" }],
  "it + aux + adj + to + V": [{ w: "it" }, { g: "aux", h: "be-verb" }, { g: "adjective", h: "predicate adjective" }, { w: "to" }, { g: "verb", h: "infinitive verb" }],
  "yes/no + S + aux + V": [{ g: "adverb", h: "opener like 'yes' or 'actually'" }, { g: "pronoun", h: "subject" }, { g: "aux", h: "auxiliary" }, { g: "verb", h: "main verb" }],
  "there + aux + O": [{ w: "there" }, { g: "aux", h: "be-verb" }, { g: "noun", h: "thing that exists" }],
  "S + aux + adj + because + S + V": [{ g: "pronoun", h: "subject" }, { g: "aux", h: "be-verb" }, { g: "adjective", h: "predicate adjective" }, { w: "because" }, { g: "pronoun", h: "subject" }, { g: "verb", h: "main verb" }],
};

export const SKELETON_CRITERIA = Object.fromEntries(
  Object.keys(SKELETONS).map((k) => [k, null]),
);

export const END_PUNCT = { ".": "statement", "!": "emphasis", "?": "question" };
