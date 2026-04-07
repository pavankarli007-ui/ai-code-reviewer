# AI Code Reviewer

**Streaming AI code review with inline highlights — powered by Claude Opus.**

One keyboard shortcut. Your git diff gets reviewed by the world's best AI engineer in real time — findings stream in live, problem lines light up in your editor, and you get a letter grade for your changes. All before you open a PR.

[![CI](https://github.com/YOUR_USERNAME/ai-code-reviewer/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-code-reviewer/actions/workflows/ci.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/your-publisher-id.ai-code-reviewer?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=your-publisher-id.ai-code-reviewer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Demo

> Pressing `Cmd+Shift+R` on a React component with bugs:

![Demo](media/demo.gif)

---

## What it does

Press `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows):

| # | What happens |
|---|---|
| 1 | Runs `git diff HEAD` to get only your changed lines |
| 2 | Sends the diff to Claude Opus API in streaming mode |
| 3 | Findings stream into the panel one by one as Claude thinks |
| 4 | Problem lines **light up in your editor** with coloured underlines |
| 5 | **Hover any highlighted line** → see the finding + before/after fix |
| 6 | **Click any finding** → jumps to that file and line |
| 7 | A **letter grade (A+ to F)** animates in when the review completes |
| 8 | **Copy as PR comment** → paste Claude's review straight into GitHub |

---

## What it catches

| Category | Examples |
|----------|---------|
| ⚠ **Security** | XSS via `dangerouslySetInnerHTML`, JWTs in `localStorage`, secrets in console.log, client-side auth bypasses |
| ⚡ **Performance** | `useEffect` with missing/wrong deps, no debounce on input handlers, unnecessary re-renders, missing memoisation |
| ◈ **Quality** | Missing `key` props, stale closures, `any` types, missing error handling, rules of hooks violations |
| ✓ **Good changes** | Highlights what you did right — positive reinforcement matters |

---

## Install

### From VS Code Marketplace (recommended)

1. Open VS Code
2. `Cmd+Shift+X` → search **AI Code Reviewer**
3. Click Install

### From source

```bash
git clone https://github.com/YOUR_USERNAME/ai-code-reviewer.git
cd ai-code-reviewer
npm install && npm run compile
# Press F5 to launch Extension Dev Host
```

### Setup

1. Get a free API key at [console.anthropic.com](https://console.anthropic.com)
2. VS Code Settings (`Cmd+,`) → search **AI Code Reviewer** → paste your key

---

## Usage

```
Cmd+Shift+R          — review your git diff
Ctrl+Shift+R         — (Windows/Linux)
Click status bar     — "⬡ AI Review" button bottom left
Command Palette      — "AI Code Reviewer: Review my changes"
```

After the review, highlighted lines stay in your editor until you:
- Click **"Clear highlights"** in the status bar, or
- Run **"AI Code Reviewer: Clear all highlights"** from the command palette

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `aiCodeReviewer.anthropicApiKey` | `""` | Your Anthropic API key |
| `aiCodeReviewer.model` | `claude-opus-4-6` | Model to use. Opus = deepest, Sonnet = faster |
| `aiCodeReviewer.maxDiffSize` | `20000` | Max chars of diff to review |

---

## Try the demo

```bash
# Sets up a dirty diff with 9 intentional bugs in a React component
bash scripts/demo-setup.sh

# Press F5 in VS Code, then Cmd+Shift+R in the new window
# Expected grade: F  →  after all fixes: A+
```

---

## How it works

```
Cmd+Shift+R
    │
    ▼
git diff HEAD  (only changed lines)
    │
    ▼
Claude Opus API  ←── expert system prompt
(streaming mode)
    │
    ▼
Findings stream into panel      +      Editor decorations light up
(one by one, 300ms apart)              (red/yellow/blue underlines)
    │
    ▼
Letter grade + Copy as PR comment button
```

The system prompt instructs Claude to act as a principal-level React/TypeScript engineer, prioritising security findings, and always providing `before` and `after` code for every fixable issue.

---

## Architecture

```
src/
  extension.ts          # Entry point — commands, status bar, config
  reviewPanel.ts        # WebView panel + Claude streaming API
  decorationManager.ts  # Inline editor highlights + hover tooltips
```

Zero runtime dependencies. TypeScript + VS Code Extension API + native `fetch`.

---

## Roadmap

- [ ] Inline fix application — click "Apply fix" to auto-patch
- [ ] `.aireview` config — per-project custom rules
- [ ] Severity gate — block commit on critical security issues
- [ ] GitHub Actions mode — run reviews in CI on every PR
- [ ] Multi-language support — Python, Go, Java

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, branch naming, commit format, and PR guidelines.

---

## License

MIT — use it, fork it, improve it. See [LICENSE](LICENSE).

---

*Built to solve a real problem: catching issues before they waste your team's review time.*
*If this saves you even one PR cycle, give it a ⭐*
