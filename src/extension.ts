import * as vscode from "vscode";
import { execSync } from "child_process";
import { ReviewPanel } from "./reviewPanel";
import { DecorationManager } from "./decorationManager";

export let decorationManager: DecorationManager;

export function activate(context: vscode.ExtensionContext) {
  decorationManager = new DecorationManager();

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = "$(sparkle) AI Review";
  statusBar.tooltip = "Run AI Code Review  (Cmd+Shift+R)";
  statusBar.command = "ai-code-reviewer.review";
  statusBar.show();
  context.subscriptions.push(statusBar);

  const clearBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  clearBar.text = "$(close) Clear highlights";
  clearBar.command = "ai-code-reviewer.clear";
  clearBar.hide();
  context.subscriptions.push(clearBar);

  const reviewCommand = vscode.commands.registerCommand("ai-code-reviewer.review", async () => {
    const config = vscode.workspace.getConfiguration("aiCodeReviewer");
    const apiKey = config.get<string>("anthropicApiKey");
    const model = config.get<string>("model") || "claude-opus-4-6";
    const maxDiffSize = config.get<number>("maxDiffSize") || 20000;

    if (!apiKey) {
      const action = await vscode.window.showErrorMessage(
        "Add your Anthropic API key to use AI Code Reviewer.",
        "Open Settings"
      );
      if (action === "Open Settings") {
        vscode.commands.executeCommand("workbench.action.openSettings", "aiCodeReviewer.anthropicApiKey");
      }
      return;
    }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      vscode.window.showErrorMessage("No workspace folder open.");
      return;
    }

    let diff = "";
    try {
      diff = execSync("git diff HEAD", { cwd: root, maxBuffer: 1024 * 1024 * 5 }).toString();
      if (!diff.trim()) diff = execSync("git diff --cached", { cwd: root }).toString();
    } catch {
      vscode.window.showErrorMessage("Could not run git diff. Is this a git repository?");
      return;
    }

    if (!diff.trim()) {
      vscode.window.showInformationMessage("No changes in git diff. Make some edits first!");
      return;
    }

    statusBar.text = "$(loading~spin) Reviewing...";
    decorationManager.clear();
    clearBar.hide();

    ReviewPanel.createOrShow(context.extensionUri, diff, apiKey, model, maxDiffSize, root, {
      onFindingReceived: (finding) => {
        decorationManager.addFinding(finding, root);
      },
      onDone: (grade) => {
        statusBar.text = `$(sparkle) AI Review  Grade: ${grade}`;
        clearBar.show();
      },
      onError: () => {
        statusBar.text = "$(sparkle) AI Review";
      },
    });
  });

  const clearCommand = vscode.commands.registerCommand("ai-code-reviewer.clear", () => {
    decorationManager.clear();
    clearBar.hide();
    statusBar.text = "$(sparkle) AI Review";
  });

  const jumpCommand = vscode.commands.registerCommand(
    "ai-code-reviewer.jumpToLine",
    async (filePath: string, line: number) => {
      try {
        const doc = await vscode.workspace.openTextDocument(filePath);
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        const pos = new vscode.Position(Math.max(0, line - 1), 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      } catch {
        // file might not exist in demo context
      }
    }
  );

  context.subscriptions.push(reviewCommand, clearCommand, jumpCommand);
}

export function deactivate() {
  decorationManager?.clear();
}
