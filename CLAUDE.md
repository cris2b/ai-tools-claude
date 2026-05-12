# CLAUDE.md

## What This Repo Is

This repository is the Claude Code distribution of the `ai-tools` hooks toolkit. It packages Claude hook wiring plus local copies of the hook scripts so the folder works as a standalone project.

## Structure

- `.claude/` - Claude Code settings and Claude-specific skills
- `ai-tools/hooks/` - local hook implementations and config
- `ai-tools/local/` - runtime logs written by the prompt logging hook
- `features-implemented.md` - platform-local feature status tracking

## Setup

The hooks run directly with Node.js. No Python runtime or TypeScript build step is required.

## Working Rules

- When implementing, changing, or adding a feature in this platform package, update `features-implemented.md` in the same change unless the user explicitly says not to.

## Development Commands

- `node ai-tools/hooks/protect-files/protect-files.js` - test the protection hook against stdin
- `node ai-tools/hooks/log-prompts/log_prompt.js start < fixture.json` - test the prompt logging start hook
- `node ai-tools/hooks/log-prompts/log_prompt.js finalize < fixture.json` - test the prompt logging finalize hook
- Claude hook wiring lives in `.claude/settings.json`
- Prompt logs are written under `ai-tools/local/logs/prompts/` and stay untracked because `ai-tools/local/` is gitignored

When new tools or scripts are added, document their run command here.
