# Architecture — VS Code Extension Scaffold POC

**Design Pattern**: Domain-Driven Design (DDD) with Aiogram-style Command Router  
**Philosophy**: Structure over features, explicit types, no magic, Result monad for error handling

---

## Overview

This scaffold implements a production-ready VS Code extension architecture with:

1. **Command Router** — centralized registry for command handlers (Aiogram/Telegram Bot pattern)
2. **Domain Services** — isolated, testable business logic (git, hygiene, chat, workflow, agent)
3. **Infrastructure Layer** — typed wrappers for external systems (git CLI, VS Code API, workspace)
4. **Workflow Engine** — linear step executor with conditional branching and output passing
5. **Agent Registry** — local agent definition discovery and validation
6. **Cross-Cutting Concerns** — logging, error handling, authentication via middleware
7. **Result Monad** — explicit error handling, no exceptions in normal flow

---

## Architecture Layers

### 1. Core (src/)

**types.ts** — Fundamental interfaces and types
- `Result<T>` — Either monad for error handling
- `Command`, `CommandName` — command definitions
- `Handler<P, R>` — handler interface `(ctx, params) => Promise<Result<R>>`
- `DomainService` — domain registration interface
- `Logger`, `GitProvider`, `WorkspaceProvider`, `ConfigProvider` — infrastructure abstractions
- `WorkflowDefinition`, `WorkflowStep` — workflow schemas
- `AgentDefinition` — agent definition schema

**router.ts** — CommandRouter
- Register domains and handlers at startup (validated upfront)
- Execute middleware chain (logging, auth, audit, rate-limiting)
- Dispatch commands to handlers
- Teardown and cleanup on deactivation

**main.ts** — Extension entry point
- Activate domains
- Register middleware
- Initialize workflow engine with step runner
- Expose VS Code commands (wrappers around router.dispatch)

### 2. Domains (src/domains/)

Each domain is isolated, owns its command space, and exports:
- `handlers.ts` — command handlers (example patterns, not all variants)
- `service.ts` — DomainService impl with initialization & teardown
- `types.ts` — domain-specific response types
- `index.ts` — public API exports

#### Git Domain (`git/`)
- **Commands**: `git.status`, `git.pull`, `git.commit`, `git.smartCommit`
- **Patterns**:
  - Read-only (`git.status`) — fetches state
  - Mutations with validation (`git.commit` requires message)
  - Smart commit (`git.smartCommit`) — interactive staged commit with validation, diff preview, and rollback
- **Integration**: GitProvider for git CLI execution

##### Smart Commit Workflow
```
1. Validate message (length, format)
2. Get unstaged changes (git status)
3. Stage selected paths (git add)
4. Show diff for review (git diff --cached)
5. User approval (interactive)
6. Execute commit (git commit)
7. Rollback on failure (git reset --soft)
```

#### Hygiene Domain (`hygiene/`)
- **Commands**: `hygiene.scan`, `hygiene.cleanup`
- **Patterns**:
  - Analysis (`hygiene.scan`) — finds dead files, large logs
  - Mutations with dry-run (`hygiene.cleanup` with `dryRun` param)
- **Integration**: WorkspaceProvider for file operations

#### Chat/Copilot Domain (`chat/`)
- **Commands**: `chat.context`, `chat.delegate`
- **Patterns**:
  - Context gathering (`chat.context`) — active file + git state
  - Local task delegation (`chat.delegate`) — spawn background tasks
- **Integration**: Local task execution

#### Workflow Domain (`workflow/`) — NEW
- **Commands**: `workflow.list`, `workflow.run`
- **Patterns**:
  - Discovery (`workflow.list`) — enumerate all workflows in `.vscode/workflows/`
  - Execution (`workflow.run <name>`) — execute workflow with conditional branching
- **Features**:
  - JSON-based workflow definitions
  - Linear step execution with onSuccess/onFailure branching
  - Variable interpolation across steps
  - Output passing between steps
  - Error recovery and rollback

#### Agent Domain (`agent/`) — NEW
- **Commands**: `agent.list`
- **Patterns**:
  - Discovery (`agent.list`) — enumerate all agents in `.vscode/agents/`
  - Local reference (definitions only, no spawning)
