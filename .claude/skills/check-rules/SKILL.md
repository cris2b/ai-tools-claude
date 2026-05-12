---
name: check-rules
description: Check files or git changes against the platform's project rules (CLAUDE.md). Reports violations and optionally auto-fixes them.
---

# check-rules

Check one or more files, glob patterns, or git changes against the project rules defined in `CLAUDE.md`. By default, violations are reported without editing files. Use "fix them" or equivalent to switch to auto-fix mode.

## Trigger Rules

Activate when:
- The user types `/check-rules` (with or without arguments), OR
- The user's message expresses intent to check files or changes against project rules:
  - "check if ... comply", "verify ... against the rules", "which rules does ... violate",
    "check my changes comply", "does this file follow the rules", or equivalent phrasing.

Do not activate on general code review requests that do not reference rules compliance.

---

## STEP 1 — READ RULES

Read `CLAUDE.md` using the Read tool. If unavailable, attempt `platforms/claude/CLAUDE.md` for development-workspace execution.

- If absent or unreadable: output "No CLAUDE.md found — cannot check rules." and stop immediately. Do not proceed.
- If the file exists but is blank (zero content after trimming whitespace): output "CLAUDE.md exists but contains no rules — nothing to check against." and stop.
- If found and non-empty: store the full file content as `rulesContent`.

---

## STEP 2 — PARSE INPUT

Classify the user's input to build a target list:

- **File paths**: collect all valid-looking file paths from the input (e.g. `src/foo.ts`, `platforms/claude/.claude/skills/plannify/SKILL.md`).
- **Glob patterns**: collect patterns that contain `*` or `**` (e.g. `platforms/claude/**/*.md`).
- **Diff description**: detect branch names, ref ranges, or natural-language diff phrases (e.g. "vs main", "HEAD~2", "my changes on this branch", "branch compared to master", "changes since last commit").
- **Pasted diff**: if the message contains a raw unified diff (lines starting with `---`, `+++`, `@@`), treat the entire diff block as a pasted diff directly.

If no targets are identified: ask "Which files or changes should I check? You can provide file paths, glob patterns, or a branch/diff description." and wait for the user to reply before continuing.

---

## STEP 3 — RESOLVE TARGETS

**Explicit file paths:** read each file using the Read tool.
- If a file cannot be read: note "Could not read `<file>` — skipped." and continue with other targets.

**Glob patterns:** expand to matching file paths; read each match using the Read tool.
- If no files match a pattern: note "No files matched `<pattern>`." and continue.

**Diff description:** attempt to run the appropriate git diff command via the Bash tool:
- Examples: `git diff main...HEAD`, `git diff HEAD~2`, `git diff origin/main...HEAD`.
- Parse the diff output; identify changed files and changed lines (hunks) within those files.
- Inspect **only** the changed lines in each changed file — not the full file content.
- If the Bash tool is unavailable or the git command fails: ask "I need the git diff to proceed. Please paste the output of `git diff <ref>` directly." and wait for the user's paste before continuing.

**Pasted diff:** parse the unified diff format to extract changed files and changed hunks. Inspect only the changed lines.

---

## STEP 4 — DETERMINE MODE

Scan the user's original message for override indicators:

- **Report-only mode** when the message contains: "just show me", "report only", "report-only", "don't fix", "list violations", "what doesn't comply", "without fixing", "no changes", or equivalent phrasing.
- **Auto-fix mode** when the message contains: "fix", "fix them", "auto-fix", "apply fixes", "correct violations", or equivalent phrasing.
- **Custom format** when the user explicitly requests a specific output format (e.g. "as a table", "in JSON", "one line per violation").
- **Default: REPORT_ONLY** — when no override is present.

Report-only indicators take priority over auto-fix indicators. For example, "don't fix" is report-only, not auto-fix.

Ambiguous intent: when the message does not clearly match any override phrase, default to REPORT_ONLY and state the assumption inline: "Interpreting as report-only mode — say 'fix them' to apply changes."

---

## STEP 5 — INSPECT

For each target item (file content or diff hunk):
  For each rule in `rulesContent`:
    Determine whether the target item violates the rule.
    If a violation exists: record it as:
      `{ file, line (or null), description, ruleText }`

Collect all violations across all targets.

---

## STEP 6 — APPLY MODE

### AUTO_FIX

For each file with violations: apply corrective edits using the Edit tool.

Output per file:
```
Fixed N issue(s) in `<file>`:
  - <description of fix> (Rule: "<rule text>")
```

If the Edit tool fails for a file: report "Could not fix `<file>` — skipped." and list the unfixed violations for that file at the end of the output.

If no violations found across all targets: output "No rule violations found."

### REPORT_ONLY (default)

Do not edit any file.

Output one section per file that has violations:
```
## <file>
- <violation description> (Rule: "<rule text or rule category>")
```

If no violations found: output "No rule violations found."

### CUSTOM

Apply the user-requested format to the report-only output (no edits). Honor the exact format the user specified.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| No input after /check-rules | Ask "Which files or changes should I check? You can provide file paths, glob patterns, or a branch/diff description." |
| CLAUDE.md absent | "No CLAUDE.md found — cannot check rules." Stop. |
| CLAUDE.md blank | "CLAUDE.md exists but contains no rules — nothing to check against." Stop. |
| File read error (target) | "Could not read `<file>` — skipped." Continue with other targets. |
| Glob no matches | "No files matched `<pattern>`." Continue. |
| git diff fails | Ask user to paste the diff directly. |
| All targets clean | "No rule violations found." |
| Edit tool failure in AUTO_FIX | Report failure for that file; continue with others; list all unfixed violations at end of output. |
| Input is arguments only (no interactive exchange) | Process the arguments directly without asking for confirmation — accept all input forms (file paths, globs, diff descriptions) from $ARGUMENTS and proceed. Do not block on interactive prompts when arguments supply sufficient information. |
