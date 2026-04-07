import * as vscode from "vscode";
import * as path from "path";

export interface Finding {
  type: "security" | "quality" | "performance" | "good";
  title: string;
  file: string;
  line: number;
  message: string;
  before?: string;
  after?: string;
}

export class DecorationManager {
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
  private activeDecorations: Map<string, vscode.DecorationOptions[]> = new Map();

  constructor() {
    this.decorationTypes.set(
      "security",
      vscode.window.createTextEditorDecorationType({
        borderWidth: "0 0 2px 0",
        borderStyle: "solid",
        borderColor: new vscode.ThemeColor("editorError.foreground"),
        overviewRulerColor: new vscode.ThemeColor("editorError.foreground"),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: { borderColor: "#e51400" },
        dark: { borderColor: "#f14c4c" },
      })
    );
    this.decorationTypes.set(
      "performance",
      vscode.window.createTextEditorDecorationType({
        borderWidth: "0 0 2px 0",
        borderStyle: "dashed",
        borderColor: new vscode.ThemeColor("editorWarning.foreground"),
        overviewRulerColor: new vscode.ThemeColor("editorWarning.foreground"),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: { borderColor: "#bf8803" },
        dark: { borderColor: "#cca700" },
      })
    );
    this.decorationTypes.set(
      "quality",
      vscode.window.createTextEditorDecorationType({
        borderWidth: "0 0 2px 0",
        borderStyle: "dotted",
        borderColor: new vscode.ThemeColor("editorInfo.foreground"),
        overviewRulerColor: new vscode.ThemeColor("editorInfo.foreground"),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: { borderColor: "#1a85ff" },
        dark: { borderColor: "#569cd6" },
      })
    );
    this.decorationTypes.set(
      "good",
      vscode.window.createTextEditorDecorationType({
        borderWidth: "0 0 2px 0",
        borderStyle: "solid",
        borderColor: new vscode.ThemeColor("terminal.ansiGreen"),
        overviewRulerColor: new vscode.ThemeColor("terminal.ansiGreen"),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: { borderColor: "#388a34" },
        dark: { borderColor: "#4ec94e" },
      })
    );
  }

  addFinding(finding: Finding, workspaceRoot: string) {
    // workspaceRoot reserved for future multi-root workspace support
    void workspaceRoot;

    const lineNum = Math.max(0, finding.line - 1);
    const range = new vscode.Range(lineNum, 0, lineNum, 999);

    const icons: Record<string, string> = {
      security: "⚠ Security",
      performance: "⚡ Performance",
      quality: "◈ Quality",
      good: "✓ Good",
    };

    const hoverLines = [
      "**" + icons[finding.type] + ": " + finding.title + "**\n",
      finding.message,
    ];
    if (finding.before && finding.after) {
      hoverLines.push("\n**Before:**\n```ts\n" + finding.before + "\n```");
      hoverLines.push("\n**After:**\n```ts\n" + finding.after + "\n```");
    }

    const decoration: vscode.DecorationOptions = {
      range,
      hoverMessage: new vscode.MarkdownString(hoverLines.join("\n")),
    };

    const key = finding.file;
    if (!this.activeDecorations.has(key)) {
      this.activeDecorations.set(key, []);
    }
    this.activeDecorations.get(key)!.push(decoration);

    // Apply to any currently open editor that matches this file
    const decType = this.decorationTypes.get(finding.type);
    if (!decType) { return; }

    vscode.window.visibleTextEditors.forEach((editor) => {
      const editorFile = path.basename(editor.document.uri.fsPath);
      const findingFile = path.basename(finding.file);
      if (
        editorFile === findingFile ||
        editor.document.uri.fsPath.endsWith(finding.file)
      ) {
        const existing = this.activeDecorations.get(key) || [];
        editor.setDecorations(decType, existing);
      }
    });
  }

  clear() {
    this.activeDecorations.clear();
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.decorationTypes.forEach((decType) => {
        editor.setDecorations(decType, []);
      });
    });
  }

  applyToEditor(editor: vscode.TextEditor) {
    this.decorationTypes.forEach((decType) => {
      const decs: vscode.DecorationOptions[] = [];
      this.activeDecorations.forEach((findings, filePath) => {
        if (
          editor.document.uri.fsPath.endsWith(filePath) ||
          editor.document.uri.fsPath.includes(filePath)
        ) {
          decs.push(...findings);
        }
      });
      if (decs.length > 0) {
        editor.setDecorations(decType, decs);
      }
    });
  }
}
