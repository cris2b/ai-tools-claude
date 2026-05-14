**Features Implemented**

Status Values:
- WORKING: Last time it was tested, it worked.
- DEPRECATED: Not maintained lately, so it may be failing.
- FAILING: Last time it was tested, it did not work, but it is not deprecated.
- IN PROGRESS: It is currently being worked on.


---


**1. Protect Files Hook**

**Description:** A hook that blocks AI tool calls trying to read or write protected files such as `.env` and `.env.*`.

**Date:** 2026-04-25

**Status:** WORKING


---


**2. Prompt Logging Hook**

**Description:** A hook that logs prompt lifecycle events and finalizes log entries from assistant output, writing logs under `ai-tools/local/logs/prompts/`.

**Date:** 2026-04-25

**Status:** WORKING


---


**3. Save Note Skill**

**Description:** A user-invokable skill that appends timestamped notes to a local monthly file under `ai-tools/local/notes/`. Supports `/save-note` slash command and natural-language invocation.

**Date:** 2026-04-25

**Status:** WORKING


---


**4. spec-define Skill + Cold-Read Subagent**

**Description:** An interactive feature-spec authoring assistant. The user describes a feature; the skill inspects the codebase, asks clarifying questions, self-resolves what it can, and produces a self-contained `*-specs.md` document under `ai-tools/local/sdd/`. A cold-read subagent (`spec-define-coldread`) reviews each draft as a planning AI with no conversation history. Supports `/spec-define` slash command and explicit invocation by name. Intended as the specialized path behind `do-make`, not the default first stop for ordinary implementation work.

**Date:** 2026-04-26

**Status:** WORKING


---


**5. do-make Routing Skill**

**Description:** A Claude skill that evaluates whether a request should stay on the direct implementation path or move into the dedicated `spec-define` workflow. It biases toward direct implementation, routes to `spec-define` only for genuinely complex or ambiguous work, and supports explicit `/do-make` invocation.

**Date:** 2026-04-26

**Status:** WORKING


---


**6. plan-execute Skill + Verifier Subagent**

**Description:** A Claude skill that executes one or more `plannify`-generated plan files phase by phase. It asks all clarifying questions upfront before implementation begins, tracks progress in a `<session-name>-progress.md` file, verifies each completed phase via the `plan-execute-verifier` subagent, retries once on failure, and optionally keeps a companion spec file in sync. Supports `/plan-execute` slash command with single plan file, folder, or explicit file list arguments.

**Date:** 2026-05-05

**Status:** IN PROGRESS


---


**7. Do Commit Skill**

**Description:** Adds a `/do-commit` skill that commits only already staged changes, blocks mixed staged and unstaged files, enforces platform feature tracking updates, and generates a concise `feat:` or `fix:` commit message from the staged diff.

**Date:** 2026-05-12

**Status:** WORKING


---


**8. Create PR Skill**

**Description:** Adds a `/create-pr` skill that creates GitHub pull requests between explicit source and target branches, detects existing open PRs, generates `feat:` or `fix:` titles from branch diffs, and writes an enumerated `Changes:` body.

**Date:** 2026-05-12

**Status:** IN PROGRESS


---


**9. Conditional Question Formatting Guidance**

**Description:** Updates spec and planning skills so clarification questions use shared question-formatting guidance when available, while only showing options and recommendations when they are grounded in real choices and sufficient context.

**Date:** 2026-05-12

**Status:** IN PROGRESS


---


**10. Brainstorming Skill**

**Description:** A user-invokable skill (`/brainstorm`) that generates multi-angle ideas, improvements, alternatives, risks, and strategic analysis for a feature or concept. Supports focus modes (technical, UX, business, security, ops), iterative drilling into specific ideas (B1/B2/B3 references), comparison matrices, and prioritized recommendations. Integrates with `spec-define` — when `allow_brainstorming_default: true`, spec-define applies this skill's methodology inline to produce optional brainstorming doubts (B1/B2/B3 format) alongside clarification questions.

**Date:** 2026-05-13

**Status:** IN PROGRESS


---


**11. Markdown Prompt Injection Boundaries For Skills**

**Description:** Hardens Markdown-consuming skills so spec, plan, source, and inline Markdown content is treated as untrusted data. The affected skills now ignore embedded role changes, tool requests, slash commands, prompt-injection text, secret exfiltration requests, and workflow overrides while still using the documents for their intended transformations, planning, review, explanation, or execution tasks.

**Date:** 2026-05-14

**Status:** IN PROGRESS
