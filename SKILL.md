---
name: bside
description: Drive the user's Aside browser with TypeSafe Jev decisions — fast typed actions, no chat LLM in the loop. Use for bounded browser tasks (navigate, click, fill from candidate values, verify state) where speed and cost matter; escalate open-ended or free-text-heavy tasks back to the full agent.
---

# bside — Jev browser pilot

bside runs an observe→decide→act loop inside `aside repl` where every decision is a
TypeSafe Jev typed answer (Choice/Score/Noul) instead of an LLM text generation.
Sub-second ticks, schema-guaranteed actions, calibrated confidence gating.

## Requirements

- `aside` CLI installed and signed in (`aside --version`)
- TypeSafe API key: `TYPESAFE_API_KEY` env or `~/.config/typesafe/api-key`

## Run

```bash
bside '{"goal":"Open the top story comments on Hacker News","urls":["https://news.ycombinator.com"]}'
bside --goal "Search Google for X and open the first result" --url https://www.google.com --input "X"
```

Key task fields: `goal` (required), `urls`/`inputs` (candidate sets for
navigate/type args — Jev cannot generate free text), `mode` (`new_tab` |
`active_tab`), `targetId` (attach a specific tab), `maxTicks`, `lingerMs`.

## When to use

- Bounded, enumerable browser tasks: navigate, click through, fill fields with
  known values, verify page state. ~300–900ms per decision.
- NOT for: composing free text (emails, comments, search queries not in
  `inputs`), tasks needing multi-step planning, or visual-only cues
  (Jev reads the accessibility tree, not screenshots). Escalate those.

## MCP

`bside --mcp` exposes a `browse` tool over stdio — register it in any
MCP-capable agent for plugin-style browser control.
