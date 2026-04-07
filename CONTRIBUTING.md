# Contributing to AI Code Reviewer

First off — thank you for wanting to contribute. This project is built by developers, for developers, and every contribution matters.

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [How to contribute](#how-to-contribute)
- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Making changes](#making-changes)
- [Submitting a pull request](#submitting-a-pull-request)
- [Reporting bugs](#reporting-bugs)
- [Suggesting features](#suggesting-features)

---

## Code of conduct

This project follows a simple rule: **be kind**. Treat contributors and users with respect. Constructive criticism is welcome; personal attacks are not.

---

## How to contribute

There are many ways to contribute — you don't have to write code:

- **Report a bug** — open an issue with steps to reproduce
- **Suggest a feature** — open a discussion or issue
- **Improve the docs** — fix typos, add examples, clarify setup steps
- **Write code** — pick an open issue and submit a PR
- **Share it** — star the repo, post about it, tell your team

---

## Development setup

### Prerequisites

- Node.js 18+
- npm 9+
- VS Code 1.80+
- Git
- An Anthropic API key (free at [console.anthropic.com](https://console.anthropic.com))

### Steps

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/ai-code-reviewer.git
cd ai-code-reviewer

# 2. Install dependencies
npm install

# 3. Compile TypeScript in watch mode
npm run watch

# 4. Open in VS Code
code .

# 5. Press F5 to launch Extension Development Host
#    A new VS Code window opens with the extension loaded

# 6. Add your API key
#    Settings (Cmd+,) → search "AI Code Reviewer" → paste key
```

### Try the demo

```bash
# Copy the demo file to create a dirty git diff
cp demo-files/UserDashboard.tsx src/UserDashboard.tsx
git add -N src/UserDashboard.tsx

# In the Extension Dev Host window, press Cmd+Shift+R
# You should see findings stream in and lines highlight
```

---

## Project structure

```
ai-code-reviewer/
├── src/
│   ├── extension.ts          # Entry point — commands, status bar, keybindings
│   ├── reviewPanel.ts        # WebView panel + Claude API streaming call
│   └── decorationManager.ts  # Inline editor highlights + hover tooltips
│
├── demo-files/
│   └── UserDashboard.tsx     # React component with intentional bugs for demos
│
├── .github/
│   └── workflows/
│       ├── ci.yml            # Runs on every push/PR — lint + compile
│       └── release.yml       # Runs on version tags — package + publish
│
├── scripts/
│   └── demo-setup.sh         # Helper script to set up the demo environment
│
├── media/                    # Icons and screenshots for the marketplace
├── CHANGELOG.md
├── CONTRIBUTING.md           # This file
├── package.json
└── tsconfig.json
```

### Key files to understand

**`extension.ts`** — Start here. This is where the VS Code command is registered, git diff is captured, and config is read. It wires everything together.

**`reviewPanel.ts`** — The core. Creates the WebView panel, calls the Claude API in streaming mode, and sends findings to the panel one by one as they arrive. The system prompt lives here.

**`decorationManager.ts`** — Manages the colored underlines in the editor. Each finding type gets its own `TextEditorDecorationType` with hover messages showing the fix.

---

## Making changes

### Branch naming

```
feature/your-feature-name
fix/bug-description
docs/what-you-updated
chore/maintenance-task
```

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add inline fix application button
fix: handle empty git diff gracefully
docs: add GIF to README
chore: upgrade to claude-opus-4-6
```

### Code style

- TypeScript strict mode is enabled — no `any` without a comment explaining why
- Run `npm run lint` before committing — CI will fail if lint fails
- Keep functions small and focused
- Add a JSDoc comment to any public method

---

## Submitting a pull request

1. **Open an issue first** for anything non-trivial — discuss the approach before building it
2. Fork the repo and create your branch from `main`
3. Make your changes
4. Run `npm run lint` and `npm run compile` — both must pass
5. Test manually with the Extension Dev Host (`F5`)
6. Open a PR with:
   - A clear title (use conventional commits format)
   - A description of *what* changed and *why*
   - Screenshots or a GIF if there's a visual change
   - Reference to the related issue (`Closes #123`)

### PR review process

- A maintainer will review within 48 hours
- We may request changes — this is normal, not a rejection
- Once approved, a maintainer will merge and credit you in the CHANGELOG

---

## Reporting bugs

Open an issue and include:

- VS Code version (`Help → About`)
- Extension version
- What you did
- What you expected
- What actually happened
- Any error messages from the Output panel (`View → Output → AI Code Reviewer`)

---

## Suggesting features

Open a GitHub Discussion or issue tagged `enhancement`. Include:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you considered

Good feature ideas that are on our radar:
- Inline fix application (click "Apply fix" to auto-patch the code)
- `.aireview` config file for per-project custom rules
- Severity gate — block commit if critical security issues found
- GitHub Actions integration — run reviews in CI
- Support for more languages beyond React/TypeScript

---

## Publishing (maintainers only)

To release a new version:

```bash
# 1. Update CHANGELOG.md with what changed
# 2. Commit everything
git add . && git commit -m "chore: prepare v1.1.0 release"

# 3. Tag the release — this triggers the publish workflow automatically
git tag v1.1.0
git push origin main --tags
```

The GitHub Actions release workflow will:
- Compile the extension
- Package it as a `.vsix`
- Create a GitHub Release with the file attached
- Publish to the VS Code Marketplace
- Publish to Open VSX

---

Thank you for contributing. Every PR, issue, and suggestion makes this better for every developer who uses it.
