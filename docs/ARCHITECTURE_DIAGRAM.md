# AIDev — Feature & Architecture Diagram

How the main features and layers relate. See `SPEC.md` for full detail.

```mermaid
flowchart TB
  subgraph VSCode["VSCode Extension (packages/vscode)"]
    SettingsManager["SettingsManager"]
    ProviderManager["ProviderManager"]
    ToolRunner["ToolRunner"]
    Chat["Chat Participant (@aidev)"]
    Sidebar["Sidebar Panel"]
    Commands["Commands (Palette)"]
    Status["Status Bar"]
  end

  subgraph Core["Core (packages/core)"]
    SettingsSchema["settings/schema.ts\n(defaults, validation, MODE_TIER_MAP)"]
    ToolRegistry["tools/index.ts\nTOOL_REGISTRY"]
    AgentLoop["agent/loop.ts\nrunAgentLoop()"]
    SystemPrompt["agent/system-prompt.ts"]
    Tiers["models/tiers.ts\nresolveTier, resolveModelId"]
  end

  subgraph Providers["Model Providers"]
    VscodeLM["VscodeLmProvider\n(vscode.lm API)"]
    DirectAPI["DirectApiProvider\n(Anthropic / OpenAI)"]
  end

  subgraph Tools["Tools (ITool)"]
    Auto["autonomous"]
    Rest["restricted"]
    T_Dead["dead-code"]
    T_Lint["lint"]
    T_Tldr["tldr"]
    T_Branch["branch-diff"]
    T_Comments["comments"]
    T_Commit["commit"]
    T_Resolve["diff-resolve"]
    T_PR["pr-review"]
  end

  subgraph Git["Git Primitives (core/git)"]
    G_Status["status, staging"]
    G_Log["log"]
    G_Blame["blame"]
    G_Branch["branch, fetch"]
    G_Conflicts["conflicts"]
    G_Validation["validation, hooks"]
  end

  %% Activation / config flow
  SettingsManager --> SettingsSchema
  SettingsManager --> ProviderManager
  ProviderManager --> VscodeLM
  ProviderManager --> DirectAPI
  ProviderManager --> ToolRunner
  SettingsSchema --> Tiers
  Tiers --> ProviderManager

  %% Registry drives everything tool-related
  ToolRegistry --> ToolRunner
  ToolRegistry --> Chat
  ToolRegistry --> Sidebar
  ToolRegistry --> Commands
  ToolRegistry --> T_Dead & T_Lint & T_Tldr & T_Branch & T_Comments & T_Commit & T_Resolve & T_PR

  %% Invocation classification
  Auto --> T_Dead & T_Lint & T_Tldr & T_Branch
  Rest --> T_Comments & T_Commit & T_Resolve & T_PR

  %% Agent loop
  Chat --> AgentLoop
  AgentLoop --> SystemPrompt
  AgentLoop --> ToolRegistry
  AgentLoop --> Providers
  ToolRunner --> AgentLoop
  AgentLoop --> ToolRunner

  %% Tools use git
  T_Commit --> G_Status & G_Validation
  T_Tldr --> G_Log
  T_Branch --> G_Branch & G_Log
  T_Resolve --> G_Conflicts
  T_Comments --> G_Blame
  T_PR --> G_Branch & G_Status

  %% UI entry points
  SettingsManager --> Status
  ToolRunner --> Status
  ToolRunner --> Sidebar
  ToolRunner --> Commands
  Chat --> ToolRunner
  Sidebar --> ToolRunner
  Commands --> ToolRunner
```

## Agent loop flow (free-form chat)

```mermaid
sequenceDiagram
  participant User
  participant Chat as Chat Participant
  participant Loop as runAgentLoop()
  participant Provider as IModelProvider
  participant Runner as ToolRunner

  User->>Chat: Free-form message
  Chat->>Loop: runAgentLoop(provider, config, history, msg)
  Loop->>Loop: buildSystemPrompt(config)
  Loop->>Provider: sendRequest(messages, tools)

  alt tool_call (autonomous)
    Provider-->>Loop: toolCalls[]
    Loop-->>Chat: yield tool_call
    Chat->>Runner: execute(toolId, args)
    Runner-->>Chat: ScanResult
    Chat->>Loop: next(toolResult)
    Loop->>Provider: sendRequest(..., toolResult)
  else confirmation_required (restricted)
    Provider-->>Loop: toolCalls[]
    Loop-->>Chat: yield confirmation_required
    Chat->>User: Confirm?
    User->>Chat: Yes/No
    Chat->>Runner: execute(...) or skip
    Chat->>Loop: next(toolResult)
  else response
    Provider-->>Loop: content, stopReason=end_turn
    Loop-->>Chat: yield response
    Chat->>User: Stream text
  else error
    Loop-->>Chat: yield error
    Chat->>User: Show error
  end
```

## Mode → tier → model

```mermaid
flowchart LR
  subgraph Mode["aidev.mode"]
    Perf["performance"]
    Bal["balanced"]
    Econ["economy"]
  end

  subgraph Role["Task role"]
    ChatRole["chat/reasoning"]
    ToolRole["tool calls"]
  end

  subgraph Tier["Model tier"]
    High["high"]
    Mid["mid"]
    Low["low"]
  end

  subgraph Config["User config"]
    HighId["aidev.modelTiers.high"]
    MidId["aidev.modelTiers.mid"]
    LowId["aidev.modelTiers.low"]
  end

  Perf --> ChatRole --> High
  Perf --> ToolRole --> High
  Bal --> ChatRole --> High
  Bal --> ToolRole --> Mid
  Econ --> ChatRole --> Mid
  Econ --> ToolRole --> Low

  High --> HighId
  Mid --> MidId
  Low --> LowId
```

## Tool ↔ UI surface

| Tool          | Invocation   | Chat slash | Sidebar category | Uses Git              |
|---------------|-------------|------------|-------------------|------------------------|
| dead-code     | autonomous  | /deadcode  | Hygiene           | —                      |
| lint          | autonomous  | /lint      | Hygiene           | —                      |
| comments      | restricted  | /comments  | Hygiene           | blame                  |
| commit        | restricted  | /commit    | SCM               | status, staging, hooks |
| tldr          | autonomous  | /tldr      | General           | log                    |
| branch-diff   | autonomous  | /branchdiff| SCM               | branch, log            |
| diff-resolve  | restricted  | /resolve   | SCM               | conflicts              |
| pr-review     | restricted  | /prreview  | (sidebar)         | branch, status         |
