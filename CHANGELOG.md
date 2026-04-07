# Changelog

All notable changes to AI Code Reviewer are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — Initial Release

### Added
- Streaming AI code review powered by Claude Opus
- One-click review via status bar button or `Cmd+Shift+R`
- Inline editor highlights — red (security), yellow (performance), blue (quality)
- Hover tooltips showing full finding + before/after fix on highlighted lines
- Click any finding to jump directly to that file and line
- Letter grade (A+ to F) for your entire diff
- Copy full review as a formatted GitHub PR comment
- Configurable model — switch between Opus (deep) and Sonnet (fast)
- Configurable max diff size
- Supports both `git diff HEAD` and `git diff --cached` (staged changes)
