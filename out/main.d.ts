/**
 * VS Code Extension Entry Point
 * Activates domains, registers commands, sets up middleware.
 */
import { CommandRouter } from "./router";
/**
 * Activate the extension.
 * Called by VS Code when activation event is triggered.
 * In real code: export async function activate(context: vscode.ExtensionContext)
 */
export declare function activate(_extensionPath: string): Promise<void>;
/**
 * Deactivate the extension.
 * Called when extension is unloaded.
 * In real code: export function deactivate()
 */
export declare function deactivate(): Promise<void>;
export { CommandRouter };
export { Logger } from "./infrastructure/logger";
export { Config } from "./infrastructure/config";
//# sourceMappingURL=main.d.ts.map