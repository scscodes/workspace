  Project Understanding — Architecture & Intent

  Meridian is a VS Code extension built on DDD + Aiogram-style command routing. The core idea is a general-purpose extension framework
  with:

  - A CommandRouter that dispatches typed commands through a middleware chain
  - Domain services (Git, Hygiene, Chat, Workflow, Agent) that register handlers at startup
  - A Result monad ({kind: "ok"|"err"}) for explicit error handling — no thrown exceptions in normal flow
  - Middleware (logging, audit) applied declaratively before handler dispatch
  - Workflow engine that executes JSON-defined step sequences
  - Agent registry that discovers local agent definitions from .vscode/agents/

  ---
  Feature State Analysis

  ┌─────────────────────────────────┬───────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────┐
  │             Feature             │        Status         │                                            Notes                                            │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ CommandRouter + Middleware      │ Solid                 │ Fully implemented: registration, dispatch, validation, teardown, middleware chain           │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Result monad / error handling   │ Solid                 │ Comprehensive. Centralized error codes in error-codes.ts + constants.ts                     │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Git domain — status/pull/commit │ Functional (mock)     │ Handlers are complete but use MockGitProvider — no real git CLI execution                   │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Git domain — smartCommit        │ Functional (mock)     │ Full pipeline: ChangeGrouper, CommitMessageSuggester, BatchCommitter with rollback          │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Git domain — analyzeInbound     │ Functional (mock)     │ InboundAnalyzer: fetch, diff, conflict detection, diff link generation                      │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Git domain — analytics          │ Functional (real git) │ GitAnalyzer calls actual git log via execSync. Webview HTML/JS/CSS exist                    │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Hygiene domain                  │ Stub                  │ Handlers registered but workspace scanning uses mock provider                               │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Chat domain                     │ Stub                  │ Context gathering + delegation stubs exist                                                  │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Workflow domain                 │ Functional            │ WorkflowEngine with step execution, variable interpolation, conditional branching           │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Agent domain                    │ Functional            │ AgentRegistry with JSON loading, capability/trigger queries                                 │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Telemetry                       │ Wired                 │ TelemetryTracker + ConsoleTelemetrySink wired as middleware in main.ts (activate)           │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Config                          │ Implemented           │ Typed config with VS Code settings contribution points                                      │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Constants                       │ Solid                 │ Centralized in constants.ts — command names, thresholds, cache settings, performance bounds │
  ├─────────────────────────────────┼───────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Tests                           │ Solid                 │ 14 test files covering router, result monad, workflow engine, all git subsystems            │
  └─────────────────────────────────┴───────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  UI/UX Surface Analysis

  This is the area you flagged as potentially lacking — and that assessment is accurate. Here's what exists vs. what's missing:

  What Exists

  1. Command palette commands (10 registered in package.json contributes.commands) — this is the primary user touchpoint today
  2. VS Code settings (4 declared: git.autofetch, hygiene.enabled, hygiene.scanInterval, log.level)
  3. Git Analytics webview — HTML/CSS/JS in src/domains/git/analytics-ui/ with Chart.js visualization (commit frequency, churn, author contributions, volatility
  scatter). The AnalyticsWebviewProvider exists in infrastructure/webview-provider.ts

  What's Missing / Not Connected

  1. No sidebar/panel registration — no views or viewsContainers in package.json contributes. There's no persistent UI presence (tree views, panels, etc.)
  2. Webview provider not wired — AnalyticsWebviewProvider (src/infrastructure/webview-provider.ts) is a mock that doesn't implement vscode.WebviewViewProvider.
     It's not registered in main.ts activation. Needs:
     - Implement vscode.WebviewViewProvider interface (resolveWebviewView method)
     - Register in main.ts via context.subscriptions.push(vscode.window.registerWebviewViewProvider(...))
     - Add views contribution point in package.json (e.g., "views.meridian": [{ "id": "meridian.analytics", ... }])
  3. [DONE] VS Code command wiring — main.ts fully wired: COMMAND_MAP maps prefixed IDs → internal CommandName, all 10 commands registered via registerCommand(),
     getCommandContext() implemented, activate() accepts vscode.ExtensionContext, telemetry middleware wired.
     Remaining: output channel + user-facing notifications (info/error messages).
  4. No user-facing output — commands dispatch and return Result objects, but there's no vscode.window.showInformationMessage, no Output Channel, no notification.
     Results go nowhere a user can see. Needs:
     - Create vscode.OutputChannel in activate() and attach to context.subscriptions
     - Add helper: resultToUserMessage() that converts Result → notification (info/warn/error)
     - Call vscode.window.showInformationMessage / showErrorMessage in command handlers
  5. SmartCommit interactivity is stubbed — lines 206-217 in src/domains/git/handlers.ts: the "present to user for approval" step just auto-approves; there's no QuickPick,
     InputBox, or webview dialog. Needs:
     - Implement vscode.window.showQuickPick() to display groups with suggested messages
     - Allow user to edit/approve each message or skip group
     - Return filtered groups for batch commit
  6. No menus, keybindings, or when-clauses — commands exist in palette but no context menu entries, no keyboard shortcuts, no conditional visibility.
     Needs in package.json:
     - "menus": { "commandPalette": [...], "explorer/context": [...] } — add git/hygiene commands to file explorer context
     - "keybindings": [...] — define shortcuts (e.g., "Ctrl+Shift+G" for git.smartCommit)
     - "when" clause conditions (e.g., "git.status" only when gitRepository context)
  7. Workflow/Agent management has no UI — listed in ARCHITECTURE.md "Next Steps" as needing sidebar UI.
  8. Chat domain — VS Code Chat API / Copilot integration not wired. Needs:
     - Register as chat participant: vscode.chat.createChatParticipant() if targeting GitHub Copilot Chat
     - OR implement language model access: vscode.lm.selectChatModels() for built-in LM
     - Map chat.context → chat session setup; chat.delegate → participant tools/functions
     - Add "chatParticipants" contribution point in package.json if using chat participant API

  Summary

  The backend/domain architecture is well-structured and complete. VS Code command wiring is done (all 10 commands registered, context builder implemented, telemetry
  middleware active). The remaining gap is user-facing output (Output Channel, notifications), sidebar tree views, the analytics webview, SmartCommit approval UI,
  and chat/Copilot integration. Also: package.json displayName is still "VS Code Scaffold POC" — should be updated to "Meridian".