- **Features**:
  - JSON-based agent definitions
  - Capability discovery (what commands can this agent execute)
  - Workflow trigger mapping

### 3. Infrastructure (src/infrastructure/)

Typed wrappers for external systems, no leaking abstraction.

**logger.ts** — Structured Logger
- In-memory buffer of log entries
- Levels: DEBUG, INFO, WARN, ERROR (no console.log)
- Export for telemetry or external logging

**config.ts** — Configuration Provider
- Typed schema (no string keys)
- Defaults + VS Code workspace settings
- Example: `CONFIG_KEYS.GIT_AUTOFETCH`, `CONFIG_KEYS.HYGIENE_ENABLED`

**workspace.ts** — Workspace utilities
- Workspace root detection
- `.vscode/` path resolution
- JSON file discovery and parsing
- Constants: `WORKSPACE_PATHS.AGENTS_DIR`, `WORKSPACE_PATHS.WORKFLOWS_DIR`

**workflow-engine.ts** — Step execution engine
- `WorkflowEngine`: orchestrates linear step execution
- `StepRunner`: interface for command dispatch
- Conditional branching (onSuccess/onFailure)
- Variable interpolation and output passing
- Error recovery support

**agent-registry.ts** — Agent discovery
- Load agents from `.vscode/agents/`
- Validate against schema
- Query by capability or workflow trigger
- Cache and refresh

### 4. Cross-Cutting Concerns (src/cross-cutting/)

**middleware.ts** — Middleware chain factories
- `createLoggingMiddleware()` — tracks execution time
- `createPermissionMiddleware()` — access control per command
- `createRateLimitMiddleware()` — prevents spam
- `createAuditMiddleware()` — logs mutations for compliance

Middleware executed in order before handler dispatch. No exceptions in normal flow.

---

## Error Handling Patterns

### Result Monad for Explicit Error Handling

Every operation that can fail returns `Result<T>`:

```typescript
export type Result<T> =
  | { kind: "ok"; value: T }
  | { kind: "err"; error: AppError };
```

### Error Structure

```typescript
interface AppError {
  code: string;           // Machine-readable code (e.g., "GIT_UNAVAILABLE")
  message: string;        // Human-readable, actionable message
  details?: unknown;      // Underlying error (exception, stderr, etc.)
  context?: string;       // Location where error occurred (e.g., "GitDomainService.initialize")
}
```

### Error Code System

All error codes are defined in `src/infrastructure/error-codes.ts`:

```typescript
export const GIT_ERROR_CODES = {
  GIT_UNAVAILABLE: "GIT_UNAVAILABLE",
  STAGE_FAILED: "STAGE_FAILED",
  BATCH_COMMIT_ERROR: "BATCH_COMMIT_ERROR",
  // ... more codes
} as const;

export const WORKFLOW_ERROR_CODES = {
  INVALID_NEXT_STEP: "INVALID_NEXT_STEP",
  STEP_TIMEOUT: "STEP_TIMEOUT",
  // ... more codes
} as const;
```

**Benefit**: Type-safe error codes, centralized reference, easy to audit and document.

### Pattern: Null/Undefined Guards

All inputs must be validated before use:

```typescript
// ❌ Bad: Unsafe access
function parseChanges(data: any) {
  for (const file of data.files) {  // Crashes if null/undefined
    const path = file.path;
  }
}

// ✅ Good: Defensive guards
function parseChanges(data: any): Result<FileChange[]> {
  if (!data || typeof data !== "object") {
    return failure({
      code: "PARSE_CHANGES_FAILED",
      message: "Invalid data object",
    });
  }

  if (!Array.isArray(data.files)) {
    return failure({
      code: "PARSE_CHANGES_FAILED",
      message: "data.files must be an array",
    });
  }

  const changes: FileChange[] = [];
  for (const file of data.files) {
    if (!file || !file.path) continue; // Guard each item

    changes.push({
      path: file.path,
      // ... safe access
    });
  }

  return success(changes);
}
```

### Pattern: Try-Catch with Context

All async operations are wrapped with error context:

