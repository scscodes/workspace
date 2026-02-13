# Cursor-Only Model Path via MCP

**Context**: In Cursor, `vscode.lm` does not expose models to extensions, so TLDR / Diff Resolve / Comment Prune fail with "no provider." Direct API keys work but require user setup. This doc pitches using **MCP** so Cursor users can use the IDE’s built-in models (including "Auto") with no API keys.

**References**:

- [Cursor: Model Context Protocol (MCP)](https://docs.cursor.com/context/model-context-protocol) — MCP as plugin system for the Agent  
- [Cursor: Building an MCP Server](https://docs.cursor.com/cookbook/building-mcp-server) — how to build and add MCP servers  
- [VS Code: MCP developer guide](https://code.visualstudio.com/api/extension-guides/ai/mcp) — Tools, Prompts, Resources, **Sampling**  
- [MCP Spec: Sampling](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling) — servers request LLM completions from the client (host)

---

## How MCP Fits

- **MCP server**: Exposes **tools** (and optionally prompts/resources). Can request **sampling** (LLM completions) from the **MCP client**.  
- **MCP client** (Cursor/VS Code): Owns the model; when a server sends `sampling/createMessage`, the client uses the user’s configured model (e.g. Auto) and returns the completion.  
- So: if we run as an MCP server that Cursor connects to, we can both expose AIDev tools *and* request model calls via sampling — no API keys in the extension, and Cursor’s “Auto” model is used.

**Important**: Cursor’s docs emphasize MCP **tools** for the Composer Agent; they do not clearly document whether Cursor’s MCP client supports **sampling**. VS Code’s MCP guide explicitly does (“make language model requests using the user’s configured models”). Before betting on sampling, we should confirm in Cursor (docs, settings, or a small test server).

---

## Strategy A: MCP Server with Sampling (preferred if Cursor supports it)

**Idea**: For Cursor, treat the extension as the host for an MCP server. That server exposes AIDev tools and uses **sampling** whenever a tool needs an LLM (TLDR, diff-resolve, comment prune).

**Flow**:

1. Extension detects Cursor (e.g. `vscode.env.appName`).
2. When `aidev.providerSource === 'ide'` (or a new `cursor-mcp` option), register an MCP server via Cursor’s MCP config (or, if available, something like VS Code’s `vscode.lm.registerMcpServerDefinitionProvider` so the server is auto-added).
3. MCP server exposes tools, e.g.:
   - `aidev_tldr` — optional `paths`; server gathers git log/diff, then sends `sampling/createMessage` with a “summarize this” prompt; returns summary as tool result.
   - `aidev_diff_resolve`, `aidev_comment_prune` — same pattern: prepare context, call sampling, return result.
   - `aidev_dead_code`, `aidev_lint`, `aidev_branch_diff` — read-only; no sampling, just run existing core logic and return findings.
4. Cursor (as MCP client) invokes tools when the user/Agent calls them. For tools that need an LLM, our server sends `sampling/createMessage`; Cursor uses the user’s model (including Auto) and returns the completion.

**Pros**:

- No API keys; uses Cursor’s subscription and model choice (including Auto).  
- Single protocol (MCP) for both “run tool” and “get model response.”  
- Aligns with Cursor’s documented extension path (MCP, Tools).

**Cons**:

- **Depends on Cursor supporting MCP sampling.** Must verify (docs or a minimal sampling test server).  
- UX is “run from Composer / MCP tools” unless we also keep sidebar/commands and have them trigger the same server (e.g. extension starts the server and also invokes it internally, or Cursor exposes a way for the extension to trigger MCP tool runs).  
- Some implementation work: MCP server process or in-process transport, mapping TOOL_REGISTRY to MCP tool definitions, and an “MCP sampling” adapter that implements `IModelProvider`-like `sendRequest` by sending `sampling/createMessage` and mapping responses back.

**Suggested first step**: Implement a minimal MCP server that only does one thing: on tool call, send `sampling/createMessage` with a fixed prompt and log the response. Add it in Cursor via Settings → MCP. If the client returns a completion, Cursor supports sampling and Strategy A is viable.

---

## Strategy B: MCP Tools Only (no sampling)

**Idea**: Expose AIDev as **tools + resources only**. No sampling. Tools that today need an LLM only return **context**; the **Cursor Agent** does the reasoning/summarization in the same or next turn.

**Flow**:

1. Same as A: for Cursor, register an MCP server (or point Cursor at one we ship).
2. Server exposes tools that return data, not model output:
   - `aidev_get_recent_changes` — returns git log + diff (and optionally a short “please summarize” instruction).
   - `aidev_get_merge_conflicts`, `aidev_get_comment_candidates` — return conflict blocks or comment snippets + instructions.
   - `aidev_dead_code`, `aidev_lint`, `aidev_branch_diff` — unchanged; return findings.
3. User (or a Cursor prompt/slash command) says e.g. “Summarize my recent changes” and references the tool or its output; the **Agent** calls `aidev_get_recent_changes`, then uses its own model to summarize. So “TLDR” is a workflow: our tool + Agent, not our tool calling the model.

**Pros**:

- Works with Cursor’s current MCP story (tools only); no dependency on sampling.  
- No API keys; Agent uses Cursor’s model (Auto, etc.).  
- Clear separation: we provide data and structure; Cursor provides the model.

**Cons**:

- We don’t “run TLDR” ourselves; UX is Composer/Agent-centric (“ask the Agent to summarize” rather than “click TLDR in sidebar”).  
- Less control over prompt and output shape; depends on the user (or a shared prompt) to wire tool output to summarization.

**Suggested first step**: Implement one tool, e.g. `aidev_get_recent_changes`, and a Cursor rule or slash-command prompt that says “When the user asks for a summary of recent changes, call aidev_get_recent_changes and then summarize the result.” Validate that the Agent reliably calls the tool and summarizes.

---

## Recommendation

1. **Validate sampling in Cursor** with a minimal MCP server that only sends `sampling/createMessage`. If it works → pursue **Strategy A** so we keep “TLDR in one click” and reuse Cursor’s model.  
2. If sampling is not supported (or not reliable), implement **Strategy B** and document the “TLDR” flow as “Use Composer + AIDev MCP tools”; optionally keep direct API as the way to get one-click TLDR in the sidebar.  
3. **Provider selection**: When running in Cursor and MCP is chosen, either:
   - New setting e.g. `aidev.providerSource: 'cursor-mcp'` and only use MCP (no vscode-lm / direct-api for model), or  
   - Keep `ide` but in Cursor treat “ide” as “use MCP if server is configured and sampling works, else direct-api.”

Doc and code should clearly separate “VSCode (vscode.lm + direct)” vs “Cursor (MCP path vs direct-api fallback)” so we don’t mix assumptions.

---

## Implementation Hints

- **MCP server**: Use [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). Server can be a separate Node process (stdio) or, if Cursor/VS Code allow, in-process.  
- **Registration**: Cursor: Settings → Features → MCP → Add server (command + args or URL). VS Code: extensions can use `vscode.lm.registerMcpServerDefinitionProvider` to register MCP servers programmatically; check if Cursor exposes the same.  
- **Mapping**: Reuse `TOOL_REGISTRY` and tool IDs; MCP tool names can be `aidev_<command>` (e.g. `aidev_tldr`). Input schema can mirror existing `inputSchema` (e.g. optional `paths`).  
- **Core**: Keep core tools (TldrTool, DiffResolveTool, etc.) unchanged; add an **MCP adapter** in the vscode package that implements `IModelProvider` by sending `sampling/createMessage` over the MCP client connection. Then when “provider” is MCP, ToolRunner still gets an `IModelProvider` and existing tools keep working.
