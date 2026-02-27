/**
 * VS Code Extension Entry Point
 * Activates domains, registers commands, sets up middleware.
 */
import * as vscode from "vscode";
import { CommandRouter } from "./router";
/**
 * Activate the extension.
 * Called by VS Code when activation event is triggered.
 */
export declare function activate(context: vscode.ExtensionContext): Promise<void>;
/**
 * Deactivate the extension.
 * Called when extension is unloaded. VS Code disposes subscriptions automatically;
 * router teardown cleans up domain services.
 */
export declare function deactivate(): Promise<void>;
export { CommandRouter };
export { Logger } from "./infrastructure/logger";
export { Config } from "./infrastructure/config";
//# sourceMappingURL=main.d.ts.map