```typescript
async function analyze(): Promise<Result<InboundChanges>> {
  try {
    // Step 1: Fetch from remote
    const fetchResult = await gitProvider.fetch("origin");
    if (fetchResult.kind === "err") {
      return fetchResult;
    }

    // Step 2: Get branch (with null check)
    const branchResult = await gitProvider.getCurrentBranch();
    if (branchResult.kind === "err") {
      return branchResult;
    }

    const branch = branchResult.value;
    if (!branch || typeof branch !== "string") {
      return failure({
        code: GIT_ERROR_CODES.INBOUND_ANALYSIS_ERROR,
        message: "Invalid branch name from git provider",
        context: "InboundAnalyzer.analyze",
      });
    }

    // ... safe to use branch

    return success(result);
  } catch (err) {
    return failure({
      code: GIT_ERROR_CODES.INBOUND_ANALYSIS_ERROR,
      message: "Failed to analyze inbound changes; check git is installed with: git --version",
      details: err,
      context: "InboundAnalyzer.analyze",
    });
  }
}
```

### Pattern: Graceful Degradation

When non-critical operations fail, return a safe default instead of propagating error:

```typescript
async getAnalytics(): Promise<Result<GitAnalyticsReport>> {
  try {
    // Try expensive operation
    const report = await generateReport();
    return success(report);
  } catch (err) {
    // Analytics not critical: return empty report
    this.logger.warn(
      "Failed to generate analytics; returning empty report",
      "GitAnalyzer"
    );
    return success(this.emptyReport());
  }
}
```

### Pattern: Dispose/Cleanup

Resources must be explicitly released:

```typescript
class AnalyticsWebviewProvider {
  dispose(): Result<void> {
    try {
      if (this.panel) {
        const callback = (this.panel as any)._disposeCallback;
        if (callback) callback();
        this.panel = null;
      }
      return success(void 0);
    } catch (err) {
      return failure({
        code: "WEBVIEW_ERROR",
        message: "Failed to dispose webview",
        details: err,
        context: "AnalyticsWebviewProvider.dispose",
      });
    }
  }
}
```

### Pattern: Actionable Error Messages

Every error message must be actionable, not generic:

| ❌ Bad | ✅ Good |
|-------|--------|
| "Failed" | "Failed to fetch git status; check git is installed with: git --version" |
| "Error parsing" | "Failed to parse git log output; ensure git version >= 2.25.0" |
| "Operation failed" | "Batch commit failed at file staging; check file permissions with: ls -la" |
| "Unknown error" | "Workflow step 'checkout' timed out after 60s; increase timeout with: timeout=120000" |

### Detailed Error Handling Guide

See **refactor/error-handling.md** for comprehensive before/after examples, patterns, and best practices.

---

## Telemetry & Observability

### Telemetry Events

All significant operations emit telemetry events. Events are classified:

- **Critical** (always emit): Command completion/failure, error occurrences, mutations
- **Optional** (emit when relevant): Status checks, performance metrics, cache hits

### Event Types

| Category | Events | Purpose |
|----------|--------|---------|
| **Command Lifecycle** | COMMAND_STARTED, COMMAND_COMPLETED, COMMAND_FAILED | Track execution |
| **Git Operations** | GIT_INIT, GIT_PULL_EXECUTED, GIT_COMMIT_EXECUTED, GIT_SMART_COMMIT | Monitor git usage |
| **Workflow Execution** | WORKFLOW_STARTED, WORKFLOW_COMPLETED, WORKFLOW_STEP_EXECUTED | Track workflows |
| **Error Tracking** | ERROR_OCCURRED, RETRY_ATTEMPTED | Monitor reliability |
| **Analytics** | ANALYTICS_GENERATED, ANALYTICS_EXPORTED | Track feature usage |

### Event Emission Pattern

```typescript
// Emit immediately after operation completes
const start = Date.now();
try {
  const result = await operation();
  
  // Emit success event
  logger.info("COMMAND_COMPLETED", "handlerName", {
    commandName: "git.smartCommit",
    durationMs: Date.now() - start,
    filesAnalyzed: 10,
    groupsCreated: 3,
  });

  return success(result);
} catch (err) {
  // Emit failure event
  logger.error("COMMAND_FAILED", "handlerName", {
    commandName: "git.smartCommit",
    errorCode: "BATCH_COMMIT_ERROR",
    durationMs: Date.now() - start,
  });

  return failure(...);
}
```

