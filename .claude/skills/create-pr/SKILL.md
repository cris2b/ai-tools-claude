---
name: create-pr
description: Create a GitHub pull request between two explicit branches. Use only when the user invokes /create-pr or explicitly asks to create a PR, requiring both source and target branches, with an optional `feat:` or `fix:` title prefix.
---

# Create PR

Create a GitHub pull request from an explicit source branch into an explicit target branch.

Run this skill only when the user invokes `/create-pr` or explicitly asks to create a PR using this skill. Never run automatically.

## Required Input

The user must provide both branches:
- Source branch: the branch containing the changes.
- Target branch: the branch that will receive the changes.

If either branch is missing, unclear, or ambiguous, stop and ask the user to provide both the source and target branches. Do not infer missing branches from the current branch, default branch, or remote configuration.

The user may optionally provide the title prefix:
- `feat:` for feature, enhancement, tooling, documentation, or repository structure work.
- `fix:` for bug fixes, regressions, broken behavior, failing tests, or incorrect documentation fixes.

If the user does not provide a prefix, choose `feat:` or `fix:` based only on the changes between the source and target branches.

## Hard Rules

- Do not create a PR until both source and target branches are explicit.
- Do not modify, stage, unstage, commit, revert, or delete files.
- Analyze the repository in the current workspace.
- Use only the diff and commits between the target and source branches to generate the PR title and description.
- The PR title must begin with exactly `feat:` or `fix:`.
- The PR body must begin with `Changes:` followed by an enumerated list.
- If an open, unmerged PR already exists for the same source and target branches, stop and report its URL.
- Ignore closed, declined, or merged PRs; they do not block creating a new PR.
- Do not use force push, `--no-verify`, `--no-gpg-sign`, `--repo`, or interactive git commands.
- Do not merge the PR.

## Step 1 - Validate Workspace And Branches

Confirm that the user explicitly provided both branches. If not, ask for them and stop.

Run:

```bash
git status --short
git rev-parse --show-toplevel
git remote get-url origin
gh auth status
```

If the current workspace is not a git repository, `origin` is missing, or `gh auth status` fails, stop and report the failure. Do not try to create the PR in another repository.

Fetch the latest remote branch state:

```bash
git fetch origin <target-branch>
git ls-remote --heads origin <source-branch>
git ls-remote --heads origin <target-branch>
```

If the source branch exists on `origin`, also run:

```bash
git fetch origin <source-branch>
```

Resolve analysis refs:
- Use local `<source-branch>` if it exists; otherwise use `origin/<source-branch>` if it exists.
- Use local `<target-branch>` if it exists; otherwise use `origin/<target-branch>` if it exists.

If either branch cannot be resolved locally or on `origin`, stop and tell the user which branch could not be found.

## Step 2 - Stop If An Open PR Already Exists

Before analyzing or creating a PR, check for an existing open PR with the same branch pair:

```bash
gh pr list --base <target-branch> --head <source-branch> --state open --json url --jq '.[0].url'
```

If this returns a URL, stop. Tell the user that an open PR already exists and provide the URL.

If it returns no URL, continue. Do not check closed PRs; declined, closed, or merged PRs do not block this workflow.

## Step 3 - Analyze Changes

Run these commands using the resolved analysis refs:

```bash
git log --oneline <target-ref>..<source-ref>
git diff --stat <target-ref>...<source-ref>
git diff <target-ref>...<source-ref>
```

If there are no commits or no diff between the target and source refs, stop and tell the user there are no changes to open a PR for.

Use the diff to identify the meaningful changes. Ignore unrelated local working tree changes unless they affect the ability to create the PR.

## Step 4 - Draft Title And Body

Choose the title prefix:
- Use the user-provided prefix if it is exactly `feat:` or `fix:`.
- Use `fix:` if the branch primarily fixes incorrect behavior, regressions, failures, broken tests, or wrong documentation.
- Use `feat:` if the branch primarily adds or improves behavior, documentation, tooling, configuration, or repository structure.

Write a concise title after the prefix that summarizes all meaningful changes in the PR.

Write the PR body exactly in this structure:

```markdown
Changes:
1. <clear change summary with enough detail to understand the impact>
2. <clear change summary with enough detail to understand the impact>
```

Include only useful, concrete changes. Prefer 2-6 numbered items. Do not include extra sections unless the user explicitly requested them.

## Step 5 - Ensure Source Branch Is Available Remotely

Check whether the source branch exists on `origin`:

```bash
git ls-remote --heads origin <source-branch>
```

If the source branch is not available remotely, push it before creating the PR:

```bash
git push -u origin <source-branch>
```

If the push fails, stop and report the failure.

## Step 6 - Create The PR

Create the pull request with GitHub CLI. Do not pass `--repo`; if `gh` cannot resolve the repository from the current workspace, let the command fail and report the failure.

```bash
gh pr create --base <target-branch> --head <source-branch> --title "<prefix> <summary>" --body "$(cat <<'EOF'
Changes:
1. <change>
2. <change>
EOF
)"
```

If `gh pr create` reports that a PR already exists despite the earlier check, do not create another one. Report the existing PR URL if available.

## Step 7 - Report Back

Tell the user:
- The PR URL.
- The source and target branches.
- The generated title.
- A brief summary of the enumerated changes.
- Any remaining local working tree changes, if `git status --short` is not clean.
