# Tool Improvements — Future Work

This document tracks planned improvements to individual tools. These are lower priority than the core improvements but represent significant value-adds.

**Status**: Planned for future implementation  
**Last updated**: 2026-02-13

---

## DeadCodeTool Enhancements

### Cross-file Export Tracking
- **Issue**: Currently only analyzes within-file usage. Can't detect unused exports that are imported elsewhere.
- **Solution**: Build export graph — track all exports and their usages across files. Detect truly unused exports.
- **Framework-aware**: Handle Angular/React decorators, Flask routes, etc.
- **Effort**: High
- **Value**: Significantly improves accuracy

### Better Model Response Parsing
- **Issue**: Line-based parsing is fragile — breaks on markdown, code blocks, or malformed responses.
- **Solution**: More robust parsing with fallback to regex. Validate line numbers before creating findings.
- **Effort**: Medium
- **Value**: Reduces false positives/negatives

---

## LintTool Enhancements

### Config-Aware Linting
- **Issue**: Doesn't check if ESLint/Pylint config exists. Doesn't recommend missing rules.
- **Solution**: 
  - Detect ESLint/Pylint config files
  - Warn if linter exists but config missing
  - Suggest common configs (e.g., "Consider adding eslint-config-standard")
- **Effort**: Medium
- **Value**: Improves usefulness

### Enhanced Model Prompts
- **Issue**: Model findings lack context — no file-level structure/imports in prompts.
- **Solution**: Include file structure/imports in context. Reference existing linter findings. Suggest specific rule additions.
- **Effort**: Medium
- **Value**: Better model suggestions

---

## CommentsTool Enhancements

### Auto-Discovery Mode
- **Issue**: Requires explicit paths — doesn't auto-discover files to scan.
- **Solution**: Scan all files in enabled languages if no paths specified. Respect `.gitignore` patterns. Configurable max files.
- **Effort**: Medium
- **Value**: Improves usability

### Configurable Thresholds
- **Issue**: Age threshold (180 days) is hardcoded. No distinction between docstrings vs inline comments.
- **Solution**: 
  - Make `STALE_THRESHOLD_DAYS` a setting
  - Different thresholds for docstrings vs inline comments
  - Per-language thresholds
- **Effort**: Medium
- **Value**: More flexible

### Comment Classification
- **Issue**: Doesn't distinguish docstrings vs inline comments, TODOs, license headers.
- **Solution**: 
  - Detect docstrings (function/class docs)
  - Detect TODOs/FIXMEs (different handling)
  - Detect license headers (never flag as stale)
- **Effort**: Medium
- **Value**: More accurate pruning

---

## CommitTool Enhancements

### Commit Template Support
- **Issue**: Doesn't use `.gitmessage` template.
- **Solution**: Read `.gitmessage` template if exists. Pre-fill template variables. Respect template structure.
- **Effort**: Medium
- **Value**: Better commit quality

### Conventional Commit Validation
- **Issue**: Doesn't enforce conventional commit format (`feat:`, `fix:`, etc.).
- **Solution**: Optional validation. Suggest conventional format if not used. Configurable enable/disable.
- **Effort**: Medium
- **Value**: Standardizes commits

### Better Hook Output Parsing
- **Issue**: Just shows raw hook output — not actionable.
- **Solution**: Parse hook output for actionable errors. Extract file paths from hook failures. Link hook failures to specific files.
- **Effort**: Medium
- **Value**: Easier debugging

---

## TldrTool Enhancements

### Configurable Time Window
- **Issue**: Fixed 14-day window, not configurable.
- **Solution**: 
  - Add `sinceDays` parameter (default: 14)
  - Support date ranges: "since 2024-01-01"
  - Support commit ranges: "since commit abc123"
- **Effort**: Medium
- **Value**: More flexible

### Filtering Options
- **Issue**: Can't filter by author, file type, commit type.
- **Solution**: 
  - Filter by author: `--author="John"`
  - Filter by file pattern: `--path="src/**"`
  - Filter by commit type: `--type="feat|fix"`
- **Effort**: Medium
- **Value**: Better summaries

### Enrich Highlights
- **Issue**: Highlights have empty files/commits arrays.
- **Solution**: Match file names in highlight descriptions. Link commits mentioned in highlights. Add commit hashes to highlight metadata.
- **Effort**: Medium
- **Value**: More useful summaries

---

## BranchDiffTool Enhancements

### Diff Preview
- **Issue**: Shows summary but not actual code changes.
- **Solution**: Show actual code changes (not just stats). Truncate large diffs intelligently. Link to file locations.
- **Effort**: Low-medium
- **Value**: Better visibility

### File Filtering
- **Issue**: Can't focus on specific files in large monorepos.
- **Solution**: Filter diff to specific paths: `--path="src/**"`. Show only modified files matching pattern.
- **Effort**: Low-medium
- **Value**: Useful for large repos

### Smart Fetching
- **Issue**: Always fetches — may be slow for large repos.
- **Solution**: Cache fetch results (don't fetch if recent). Configurable fetch interval. Background fetch option.
- **Effort**: Medium
- **Value**: Faster operations

---

## DiffResolveTool Enhancements

### Conflict Preview
- **Issue**: Doesn't show conflict context before resolving.
- **Solution**: Show conflict with surrounding context. Highlight differences between sides. Visual diff view.
- **Effort**: Medium
- **Value**: Better UX

### Better Confidence Scoring
- **Issue**: Word overlap isn't reliable for code conflicts.
- **Solution**: Use AST similarity for code conflicts. Consider semantic similarity (not just word overlap). Machine learning confidence (if available).
- **Effort**: Medium-high
- **Value**: More reliable resolutions

### Resolution History
- **Issue**: Can't undo applied resolutions.
- **Solution**: Track applied resolutions. Allow undo: "Revert last resolution". Show resolution diff before applying.
- **Effort**: Medium-high
- **Value**: Safety net

---

## Base Tool Improvements

### Progress Reporting
- **Issue**: Tools don't emit progress events.
- **Solution**: Emit progress during execution. Hook by UI for progress bars.
- **Effort**: Medium
- **Value**: Better UX for long scans

### Streaming Results
- **Issue**: Large results built in memory.
- **Solution**: Yield findings as they're discovered. Don't wait for all files to complete.
- **Effort**: High
- **Value**: Lower memory usage

### Result Pagination
- **Issue**: All findings returned at once.
- **Solution**: Return findings in chunks. Support "load more" pattern. Reduce memory usage.
- **Effort**: High
- **Value**: Scalability

---

## Implementation Notes

- These improvements are prioritized by effort/value ratio
- Some may require breaking changes (e.g., streaming API)
- Consider user feedback before implementing
- Test thoroughly on large codebases before release