### Event Definitions

All events are defined in `src/infrastructure/error-codes.ts`:

```typescript
export enum TelemetryEvent {
  COMMAND_STARTED = "COMMAND_STARTED",
  COMMAND_COMPLETED = "COMMAND_COMPLETED",
  COMMAND_FAILED = "COMMAND_FAILED",
  GIT_SMART_COMMIT = "GIT_SMART_COMMIT",
  GIT_BATCH_ROLLBACK = "GIT_BATCH_ROLLBACK",
  WORKFLOW_STARTED = "WORKFLOW_STARTED",
  WORKFLOW_COMPLETED = "WORKFLOW_COMPLETED",
  ERROR_OCCURRED = "ERROR_OCCURRED",
  // ... more events
}

export const TELEMETRY_EVENTS: Record<TelemetryEvent, TelemetryEventMetadata> = {
  [TelemetryEvent.COMMAND_COMPLETED]: {
    eventName: TelemetryEvent.COMMAND_COMPLETED,
    isCritical: true,
    description: "Fired when a command completes successfully",
    payloadExample: {
      commandName: "git.smartCommit",
      durationMs: 1234,
    },
  },
  // ... metadata for all events
};
```

### Monitoring Queries

Example: Command success rate by type
```sql
SELECT
  commandName,
  SUM(CASE WHEN eventName = 'COMMAND_COMPLETED' THEN 1 ELSE 0 END) as successes,
  SUM(CASE WHEN eventName = 'COMMAND_FAILED' THEN 1 ELSE 0 END) as failures,
  ROUND(100.0 * successes / (successes + failures), 2) as successRate
FROM telemetry_events
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY commandName
ORDER BY successRate ASC;
```

### Integration with Observability Tools

- **Datadog**: Emit as metrics via StatsD
- **Segment**: Track as analytics events
- **OpenTelemetry**: Emit spans and metrics
- **CloudWatch**: Log to AWS CloudWatch

See **refactor/telemetry-events.md** for comprehensive event reference and examples.

---

## Configuration & Constants

### Configuration Defaults

Centralized in `src/infrastructure/error-codes.ts`:

```typescript
export const TIMEOUTS = {
  GIT_OPERATION: 30_000,      // 30 seconds
  GIT_CLONE: 120_000,         // 2 minutes
  WORKFLOW_STEP: 60_000,      // 1 minute
  NETWORK_REQUEST: 10_000,    // 10 seconds
} as const;

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialBackoffMs: 100,
  maxBackoffMs: 5000,
  backoffMultiplier: 2,
};
```

### Environment Variables

Supported environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `GIT_PATH` | `"git"` | Path to git executable |
| `TELEMETRY_ENABLED` | `"true"` | Enable telemetry events |
| `TELEMETRY_ENDPOINT` | None | Telemetry endpoint URL |
| `LOG_LEVEL` | `"info"` | Logging level (debug, info, warn, error) |

---

## Patterns

### Command Definition (Explicit Types)

```typescript
// In types.ts, discriminated union of all commands:
export type CommandName =
  | GitCommandName
  | HygieneCommandName
  | ChatCommandName
  | WorkflowCommandName
  | AgentCommandName;

export type GitCommandName = "git.status" | "git.pull" | "git.commit" | "git.smartCommit";
export type WorkflowCommandName = "workflow.list" | "workflow.run";

// Per-command parameter types:
interface SmartCommitParams {
  message: string;
  autoStageAll?: boolean;
  paths?: string[];
  branch?: string;
}
```

**Benefit**: Compiler catches mismatched params at call site.

### Handler Registration (Validated at Startup)

```typescript
// In git/service.ts:
export class GitDomainService implements DomainService {
  name = "git";

  handlers = {
    "git.status": createStatusHandler(gitProvider, logger),
    "git.pull": createPullHandler(gitProvider, logger),
    "git.commit": createCommitHandler(gitProvider, logger),
    "git.smartCommit": createSmartCommitHandler(gitProvider, logger),
  };

  async initialize(): Promise<Result<void>> {
    // Verify git is available
    const result = await gitProvider.status();
    return result.kind === "ok" ? success(void 0) : failure(...);
  }
}

// In main.ts:
const gitDomain = createGitDomain(gitProvider, logger);
router.registerDomain(gitDomain);

// Router validates handlers exist and initializes domain
const validationResult = await router.validateDomains();
```

