import * as vscode from 'vscode';
import type { ScanResult, ScanOptions, ToolId } from '@aidev/core';
import {
  getToolEntry,
  DeadCodeTool,
  LintTool,
  CommitTool,
  CommentsTool,
  TldrTool,
  BranchDiffTool,
  DiffResolveTool,
} from '@aidev/core';
import type { SettingsManager } from '../settings/index.js';
import type { ProviderManager } from '../providers/index.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type ToolResultCallback = (result: ScanResult) => void;

// ─── Tool Runner ────────────────────────────────────────────────────────────

/**
 * Orchestrates tool execution in the VSCode environment.
 *
 * Bridges @aidev/core tools with VSCode-specific concerns:
 * - Injects model provider and settings as dependencies
 * - Resolves workspace path for cwd
 * - Manages result notifications and sidebar updates
 * - Handles progress indication
 */
export class ToolRunner implements vscode.Disposable {
  private readonly _onDidCompleteRun = new vscode.EventEmitter<ScanResult>();

  /** Fires when any tool run completes (success, failure, or cancel) */
  readonly onDidCompleteRun: vscode.Event<ScanResult> = this._onDidCompleteRun.event;

  /** Most recent result from each tool */
  private readonly lastResults = new Map<ToolId, ScanResult>();

  constructor(
    private readonly settings: SettingsManager,
    private readonly providers: ProviderManager,
  ) {}

