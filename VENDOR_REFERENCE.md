# VS Code Extension API — Vendor Reference

**Source**: https://code.visualstudio.com/api  
**Last Updated**: Feb 2026

## Core API Documentation

### Extension API Overview
- **URL**: https://code.visualstudio.com/api
- **Coverage**: Extension capabilities, guides, and advanced topics
- **Key Sections**:
  - Extension Capabilities (UI, Workbench, Webviews, Languages, Debug)
  - Extension Guides (Commands, Webviews, Custom Editors, TreeViews, Settings)
  - UX Guidelines (best practices for user experience)
  - Testing & Publishing (test frameworks, deployment)
  - Advanced Topics (Extension Host, Remote Development, Proposed APIs)

### Getting Started
- **URL**: https://code.visualstudio.com/api/get-started/your-first-extension
- **Key Concepts**:
  - Generator: `yo code` scaffolds TypeScript/JavaScript projects
  - Debug: F5 or `Debug: Start Debugging` launches Extension Development Host
  - Commands: Registered via `vscode.commands.registerCommand()`
  - Manifest: `package.json` declares contribution points (commands, menus, keybindings)
  - Contribution Points: Static declarations in package.json (see `/api/references/contribution-points`)

### Built-in Commands
- **URL**: https://code.visualstudio.com/api/references/commands
- **Scope**: Subset of VS Code commands exposed to extensions
- **Usage**: `vscode.commands.executeCommand(commandId, ...args)`
- **Examples**:
  - `vscode.open` - Open file/URL in editor
  - `vscode.diff` - Open diff view
  - `vscode.executeCodeActionProvider` - Trigger code actions
  - `editor.action.*` - Editor manipulation (fold, scroll, cursor move)
  - `workbench.action.*` - Workbench actions (find, tasks, extensions)

## VS Code API Reference
- **Main API**: https://code.visualstudio.com/api/references/vscode-api
- **Modules**:
  - `vscode.window` - UI (editors, dialogs, status bar, progress)
  - `vscode.workspace` - Workspace (folders, files, configuration)
  - `vscode.commands` - Command registration & execution
  - `vscode.languages` - Language support (completions, diagnostics, formatting)
  - `vscode.debug` - Debugger integration
  - `vscode.scm` - Source control (Git)
  - `vscode.extensions` - Extension discovery
  - `vscode.authentication` - OAuth/authentication providers
  - `vscode.notebooks` - Notebook support
  - `vscode.tests` - Test explorer integration

## Contribution Points
- **URL**: https://code.visualstudio.com/api/references/contribution-points
- **Types**:
  - `commands` - Command registration with titles and icons
  - `menus` - Command visibility in editor/explorer menus
  - `keybindings` - Keyboard shortcuts
  - `configuration` - Settings schema
  - `views` - Custom sidebars/panels
  - `viewsContainers` - Sidebar container definitions
  - `languages` - Language ID registration
  - `grammars` - Syntax highlighting
  - `debuggers` - Debugger adapter integration
  - `taskDefinitions` - Task provider registration

## Key Patterns

### Command Registration
```typescript
// In extension.ts
let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
  vscode.window.showInformationMessage('Hello from VS Code!');
});
context.subscriptions.push(disposable);
```

### Contribution Points (package.json)
```json
{
  "contributes": {
    "commands": [
      {
        "command": "extension.helloWorld",
        "title": "Hello World",
        "category": "My Extension"
      }
    ]
  }
}
```

### API Error Handling
- No try/catch required for most async operations
- Use `Promise<T>` return types
- Check URI validity with `Uri.file()`, `Uri.parse()`
- Workspace methods return `undefined` when file not found

## Best Practices (from UX Guidelines)
- Use built-in commands over custom keyboard shortcuts when possible
- Keep UI consistent with VS Code design language
- Provide clear, actionable error messages
- Avoid modal dialogs for common operations
- Use progress reporting for long-running tasks
- Respect user settings and configuration

## Samples & Resources
- **Samples**: https://github.com/microsoft/vscode-extension-samples
- **Discussions**: https://github.com/microsoft/vscode-discussions
- **Issues**: https://github.com/microsoft/vscode/issues
- **Marketplace**: https://marketplace.visualstudio.com/vscode

## Extension Manifest (package.json)
- `name`: Extension identifier (lowercase, no spaces)
- `displayName`: Human-readable name
- `version`: Semantic version
- `description`: Short description
- `publisher`: Publisher ID (required for marketplace)
- `engines.vscode`: Minimum VS Code version (e.g., `^1.80.0`)
- `activationEvents`: When extension activates (e.g., `onCommand:extension.helloWorld`)
- `main`: Entry point (usually `./out/extension.js`)
- `contributes`: Contribution points (commands, menus, views, etc.)

## Activation Events
- `onLanguage:<language>` - Activate when file of language opens
- `onCommand:<id>` - Activate when command is invoked
- `onView:<id>` - Activate when view becomes visible
- `onUri` - Activate on VS Code URI scheme
- `*` - Activate on startup (avoid; expensive)

---

See `ARCHITECTURE.md` for how this DDD-based scaffold applies these concepts.