**Benefit**: No late binding; all commands registered & initialized before extension is ready.

### Error Handling (Result Monad)

```typescript
// Never throw; return Result<T>
async function statusHandler(ctx, params) {
  try {
    const result = await gitProvider.status(params.branch);
    if (result.kind === "ok") {
      return success(result.value);
    }
    return result; // Forward error
  } catch (err) {
    return failure({
      code: "GIT_STATUS_ERROR",
      message: "Failed to fetch git status",
      details: err,
      context: "git.status",
    });
  }
}

// At call site:
const result = await router.dispatch(command, ctx);
if (result.kind === "ok") {
  handleSuccess(result.value);
} else {
  handleError(result.error);
}
```

**Benefit**: Explicit error flow, no silent failures or exception handling.

### Workflow Definition (JSON Schema)

```json
{
  "name": "lint-and-commit",
  "description": "Run linter, then commit if successful",
  "version": "1.0.0",
  "steps": [
    {
      "id": "lint",
      "command": "hygiene.lint",
      "params": { "path": "." },
      "onSuccess": "test",
      "onFailure": "exit"
    },
    {
      "id": "test",
      "command": "hygiene.test",
      "params": { "path": "." },
      "onSuccess": "commit",
      "onFailure": "exit"
    },
    {
      "id": "commit",
      "command": "git.smartCommit",
      "params": { "message": "chore: lint and test passed" },
      "onSuccess": "exit"
    }
  ]
}
```

**Location**: `.vscode/workflows/lint-and-commit.json`  
**Benefit**: Declarative, version-controlled, easy to audit.

### Workflow Execution

```typescript
// In workflow domain:
const workflowEngine = new WorkflowEngine(logger, stepRunner);
const result = await workflowEngine.execute(workflow, commandContext, {
  srcPath: "/home/user/src",
});

// Each step executes sequentially:
// 1. lint: hygiene.lint (params interpolated)
// 2. If success → test; if failure → exit
// 3. test: hygiene.test
// 4. If success → commit; if failure → exit
// 5. commit: git.smartCommit
// 6. If success → exit

// Output passing:
// Step N output available to step N+1 via $(outputKey)
```

**Benefit**: Separates orchestration from implementation, allows complex workflows without code.

### Agent Definition (JSON Schema)

```json
{
  "id": "git-operator",
  "description": "Git operations handler",
  "version": "1.0.0",
  "capabilities": ["git.status", "git.smartCommit", "git.pull"],
  "workflowTriggers": ["lint-and-commit", "pre-commit"],
  "metadata": {
    "author": "ops-team",
    "schedule": "on-demand"
  }
}
```

**Location**: `.vscode/agents/git-operator.json`  
**Benefit**: Declares agent capabilities, no external spawning.

### Agent Discovery

```typescript
// In agent registry:
const agents = loadAgents();
const gitOperators = findAgentsByCapability("git.smartCommit");
const preCommitAgents = findAgentsByWorkflowTrigger("pre-commit");
```

**Benefit**: Local reference only, no network calls.

### Middleware Chain

```typescript
// In main.ts, register middleware:
router.use(createLoggingMiddleware(logger));
router.use(createAuditMiddleware(logger));

// In router.ts, dispatch():
async dispatch(command, context): Promise<Result<unknown>> {
  const handler = this.handlers[command.name];
  
  // Execute middleware chain
  const mwCtx: MiddlewareContext = { commandName, startTime, permissions: [] };
  await this.executeMiddlewares(mwCtx, 0); // Throws on auth failure
  
  // Execute handler
  try {
    return await handler(context, command.params);
  } catch (err) {
    return failure(...);
  }
}

// Execution order: LoggingMiddleware → AuditMiddleware → handler
```

**Benefit**: Concerns (logging, auth, rate-limiting) separated from business logic.

### Dependency Injection

```typescript
// Services receive dependencies; fully testable
export class GitDomainService implements DomainService {
  constructor(
    private gitProvider: GitProvider,
    private logger: Logger
  ) {}

  // Test by passing mock GitProvider & Logger
}

// Create with real providers in main.ts
const gitDomain = createGitDomain(realGitProvider, logger);
```

