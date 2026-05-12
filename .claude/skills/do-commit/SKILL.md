---
name: do-commit
description: Create a commit from already staged changes only. Use when the user invokes /do-commit or asks to commit staged changes, optionally choosing the `feat:` or `fix:` prefix. Stop if there are no staged changes or if any staged file also has unstaged changes.
---

# Do Commit

Create a git commit from the changes that are already staged. Do not stage additional files.

Run this skill only when the user explicitly asks to commit staged changes or invokes this skill by name. Never run automatically.

## Trigger Patterns

Run this skill when the user asks for any of the following:
- Commit the currently staged changes.
- Commit staged files only.
- Create a commit from the index.
- Use this skill by name, for example `/do-commit`.

The user may specify the required commit prefix:
- `feat:` for feature or enhancement work.
- `fix:` for bug fixes.

If the user does not specify a prefix, choose `feat:` or `fix:` based only on the staged diff.

## Hard Rules

- Do not stage, unstage, revert, or modify files.
- Do not commit if there are no staged changes.
- Do not commit if any staged file also has unstaged changes.
- Do not commit feature additions or feature changes in a platform package unless that platform's `features-implemented.md` is also staged, or the staged diff clearly only updates `features-implemented.md` itself.
- Analyze only staged changes when writing the commit message.
- The final commit subject must begin with exactly `feat:` or `fix:`.
- Do not use `--amend`, `--no-verify`, `--no-gpg-sign`, force options, or interactive git commands.
- Do not push unless the user explicitly asks for it separately.

## Step 1 - Inspect Git State

Run these commands:

```bash
git status --short
git diff --cached --name-only
git diff --name-only
```

Interpret the results:
- `git diff --cached --name-only` lists staged files.
- `git diff --name-only` lists files with unstaged changes.

If `git diff --cached --name-only` returns no files, stop and tell the user that there are no staged changes to commit.

If any file appears in both lists, stop and tell the user that the staged commit is blocked because those files have both staged and unstaged changes. List the overlapping files and ask the user to either stage the remaining changes or separate them before retrying.

## Step 2 - Check Feature Tracking

Before writing the commit message, verify whether the staged files include platform feature work.

Treat staged changes under these paths as platform feature work unless the diff is clearly only documentation cleanup unrelated to an implemented feature:
- `platforms/<name>/.agents/skills/`
- `platforms/<name>/.claude/skills/`
- `platforms/<name>/.opencode/agents/`
- `platforms/<name>/.opencode/commands/`
- `platforms/<name>/ai-tools/hooks/`
- `platforms/<name>/.claude/settings.json`
- `platforms/<name>/.opencode/`

For each affected platform package, check whether `platforms/<name>/features-implemented.md` is also in the staged file list.

If platform feature work is staged but the matching `features-implemented.md` is not staged, stop and tell the user that the commit is blocked because the feature tracking file must be updated and staged first. List each missing `features-implemented.md` path.

## Step 3 - Analyze Staged Changes

Run:

```bash
git diff --cached
```

Use only this diff to determine what changed and why.

Choose the prefix as follows:
- Use the user-provided prefix if it is exactly `feat:` or `fix:`.
- Use `fix:` if the staged diff primarily fixes incorrect behavior, errors, regressions, failing tests, or broken documentation.
- Use `feat:` if the staged diff primarily adds or improves behavior, docs, tooling, configuration, or repository structure.

Write a concise commit subject after the prefix:
- Use sentence case after the prefix.
- Keep it short and specific.
- Prefer one line.
- Do not include bullet points in the commit message unless the staged changes genuinely need a body.

Examples:
- `feat: Add staged commit skill`
- `fix: Fix prompt logging finalize path`

## Step 4 - Commit

Run:

```bash
git commit -m "<prefix> <summary>"
```

Replace `<prefix>` with `feat:` or `fix:` and `<summary>` with the generated summary.

If the commit fails, do not amend. Report the failure and the relevant command output.

## Step 5 - Report Back

After a successful commit, run:

```bash
git log -1 --oneline
git status --short
```

Tell the user:
- The commit hash and message.
- A short summary of what was committed.
- Whether any uncommitted changes remain.
