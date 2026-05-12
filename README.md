# claude-ai-tools

## What it is

A standalone Claude Code package from the `ai-tools` project. It includes Claude hook wiring plus local copies of the file protection and prompt logging hooks.

## What's included

- `.claude/settings.json` with Claude hook wiring for file protection and prompt logging
- `.claude/skills/` with Claude-specific skills including `do-make`, `spec-define`, and local utilities
- `ai-tools/hooks/protect-files/` with the protection hook and its config
- `ai-tools/hooks/log-prompts/` with the prompt logging hook, library, and config
- `features-implemented.md` with the current platform feature status

## How to use it

Copy the contents of this folder into the root of your own project. Keep `.claude/settings.local.json` and `CLAUDE.local.md` as local-only files, and edit the configs under `ai-tools/hooks/` if you want different protection or logging behavior.

## Skills

- `/do-make` is the preferred routing entry point. It defaults to direct implementation and points users to `/spec-define` only when the request is genuinely complex.
- `/spec-define` is the dedicated specification workflow for larger or more ambiguous feature work.
