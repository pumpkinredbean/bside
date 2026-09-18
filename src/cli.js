#!/usr/bin/env node
import { runPilot } from "./pilot.js";
import { startMcp } from "./mcp.js";

const args = process.argv.slice(2);

if (args[0] === "--mcp") {
  startMcp();
} else if (args[0] === "--help" || args[0] === "-h" || !args.length) {
  console.log(`bside — Jev-driven browser pilot on top of Aside

Usage:
  bside '{"goal":"...", "urls":[...], "inputs":[...], "mode":"new_tab"}'
  bside --goal "..." --url https://... --input "text" [--attach <targetId>] [--active]
  bside --engine llm --model <model> --goal "..."   use a chat LLM instead of Jev
  bside --mcp                 start MCP stdio server (tool: browse)

Env:
  TYPESAFE_API_KEY        Jev key (else ~/.config/typesafe/api-key)
  BSIDE_LLM_URL           Responses-compatible endpoint (default https://api.openai.com/v1/responses)
  BSIDE_LLM_API_KEY       LLM key (or OPENAI_API_KEY)
  BSIDE_LLM_MODEL         default model for --engine llm
Requires \`aside\` CLI.`);
} else {
  let task;
  if (args[0].startsWith("{")) {
    task = JSON.parse(args[0]);
  } else {
    task = {};
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "--goal") task.goal = args[++i];
      else if (a === "--url") (task.urls ??= []).push(args[++i]);
      else if (a === "--input") (task.inputs ??= []).push(args[++i]);
      else if (a === "--attach") task.targetId = args[++i];
      else if (a === "--active") task.mode = "active_tab";
      else if (a === "--ticks") task.maxTicks = +args[++i];
      else if (a === "--linger") task.lingerMs = +args[++i];
      else if (a === "--engine") task.engine = args[++i];
      else if (a === "--model") task.model = args[++i];
      else if (a === "--shots") task.shots = true;
    }
  }
  try {
    const { log, result } = await runPilot(task);
    process.stdout.write(log);
    if (result) console.log("RESULT " + JSON.stringify(result));
  } catch (e) {
    console.error("bside failed:", e.message);
    process.exit(1);
  }
}