---
## UI/UX Phase — Remaining Work

### Group 1: VS Code Command Wiring (Result Surfacing)

- **[DONE] VS Code command registration** — All 10 commands registered via COMMAND_MAP loop in activate(); getCommandContext() derives workspace metadata from ExtensionContext.
- **[DONE] Telemetry middleware** — ConsoleTelemetrySink wired as first middleware; tracks COMMAND_STARTED/COMPLETED/FAILED.

- **[REMAINING] Create Output Channel in `src/main.ts`**
  - In `activate()`, instantiate `const outputChannel = vscode.window.createOutputChannel("Meridian")` before router creation.
  - Push to `context.subscriptions` for auto-cleanup.

- **[REMAINING] Add result-to-message helper in `src/infrastructure/result-handler.ts` (new file)**
  - Create `function resultToUserMessage(result: Result<unknown>): {type: 'info'|'warn'|'error', message: string}`
  - Convert error codes (e.g., NO_CHANGES, GIT_COMMIT_ERROR) to human-readable messages.

- **[REMAINING] Wrap command handlers in `src/main.ts` (lines 163–186)**
  - Replace logger.info/error calls with:
    - `outputChannel.appendLine()` for all result statuses
    - `vscode.window.showInformationMessage()` on success
    - `vscode.window.showErrorMessage()` on failure (error.code + error.message)
  - Append timestamp and command ID to all output channel logs.

---
### Group 2: Panel View / Sidebar (Tree Data Providers)

- **Add viewsContainers + views to `package.json` contributes**
  - Add `"viewsContainers": {"activityBar": [{"id": "meridian-explorer", "title": "Meridian", "icon": "media/icon.svg"}]}`
  - Add `"views": {"meridian-explorer": [{"id": "meridian.git.view", "name": "Git Repos"}, {"id": "meridian.hygiene.view", "name": "Hygiene"}, {"id": "meridian.workflow.view", "name": "Workflows"}, {"id": "meridian.agent.view", "name": "Agents"}]}`