### Smart Commit Example

```typescript
// Handler demonstrates complex workflow with recovery:
async function createSmartCommitHandler(
  gitProvider: GitProvider,
  logger: Logger
): Handler<SmartCommitParams, SmartCommitResult> {
  return async (ctx, params) => {
    // 1. Validate message format
    if (!params.message || params.message.length < 3) {
      return failure({ code: "INVALID_MESSAGE", ... });
    }

    try {
      // 2. Get changes
      const changes = await gitProvider.getChanges();
      
      // 3. Stage selected paths
      await gitProvider.stage(params.paths || []);
      
      // 4. Show diff for review (in real extension, would be interactive)
      const diff = await gitProvider.getDiff(params.paths);
      logger.debug(`Diff:\n${diff}`);
      
      // 5. Commit
      const result = await gitProvider.commit(params.message);
      
      if (result.kind === "ok") {
        return success({ success: true, message: "Committed" });
      }
      
      // 6. Rollback on failure
      await gitProvider.reset(params.paths || []);
      return failure({ code: "COMMIT_FAILED", ... });
    } catch (err) {
      // Error recovery
      await gitProvider.reset(params.paths || []);
      return failure({ ... });
    }
  };
}
```

**Benefit**: Demonstrates error recovery, user approval points, and complex state management.

---

## Extension Points

### Adding a New Domain

1. Create `src/domains/<domain-name>/`
2. Define commands in `types.ts` (add to `CommandName` union)
3. Implement handlers in `handlers.ts`
4. Create `DomainService` in `service.ts`
5. Register in `main.ts`:
   ```typescript
   const newDomain = createNewDomain(...providers, logger);
   router.registerDomain(newDomain);
   ```

### Adding Middleware

```typescript
// In cross-cutting/middleware.ts:
export function createMyMiddleware(logger): Middleware {
  return async (ctx, next) => {
    logger.info(`Before ${ctx.commandName}`, "MyMiddleware");
    await next();
    logger.info(`After ${ctx.commandName}`, "MyMiddleware");
  };
}

// In main.ts:
router.use(createMyMiddleware(logger));
```

### Adding a Workflow

1. Create `<workspace>/.vscode/workflows/<name>.json`
2. Define steps with command references
3. Accessible via `workflow.list` and `workflow.run <name>`

### Adding an Agent Definition

1. Create `<workspace>/.vscode/agents/<id>.json`
2. Define capabilities and workflow triggers
3. Discoverable via `agent.list`

---

## Testing Strategy

### Unit Tests (per handler)

```typescript
// Mock providers
const mockGit = { status: jest.fn().mockResolvedValue(...) };
const mockLogger = { info: jest.fn(), ... };

// Create handler
const handler = createStatusHandler(mockGit, mockLogger);

// Test with various params
const result = await handler(ctx, { branch: "dev" });
expect(result.kind).toBe("ok");
expect(mockGit.status).toHaveBeenCalledWith("dev");
```

### Integration Tests (router + domains)

```typescript
const router = new CommandRouter(logger);
const gitDomain = createGitDomain(mockGit, logger);
router.registerDomain(gitDomain);

await router.validateDomains();

const result = await router.dispatch(
  { name: "git.status", params: {} },
  context
);
expect(result.kind).toBe("ok");
```

### Workflow Tests

```typescript
const workflow: WorkflowDefinition = {
  name: "test-workflow",
  steps: [
    { id: "step1", command: "git.status", params: {}, onSuccess: "step2" },
    { id: "step2", command: "git.status", params: {}, onSuccess: "exit" },
  ],
};

const engine = new WorkflowEngine(logger, stepRunner);
const result = await engine.execute(workflow, ctx);
expect(result.kind).toBe("ok");
```

---

## File Structure

