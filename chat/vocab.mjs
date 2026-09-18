/**
 * ChatJev vocabulary — a bounded word list the model chooses from.
 * Grouped semantically so a two-pass fallback can first pick a group,
 * then a word inside it (same pattern as pilot.js region->target).
 */
export const GROUPS = {
  function: `the a an and or but if then than so because while when where how what who whom whose which that this these those there here not no yes also just only even still again very too more most less least much many some any all each every both other another same own such like as of in on at to for from by with about into over under between through during before after up down out off around above below against within without per via`,
  pronoun: `i me my mine you your yours it its we us our ours they them their theirs he him his she her hers one someone something anyone anything everyone everything nobody nothing`,
  aux: `is am are was were be been being have has had having do does did done will would can could shall should may might must`,
  verb: `go goes going went come comes coming came get gets getting got make makes making made take takes taking took see sees seeing saw know knows knowing knew think thinks thinking thought say says saying said tell tells telling told give gives giving gave find finds finding found use uses using used work works working worked want wants wanting wanted need needs needing needed try tries trying tried ask asks asking asked help helps helping helped run runs running ran build builds building built show shows showing showed learn learns learning learned change changes changing changed play plays playing played move moves moving moved open opens opening opened close closes closing closed start starts starting started stop stops stopping stopped keep keeps keeping kept let lets letting read reads reading write writes writing wrote look looks looking looked feel feels feeling felt seem seems seeming seemed happen happens happening happened cost costs costing spend spends spending spent choose chooses choosing chose chosen decide decides deciding decided answer answers answering answered click clicks clicking search searches searching searched replace replaces replacing replaced pick picks picking picked browse browses browsing browsed`,
  noun: `time way year people day man woman thing things world life hand part place work week case point company number group problem fact question money story example family state word words business issue home side kind head house service friend power hour game line end member law car city community name team minute idea body information back face level office door health person art history party result morning reason research moment teacher force education browser agents agent model models system decisions decision action actions page pages tab tabs web website internet code api data file files token tokens text sentence sentences language loop loops engine engines query queries cost costs price prices latency speed step steps task tasks goal goals user users human humans machine machines computer computers tool tools input inputs output outputs answer answers probability confidence schema type types choice choices button buttons link links element elements screenshot screenshots demo demos benchmark benchmarks race races community communities reply replies message messages`,
  adjective: `good new first last long great little own old right big high different small large next early important few public bad same able sure real best better free open closed full easy hard possible simple fast slow cheap expensive quick deep low strong whole clear main similar current recent available useful weird funny crazy insane nice cool honest`,
  adverb: `very too so just only even also still already always never often sometimes usually really actually probably maybe perhaps quite pretty almost nearly again once twice now then today tomorrow yesterday here there everywhere anywhere somewhere nowhere together alone instead anyway however therefore though yet indeed literally basically simply mostly exactly`,
  tech: `jev typesafe aside bside gpt llm ai chatbot repl github open-source opensource schema typed hallucination inference decision-only playwright mcp cli json api`,
  punct: `. , ! ? 's n't 're 'll 'd - : ; <end>`,
};

export const VOCAB = Object.values(GROUPS).flatMap((g) => g.trim().split(/\s+/));

export const CRITERIA = Object.fromEntries(VOCAB.map((w) => [w, null]));

export const GROUP_CRITERIA = Object.fromEntries(
  Object.entries(GROUPS).map(([name, words]) => [
    name,
    words.trim().split(/\s+/).slice(0, 6).join(" ") + " …",
  ]),
);