- **Create `src/ui/tree-providers/git-tree-provider.ts`**
  - Implement `vscode.TreeDataProvider<GitRepoItem>` to list workspace repos + branch status.
  - Query from `gitProvider.status()` on `getChildren()` refresh.
  - Show dirty/clean state via icons; emit `onDidChangeTreeData` when git state changes.

- **Create `src/ui/tree-providers/hygiene-tree-provider.ts`**
  - Implement `vscode.TreeDataProvider<HygieneIssueItem>` to list detected issues.
  - Call hygiene domain's scan handler on refresh; group issues by category (unused files, dead code, etc.).

- **Create `src/ui/tree-providers/workflow-tree-provider.ts`**
  - Implement `vscode.TreeDataProvider<WorkflowItem>` listing workflows from agent registry.
  - Each item has command trigger: `vscode.Uri.parse("command:meridian.workflow.run?..." )` for one-click execution.

- **Create `src/ui/tree-providers/agent-tree-provider.ts`**
  - Implement `vscode.TreeDataProvider<AgentItem>` listing discovered agents + their capabilities.
  - Each capability is a child node; clicking opens agent details in webview or quick info.

- **Register all tree providers in `src/main.ts`**
  - For each provider, call `vscode.window.registerTreeDataProvider(viewId, provider)` and push to subscriptions.
  - Pass logger, gitProvider, workspaceProvider, and dispatcher (router) to provider constructors.

---
### Group 3: Webview (Git Analytics Panel)

- **Update `src/infrastructure/webview-provider.ts` to implement `vscode.WebviewViewProvider`**
  - Remove MockWebviewPanel; change signature: `class AnalyticsWebviewProvider implements vscode.WebviewViewProvider`
  - Implement `resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken): Promise<void>`
  - In resolver: set `webviewView.webview.html` to content from `src/domains/git/analytics-ui/index.html` (read at runtime).
  - Set webview options: `localResourceRoots: [vscode.Uri.joinPath(context.extension.extensionUri, 'src/domains/git/analytics-ui')]`

- **Wire message routing in `resolveWebviewView()`**
  - Subscribe to `webviewView.webview.onDidReceiveMessage()` to handle "filter" and "export" messages from UI.
  - On filter: dispatch `analytics.rerun` command with filter params; post updated data back to webview.
  - On export: dispatch analytics command with export format, return file path via postMessage.

- **Register webview provider in `src/main.ts`**
  - Call `vscode.window.registerWebviewViewProvider('meridian.analytics', provider, {webviewOptions: {...}})`
  - Push disposable to subscriptions.

- **Update `package.json` to add analytics view**
  - Add to views under a new viewsContainer or existing explorer:
    - `{"id": "meridian.analytics", "name": "Git Analytics", "when": "gitRepository"}`

- **Load analytics-ui HTML/CSS/JS at runtime in webview provider**
  - Read `/src/domains/git/analytics-ui/index.html` and rewrite `<script src="script.js">` to use `vscode.Uri.joinPath()` so VS Code can serve local assets.
  - Do the same for `styles.css`; ensure relative paths in HTML are absolute vscode-resource URIs.

---
### Group 4: Chat / Copilot Integration

- **Create `src/ui/chat-participant.ts` (if targeting GitHub Copilot Chat API)**
  - Export `createChatParticipant()` that:
    - Returns a participant with id: "meridian", name: "Meridian", description: "..."
    - Registers 2–3 tools: "analyze-git" (delegates to analytics), "run-workflow" (delegates to workflow.run), "scan-hygiene" (delegates to hygiene.scan)
    - Each tool invokes router.dispatch() via injected dispatcher.

- **Alternatively, use native VS Code Chat API (if vscode.lm available)**
  - In `src/ui/chat-integration.ts`: call `vscode.lm.selectChatModels()` and create a language model-backed chat handler.
  - Wire context via `createContextHandler` from chat domain; add tools matching workflow/git/hygiene commands.

