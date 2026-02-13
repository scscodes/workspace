import * as vscode from 'vscode';
import type { ScanResult, ScanOptions, ToolId } from '@aidev/core';
import { getToolEntry } from '@aidev/core';
import { DeadCodeTool } from '@aidev/core/dist/tools/dead-code/index.js';
import { LintTool } from '@aidev/core/dist/tools/lint/index.js';
import { CommitTool } from '@aidev/core/dist/tools/commit/index.js';
import { CommentsTool } from '@aidev/core/dist/tools/comments/index.js';
import { TldrTool } from '@aidev/core/dist/tools/tldr/index.js';
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
    const entry = getToolEntry(toolId);
    if (!entry) {
      void vscode.window.showErrorMessage(`AIDev: Unknown tool "${toolId}".`);
      return undefined;
    }

    const cwd = this.getWorkspacePath();
    if (!cwd) {
      void vscode.window.showErrorMessage('AIDev: No workspace folder open.');
      return undefined;
    }

    const provider = this.providers.getActiveProvider();

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
          throw new Error(`Failed to create tool: ${toolId}`);
        }

        // Wire cancellation
        token.onCancellationRequested(() => tool.cancel());

        const scanOptions: ScanOptions = {
          paths: options?.paths,
          signal: options?.signal,
        };

        progress.report({ message: 'Analyzing...' });
        return tool.execute(scanOptions);
      },
    );

    // Store and broadcast result
    this.lastResults.set(toolId, result);
    this._onDidCompleteRun.fire(result);

    // Notify user
    this.notifyResult(entry.name, result);

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

    switch (toolId) {
      case 'dead-code': {
        // DeadCodeTool doesn't need deps yet (stub)
        return new DeadCodeTool();
      }
      case 'lint': {
        return new LintTool();
      }
      case 'commit': {
        if (!provider) {
          void vscode.window.showErrorMessage(
            'AIDev: No model provider available. Configure one in settings.',
          );
          return undefined;
        }
        const tool = new CommitTool();
        tool.setDeps({
          modelProvider: provider,
          commitConstraints: current.commitConstraints,
          preCommitDryRun: current.preCommitDryRun,
          cwd,
        });
        return tool;
      }
      case 'comments': {
        if (!provider) {
          void vscode.window.showErrorMessage(
            'AIDev: No model provider available. Configure one in settings.',
          );
          return undefined;
        }
        const tool = new CommentsTool();
        tool.setDeps({
          modelProvider: provider,
          cwd,
          enabledLanguages: current.enabledLanguages,
        });
        return tool;
      }
      case 'tldr': {
        if (!provider) {
          void vscode.window.showErrorMessage(
            'AIDev: No model provider available. Configure one in settings.',
          );
          return undefined;
        }
        const tool = new TldrTool();
        tool.setDeps({
          modelProvider: provider,
          cwd,
        });
        return tool;
      }
      default:
        return undefined;
    }
  }

  private getWorkspacePath(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
  }

  private notifyResult(toolName: string, result: ScanResult): void {
    const { status, summary } = result;

    switch (status) {
      case 'completed':
        if (summary.totalFindings > 0) {
          void vscode.window.showInformationMessage(
            `AIDev: ${toolName} found ${String(summary.totalFindings)} items. Check the sidebar for details.`,
          );
        } else {
          void vscode.window.showInformationMessage(
            `AIDev: ${toolName} completed — no findings.`,
          );
        }
        break;
      case 'failed':
        void vscode.window.showErrorMessage(
          `AIDev: ${toolName} failed: ${result.error ?? 'Unknown error'}`,
        );
        break;
      case 'cancelled':
        void vscode.window.showInformationMessage(`AIDev: ${toolName} cancelled.`);
        break;
    }
  }
}
