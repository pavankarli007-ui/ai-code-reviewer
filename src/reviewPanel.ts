import * as vscode from "vscode";
import * as path from "path";
import * as https from "https";
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
  private _diff: string = "";
  private _apiKey: string = "";
  private _model: string = "";
  private _maxDiffSize: number = 20000;
  private _workspaceRoot: string = "";
  private _callbacks: ReviewCallbacks | undefined;
  private _lastGrade: string = "";
  private _runCount: number = 0;

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
      panel, extensionUri, diff, apiKey, model, maxDiffSize, workspaceRoot, callbacks
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
    this._diff = diff;
    this._apiKey = apiKey;
    this._model = model;
    this._maxDiffSize = maxDiffSize;
    this._workspaceRoot = workspaceRoot;
    this._callbacks = callbacks;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getFullHtml();

    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === "ready") {
        this._runReview();
      }
      if (msg.command === "rerun") {
        const { execSync } = require("child_process");
        let d = "";
        try {
          d = execSync("git diff HEAD", { cwd: this._workspaceRoot, maxBuffer: 1024 * 1024 * 5 }).toString();
          if (!d.trim()) { d = execSync("git diff --cached", { cwd: this._workspaceRoot }).toString(); }
          if (!d.trim()) { d = execSync("git diff HEAD~1", { cwd: this._workspaceRoot }).toString(); }
        } catch { vscode.window.showErrorMessage("Could not run git diff."); return; }
        if (!d.trim()) { vscode.window.showInformationMessage("No changes found."); return; }
        this._diff = d;
        this._runReview();
      }
      if (msg.command === "jumpToLine") {
        try {
          const files = await vscode.workspace.findFiles("**/" + path.basename(msg.file), "**/node_modules/**");
          if (files.length > 0) {
            const doc = await vscode.workspace.openTextDocument(files[0]);
            const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
            const pos = new vscode.Position(Math.max(0, msg.line - 1), 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            const deco = vscode.window.createTextEditorDecorationType({
              backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
              isWholeLine: true,
            });
            editor.setDecorations(deco, [new vscode.Range(pos, pos)]);
            setTimeout(() => deco.dispose(), 2000);
          }
        } catch { /* ignore */ }
      }
    }, null, this._disposables);
  }

  private _runReview() {
    this._panel.webview.postMessage({ command: "showLoading" });
    setTimeout(() => {
      if (this._callbacks) {
        this._doReview(this._diff, this._apiKey, this._model, this._maxDiffSize, this._callbacks);
      }
    }, 500);
  }

  private _callApi(apiKey: string, model: string, content: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: model,
        max_tokens: 3000,
        messages: [{ role: "user", content: content }],
      });
      const req = https.request({
        hostname: "api.anthropic.com",
        port: 443,
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(body),
        },
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) { reject(new Error(parsed.error.message)); return; }
            resolve(parsed.content?.[0]?.text || "[]");
          } catch (e) {
            reject(new Error("Parse error: " + data.slice(0, 100)));
          }
        });
      });
      req.on("error", (e) => reject(e));
      req.setTimeout(60000, () => { req.destroy(); reject(new Error("Timed out")); });
      req.write(body);
      req.end();
    });
  }

  private async _doReview(diff: string, apiKey: string, model: string, maxDiffSize: number, callbacks: ReviewCallbacks) {
    try {
      const prompt = "You are a senior React/TypeScript engineer. Review ONLY added lines (+) in this git diff.\nReturn ONLY a valid JSON array:\n[{\"type\":\"security|performance|quality|good\",\"title\":\"max 5 words\",\"file\":\"filename.tsx\",\"line\":42,\"message\":\"explanation\",\"before\":\"bad code\",\"after\":\"fixed code\"}]\nMax 12 findings. ONLY the JSON array.\n\nGit diff:\n" + diff.slice(0, maxDiffSize);
      const raw = await this._callApi(apiKey, model, prompt);
      const findings: Finding[] = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const sec  = findings.filter(f => f.type === "security").length;
      const perf = findings.filter(f => f.type === "performance").length;
      const qual = findings.filter(f => f.type === "quality").length;
      const good = findings.filter(f => f.type === "good").length;
      const score = sec * 3 + perf + qual;
      const grade = score === 0 ? "A+" : score <= 5 ? "A" : score <= 10 ? "B" : score <= 16 ? "C" : score <= 22 ? "D" : "F";
      const prevGrade = this._lastGrade;
      this._lastGrade = grade;
      this._runCount++;
      this._panel.webview.postMessage({
        command: "showResults",
        findings, grade, prevGrade,
        runCount: this._runCount,
        stats: { security: sec, performance: perf, quality: qual, good },
      });
      findings.forEach(f => callbacks.onFindingReceived(f));
      callbacks.onDone(grade);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      this._panel.webview.postMessage({ command: "showError", message: msg });
      callbacks.onError();
    }
  }

  private _esc(s: string | undefined): string {
    if (!s) { return ""; }
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  private _getFullHtml(): string {
    const css = ""
      + "*{box-sizing:border-box;margin:0;padding:0}"
      + "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);height:100vh;display:flex;flex-direction:column;overflow:hidden}"
      + "#topbar{padding:10px 14px;border-bottom:1px solid rgba(128,128,128,.2);display:flex;align-items:center;gap:10px;background:var(--vscode-sideBar-background);flex-shrink:0}"
      + "#grade{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0;border:2px solid #888;color:#888;transition:all .4s}"
      + "#title-main{font-size:13px;font-weight:600}"
      + "#title-sub{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px;min-height:14px}"
      + "#rerun{padding:5px 12px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:4px;font-size:11px;cursor:pointer;display:none}"
      + "#rerun:hover{opacity:.85}"
      + "#stats{display:none;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(128,128,128,.15);flex-shrink:0;border-bottom:1px solid rgba(128,128,128,.15)}"
      + ".stat{background:var(--vscode-sideBar-background);padding:8px 4px;text-align:center}"
      + ".snum{font-size:18px;font-weight:700;line-height:1}"
      + ".slbl{font-size:9px;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:.05em;margin-top:2px}"
      + "#body{flex:1;overflow-y:auto;padding:10px}"
      + "#loading{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:20px}"
      + ".spinner{width:40px;height:40px;border-radius:50%;border:2px solid rgba(128,128,128,.2);border-top-color:var(--vscode-button-background);animation:spin .8s linear infinite}"
      + "@keyframes spin{to{transform:rotate(360deg)}}"
      + ".ld-title{font-size:14px;font-weight:600}"
      + ".ld-sub{font-size:12px;color:var(--vscode-descriptionForeground)}"
      + ".dots{display:flex;gap:6px}"
      + ".dot{width:6px;height:6px;border-radius:50%;background:var(--vscode-button-background);animation:dp 1.2s ease-in-out infinite}"
      + ".dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}"
      + "@keyframes dp{0%,80%,100%{transform:scale(.5);opacity:.3}40%{transform:scale(1);opacity:1}}"
      + "#results{display:none}"
      + ".hint{font-size:11px;color:var(--vscode-descriptionForeground);padding:6px 10px;background:rgba(128,128,128,.08);border-radius:4px;margin-bottom:10px}"
      + ".card{border-radius:6px;margin-bottom:6px;overflow:hidden;cursor:pointer;transition:opacity .15s;border:1px solid rgba(128,128,128,.12)}"
      + ".card:hover{opacity:.8}"
      + ".card-head{display:flex;align-items:center;gap:7px;padding:8px 10px;background:var(--vscode-sideBar-background)}"
      + ".cdot{width:7px;height:7px;border-radius:50%;flex-shrink:0}"
      + ".ctype{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;flex-shrink:0}"
      + ".ctitle{font-size:12px;font-weight:500;flex:1;margin-left:2px}"
      + ".cloc{font-family:monospace;font-size:10px;color:var(--vscode-descriptionForeground);background:rgba(128,128,128,.12);padding:2px 6px;border-radius:3px}"
      + ".card-body{padding:7px 10px;font-size:11px;color:var(--vscode-descriptionForeground);line-height:1.6}"
      + ".diff{margin-top:6px;border-radius:3px;overflow:hidden;font-family:monospace;font-size:10px}"
      + ".dold{padding:3px 8px;background:rgba(241,76,76,.1);color:#f14c4c}"
      + ".dnew{padding:3px 8px;background:rgba(78,201,78,.1);color:#4ec94e}"
      + ".empty{text-align:center;padding:60px 20px;color:var(--vscode-descriptionForeground)}"
      + "#copybar{padding:8px 10px;border-top:1px solid rgba(128,128,128,.15);flex-shrink:0;background:var(--vscode-sideBar-background);display:none}"
      + "#copybtn{display:block;width:100%;padding:8px;background:rgba(128,128,128,.08);color:var(--vscode-editor-foreground);border:1px solid rgba(128,128,128,.15);border-radius:4px;font-size:11px;cursor:pointer}"
      + "#copybtn:hover{background:rgba(128,128,128,.15)}";

    return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><style>" + css + "</style></head><body>"
      + "<div id=\"topbar\">"
      + "<div id=\"grade\">-</div>"
      + "<div style=\"flex:1\"><div id=\"title-main\">AI Code Review</div><div id=\"title-sub\">Connecting to Claude...</div></div>"
      + "<button id=\"rerun\" onclick=\"doRerun()\">↻ Re-run</button>"
      + "</div>"
      + "<div id=\"stats\" style=\"display:none\">"
      + "<div class=\"stat\"><div class=\"snum\" id=\"ssec\" style=\"color:#f14c4c\">0</div><div class=\"slbl\">Security</div></div>"
      + "<div class=\"stat\"><div class=\"snum\" id=\"sperf\" style=\"color:#cca700\">0</div><div class=\"slbl\">Perf</div></div>"
      + "<div class=\"stat\"><div class=\"snum\" id=\"squal\" style=\"color:#569cd6\">0</div><div class=\"slbl\">Quality</div></div>"
      + "<div class=\"stat\"><div class=\"snum\" id=\"sgood\" style=\"color:#4ec94e\">0</div><div class=\"slbl\">Good</div></div>"
      + "</div>"
      + "<div id=\"body\">"
      + "<div id=\"loading\"><div class=\"spinner\"></div><div><div class=\"ld-title\">Reviewing your changes...</div><div class=\"ld-sub\">Claude is analysing your diff</div></div><div class=\"dots\"><div class=\"dot\"></div><div class=\"dot\"></div><div class=\"dot\"></div></div></div>"
      + "<div id=\"results\"></div>"
      + "</div>"
      + "<div id=\"copybar\"><button id=\"copybtn\" onclick=\"doCopy()\">Copy full review as PR comment</button></div>"
      + "<script>"
      + "var vscode=acquireVsCodeApi();"
      + "var allFindings=[];"
      + "vscode.postMessage({command:'ready'});"
      + "window.addEventListener('message',function(e){"
      + "var m=e.data;"
      + "if(m.command==='showLoading'){"
      + "document.getElementById('loading').style.display='flex';"
      + "document.getElementById('results').style.display='none';"
      + "document.getElementById('results').innerHTML='';"
      + "document.getElementById('copybar').style.display='none';"
      + "document.getElementById('rerun').style.display='none';"
      + "document.getElementById('title-sub').textContent='Reviewing changes...';"
      + "document.getElementById('stats').style.display='none';"
      + "allFindings=[];"
      + "}"
      + "if(m.command==='showResults'){"
      + "allFindings=m.findings;"
      + "var f=m.findings,g=m.grade,s=m.stats,prev=m.prevGrade,rc=m.runCount;"
      + "var gc=(g==='A+'||g==='A')?'#4ec94e':g==='B'?'#569cd6':g==='C'?'#cca700':'#f14c4c';"
      + "var gb=document.getElementById('grade');"
      + "gb.textContent=g;gb.style.color=gc;gb.style.borderColor=gc;gb.style.background=gc+'18';"
      + "var baseLabel=f.length===0?'Perfect!':g==='F'?f.length+' issues found':g==='D'?'Needs work':g==='C'?'Room to improve':g==='B'?'Pretty good':'Nearly perfect';"
      + "var label=baseLabel;"
      + "if(prev&&prev!==g&&rc>1){label='<span style=\"text-decoration:line-through;opacity:.5\">'+prev+'</span> \u2192 '+g+' \u00b7 '+baseLabel;}"
      + "document.getElementById('title-sub').innerHTML=label;"
      + "document.getElementById('ssec').textContent=s.security;"
      + "document.getElementById('sperf').textContent=s.performance;"
      + "document.getElementById('squal').textContent=s.quality;"
      + "document.getElementById('sgood').textContent=s.good;"
      + "document.getElementById('stats').style.display='grid';"
      + "document.getElementById('loading').style.display='none';"
      + "document.getElementById('rerun').style.display='block';"
      + "var res=document.getElementById('results');"
      + "res.innerHTML='';"
      + "if(!f.length){"
      + "res.innerHTML='<div class=\"empty\"><div style=\"font-size:40px;margin-bottom:12px\">\u2713</div><div style=\"font-size:15px;font-weight:600;margin-bottom:6px\">Clean diff!</div><div style=\"font-size:12px\">No issues found.</div></div>';"
      + "}else{"
      + "var hint=document.createElement('div');hint.className='hint';hint.textContent='Click any finding to jump to that line in your editor';res.appendChild(hint);"
      + "f.forEach(function(item){"
      + "var colors={security:'#f14c4c',performance:'#cca700',quality:'#569cd6',good:'#4ec94e'};"
      + "var labels={security:'\u26a0 Security',performance:'\u26a1 Perf',quality:'\u25c8 Quality',good:'\u2713 Good'};"
      + "var col=colors[item.type]||'#888';"
      + "var dh='';"
      + "if(item.before&&item.after){dh='<div class=\"diff\"><div class=\"dold\">- '+esc(item.before)+'</div><div class=\"dnew\">+ '+esc(item.after)+'</div></div>';}"
      + "var card=document.createElement('div');"
      + "card.className='card';"
      + "card.style.borderLeft='3px solid '+col;"
      + "card.innerHTML='<div class=\"card-head\"><div class=\"cdot\" style=\"background:'+col+'\"></div><span class=\"ctype\" style=\"color:'+col+'\">'+(labels[item.type]||item.type)+'</span><span class=\"ctitle\">'+esc(item.title)+'</span><span class=\"cloc\">'+esc(item.file)+':'+item.line+' \u2197</span></div><div class=\"card-body\">'+esc(item.message)+dh+'</div>';"
      + "card.addEventListener('click',(function(fi){return function(){vscode.postMessage({command:'jumpToLine',file:fi.file,line:fi.line});};})(item));"
      + "res.appendChild(card);"
      + "});"
      + "}"
      + "res.style.display='block';"
      + "document.getElementById('copybar').style.display='block';"
      + "}"
      + "if(m.command==='showError'){"
      + "document.getElementById('loading').style.display='none';"
      + "document.getElementById('results').innerHTML='<div style=\"margin:16px;padding:16px;border:1px solid rgba(241,76,76,.3);border-radius:6px;color:#f14c4c;font-size:12px\"><strong>Review failed</strong><p style=\"margin-top:8px;color:var(--vscode-descriptionForeground)\">'+esc(m.message)+'</p></div>';"
      + "document.getElementById('results').style.display='block';"
      + "document.getElementById('rerun').style.display='block';"
      + "}"
      + "});"
      + "function doRerun(){vscode.postMessage({command:'rerun'});}"
      + "function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}"
      + "function doCopy(){"
      + "var lines=['## AI Code Review',''],o=['security','performance','quality','good'],lm={security:'\u26a0 Security',performance:'\u26a1 Performance',quality:'\u25c8 Code Quality',good:'\u2713 Good'};"
      + "o.forEach(function(t){var g=allFindings.filter(function(f){return f.type===t;});if(!g.length)return;lines.push('### '+lm[t]);g.forEach(function(f){lines.push('**'+f.title+'** \u2014 '+f.file+':'+f.line);lines.push(f.message);if(f.before&&f.after){lines.push('Before: '+f.before);lines.push('After: '+f.after);}lines.push('');});});"
      + "navigator.clipboard.writeText(lines.join('\\n')).then(function(){var b=document.getElementById('copybtn');b.textContent='\u2713 Copied!';setTimeout(function(){b.textContent='Copy full review as PR comment';},2000);});"
      + "}"
      + "<\/script></body></html>";
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