  /**
   * Run a tool by ID, with optional scan options.
   * Shows progress in the status bar and notifies on completion.
   */
  async run(toolId: ToolId, options?: Partial<ScanOptions>): Promise<ScanResult | undefined> {
    console.log(`AIDev: Running tool: ${toolId}`);
    
    const entry = getToolEntry(toolId);
    if (!entry) {
      const errorMsg = `AIDev: Unknown tool "${toolId}". Check TOOL_REGISTRY for valid tool IDs.`;
      console.error(errorMsg);
      void vscode.window.showErrorMessage(errorMsg);
      return undefined;
    }

    const cwd = this.getWorkspacePath();
    if (!cwd) {
      const errorMsg = 'AIDev: No workspace folder open. Open a workspace folder to use AIDev tools.';
      console.error(errorMsg);
      void vscode.window.showErrorMessage(errorMsg);
      return undefined;
    }

    console.log(`AIDev: Workspace path: ${cwd}`);

    let provider = this.providers.getActiveProvider();
    console.log(`AIDev: Active provider: ${provider ? provider.name : 'none'}`);
    
    // If no provider but tool requires one, try to reactivate with retries
    if (!provider && this.toolRequiresProvider(toolId)) {
      console.log(`AIDev: Tool ${toolId} requires provider, but none available. Retrying activation with delays...`);
      // Attempt to reactivate providers in case they became available
      // (e.g., IDE models loading after extension activation)
      // Use more retries and longer delays for tool execution
      try {
        await this.providers.retryActivation(5, 1500);
        provider = this.providers.getActiveProvider();
        if (provider) {
          console.log(`AIDev: Provider became available after retry: ${provider.name}`);
        } else {
          console.warn(`AIDev: Provider still not available after retry. Models may not be configured.`);
        }
      } catch (error) {
        console.error('AIDev: Error during provider retry:', error);
      }
    }

    // Execute with progress
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: `AIDev: ${entry.name}`,
        cancellable: true,
      },
      async (progress, token) => {
        progress.report({ message: 'Starting...' });

        const tool = this.createTool(toolId, cwd, provider);
        if (!tool) {
          // Return a failed result instead of throwing
          // createTool already showed an error message to the user
          return {
            toolId,
            status: 'failed',
            startedAt: new Date(),
            completedAt: new Date(),
            findings: [],
            summary: {
              totalFindings: 0,
              bySeverity: { error: 0, warning: 0, info: 0, hint: 0 },
            },
            error: `Tool "${toolId}" could not be created. Check error messages above for details.`,
            filesScanned: 0,
          };
        }

        // Wire cancellation
        token.onCancellationRequested(() => tool.cancel());

        const scanOptions: ScanOptions = {
          paths: options?.paths,
          signal: options?.signal,
          args: options?.args,
        };

        progress.report({ message: 'Analyzing...' });
        
        console.log(`AIDev: Executing ${toolId}...`);
        const executeResult = await tool.execute(scanOptions);
        console.log(`AIDev: ${toolId} execution completed with status: ${executeResult.status}`);
        
        if (executeResult.status === 'failed' && executeResult.error) {
          console.error(`AIDev: ${toolId} execution failed:`, executeResult.error);
        }
        
        return executeResult;
      },
    );

    // Store and broadcast result
    this.lastResults.set(toolId, result);
    this._onDidCompleteRun.fire(result);

    // Notify user
    this.notifyResult(entry.name, result);

    console.log(`AIDev: Tool ${toolId} run complete. Status: ${result.status}, Findings: ${result.findings.length}`);
    return result;
  }

  /**
   * Get the most recent result for a tool.
   */
  getLastResult(toolId: ToolId): ScanResult | undefined {
    return this.lastResults.get(toolId);
  }

  /**
   * Get all stored results.
   */
  getAllResults(): Map<ToolId, ScanResult> {
    return new Map(this.lastResults);
  }

  dispose(): void {
    this._onDidCompleteRun.dispose();
    this.lastResults.clear();
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private createTool(
    toolId: ToolId,
    cwd: string,
    provider: import('@aidev/core').IModelProvider | undefined,
  ): import('@aidev/core').ITool | undefined {
    const current = this.settings.current;

    // Helper to create consistent error messages for missing providers
    const getProviderErrorMsg = (toolName: string): string => {
      const isCursor = vscode.env.appName.toLowerCase().includes('cursor');
      const baseMsg = `AIDev: ${toolName} requires a model provider. No provider is currently available.`;
      
      if (isCursor) {
        return (
          baseMsg +
          ' Cursor IDE does not expose models via vscode.lm API. ' +
          'Please configure direct API keys: set aidev.providerSource to "direct" ' +
          'and configure aidev.directApi.provider and aidev.directApi.apiKey in settings.'
        );
      }
      
      return (
        baseMsg +
        ' Check AIDev settings (aidev.providerSource) and ensure your IDE has models configured or API keys are set.'
      );
    };

    // Helper to safely create a tool with error handling
    const createToolSafely = <T extends import('@aidev/core').ITool>(
      ToolClass: new () => T,
      toolName: string,
      setDepsFn: (tool: T) => void,
    ): T | undefined => {
      try {
        const tool = new ToolClass();
        setDepsFn(tool);
        console.log(`AIDev: ${toolName} created successfully`);
        return tool;
      } catch (error) {
        const errorMsg = `AIDev: Failed to create ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg, error);
        void vscode.window.showErrorMessage(errorMsg);
        return undefined;
      }
    };

    switch (toolId) {
      case 'dead-code': {
        return createToolSafely(
          DeadCodeTool,
          'DeadCodeTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider,
              cwd,
              enabledLanguages: current.enabledLanguages,
            });
          },
        );
      }
      case 'lint': {
        return createToolSafely(
          LintTool,
          'LintTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider,
              cwd,
              enabledLanguages: current.enabledLanguages,
            });
          },
        );
      }
      case 'commit': {
        if (!provider) {
          const errorMsg = getProviderErrorMsg('Auto-Commit');
          console.error(errorMsg);
          void vscode.window.showErrorMessage(errorMsg);
          return undefined;
        }
        return createToolSafely(
          CommitTool,
          'CommitTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider!,
              commitConstraints: current.commitConstraints,
              preCommitDryRun: current.preCommitDryRun,
              cwd,
            });
          },
        );
      }
      case 'comments': {
        if (!provider) {
          const errorMsg = getProviderErrorMsg('Comment Pruning');
          console.error(errorMsg);
          void vscode.window.showErrorMessage(errorMsg);
          return undefined;
        }
        return createToolSafely(
          CommentsTool,
          'CommentsTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider!,
              cwd,
              enabledLanguages: current.enabledLanguages,
            });
          },
        );
      }
      case 'tldr': {
        if (!provider) {
          const errorMsg = getProviderErrorMsg('TLDR');
          console.error(errorMsg);
          void vscode.window.showErrorMessage(errorMsg);
          return undefined;
        }
        return createToolSafely(
          TldrTool,
          'TldrTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider!,
              cwd,
            });
          },
        );
      }
      case 'branch-diff': {
        return createToolSafely(
          BranchDiffTool,
          'BranchDiffTool',
          (tool) => {
            tool.setDeps({ cwd });
          },
        );
      }
      case 'diff-resolve': {
        if (!provider) {
          const errorMsg = getProviderErrorMsg('Diff Resolver');
          console.error(errorMsg);
          void vscode.window.showErrorMessage(errorMsg);
          return undefined;
        }
        return createToolSafely(
          DiffResolveTool,
          'DiffResolveTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider!,
              cwd,
            });
          },
        );
      }
      default: {
        const errorMsg = `AIDev: Unknown tool ID: ${toolId}`;
        console.error(errorMsg);
        void vscode.window.showErrorMessage(errorMsg);
        return undefined;
      }
    }
  }

  private getWorkspacePath(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
  }

  /**
   * Check if a tool requires a model provider to function.
   */
  private toolRequiresProvider(toolId: ToolId): boolean {
    // Tools that require a model provider
    return ['tldr', 'comments', 'commit', 'diff-resolve'].includes(toolId);
  }

  private notifyResult(toolName: string, result: ScanResult): void {
    const { status, summary } = result;

    switch (status) {
      case 'completed':
        if (summary.totalFindings > 0) {
          const message = `AIDev: ${toolName} found ${String(summary.totalFindings)} items. Check the sidebar for details.`;
          console.log(message);
          void vscode.window.showInformationMessage(message);
        } else {
          const message = `AIDev: ${toolName} completed — no findings.`;
          console.log(message);
          void vscode.window.showInformationMessage(message);
        }
        break;
      case 'failed': {
        const errorMsg = result.error ?? 'Unknown error';
        const message = `AIDev: ${toolName} failed: ${errorMsg}`;
        console.error(message);
        void vscode.window.showErrorMessage(message);
        break;
      }
      case 'cancelled': {
        const message = `AIDev: ${toolName} cancelled.`;
        console.log(message);
        void vscode.window.showInformationMessage(message);
        break;
      }
    }
  }
}
