import * as vscode from "vscode";
import * as path from "path";
import { Finding } from "./decorationManager";

interface ReviewCallbacks {
  onFindingReceived: (finding: Finding) => void;
  onDone: (grade: string) => void;
  onError: () => void;
}

export class ReviewPanel {
  public static currentPanel: ReviewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _findings: Finding[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    diff: string,
    apiKey: string,
    model: string,
    maxDiffSize: number,
    workspaceRoot: string,
    callbacks: ReviewCallbacks
  ) {
    const panel = vscode.window.createWebviewPanel(
      "aiCodeReviewer",
      "AI Code Review",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    ReviewPanel.currentPanel = new ReviewPanel(
      panel,
      extensionUri,
      diff,
      apiKey,
      model,
      maxDiffSize,
      workspaceRoot,
      callbacks
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    diff: string,
    apiKey: string,
    model: string,
    maxDiffSize: number,
    workspaceRoot: string,
    callbacks: ReviewCallbacks
  ) {
    this._panel = panel;
    this._panel.webview.html = this._getShellHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (msg) => {
        if (msg.command === "jumpToLine") {
          vscode.commands.executeCommand(
            "ai-code-reviewer.jumpToLine",
            path.join(workspaceRoot, msg.file),
            msg.line
          );
        }
      },
      null,
      this._disposables
    );

    this._streamReview(diff, apiKey, model, maxDiffSize, workspaceRoot, callbacks);
  }

  private async _streamReview(
    diff: string,
    apiKey: string,
    model: string,
    maxDiffSize: number,
    workspaceRoot: string,
    callbacks: ReviewCallbacks
  ) {
    // System prompt stored as plain string concatenation — no backtick conflicts
    const systemPrompt = [
      "You are a principal-level React/TypeScript engineer at a top-tier tech company.",
      "You have deep expertise in frontend security, performance engineering, and large-scale React architectures.",
      "You are doing a thorough, opinionated code review.",
      "",
      "You will receive a git diff. Analyse ONLY the added lines (starting with +).",
      "Ignore removed lines and context lines.",
      "",
      "Your review must catch issues across these categories:",
      "",
      'SECURITY (type: "security") — be aggressive here, these are the most important:',
      "- XSS vectors: dangerouslySetInnerHTML, innerHTML, eval, document.write with user data",
      "- Sensitive data exposure: tokens/secrets in localStorage, sessionStorage, console.log, props, URLs",
      "- Injection risks: string interpolation in queries, API URLs, or shell commands",
      "- Client-side auth enforcement that can be bypassed",
      "- Hardcoded credentials, API keys, or secrets",
      "- CSRF vulnerabilities, insecure fetch without credentials handling",
      "",
      'PERFORMANCE (type: "performance") — think about real-world rendering cost:',
      "- useEffect/useCallback/useMemo with incorrect or missing dependency arrays",
      "- State updates inside render causing infinite loops",
      "- Expensive operations (heavy computation, large data transforms) not memoised",
      "- Missing debounce/throttle on user input handlers that trigger API calls",
      "- Unnecessary re-renders: object/array literals in JSX props, inline function definitions",
      "- Missing React.memo on pure components receiving complex props",
      "- Large bundle imports that could be lazy-loaded",
      "",
      'QUALITY (type: "quality") — enforce senior engineering standards:',
      "- Missing error handling on async operations and fetch calls",
      "- TypeScript: use of any type, missing types, unsafe type assertions",
      "- React: missing key props, rules of hooks violations, stale closures",
      "- Accessibility: missing aria labels, non-semantic elements for interactive content",
      "- Missing loading and empty states",
      "- Dead code, commented-out code left in",
      "- Overly complex logic that should be extracted into a custom hook or utility",
      "",
      'GOOD (type: "good") — acknowledge genuinely positive changes:',
      "- Security improvements (parameterised queries, input sanitisation)",
      "- Correct use of memoisation",
      "- Proper TypeScript typing added",
      "- Accessibility improvements",
      "- Good error handling patterns",
      "",
      "OUTPUT FORMAT — return ONLY a JSON array, no markdown, no explanation:",
      '[{ "type": "security|quality|performance|good", "title": "max 5 words", "file": "filename.tsx", "line": 42, "message": "what is wrong and why it matters", "before": "bad code (optional)", "after": "fixed code (optional)" }]',
      "",
      "Rules:",
      "- Be specific about the exact line and exact problem. No generic advice.",
      "- message must explain both WHAT is wrong and WHY it is a problem.",
      "- Include before/after for every fixable issue.",
      "- Prioritise: security > performance > quality.",
      "- Maximum 12 findings total. Quality over quantity.",
      "- Return ONLY the JSON array. Any text outside the array will break the parser.",
    ].join("\n");

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 4000,
          stream: true,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content:
                "Review this git diff thoroughly. Focus on correctness and security above all else:\n\n" +
                diff.slice(0, maxDiffSize),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("API error " + response.status);
      }

      this._panel.webview.postMessage({ type: "streaming_start" });

      let fullText = "";
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) { streamDone = true; break; }

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) { continue; }
          const data = line.slice(6);
          if (data === "[DONE]") { continue; }
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta") {
              fullText += parsed.delta?.text || "";
              this._panel.webview.postMessage({
                type: "streaming_progress",
                chars: fullText.length,
              });
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      const clean = fullText.replace(/```json|```/g, "").trim();
      const findings: Finding[] = JSON.parse(clean);
      this._findings = findings;

      for (let i = 0; i < findings.length; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const f = findings[i];
        callbacks.onFindingReceived(f);
        this._panel.webview.postMessage({ type: "finding", finding: f, index: i });
      }

      const securityCount = findings.filter((f) => f.type === "security").length;
      const qualityCount  = findings.filter((f) => f.type === "quality").length;
      const perfCount     = findings.filter((f) => f.type === "performance").length;
      const totalIssues   = securityCount * 3 + qualityCount + perfCount;

      const grade =
        totalIssues === 0 ? "A+" :
        totalIssues <= 1  ? "A"  :
        totalIssues <= 3  ? "B"  :
        totalIssues <= 5  ? "C"  :
        totalIssues <= 8  ? "D"  : "F";

      await new Promise((r) => setTimeout(r, 500));
      this._panel.webview.postMessage({
        type: "done",
        grade,
        stats: {
          security:    securityCount,
          quality:     qualityCount,
          performance: perfCount,
          good:        findings.filter((f) => f.type === "good").length,
          total:       findings.length,
        },
      });

      callbacks.onDone(grade);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this._panel.webview.postMessage({ type: "error", message });
      callbacks.onError();
    }
  }

  private _getShellHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    padding: 10px 16px;
    border-bottom: 1px solid var(--vscode-widget-border);
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    background: var(--vscode-sideBar-background);
  }
  .topbar-title { font-weight: 600; font-size: 13px; flex: 1; }
  .grade-badge {
    font-size: 20px; font-weight: 700;
    width: 40px; height: 40px;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transform: scale(0.5);
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .grade-badge.visible { opacity: 1; transform: scale(1); }
  .grade-Ap, .grade-A { background: rgba(78,201,78,.15); color: #4ec94e; border: 1px solid rgba(78,201,78,.3); }
  .grade-B { background: rgba(86,156,214,.15); color: #569cd6; border: 1px solid rgba(86,156,214,.3); }
  .grade-C { background: rgba(204,167,0,.15); color: #cca700; border: 1px solid rgba(204,167,0,.3); }
  .grade-D, .grade-F { background: rgba(241,76,76,.15); color: #f14c4c; border: 1px solid rgba(241,76,76,.3); }
  .stats-bar { display: flex; gap: 1px; flex-shrink: 0; background: var(--vscode-widget-border); }
  .stat-cell { flex: 1; padding: 8px 6px; text-align: center; background: var(--vscode-sideBar-background); font-size: 11px; }
  .stat-cell .num { font-size: 18px; font-weight: 600; line-height: 1; }
  .stat-cell .lbl { color: var(--vscode-descriptionForeground); margin-top: 2px; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  .num.sec { color: #f14c4c; }
  .num.perf { color: #cca700; }
  .num.qual { color: #569cd6; }
  .num.good { color: #4ec94e; }
  .stream-bar {
    padding: 8px 16px; font-size: 12px;
    color: var(--vscode-descriptionForeground);
    display: flex; align-items: center; gap: 8px;
    flex-shrink: 0; border-bottom: 1px solid var(--vscode-widget-border);
  }
  .stream-bar.hidden { display: none; }
  .dot-pulse { display: flex; gap: 4px; align-items: center; }
  .dot-pulse span { width: 5px; height: 5px; border-radius: 50%; background: var(--vscode-button-background); animation: dp .9s ease-in-out infinite; }
  .dot-pulse span:nth-child(2) { animation-delay: .15s; }
  .dot-pulse span:nth-child(3) { animation-delay: .3s; }
  @keyframes dp { 0%,80%,100%{transform:scale(.6);opacity:.4} 40%{transform:scale(1);opacity:1} }
  .findings { flex: 1; overflow-y: auto; padding: 12px; }
  .finding-card {
    border: 1px solid var(--vscode-widget-border);
    border-radius: 6px; margin-bottom: 8px; overflow: hidden;
    opacity: 0; transform: translateY(8px);
    transition: opacity .3s ease, transform .3s ease;
    cursor: pointer;
  }
  .finding-card.visible { opacity: 1; transform: translateY(0); }
  .finding-card:hover { border-color: var(--vscode-focusBorder); }
  .finding-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--vscode-sideBar-background); }
  .finding-type-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .finding-title { font-size: 13px; font-weight: 500; flex: 1; }
  .finding-file { font-family: var(--vscode-editor-font-family); font-size: 11px; color: var(--vscode-descriptionForeground); background: var(--vscode-textBlockQuote-background); padding: 2px 7px; border-radius: 3px; }
  .finding-body { padding: 8px 12px; font-size: 12px; color: var(--vscode-descriptionForeground); line-height: 1.6; }
  .diff-view { margin-top: 8px; border-radius: 4px; overflow: hidden; font-family: var(--vscode-editor-font-family); font-size: 11px; }
  .diff-line { padding: 3px 10px; }
  .diff-line.before { background: rgba(241,76,76,.1); color: #f14c4c; }
  .diff-line.after { background: rgba(78,201,78,.1); color: #4ec94e; }
  .diff-label { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 3px; color: var(--vscode-descriptionForeground); }
  .type-security .finding-type-dot { background: #f14c4c; }
  .type-security .finding-header { border-left: 3px solid #f14c4c; }
  .type-performance .finding-type-dot { background: #cca700; }
  .type-performance .finding-header { border-left: 3px solid #cca700; }
  .type-quality .finding-type-dot { background: #569cd6; }
  .type-quality .finding-header { border-left: 3px solid #569cd6; }
  .type-good .finding-type-dot { background: #4ec94e; }
  .type-good .finding-header { border-left: 3px solid #4ec94e; }
  .loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px; color: var(--vscode-descriptionForeground); font-size: 13px; }
  .spinner { width: 28px; height: 28px; border: 2px solid var(--vscode-widget-border); border-top-color: var(--vscode-button-background); border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .copy-btn { display: block; width: calc(100% - 24px); margin: 4px 12px 12px; padding: 8px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-widget-border); border-radius: 4px; font-size: 12px; cursor: pointer; font-family: var(--vscode-font-family); flex-shrink: 0; }
  .copy-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .empty-msg { display: none; text-align: center; padding: 40px 20px; color: var(--vscode-descriptionForeground); font-size: 13px; }
</style>
</head>
<body>
<div class="topbar">
  <span class="topbar-title">AI Code Review</span>
  <div class="grade-badge" id="grade-badge">-</div>
</div>
<div class="stats-bar" id="stats-bar" style="display:none">
  <div class="stat-cell"><div class="num sec" id="s-sec">0</div><div class="lbl">Security</div></div>
  <div class="stat-cell"><div class="num perf" id="s-perf">0</div><div class="lbl">Perf</div></div>
  <div class="stat-cell"><div class="num qual" id="s-qual">0</div><div class="lbl">Quality</div></div>
  <div class="stat-cell"><div class="num good" id="s-good">0</div><div class="lbl">Good</div></div>
</div>
<div class="stream-bar" id="stream-bar">
  <div class="dot-pulse"><span></span><span></span><span></span></div>
  <span id="stream-msg">Connecting to Claude AI...</span>
</div>
<div class="findings" id="findings">
  <div class="loading-state" id="loading-state">
    <div class="spinner"></div>
    <span>Sending diff to Claude...</span>
    <span style="font-size:11px;color:var(--vscode-disabledForeground)">Checking security · quality · performance</span>
  </div>
  <div class="empty-msg" id="empty-msg">No issues found - clean diff!</div>
</div>
<button class="copy-btn" id="copy-btn" style="display:none" onclick="copyAsComment()">Copy full review as PR comment</button>
<script>
  const vscode = acquireVsCodeApi();
  const findings = [];
  const icons = { security: 'SECURITY', performance: 'PERF', quality: 'QUALITY', good: 'GOOD' };

  window.addEventListener('message', function(event) {
    const msg = event.data;

    if (msg.type === 'streaming_start') {
      document.getElementById('loading-state').style.display = 'none';
      document.getElementById('stream-bar').classList.remove('hidden');
      document.getElementById('stream-msg').textContent = 'Claude is reading your diff...';
    }

    if (msg.type === 'streaming_progress') {
      const chars = msg.chars;
      document.getElementById('stream-msg').textContent =
        chars < 200 ? 'Analysing your changes...' :
        chars < 500 ? 'Checking for security issues...' :
        chars < 900 ? 'Reviewing performance patterns...' :
        'Finalising review...';
    }

    if (msg.type === 'finding') {
      const f = msg.finding;
      findings.push(f);
      document.getElementById('stream-bar').classList.add('hidden');
      document.getElementById('stats-bar').style.display = 'flex';
      renderFinding(f);
    }

    if (msg.type === 'done') {
      document.getElementById('stream-bar').classList.add('hidden');
      document.getElementById('stats-bar').style.display = 'flex';
      document.getElementById('s-sec').textContent = msg.stats.security;
      document.getElementById('s-perf').textContent = msg.stats.performance;
      document.getElementById('s-qual').textContent = msg.stats.quality;
      document.getElementById('s-good').textContent = msg.stats.good;
      var badge = document.getElementById('grade-badge');
      badge.textContent = msg.grade;
      badge.className = 'grade-badge visible grade-' + msg.grade;
      if (findings.length === 0) {
        document.getElementById('empty-msg').style.display = 'block';
      }
      document.getElementById('copy-btn').style.display = 'block';
    }

    if (msg.type === 'error') {
      document.getElementById('loading-state').innerHTML =
        '<div style="color:var(--vscode-errorForeground);font-size:13px;text-align:center;padding:20px">Error: ' + msg.message + '</div>';
    }
  });

  function renderFinding(f) {
    var container = document.getElementById('findings');
    var loadingState = document.getElementById('loading-state');
    if (loadingState) { loadingState.remove(); }

    var diffHtml = '';
    if (f.before && f.after) {
      diffHtml = '<div class="diff-view"><div class="diff-label">Before vs After</div>' +
        '<div class="diff-line before">- ' + escHtml(f.before) + '</div>' +
        '<div class="diff-line after">+ ' + escHtml(f.after) + '</div></div>';
    }

    var card = document.createElement('div');
    card.className = 'finding-card type-' + f.type;
    card.innerHTML =
      '<div class="finding-header">' +
        '<div class="finding-type-dot"></div>' +
        '<span class="finding-title">' + escHtml(f.title) + '</span>' +
        '<span class="finding-file">' + escHtml(f.file) + ':' + f.line + '</span>' +
      '</div>' +
      '<div class="finding-body">' + escHtml(f.message) + diffHtml + '</div>';

    card.addEventListener('click', function() {
      vscode.postMessage({ command: 'jumpToLine', file: f.file, line: f.line });
    });

    container.appendChild(card);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { card.classList.add('visible'); });
    });
  }

  function escHtml(str) {
    if (!str) { return ''; }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function copyAsComment() {
    var lines = ['## AI Code Review', ''];
    var order = ['security', 'performance', 'quality', 'good'];
    var labelMap = { security: 'Security', performance: 'Performance', quality: 'Code Quality', good: 'Good Changes' };
    order.forEach(function(type) {
      var group = findings.filter(function(f) { return f.type === type; });
      if (!group.length) { return; }
      lines.push('### ' + labelMap[type]);
      group.forEach(function(f) {
        lines.push('**' + f.title + '** - ' + f.file + ':' + f.line);
        lines.push(f.message);
        if (f.before && f.after) {
          lines.push('Before: ' + f.before);
          lines.push('After:  ' + f.after);
        }
        lines.push('');
      });
    });
    navigator.clipboard.writeText(lines.join('\n')).then(function() {
      var btn = document.getElementById('copy-btn');
      btn.textContent = 'Copied to clipboard!';
      setTimeout(function() { btn.textContent = 'Copy full review as PR comment'; }, 2000);
    });
  }
</script>
</body>
</html>`;
  }

  public dispose() {
    ReviewPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }
}
