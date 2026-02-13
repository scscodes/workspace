What's built
Layer	What	Status
Settings	SettingsManager with change events, normalizeSettings, validateSettings	Done, 12 tests
Git ops	executor, status parser, log parser, blame, staging, hooks, commit validation	Done, 20 tests
Model providers	VscodeLmProvider (vscode.lm API - VSCode/Copilot only), DirectApiProvider (Anthropic + OpenAI - required for Cursor)	Done
Base tool	BaseTool abstract class — lifecycle, cancellation, summary, JSON/MD export	Done
DeadCodeTool	Static regex patterns + model-driven synthesis, deduplication	Done
LintTool	ESLint/Pylint wrapping + model-driven smell detection	Done
CommentsTool	Git blame age analysis + model value assessment, proposals only	Done
CommitTool	Full pipeline: status → stage → model message → constraints → hooks → proposal	Done
TldrTool	Git log → model summarization with highlights	Done
ToolRunner	Orchestrates execution, progress, result broadcasting	Done
Sidebar	Tools tree + Results tree with jump-to-source	Done
Chat	@aidev participant with command routing and file reference extraction	Done
Commands	All route to ToolRunner, export with format picker	Done
Status bar	Mode indicator with real-time updates	Done
Docs	docs/SPEC.md + .cursor/rules/aidev-project.mdc	Done
What's left for future work
Integration tests — @vscode/test-electron is configured but no test files yet
Framework-aware dead code analysis — Angular decorators, React hooks, Flask routes awareness
Linter config suggestions — model recommending ESLint/Pylint rule additions
Richer sidebar — collapsible finding details, inline diff preview
Direct API key storage — migrate from settings to VSCode SecretStorage