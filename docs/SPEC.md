# AIDev — Project Specification

> **Status**: UI/UX improvements — inline commands, auto-discovery, error handling, timeouts, parallel processing.
> **Last updated**: 2026-02-13

This is the single source of truth for the AIDev extension. All architectural decisions, constraints, and conventions are recorded here. When in doubt, defer to this document.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Settings](#settings)
- [Model Provider System](#model-provider-system)
- [Operating Modes](#operating-modes)
- [Tools / Features](#tools--features)
- [UI Surfaces](#ui-surfaces)
- [Language Support](#language-support)
- [Constraints & Conventions](#constraints--conventions)
- [File Map](#file-map)
- [Implementation Status](#implementation-status)

---

## Overview

AIDev is an AI-powered developer toolkit extension for **VSCode**. It provides automated code analysis, commit workflows, and change summarization — driven by language models selected through the IDE or configured via direct API keys.

### Core Philosophy

- **Data structures first**: every configurable value, every result, every tool has a strict typed interface.
- **Single source of truth**: settings schema, tool registry, mode mappings — defined once, referenced everywhere.
- **Zero magic numbers**: all constants named, all defaults centralized in `packages/core/src/settings/defaults.ts`.
- **Proposal-based**: all destructive or modifying actions propose changes for user approval. No auto-apply.

---

## Architecture

### Monorepo Structure

```
packages/
  core/       Pure TypeScript. Zero IDE dependency. Types, settings, models, tools, utils.
  vscode/     VSCode extension shell. Depends on @aidev/core.
```

**Why**: Enforces clean separation. Core logic is testable in isolation (vitest, no electron). Extension shell is a thin adapter layer.

### Key Boundaries

| Layer | Can import | Cannot import |
|-------|-----------|---------------|
| `@aidev/core` | Standard lib only | `vscode`, any IDE API |
| `aidev-vscode` | `@aidev/core`, `vscode` API | — |

### Build & Tooling

| Tool | Purpose |
|------|---------|
| TypeScript 5.4+ | Strict mode, Node16 module resolution |
| esbuild | Bundle vscode extension (fast, CJS output) |
| vitest | Unit tests for core |
| ESLint | Static analysis, no-magic-numbers rule enabled |
| Prettier | Formatting (single quotes, trailing commas, 100 width) |
| npm workspaces | Monorepo dependency management |

### Minimum Versions

- **Node**: >= 18.0.0
- **VSCode**: >= 1.95.0 (stable Language Model API)

---

## Settings

All settings live under the `aidev.*` namespace in VSCode settings.

### Authoritative References

- **Types**: `packages/core/src/types/settings.ts` → `ExtensionSettings` interface
- **Defaults**: `packages/core/src/settings/defaults.ts` → `DEFAULT_SETTINGS`
- **Validation**: `packages/core/src/settings/schema.ts` → `validateSettings()`
- **VSCode UI**: `packages/vscode/package.json` → `contributes.configuration`

### Setting Scope

Settings apply at both **user** (global) and **workspace** levels via standard VSCode configuration resolution. No custom scoping logic.

### Complete Settings Map

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `aidev.mode` | `performance \| balanced \| economy` | `balanced` | Operating mode |
| `aidev.modelTiers.high` | `string` | `""` | Model ID for high tier |
| `aidev.modelTiers.mid` | `string` | `""` | Model ID for mid tier |
| `aidev.modelTiers.low` | `string` | `""` | Model ID for low tier |
| `aidev.providerSource` | `ide \| direct` | `ide` | Model source |
| `aidev.directApi.provider` | `anthropic \| openai` | `anthropic` | Direct API provider |
| `aidev.directApi.apiKey` | `string` | `""` | API key (use env vars) |
| `aidev.directApi.baseUrl` | `string` | `""` | Custom endpoint URL |
| `aidev.enabledLanguages` | `string[]` | `["typescript","javascript","python"]` | Analysis languages |
| `aidev.commitConstraints.minLength` | `number` | `10` | Min commit msg length |
| `aidev.commitConstraints.maxLength` | `number` | `72` | Max first-line length |
| `aidev.commitConstraints.prefix` | `string` | `""` | Required prefix (e.g. `TEAM-123: `) |
| `aidev.commitConstraints.suffix` | `string` | `""` | Required suffix |
| `aidev.commitConstraints.enforcement` | `warn \| deny` | `warn` | Constraint violation handling |
| `aidev.preCommitDryRun` | `boolean` | `true` | Dry-run hooks before commit |
| `aidev.agent.maxTurns` | `number` | `10` | Max tool-call round-trips per agent run |
| `aidev.agent.maxTokenBudget` | `number` | `32000` | Max total tokens per agent run |
| `aidev.agent.systemPrompt` | `string` | `""` | Custom system prompt (empty = built-in) |

---

## Model Provider System

### Provider Interface

All providers implement `IModelProvider` (defined in `packages/core/src/types/models.ts`):

```
isAvailable() → boolean
listModels() → ResolvedModel[]
sendRequest(options) → ModelResponse      // options may include tools[]
dispose()
```

### Tool Calling Protocol

Providers support structured tool calling via `ModelRequestOptions.tools` and `ModelResponse.toolCalls`:

- **DirectApiProvider**: Full tool calling via Anthropic tool_use / OpenAI function calling wire formats. Translates `ToolDefinition[]` to native format, parses `ToolCall[]` from responses.
- **VscodeLmProvider**: Native tool calling via `vscode.lm` API — passes `ToolDefinition[]` in `LanguageModelChatRequestOptions.tools`, parses `ToolCall[]` from response. Falls back to text serialization for older VSCode versions or unsupported models.

Key types (all in `packages/core/src/types/models.ts`):

```
ToolDefinition    { name, description, inputSchema }
ToolCall          { id, name, arguments }
ToolResult        { toolCallId, content, isError? }
StopReason        'end_turn' | 'tool_use' | 'max_tokens'
```

`ChatMessage` supports `role: 'tool_result'` for feeding tool execution results back into the conversation.

### Available Providers

| ID | Class | Location | Description |
|----|-------|----------|-------------|
| `vscode-lm` | `VscodeLmProvider` | `packages/vscode/src/providers/vscode-lm.ts` | Uses `vscode.lm` API — GitHub Copilot in VSCode |
| `direct-api` | `DirectApiProvider` | `packages/vscode/src/providers/direct-api.ts` | Direct API keys — Anthropic / OpenAI |

### Provider Selection

Managed by `ProviderManager` (`packages/vscode/src/providers/index.ts`):
1. Reads `aidev.providerSource` setting
2. Activates the matching provider if available
3. Falls back to the other provider if primary unavailable
4. Reacts to settings changes (supports in-flight switching)

### Model Tier System

Users assign model identifiers to three tiers. The operating mode determines which tier is used for each task type.

```
User configures:  high → "claude-3-opus"
                  mid  → "claude-3-sonnet"
                  low  → "claude-3-haiku"

Mode determines:  balanced + chat → high tier → "claude-3-opus"
                  balanced + tool → mid tier  → "claude-3-sonnet"
```

---

## Operating Modes

Defined in `packages/core/src/settings/schema.ts` → `MODE_TIER_MAP`.

| Mode | Chat/Reasoning | Tool Calls |
|------|---------------|------------|
| **performance** | `high` tier | `high` tier |
| **balanced** | `high` tier | `mid` tier |
| **economy** | `mid` tier | `low` tier |

### Mode Switching

- Applied **globally** — no per-feature overrides (current design choice).
- In-flight switching supported: `ProviderManager` reacts to config changes.
- Status bar shows current mode with a clickable icon.

### Tier Resolution

```
resolveTier(mode, role) → ModelTier
resolveModelId(mode, role, tierMap) → string
```

Both in `packages/core/src/models/tiers.ts`.

---

## Tools / Features

### Tool Registry

All tools are registered in `packages/core/src/tools/index.ts` → `TOOL_REGISTRY`.

This is the **single source of truth** for tool metadata. Chat commands, VSCode commands, sidebar items, and help text all derive from this registry. Never hardcode tool info elsewhere.

### Tool Lookup

```
getToolEntry(id: ToolId) → ToolRegistryEntry | undefined
getToolByCommand(command: string) → ToolRegistryEntry | undefined
getAutonomousTools() → ToolRegistryEntry[]
getToolDefinitions(filter?) → ToolDefinition[]
```

### Tool Invocation Classification

Each tool has an `invocation` mode (`ToolInvocationMode`) that controls whether the model can call it autonomously during the agentic loop:

| Tool | Invocation | Rationale |
|------|-----------|-----------|
| `dead-code` | `autonomous` | Read-only analysis |
| `lint` | `autonomous` | Read-only analysis |
| `tldr` | `autonomous` | Read-only summarization |
| `branch-diff` | `autonomous` | Read-only branch comparison |
| `comments` | `restricted` | Proposes file modifications |
| `commit` | `restricted` | Proposes git staging + commit (or applies/amends) |
| `diff-resolve` | `restricted` | Proposes conflict resolutions (modifies files) |

- **`autonomous`**: Model invokes freely during the agent loop. No user confirmation needed.
- **`restricted`**: Requires explicit user slash command or confirmation prompt. Enforces the proposal-based constraint.

Each `ToolRegistryEntry` also carries `inputSchema` (JSON Schema) used to build `ToolDefinition[]` for the model's tool calling payload.

### Tool Interface

All tools implement `ITool` (defined in `packages/core/src/types/analysis.ts`):

```
execute(options: ScanOptions) → ScanResult
cancel()
export(result: ScanResult, format: ExportFormat) → string
```

### Tool Catalog

#### 1. Dead Code Discovery (`dead-code`)

| | |
|---|---|
| **Class** | `DeadCodeTool` in `packages/core/src/tools/dead-code/index.ts` |
| **Strategy** | Static analysis (knip, tree-shaking heuristics) + model synthesis |
| **Scope** | Unused exports, unreachable branches, unused files, unused variables |
| **Output** | Findings with jump-to-source, suggested removals |

#### 2. Lint & Best Practice (`lint`)

| | |
|---|---|
| **Class** | `LintTool` in `packages/core/src/tools/lint/index.ts` |
| **Strategy** | Wrap existing linters (ESLint, Prettier, pylint) + model-driven smell detection |
| **Scope** | Static rule violations + architectural smells + linter config suggestions |
| **Output** | Findings with severity, suggested fixes, linter config patches |

#### 3. Comment Pruning (`comments`)

| | |
|---|---|
| **Class** | `CommentsTool` in `packages/core/src/tools/comments/index.ts` |
| **Strategy** | Git blame age analysis + model judgment on value/verbosity |
| **Scope** | Stale comments, dead code blocks left as comments, low-ROI verbosity |
| **Output** | Proposals only — **never auto-apply** |

#### 4. Auto-Commit (`commit`)

| | |
|---|---|
| **Class** | `CommitTool` in `packages/core/src/tools/commit/index.ts` |
| **Strategy** | Git status → auto-stage → model-generated message → constraint validation → hook dry-run |
| **Scope** | Changed files in workspace (or user-specified paths) |
| **Output** | `CommitProposal` for user approval — **never auto-commit in propose mode** |
| **Constraints** | Min/max length, prefix/suffix, enforcement (warn/deny) |
| **Actions** | `propose` (default), `apply`, `amend` — see input schema below |

**Input schema**: `{ action?: 'propose'|'apply'|'amend', message?: string, paths?: string[] }`

- **`propose`** (default): Detect changes, stage, generate message via model, return proposal.
- **`apply`**: Stage files, validate provided message, create the commit. Requires `message`.
- **`amend`**: Amend the last commit with a new message. Requires `message`.

Conversational refinement is handled by the agent loop: the model proposes, the user gives feedback, the model adjusts, and calls `apply` or `amend` once confirmed.

#### 5. TLDR (`tldr`)

| | |
|---|---|
| **Class** | `TldrTool` in `packages/core/src/tools/tldr/index.ts` |
| **Strategy** | Git log for scope → model summarization |
| **Scope** | Adaptive — file, directory, or entire project based on user query |
| **Output** | `TldrSummary` with highlights and commit references |

#### 6. Branch Diff (`branch-diff`)

| | |
|---|---|
| **Class** | `BranchDiffTool` in `packages/core/src/tools/branch-diff/index.ts` |
| **Strategy** | Fetch remote → ahead/behind → incoming/outgoing commit logs → diff summary |
| **Scope** | Current branch vs its remote tracking branch |
| **Output** | `BranchComparison` with ahead/behind, commit lists, diff stat |
| **Invocation** | `autonomous` — read-only |

**Input schema**: `{ remote?: string, fetch?: boolean }`

#### 7. Diff Resolver (`diff-resolve`)

| | |
|---|---|
| **Class** | `DiffResolveTool` in `packages/core/src/tools/diff-resolve/index.ts` |
| **Strategy** | Detect conflict state → parse markers → classify safe vs complex → model-assisted resolution |
| **Scope** | Files with unresolved merge/rebase/cherry-pick conflicts |
| **Output** | `ConflictResolution[]` proposals for user approval — **never auto-apply by default** |
| **Invocation** | `restricted` — modifies files |

**Safe conflicts** (auto-resolvable): one side empty, both sides identical, whitespace-only differences.
**Complex conflicts**: overlapping edits requiring model-assisted merge.

**Input schema**: `{ paths?: string[], autoApplySafe?: boolean }`

---

## UI Surfaces

### Chat Participant (`@aidev`)

- Registered via VSCode Chat Participant API in `packages/vscode/src/chat/participant.ts`
- Two interaction modes:
  - **Slash commands**: `/deadcode`, `/lint`, `/comments`, `/commit`, `/tldr`, `/branchdiff`, `/resolve` — direct tool invocation, bypasses agent loop
  - **Free-form messages**: Routed through the agentic multi-turn loop (see below)
- **Graceful degradation**: if Chat Participant API is unavailable, all tools remain accessible via commands and sidebar
- Driven by `TOOL_REGISTRY` — adding a tool there auto-registers its chat command and makes it available to the agent loop

### Agentic Multi-Turn Loop

The chat participant drives an agentic loop (`packages/core/src/agent/loop.ts`) that enables the model to autonomously invoke tools during a conversation.

**Architecture** (core has zero IDE deps — testable with vitest):

```
packages/core/src/agent/
├── types.ts            AgentConfig, AgentAction (discriminated union), ConversationTurn
├── loop.ts             runAgentLoop() — async generator state machine
├── system-prompt.ts    buildSystemPrompt() — tool descriptions + behavioral constraints
└── index.ts            Barrel export
```

**Flow**:

1. User sends a free-form message (no slash command)
2. Chat participant builds `AgentConfig` from settings + `getToolDefinitions()`
3. Conversation history is reconstructed from `ChatContext.history`
4. `runAgentLoop()` async generator is started
5. Generator yields `AgentAction` values:
   - `tool_call` — autonomous tool: execute via `ToolRunner`, feed result back
   - `confirmation_required` — restricted tool: prompt user, then execute or skip
   - `response` — final text response: stream to chat
   - `error` — budget/turn limit/model failure: display error
6. Loop continues until text response, error, or limits hit

**Safety rails**:

- `maxTurns` setting (default 10) prevents runaway tool call loops
- `maxTokenBudget` setting (default 32000) caps total token usage per run
- Restricted tools cannot be auto-invoked without user awareness
- All destructive operations remain proposal-based per core philosophy

**Tier interaction**: The outer conversation uses `chat` role (higher tier). Tools that internally call the LLM (e.g. dead-code model synthesis) use `tool` role (potentially lower tier via `MODE_TIER_MAP`).

### Sidebar Panel

- Activity bar icon: `$(beaker)` → "AIDev"
- Single view "AIDev" with categorized tree:
  - **General**: TLDR
  - **Hygiene**: Dead Code, Lint & Best Practice, Comment Pruning
  - **SCM**: Branch Diff, Diff Resolver, Auto-Commit
- Each category is expandable with inline badge showing total findings count
- Each tool shows inline status (✓ clean, n findings, or Failed) and a right-aligned "Run" button
- Clicking the tool name expands/collapses (does not run the tool)
- Clicking the "Run" button executes the tool
- When a tool is running, shows `$(sync~spin) Running...` inline spinner matching the status bar
- Results (findings or summary) appear as children under the tool. Jump-to-source for findings.
- Tools automatically discover project files when no paths are specified (uses `git ls-files`)
- Registered in `packages/vscode/src/sidebar/provider.ts`

### Status Bar

- Single left-aligned item: shows current mode (e.g. "AIDev: balanced") with icon (rocket/dashboard/leaf); clickable → mode picker. When a tool is running, shows spinner and "AIDev: Scanning..." or "AIDev: Fetching..." (branch-diff).
- Reacts to settings changes and run state.
- Defined in `packages/vscode/src/status/index.ts`

### Commands (Palette)

All commands registered in `packages/vscode/src/commands/index.ts`:

| Command | Title |
|---------|-------|
| `aidev.scanDeadCode` | AIDev: Scan Dead Code |
| `aidev.scanLint` | AIDev: Lint & Best Practice Analysis |
| `aidev.pruneComments` | AIDev: Prune Comments |
| `aidev.autoCommit` | AIDev: Auto-Commit |
| `aidev.tldr` | AIDev: TLDR — Summarize Changes |
| `aidev.branchDiff` | AIDev: Branch Diff — Compare Local vs Remote |
| `aidev.diffResolve` | AIDev: Diff Resolver — Resolve Merge Conflicts |
| `aidev.exportResults` | AIDev: Export Results |
| `aidev.setMode` | AIDev: Set Operating Mode |

### Notification Policy

- **No pop-up notifications** — all results logged to console only
- **No modal dialogs or toast notifications** that overlap chat
- Use status bar spinner for in-progress / loading states
- Use inline spinner in sidebar when tools are running
- Use simple icons in the sidebar results view

---

## Language Support

| Language | Frameworks | Priority |
|----------|-----------|----------|
| TypeScript | Angular, React, Next.js | Primary |
| JavaScript | Angular, React, Next.js | Primary |
| Python | Flask, FastAPI | Primary |

Framework detection is used for smarter dead code analysis (e.g. Angular decorators, React hooks, Flask routes aren't "unused").

---

## Constraints & Conventions

### Non-Negotiable

1. **All settings in `packages/core/src/settings/`** — `defaults.ts` for values, `schema.ts` for validation.
2. **All tool metadata in `TOOL_REGISTRY`** — never hardcode tool names/commands/descriptions elsewhere.
3. **All types in `packages/core/src/types/`** — shared between core and vscode packages.
4. **No magic numbers** — ESLint's `no-magic-numbers` rule is enabled. Extract to named constants.
5. **No duplication** — if it's used in two places, it belongs in `@aidev/core`.
6. **Proposal-based** — comment pruning and auto-commit propose changes, never auto-apply.
7. **Strict TypeScript** — `strict: true`, no `any`, no unused vars/params.

### Conventions

- Use `.js` extensions in import paths (required by Node16 module resolution).
- Barrel exports via `index.ts` in each module directory.
- Tool stubs throw `Error('not yet implemented')` — grep for these to find work items.
- VSCode commands prefixed with `aidev.`.
- Settings namespaced under `aidev.*`.

---

## File Map

```
packages/core/src/
├── index.ts                    Barrel export (all public API)
├── types/
│   ├── index.ts                Type barrel export
│   ├── common.ts               CodeLocation, Severity, ExportFormat, etc.
│   ├── settings.ts             ExtensionSettings, OperatingMode, AgentSettings, CommitConstraints, etc.
│   ├── models.ts               IModelProvider, ResolvedModel, ChatMessage, ToolDefinition, ToolCall, ToolResult, etc.
│   ├── analysis.ts             ITool, ToolInvocationMode, Finding, ScanResult, ScanOptions, etc.
│   └── git.ts                  CommitProposal, ChangedFile, TldrSummary, BranchComparison, ConflictResolution, etc.
├── settings/
│   ├── index.ts                Settings barrel
│   ├── defaults.ts             DEFAULT_SETTINGS and all default constants
│   └── schema.ts               VALID_*, MODE_TIER_MAP, normalizeSettings, validateSettings
├── models/
│   ├── index.ts                Models barrel
│   └── tiers.ts                resolveTier, resolveModelId
├── tools/
│   ├── index.ts                TOOL_REGISTRY, getToolEntry, getToolByCommand, getAutonomousTools, getToolDefinitions, BaseTool
│   ├── base-tool.ts            Abstract base class (lifecycle, cancel, export)
│   ├── dead-code/index.ts      DeadCodeTool (static patterns + model synthesis)
│   ├── lint/index.ts           LintTool (ESLint/Pylint + model analysis)
│   ├── comments/index.ts       CommentsTool (implemented — blame + model)
│   ├── commit/index.ts         CommitTool (propose/apply/amend — full pipeline)
│   ├── tldr/index.ts           TldrTool (implemented — git log + model)
│   ├── branch-diff/index.ts    BranchDiffTool (compare local vs remote)
│   └── diff-resolve/index.ts   DiffResolveTool (conflict detection + resolution)
├── agent/
│   ├── index.ts                Agent barrel export
│   ├── types.ts                AgentConfig, AgentAction, ConversationTurn
│   ├── loop.ts                 runAgentLoop() — async generator state machine
│   └── system-prompt.ts        buildSystemPrompt() — tool descriptions + constraints
├── git/
│   ├── index.ts                Git barrel export
│   ├── executor.ts             execGit, execGitStrict, isGitRepo, getRepoRoot
│   ├── status.ts               getChangedFiles, parsePorcelainLine
│   ├── log.ts                  getLog, GitLogEntry, parseLogOutput
│   ├── blame.ts                getBlame, getFileAge, BlameRange
│   ├── staging.ts              stageFiles, autoStage, getStagedDiff, createCommit, amendCommit, getLastCommitInfo
│   ├── branch.ts               getCurrentBranch, getTrackingBranch, getAheadBehind, fetchRemote, getRemoteDiff/Log
│   ├── conflicts.ts            isInMergeState, getConflictFiles, parseConflictMarkers, writeResolution
│   ├── hooks.ts                checkHooks, HookCheckResult
│   └── validation.ts           validateCommitMessage
└── utils/
    └── index.ts                generateId, emptyScanSummary, buildScanSummary

packages/vscode/src/
├── extension.ts                activate / deactivate (settings → providers → runner → UI)
├── settings/
│   └── index.ts                SettingsManager (centralized config reader)
├── providers/
│   ├── index.ts                ProviderManager (provider lifecycle + selection)
│   ├── vscode-lm.ts            VscodeLmProvider (full sendRequest implementation)
│   └── direct-api.ts           DirectApiProvider (Anthropic + OpenAI implementations)
├── tools/
│   ├── index.ts                Tools barrel
│   └── runner.ts               ToolRunner (orchestrates tool execution)
├── chat/
│   ├── index.ts                Chat barrel
│   └── participant.ts          @aidev chat participant (agent loop host + slash commands)
├── sidebar/
│   ├── index.ts                Sidebar barrel
│   └── provider.ts             AidevTreeProvider (categorized tree, results under tools)
├── commands/
│   └── index.ts                All command registrations (routes to ToolRunner)
└── status/
    └── index.ts                Status bar: mode + busy state (Scanning.../Fetching...)
```

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Monorepo scaffold | Done | npm workspaces, tsconfig, esbuild |
| Type system | Done | All interfaces defined |
| Settings schema | Done | Defaults, validation, normalization, 12 unit tests |
| Settings bridge (VSCode) | Done | SettingsManager with change events, all components use it |
| Model tier resolution | Done | resolveTier, resolveModelId |
| Tool registry | Done | TOOL_REGISTRY with all 7 tools, invocation classification, input schemas |
| Base tool class | Done | BaseTool: lifecycle, cancellation, summary, JSON/MD export |
| Git operations | Done | executor, status, log, blame, staging, hooks, validation |
| Extension activation | Done | settings → providers → runner → UI |
| ToolRunner | Done | Orchestrates execution, progress, result broadcasting |
| Chat participant | Done | Agentic multi-turn loop + slash command fallback |
| Agent loop (core) | Done | Async generator state machine, system prompt builder |
| Tool calling protocol | Done | ToolDefinition, ToolCall, ToolResult types + provider support |
| Sidebar views | Done | Categorized tree with inline Run buttons (right-aligned), inline spinners, auto-file discovery, expand-only click behavior |
| Status bar | Done | Mode display with real-time updates, spinner when busy |
| File count tracking | Done | All tools report accurate filesScanned counts |
| Constants centralization | Done | All magic numbers moved to defaults.ts |
| Error reporting | Done | No silent failures — all errors create findings |
| Timeout handling | Done | All model calls have 30s timeout protection |
| Parallel processing | Done | DeadCodeTool and LintTool process files in batches |
| Commands | Done | All route to ToolRunner, export with format selection |
| VscodeLmProvider | Done | Tier resolution, model matching, streaming, tool message fallback |
| DirectApiProvider | Done | Anthropic + OpenAI API with model catalogs, full tool calling |
| DeadCodeTool | Done | Static export analysis + model-driven false positive filtering |
| LintTool | Done | ESLint/pylint wrapping + model-driven code smell detection |
| CommentsTool | Done | Git blame age + model-driven value assessment |
| CommitTool | Done | Full pipeline: propose/apply/amend actions, constraint validation, hook dry-run |
| TldrTool | Done | Git log → model summarization with highlights |
| BranchDiffTool | Done | Fetch → ahead/behind → commit logs → diff summary |
| DiffResolveTool | Done | Conflict detection, safe auto-resolution, model-assisted complex resolution |
| Git branch ops | Done | getCurrentBranch, getTrackingBranch, getAheadBehind, fetchRemote, getRemoteDiff/Log |
| Git conflict ops | Done | isInMergeState, getConflictFiles, parseConflictMarkers, writeResolution |
| Git amend/info | Done | amendCommit, getLastCommitInfo |
| Unit tests | 43 passing | schema (12), validation (9), status parsing (11), conflict parsing (10), branch module (1) |
| Integration tests | Not started | @vscode/test-electron configured |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-12 | VSCode only (not JetBrains/Neovim/Cursor) | Same extension API, ship fast; Cursor dropped 2026-02-13 |
| 2026-02-12 | Monorepo: core + vscode | Clean separation, testable core |
| 2026-02-12 | Global modes only, no per-feature overrides | Keep it simple at launch |
| 2026-02-12 | IDE-provided models primary, direct API fallback | Cover both Copilot and API-key users |
| 2026-02-12 | Static analysis + model synthesis for dead code/lint | Static is fast/cheap, model catches subtler issues |
| 2026-02-12 | Proposal-based for comments and commits | Safety first — never auto-modify without approval |
| 2026-02-12 | Chat Participant API with graceful degradation | Works in VSCode; commands fallback if API unavailable |
| 2026-02-12 | npm over pnpm/yarn | More common on developer's systems |
| 2026-02-12 | Warn (not deny) as default enforcement | Less friction out of the box |
| 2026-02-13 | Tool invocation classification (autonomous/restricted) | Enforces proposal-based constraint in agentic loop |
| 2026-02-13 | Agent loop as async generator in core | Pure TS, testable, IDE-agnostic; host drives execution |
| 2026-02-13 | Slash commands bypass agent loop | Backward compatibility, explicit user override |
| 2026-02-13 | VscodeLmProvider: text fallback for tool calls | vscode.lm tool API not stable across versions |
| 2026-02-13 | maxTurns=10, maxTokenBudget=32000 defaults | Safety rails for agentic loop cost control |
| 2026-02-13 | Commit tool supports propose/apply/amend actions | Enables conversational refinement via agent loop |
| 2026-02-13 | ScanOptions.args for tool-specific parameters | Generic passthrough from agent loop to tools without breaking ITool interface |
| 2026-02-13 | Branch diff as autonomous tool | Read-only remote comparison, safe for model invocation |
| 2026-02-13 | Diff resolver as restricted tool | Modifies files, requires user confirmation per proposal-based policy |
| 2026-02-13 | Cursor dropped as intended use case | Limitations too hindering; extension targets VSCode only |
| 2026-02-13 | Conflict classification: safe (auto) vs complex (model) | Trivial conflicts resolved deterministically; non-trivial use LLM with confidence scoring |
