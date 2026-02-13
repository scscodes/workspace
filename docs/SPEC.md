# AIDev — Project Specification

> **Status**: Scaffold complete. Feature implementation pending.
> **Last updated**: 2026-02-12

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

AIDev is an AI-powered developer toolkit extension for **VSCode** and **Cursor** (same extension, one codebase). It provides automated code analysis, commit workflows, and change summarization — driven by language models selected through the IDE or configured via direct API keys.

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
  vscode/     VSCode/Cursor extension shell. Depends on @aidev/core.
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

All settings live under the `aidev.*` namespace in VSCode/Cursor settings.

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

---

## Model Provider System

### Provider Interface

All providers implement `IModelProvider` (defined in `packages/core/src/types/models.ts`):

```
isAvailable() → boolean
listModels() → ResolvedModel[]
sendRequest(options) → ModelResponse
dispose()
```

### Available Providers

| ID | Class | Location | Description |
|----|-------|----------|-------------|
| `vscode-lm` | `VscodeLmProvider` | `packages/vscode/src/providers/vscode-lm.ts` | Uses `vscode.lm` API — Copilot / Cursor models |
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
```

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
| **Output** | `CommitProposal` for user approval — **never auto-commit** |
| **Constraints** | Min/max length, prefix/suffix, enforcement (warn/deny) |

#### 5. TLDR (`tldr`)

| | |
|---|---|
| **Class** | `TldrTool` in `packages/core/src/tools/tldr/index.ts` |
| **Strategy** | Git log for scope → model summarization |
| **Scope** | Adaptive — file, directory, or entire project based on user query |
| **Output** | `TldrSummary` with highlights and commit references |

---

## UI Surfaces

### Chat Participant (`@aidev`)

- Registered via VSCode Chat Participant API in `packages/vscode/src/chat/participant.ts`
- Commands: `/deadcode`, `/lint`, `/comments`, `/commit`, `/tldr`
- **Graceful degradation**: if Chat Participant API is unavailable (e.g. some Cursor versions), all tools remain accessible via commands and sidebar
- Driven by `TOOL_REGISTRY` — adding a tool there auto-registers its chat command

### Sidebar Panel

- Activity bar icon: `$(beaker)` → "AIDev"
- Two views:
  - **Tools**: clickable list of all tools (one item per `TOOL_REGISTRY` entry)
  - **Results**: findings from the most recent scan, with jump-to-source
- Registered in `packages/vscode/src/sidebar/provider.ts`

### Status Bar

- Left-aligned, shows current mode with icon (rocket/dashboard/leaf)
- Clickable → opens mode picker
- Reacts to settings changes in real-time
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
| `aidev.exportResults` | AIDev: Export Results |
| `aidev.setMode` | AIDev: Set Operating Mode |

### Notification Policy

- **No modal dialogs or toast notifications that overlap chat.**
- Use status bar icons for in-progress / loading states.
- Use simple icons in the sidebar results view.

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
│   ├── settings.ts             ExtensionSettings, OperatingMode, CommitConstraints, etc.
│   ├── models.ts               IModelProvider, ResolvedModel, ChatMessage, etc.
│   ├── analysis.ts             ITool, Finding, ScanResult, ScanOptions, etc.
│   └── git.ts                  CommitProposal, ChangedFile, TldrSummary, etc.
├── settings/
│   ├── index.ts                Settings barrel
│   ├── defaults.ts             DEFAULT_SETTINGS and all default constants
│   └── schema.ts               VALID_*, MODE_TIER_MAP, normalizeSettings, validateSettings
├── models/
│   ├── index.ts                Models barrel
│   └── tiers.ts                resolveTier, resolveModelId
├── tools/
│   ├── index.ts                TOOL_REGISTRY, getToolEntry, getToolByCommand, BaseTool
│   ├── base-tool.ts            Abstract base class (lifecycle, cancel, export)
│   ├── dead-code/index.ts      DeadCodeTool (stub — extends BaseTool)
│   ├── lint/index.ts           LintTool (stub — extends BaseTool)
│   ├── comments/index.ts       CommentsTool (implemented — blame + model)
│   ├── commit/index.ts         CommitTool (implemented — full pipeline)
│   └── tldr/index.ts           TldrTool (implemented — git log + model)
├── git/
│   ├── index.ts                Git barrel export
│   ├── executor.ts             execGit, execGitStrict, isGitRepo, getRepoRoot
│   ├── status.ts               getChangedFiles, parsePorcelainLine
│   ├── log.ts                  getLog, GitLogEntry, parseLogOutput
│   ├── blame.ts                getBlame, getFileAge, BlameRange
│   ├── staging.ts              stageFiles, autoStage, getStagedDiff, createCommit
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
│   └── participant.ts          @aidev chat participant (routes to ToolRunner)
├── sidebar/
│   ├── index.ts                Sidebar barrel
│   └── provider.ts             ToolsTreeProvider, ResultsTreeProvider (jump-to-source)
├── commands/
│   └── index.ts                All command registrations (routes to ToolRunner)
└── status/
    └── index.ts                Status bar mode indicator
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
| Tool registry | Done | TOOL_REGISTRY with all 5 tools |
| Base tool class | Done | BaseTool: lifecycle, cancellation, summary, JSON/MD export |
| Git operations | Done | executor, status, log, blame, staging, hooks, validation |
| Extension activation | Done | settings → providers → runner → UI |
| ToolRunner | Done | Orchestrates execution, progress, result broadcasting |
| Chat participant | Done | Routes to ToolRunner, extracts file references |
| Sidebar views | Done | Tools list + Results tree with jump-to-source |
| Status bar | Done | Mode display with real-time updates |
| Commands | Done | All route to ToolRunner, export with format selection |
| VscodeLmProvider | Done | Full sendRequest: tier resolution, model matching, streaming |
| DirectApiProvider | Done | Anthropic + OpenAI API with model catalogs |
| DeadCodeTool | Stub | Extends BaseTool, `run()` not yet implemented |
| LintTool | Stub | Extends BaseTool, `run()` not yet implemented |
| CommentsTool | Done | Git blame age + model-driven value assessment |
| CommitTool | Done | Full pipeline: status → stage → model → validate → hooks |
| TldrTool | Done | Git log → model summarization with highlights |
| Unit tests | 32 passing | schema (12), validation (9), status parsing (11) |
| Integration tests | Not started | @vscode/test-electron configured |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-12 | VSCode + Cursor only (not JetBrains/Neovim) | Same extension API, ship fast |
| 2026-02-12 | Monorepo: core + vscode | Clean separation, testable core |
| 2026-02-12 | Global modes only, no per-feature overrides | Keep it simple at launch |
| 2026-02-12 | IDE-provided models primary, direct API fallback | Cover both Copilot and API-key users |
| 2026-02-12 | Static analysis + model synthesis for dead code/lint | Static is fast/cheap, model catches subtler issues |
| 2026-02-12 | Proposal-based for comments and commits | Safety first — never auto-modify without approval |
| 2026-02-12 | Chat Participant API with graceful degradation | Works in VSCode, commands fallback for Cursor |
| 2026-02-12 | npm over pnpm/yarn | More common on developer's systems |
| 2026-02-12 | Warn (not deny) as default enforcement | Less friction out of the box |