- **Wire chat handlers in `src/main.ts`**
  - If using participant API: `const participant = createChatParticipant(router, logger); vscode.chat.registerChatParticipant(participant); context.subscriptions.push(...)`
  - OR if using LM: wrap LM access and route to router.dispatch().

- **Add `package.json` contribution (if participant API)**
  - Add `"chatParticipants": [{"id": "meridian", "fullName": "Meridian Assistant", "icon": "...", "isDefault": false}]`

- **Map chat domain handlers to chat API**
  - `chat.context` → chat session initialization (gathers git branch, file, workspace context; sent to LM)
  - `chat.delegate` → tool invocation (user requests "run workflow X"; send as tool call to LM)
  - LM response → post to chat UI; allow user to accept/reject suggested workflow.

---
### Group 5: SmartCommit Approval UI

- **Replace auto-approval stub in `src/domains/git/handlers.ts` (lines 251–264)**
  - Change: Remove the `else { approvedGroups = groupsWithMessages }` fallback.
  - Call new helper: `const approvedGroups = await presentSmartCommitApprovalUI(groupsWithMessages, vscode)`
  - Helper must be injected as a dependency (passed to handler factory) or stored in context.

- **Create `src/ui/smart-commit-quick-pick.ts` (new file)**
  - Export `async function presentSmartCommitApprovalUI(groups: ChangeGroup[], vscode: typeof import('vscode')): Promise<ChangeGroup[]>`
  - Use `vscode.window.showQuickPick()` with multi-select items:
    - Each group is one item with label (e.g., "feature: auth flow (5 files)"), description (suggested message), picked: true
    - User toggles picks; selections are returned.
  - For each picked group, optionally show `vscode.window.showInputBox()` to edit the suggested message before confirming.
  - Return array of approved groups with user-edited messages (if changed).

- **Inject UI helper into handler in `src/domains/git/service.ts` (handler factory)**
  - Modify `createSmartCommitHandler()` signature to accept `approvalUI?: (groups) => Promise<ChangeGroup[]>`
  - If provided (and autoApprove=false), call it; otherwise fallback to auto-approve for backward compatibility.

- **Wire in `src/main.ts`**
  - After activating gitDomain, pass the UI helper:
    ```
    const smartCommitHandler = createSmartCommitHandler(
      gitProvider, logger, grouper, suggester, committer,
      presentSmartCommitApprovalUI // <-- pass UI callback
    );
    ```
  - OR extend gitDomain factory to accept UI callback parameter.

---
### Group 6: Menus, Keybindings & Context Clauses (Optional But Recommended)

- **Add context menu entries to `package.json` contributes**
  - `"menus": {"explorer/context": [{"command": "meridian.git.status", "group": "meridian@1"}, {"command": "meridian.hygiene.scan", "group": "meridian@2"}]}` (filter by file/folder)
  - Conditionally show: add `"when": "explorerResourceIsFolder"` to folder-level git commands.

- **Add keybindings to `package.json` contributes**
  - `"keybindings": [{"command": "meridian.git.smartCommit", "key": "ctrl+shift+g"}, {"command": "meridian.hygiene.scan", "key": "ctrl+shift+h"}]`
  - Platform-specific variants for macOS: `"mac": "cmd+shift+g"`

- **Add when-clauses to command definitions**
  - `"meridian.git.status"`: add `"when": "gitRepository"`
  - `"meridian.hygiene.scan"`: add `"when": "workspaceFolderCount > 0"`
  - Prevents palette clutter when not applicable.

---
## Summary of Wiring Order

1. **Commands** → Output Channel + notifications (Group 1)
2. **Sidebar Views** → Tree providers for Git, Hygiene, Workflow, Agent (Group 2)
3. **Git Analytics Webview** → WebviewViewProvider + local asset serving (Group 3)
4. **Chat/Copilot** → Participant registration or LM integration (Group 4)
5. **SmartCommit UI** → QuickPick approval flow (Group 5)
6. **Polish** → Menus, keybindings, when-clauses (Group 6)

Each group is independent; start with Group 1 (highest ROI) and iterate.

