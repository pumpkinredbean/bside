import { createInterface } from "node:readline";
import { runPilot } from "./pilot.js";

const TOOLS = [
  {
    name: "browse",
    description:
      "Drive the user's Aside browser toward a goal using TypeSafe Jev decisions — fast, typed, no LLM text generation in the loop. Works on logged-in sites. Actions are click/type/press_enter/navigate; text and URLs must come from the candidate lists you pass in.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "What to accomplish, in natural language" },
        urls: { type: "array", items: { type: "string" }, description: "Candidate URLs the pilot may navigate to" },
        inputs: { type: "array", items: { type: "string" }, description: "Candidate text values the pilot may type into fields" },
        mode: { type: "string", enum: ["new_tab", "active_tab"], description: "new_tab (default) opens a session tab; active_tab attaches to the user's current tab" },
        targetId: { type: "string", description: "Attach to a specific browser tab by targetId" },
        maxTicks: { type: "number", description: "Max decision ticks (default 10; repl call has a 120s cap)" },
      },
      required: ["goal"],
    },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

export function startMcp() {
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on("line", async (line) => {
    let req;
    try { req = JSON.parse(line); } catch { return; }
    const { id, method, params } = req;

    if (method === "initialize") {
      send({ jsonrpc: "2.0", id, result: {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "bside", version: "0.1.0" },
      } });
      return;
    }
    if (method === "notifications/initialized" || method === "initialized") return;
    if (method === "ping") { send({ jsonrpc: "2.0", id, result: {} }); return; }
    if (method === "tools/list") { send({ jsonrpc: "2.0", id, result: { tools: TOOLS } }); return; }
    if (method === "tools/call") {
      if (params?.name !== "browse") {
        send({ jsonrpc: "2.0", id, error: { code: -32602, message: `unknown tool ${params?.name}` } });
        return;
      }
      try {
        const { log, result } = await runPilot(params.arguments ?? {});
        send({ jsonrpc: "2.0", id, result: {
          content: [{ type: "text", text: log + "\nRESULT " + JSON.stringify(result) }],
        } });
      } catch (e) {
        send({ jsonrpc: "2.0", id, result: {
          content: [{ type: "text", text: `bside failed: ${e.message}` }],
          isError: true,
        } });
      }
      return;
    }
    if (id !== undefined) {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
    }
  });
}
