/**
 * Model Selector — resolve the best available VS Code language model for a given domain.
 * Reads meridian.model.<domain> → meridian.model.default → any available model.
 */

import * as vscode from "vscode";

export type ModelDomain = "hygiene" | "git" | "chat";

/**
 * Select the best available language model for the given domain.
 * Reads meridian.model.<domain> setting, falls back to meridian.model.default,
 * then falls back to any available model.
 */
export async function selectModel(
  domain?: ModelDomain
): Promise<vscode.LanguageModelChat | null> {
  const cfg = vscode.workspace.getConfiguration("meridian.model");
  const domainFamily = domain ? cfg.get<string>(domain, "") : "";
  const defaultFamily = cfg.get<string>("default", "gpt-4o");
  const family = domainFamily || defaultFamily;

  const models = await vscode.lm.selectChatModels({ family });
  if (models.length > 0) return models[0];

  // Fallback: any available model
  const any = await vscode.lm.selectChatModels({});
  return any[0] ?? null;
}
