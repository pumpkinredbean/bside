#!/usr/bin/env node
/**
 * bench — run the same browsing task across engines (jev + LLM models),
 * capture per-tick screenshots, and emit a side-by-side player page.
 *
 * usage:
 *   node bench/run.mjs '{"goal":"...","urls":[...],"inputs":[...],"maxTicks":12}' \
 *     [--models gpt-x,gpt-y@1.25/10] [--only name,...]
 *
 * jev always runs. --models adds one llm-engine column per model; append
 * @<in>/<out> to set list-price ($/1M tokens) shown by the player.
 * Endpoint/key via BSIDE_LLM_URL + BSIDE_LLM_API_KEY; see README.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runPilot } from "../src/pilot.js";
import { writePlayer } from "./gen-player.mjs";

const BENCH = join(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const task = JSON.parse(argv[0] ?? "{}");
task.shots = true;
task.mode = "new_tab";

const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
// model spec: "name" or "name@<in-price>/<out-price>" ($/1M tokens)
const specs = (flag("--models") ?? process.env.BSIDE_BENCH_MODELS ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const engines = [
  { name: "jev", task: { engine: "jev" } },
  ...specs.map((s) => {
    const [name, price] = s.split("@");
    const [i, o] = (price ?? "").split("/").map(Number);
    return { name, price: price ? { i, o } : undefined, task: { engine: "llm", model: name } };
  }),
];
const only = flag("--only") ? new Set(flag("--only").split(",")) : null;
const toRun = only ? engines.filter((e) => only.has(e.name)) : engines;

const results = [];
for (const e of toRun) {
  console.log(`\n=== ${e.name} ===`);
  const t0 = Date.now();
  try {
    const { log, result, shots, evs } = await runPilot({ ...task, ...e.task });
    const wall = Date.now() - t0;
    console.log(log);
    const decMs = [...log.matchAll(/\| \S+ (\d+)ms/g)].map((m) => +m[1]);
    const decAvg = decMs.length ? Math.round(decMs.reduce((a, b) => a + b) / decMs.length) : null;
    const dir = join(BENCH, "frames", e.name);
    await mkdir(dir, { recursive: true });
    const manifest = shots.map((f, i) => ({ t: f.t, file: `f${String(i).padStart(3, "0")}.jpg` }));
    for (let i = 0; i < shots.length; i++) {
      await writeFile(join(dir, manifest[i].file), Buffer.from(shots[i].b64, "base64"));
    }
    await writeFile(join(dir, "list.json"), JSON.stringify(manifest));
    results.push({ name: e.name, price: e.price, wall, ticks: result?.ticks ?? null, url: result?.url, title: result?.title, frames: manifest.length, ok: !!result, elapsedMs: result?.elapsedMs, decAvg, evs: evs || [] });
  } catch (e2) {
    console.log(`${e.name} failed: ${e2.message.slice(0, 300)}`);
    results.push({ name: e.name, wall: Date.now() - t0, ok: false, error: e2.message.slice(0, 200) });
  }
}

let merged = results;
if (only) {
  try {
    const prev = JSON.parse(await readFile(join(BENCH, "results.json"), "utf8"));
    merged = [...(prev.results || []).filter((r) => !only.has(r.name)), ...results];
  } catch {}
}
await writeFile(join(BENCH, "results.json"), JSON.stringify({ task, at: new Date().toISOString(), results: merged }, null, 2));

await writePlayer(BENCH, task, merged);

console.log("\n=== SUMMARY ===");
for (const r of merged) console.log(`${r.name}: ${r.ok ? (r.wall / 1000).toFixed(1) + "s, " + r.ticks + " ticks, " + r.frames + " frames" : "FAILED " + (r.error || "")}`);
console.log(`frames: ${join(BENCH, "frames")}/  results: ${join(BENCH, "results.json")}`);