```
src/
├── main.ts                          # Entry point, domain registration
├── types.ts                         # Core types, Result monad
├── router.ts                        # CommandRouter implementation
├── domains/
│   ├── git/
│   │   ├── index.ts
│   │   ├── service.ts
│   │   ├── handlers.ts
│   │   └── types.ts (Git-specific responses)
│   ├── hygiene/
│   │   ├── index.ts
│   │   ├── service.ts
│   │   └── handlers.ts
│   ├── chat/
│   │   ├── index.ts
│   │   ├── service.ts
│   │   └── handlers.ts
│   ├── workflow/                    # NEW
│   │   ├── index.ts
│   │   ├── service.ts
│   │   ├── handlers.ts
│   │   └── types.ts
│   └── agent/                       # NEW
│       ├── index.ts
│       ├── service.ts
│       ├── handlers.ts
│       └── types.ts
├── infrastructure/
│   ├── logger.ts
│   ├── config.ts
│   ├── workspace.ts                 # NEW
│   ├── workflow-engine.ts            # NEW
│   └── agent-registry.ts             # NEW
└── cross-cutting/
    └── middleware.ts

.vscode/                             # NEW - Convention directories
├── agents/                           # Agent definitions
│   ├── git-operator.json
│   └── ...
└── workflows/                        # Workflow definitions
    ├── lint-and-commit.json
    └── ...
```

---

## Constraints & Design Decisions

### TypeScript Strict Mode
- No `any` types
- No implicit returns
- No unused variables
- Catches errors at compile time, not runtime

### No External Dependencies (except @vscode/api)
- Minimal `package.json` → smaller bundle
- Clear dependencies → easier audits
- Decoupled from ecosystem trends

### Result Monad (no exceptions in handlers)
- Explicit error flow
- Middleware can handle errors without try/catch
- Logging at every layer

### Local-Only Scope
- No network calls
- No external agent spawning
- All definitions in `.vscode/` (workspace convention)
- Workflows and agents are declarations, not code

### One Example Handler per Domain
- Show pattern, not all variants
- Reduce token cost
- Focus on architecture over implementation

### Lazy Initialization (domains initialize on startup)
- Validate config, check git availability, etc.
- Fail fast if prerequisites missing
- Clear startup error messages

---

## Completed Refactoring

### Error Handling Audit & Fixes (✓ Complete)

- [x] All GitProvider calls wrapped in Result<T> checks
- [x] Null/undefined guards before property access
- [x] Try-catch for async operations with proper error context
- [x] File I/O errors caught and wrapped
- [x] Parser errors from git output handled gracefully
- [x] Graceful degradation (cache miss fallback)
- [x] Webview message handling with error callbacks
- [x] Workflow JSON schema validation
- [x] Missing dispose/cleanup handlers implemented

### Documentation (✓ Complete)

- [x] **refactor/error-handling.md** — Error handling patterns with before/after examples
- [x] **refactor/telemetry-events.md** — Telemetry event reference
- [x] **TESTING.md** — Testing guide with mock usage and error path testing
- [x] **MIGRATION.md** — Breaking changes guide for callers
- [x] **ARCHITECTURE.md** — This document (added error handling & telemetry sections)

### Infrastructure (✓ Complete)

- [x] **error-codes.ts** — Centralized error codes and telemetry events
- [x] Consistent error wrapping (code + message + details + context)
- [x] Retry configuration and timeout constants
- [x] Type-safe error codes (no string literals)

## Next Steps (Not in Scope)

- [ ] Replace mock providers with real VS Code API wrappers
- [ ] Implement background task scheduling (periodic hygiene scans)
- [ ] Pre-commit hooks (git domain)
- [ ] Full test suite (unit + integration) — See TESTING.md for framework
- [ ] Publish to VS Code Marketplace
- [ ] UI for workflow/agent management in VS Code sidebar
- [ ] Conditional branching in workflows (beyond onSuccess/onFailure)
- [ ] Complete refactoring of remaining domains (chat, agent, hygiene)
- [ ] Timeout handling for long operations
- [ ] Retry logic with exponential backoff

---

## References

- **VS Code Extension API**: https://code.visualstudio.com/api
- **Command Registration**: https://code.visualstudio.com/api/extension-guides/command
- **Contribution Points**: https://code.visualstudio.com/api/references/contribution-points
- **Marketplace**: https://marketplace.visualstudio.com/vscode

---

**Last Updated**: Feb 25, 2026  
**Architecture Version**: 2.0.0  
**Recent Changes**: Error Handling Refactoring — Result monad, error codes, telemetry, documentation
