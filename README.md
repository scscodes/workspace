# AIDev

AI-powered developer toolkit for VSCode. Code analysis, commit workflows, change summarization, and intelligent task orchestration — driven by any language model available in your IDE or via direct API key.

## What it does

AIDev runs analysis and actions directly in your editor through a chat participant (`@aidev`), slash commands, and a sidebar panel. Everything is proposal-based: destructive or modifying actions show a diff and wait for approval before applying.

### Tools

| Tool | Slash command | Type | What it does |
|------|--------------|------|--------------|
| `dead-code` | `/deadcode` | autonomous | Static + model-driven dead code detection |
| `lint` | `/lint` | autonomous | ESLint/Pylint wrapping + model smell detection |
| `comments` | `/comments` | restricted | Git blame age analysis + comment value assessment |
| `commit` | `/commit` | restricted | Status → stage → model message → hooks → proposal |
| `tldr` | `/tldr` | autonomous | Git log → model summarization with highlights |
| `branch-diff` | `/branchdiff` | autonomous | Branch comparison with commit and diff analysis |
| `diff-resolve` | `/resolve` | restricted | Merge conflict resolution proposals |
| `pr-review` | `/prreview` | restricted | PR diff fetch → scoped analysis → semantic review |
| `decompose` | `/decompose` | restricted | Break a free-form objective into parallel subtasks, execute, consolidate |

**Invocation types:**
- `autonomous` — runs immediately, read-only, no approval needed
- `restricted` — proposes changes, requires explicit confirmation before applying

### Workflow routing

Free-form messages to `@aidev` are matched against a workflow registry before falling through to the agent loop. Matched workflows execute their tool chains automatically — autonomous tools run in parallel, restricted tools gate on completion.

Built-in workflows:

| Workflow | Triggers | Tool chain |
|----------|---------|-----------|
| `fix` | "fix", "broken", "failing" | lint → dead-code → commit |
| `prep-pr` | "prep pr", "ship it", "ready for review" | branch-diff → tldr → commit |
| `review` | "review", "audit", "code review" | dead-code → lint → comments |

Use `/workflow` to list all available workflows.

### Speculative pre-execution

When a workflow is matched, autonomous tools start immediately — before the agent loop initializes. By the time the UI confirms the workflow, analysis is already running. Cache hits mean zero duplicate work.

### Task decomposition

`/decompose "objective"` sends the objective to the model, which returns a structured plan of independent subtasks. Each subtask maps to a tool chain. Subtasks run in parallel; results are deduplicated and consolidated into a single summary.

---

## Architecture

Monorepo with a strict separation between logic and IDE:

```
packages/
  core/    Pure TypeScript. Zero IDE dependency. Types, settings, models, tools, git, agent, telemetry.
  vscode/  VSCode extension shell. Thin adapter layer. Depends on @aidev/core.
```

Core is fully testable in isolation (vitest, no Electron). The extension shell wires UI surfaces to core logic.

### Model provider system

| Provider | Source | When to use |
|----------|--------|-------------|
| `VscodeLmProvider` | `vscode.lm` API (Copilot, etc.) | IDE-managed models, no API key needed |
| `DirectApiProvider` | Anthropic / OpenAI REST | Bring your own key, any supported model |

Models are resolved through a three-tier system mapped to operating modes:

| Mode | Chat/reasoning tier | Tool call tier |
|------|-------------------|----------------|
| `performance` | high | high |
| `balanced` | high | mid |
| `economy` | mid | low |

Configure tiers in settings: `aidev.modelTiers.high`, `.mid`, `.low`.

### Telemetry

All tool executions, workflow runs, and speculative cache events emit structured telemetry events automatically via `ITelemetry` (implemented in `BaseTool`). Events are stored in a local SQLite database in the extension's global storage. Zero per-tool instrumentation required — new tools inherit it automatically.

Event types: `tool.start`, `tool.complete`, `tool.error`, `workflow.start`, `workflow.complete`, `finding.acted`, `speculative.hit`, `speculative.miss`, `decompose.complete`.

---

## Getting started

### Requirements

- Node.js >= 18
- VSCode >= 1.95.0
- For `VscodeLmProvider`: GitHub Copilot or another VSCode LM extension
- For `DirectApiProvider`: Anthropic or OpenAI API key

### Install

```bash
git clone https://github.com/scscodes/meridian
cd meridian
npm install
```

### Build

```bash
# Type-check both packages
npm run build

# Build + watch (development)
npm run dev

# Run extension in VSCode debugger
# Press F5 in VSCode with the repo open
```

### Test

