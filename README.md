# bside

**b(oost)side** — drive the [Aside](https://aside.com) browser with [TypeSafe Jev](https://typesafe.ai) decisions instead of a chat LLM.

Jev is a System One model: it never generates text. Each tick it answers typed
questions — which action, which element, is the goal met — with calibrated
probabilities and confidence, in ~0.3–1s at ~$0.042/1M input tokens.
Actions come from a schema you enumerate, so the pilot cannot hallucinate a
tool call.

```
agent ── browse(goal) ──▶ bside ──▶ aside repl (observe/act)
                            └──▶ Jev /v1/systemone (decide)
```

## Benchmark

Task: "Starting from google.com, search for wikipedia, open the Wikipedia
site, search for Batman on Wikipedia, then in the Batman article click the
link to the Gotham City article" — same browser, same loop, only the
decision engine differs:

| engine | wall time | steps | avg decision latency | est. cost |
| --- | --- | --- | --- | --- |
| **jev** (bside) | **52.8s** | 7 | ~1.0s | $0.0018 |
| gpt-6-astra (frontier LLM) | 72.9s | 7 | ~3.6s | $0.039 |
| gpt-5.6-luna (light LLM) | 68.9s | 7+retries | ~2.5s | $0.011 |

Browser latency (page loads, snapshots, action execution) is excluded from
the decision column — those numbers measure only model inference. Luna
additionally attempted clicks on elements that do not exist and retried;
Jev cannot emit a ref outside the enumerated candidate set.

Reproduce (model names shown are the ones measured; any
Responses-compatible model works — results will differ):

```bash
export BSIDE_LLM_URL=https://api.openai.com/v1/responses   # or any Responses-compatible endpoint
export BSIDE_LLM_API_KEY=...
node bench/run.mjs '{"goal":"...","urls":["https://www.google.com"],"inputs":["wikipedia","batman"],"maxTicks":12}' \
  --models gpt-6-astra@1.25/10,gpt-5.6-luna@0.25/2
open bench/player.html   # side-by-side real-time replay
```

## Install

```bash
npm i -g bside        # or: npx bside ...
```

Requirements: [`aside` CLI](https://releases.aside.com/install.sh) signed in,
and a TypeSafe API key (`TYPESAFE_API_KEY` or `~/.config/typesafe/api-key`).

For the `llm` comparison engine, point at any OpenAI Responses-compatible
endpoint: `BSIDE_LLM_URL`, `BSIDE_LLM_API_KEY` (or `OPENAI_API_KEY`),
`BSIDE_LLM_MODEL` (or `--model`).

## CLI

```bash
bside '{"goal":"Open the top story comments on Hacker News","urls":["https://news.ycombinator.com"]}'
bside --goal "Search Google for typesafe ai and open the first result" \
      --url https://www.google.com --input "typesafe ai"
```

Options: `--attach <targetId>` (drive an existing tab), `--active` (current tab),
`--ticks N`, `--linger <ms>` (keep the tab visible after finishing).

## MCP

```bash
bside --mcp
```

```json
{ "mcpServers": { "bside": { "command": "bside", "args": ["--mcp"] } } }
```

Exposes one tool: `browse(goal, urls?, inputs?, mode?, targetId?, maxTicks?)`.

## Design notes / limits

- **No text generation**: `type`/`navigate` arguments come from `inputs`/`urls`
  candidate lists. Free text needs an upstream LLM or human.
- **Text-only state**: decisions read the accessibility tree, not screenshots.
- **Per-tick judge, not a planner**: long-horizon goals need a decomposer
  upstream; bside escalates on low confidence / blocked / loops.
- Each run is one `aside repl` call (~120s cap); session tabs close on exit.
  Use `--attach`/`--active` to drive persistent browser tabs.

MIT.