```bash
# All unit tests
npm test

# Core package only
npm run test:core

# With coverage
npm run test:coverage
```

---

## Usage

### Chat participant

Open the VSCode chat panel and address `@aidev`:

```
@aidev fix the linting issues in auth.ts
@aidev prep pr
@aidev /decompose "audit and clean up the payments module"
@aidev /prreview 42
```

Free-form messages trigger workflow routing first. Unmatched messages go to the agent loop.

### Slash commands

All tools are accessible as slash commands in the `@aidev` chat:

```
@aidev /lint
@aidev /deadcode
@aidev /commit
@aidev /branchdiff
@aidev /tldr
@aidev /resolve
@aidev /prreview <pr-number>
@aidev /decompose <objective>
@aidev /workflow        ← list all workflows
```

### Sidebar

The AIDev panel in the Explorer sidebar shows:

- **Hygiene** — dead-code, lint, comments
- **SCM** — commit, branch-diff, diff-resolve
- **General** — tldr
- **Review** — pr-review
- **Workflows** — decompose

Click any tool to run it. Results appear in the Results tree with jump-to-source.

---

## Configuration

All settings are under the `aidev.*` namespace in VSCode settings.

| Setting | Default | Description |
|---------|---------|-------------|
| `aidev.mode` | `balanced` | Operating mode: `performance`, `balanced`, `economy` |
| `aidev.providerSource` | `ide` | `ide` (vscode.lm) or `direct` (API key) |
| `aidev.directApi.provider` | `anthropic` | `anthropic` or `openai` |
| `aidev.modelTiers.high` | `""` | Model ID for high tier |
| `aidev.modelTiers.mid` | `""` | Model ID for mid tier |
| `aidev.modelTiers.low` | `""` | Model ID for low tier |

---

## Development

### Conventions (non-negotiable)

- **No magic numbers** — all constants in `packages/core/src/settings/defaults.ts`
- **Strict TypeScript** — `strict: true`, no `any`, no unused vars
- **Node16 module resolution** — `.js` extensions in all import paths
- **Barrel exports** — every directory exports via `index.ts`
- **Proposal-based** — restricted tools never auto-apply; always show a diff and confirm
- **Zero per-tool telemetry** — emit events via `BaseTool`; never instrument individual tools manually

### Adding a tool

1. Create `packages/core/src/tools/<name>/index.ts` extending `BaseTool`
2. Add entry to `TOOL_REGISTRY` in `packages/core/src/tools/index.ts`
3. Add `ToolId` variant to `packages/core/src/types/analysis.ts`
4. Export from `packages/core/src/tools/index.ts` barrel
5. Register slash command in `packages/vscode/src/chat/participant.ts`
6. Add sidebar category entry in `packages/vscode/src/sidebar/provider.ts`
7. Add unit tests in `packages/core/src/tools/<name>/<name>.test.ts`

### Adding a workflow

Edit `packages/core/src/agent/workflows.ts` — add a `WorkflowDefinition` to `WORKFLOW_REGISTRY` with `id`, `name`, `triggers`, `toolIds`, and `description`. No other changes needed.

### Project structure

```
packages/
  core/
    src/
      agent/          Agent loop, workflow registry, system prompt
      git/            Git primitives (status, log, blame, conflicts, hooks)
      models/         Provider system, tier resolution
      settings/       Schema, defaults, validation
      telemetry/      ITelemetry interface, NullTelemetry
      tools/          Tool implementations + TOOL_REGISTRY
      types/          Shared TypeScript types
      utils/          Shared utilities
  vscode/
    src/
      chat/           @aidev chat participant
      commands/       Command palette registrations
      sidebar/        Explorer panel provider
      telemetry/      SqliteTelemetry, migrations
      tools/          ToolRunner
docs/
  SPEC.md             Authoritative spec — defer here when in doubt
  ARCHITECTURE_DIAGRAM.md
  IMPLEMENTATION_PLAN.md
  TOOL_IMPROVEMENTS.md
```

---

## Status

| Area | Status |
|------|--------|
| Core tools (7) | ✅ Done |
| PR review pipeline | ✅ Done |
| Workflow routing + parallel execution | ✅ Done |
| Speculative pre-execution | ✅ Done |
| Task decomposition (`/decompose`) | ✅ Done |
| Telemetry foundation | ✅ Done |
| Integration tests | 🔜 Planned |
| Framework-aware dead code (React, Angular) | 🔜 Planned |
| Linter config suggestions | 🔜 Planned |
| Telemetry dashboard / `/stats` command | 🔜 Planned |
| Direct API key SecretStorage migration | 🔜 Planned |
