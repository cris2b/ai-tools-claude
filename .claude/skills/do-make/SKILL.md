---
name: do-make
description: Route each request to direct implementation only when the work is fairly simple, and use spec-define for ambiguous or genuinely complex work even when it appears implementation-ready. Use when the user explicitly invokes /do-make or explicitly asks to use do-make. Never run automatically.
---

# do-make

You are the main routing skill for this workspace.

Your first job on every request is to decide whether the work should be answered directly without changes, stay on the direct implementation path, or move into the dedicated specification path handled by `spec-define`.

Default to `spec-define` for work that is complex, broad, or likely to benefit from explicit scope definition. Use direct execution only when the task is fairly simple and clearly bounded.

Act as a router first, not as the long-term owner of work that belongs in the downstream specification workflow.

Core behavior:
- Answer directly without making changes when the user asks a question, requests explanation, asks for advice, or otherwise does not ask for workspace changes.
- Bias toward `spec-define` for genuinely complex work, even if it already appears implementation-ready.
- Use direct implementation only when the work is fairly simple, clear, and low-risk.
- Use `spec-define` when the work is complex enough to benefit from explicit requirements or scope capture before implementation.
- When routing to `spec-define`, delegate quickly instead of continuing to analyze or implement in this skill.
- For direct response or direct implementation, ask the user a concise clarifying question when needed information is missing or a safe answer/change depends on a user decision.
- Respect explicit user instructions to use direct implementation or `spec-define`.
- Ask for confirmation only when the case is genuinely ambiguous.
- Explain the routing choice only when routing to `spec-define` or when asking for confirmation on an ambiguous case.
- When routing to `spec-define`, provide a concise structured handoff so the downstream workflow does not need to redo routing or rediscover obvious context.

Run this skill only when:
- The user types `/do-make` with or without arguments, OR
- The user explicitly asks to use `do-make` in natural language.

Do not run on ambiguous mentions.

## 1. Check for explicit overrides

Treat the request as an override only when the user gives a clear directive such as:

- `implement this directly`
- `use direct implementation`
- `use spec-define`
- `/spec-define ...`

Casual mentions of direct implementation or `spec-define` do not count as overrides.

Override rules:
- Clear directive to implement directly: stay on the direct implementation path.
- Clear directive to use `spec-define`: route into the specification path.
- Explicit `/spec-define` always takes priority over the automatic decision.
- When the user explicitly directs you to use `spec-define`, continue into the specification workflow even if the request might otherwise have stayed on the direct implementation path.

## 2. Make the automatic routing decision

Route to direct response when the request is informational or conversational and does not require changing files, running a workflow, or modifying the workspace.

Common direct-response signals:
- the user asks a question about code, behavior, tools, or process
- the user asks for an explanation, recommendation, comparison, or review that does not request edits
- the user is brainstorming or clarifying options before deciding whether to change anything
- the safest useful action is to answer only, without file changes

Route to direct implementation only when the request is simple, concrete, bounded, implementation-ready, and unlikely to need dedicated requirements capture.

Common direct-implementation signals:
- the task is specific and easy to identify
- the expected change is local or narrowly scoped
- the user is clearly asking for implementation, diagnosis, or a direct edit
- the work can be done safely without a separate acceptance-criteria round
- the change is fairly small or routine
- the task is straightforward enough that a dedicated specification step would add little value

Route to `spec-define` only when at least one clear trigger is present.

Clear `spec-define` triggers:
- important requirements are still ambiguous or missing
- the request spans multiple meaningful moving parts or steps
- the scope is broad enough to affect multiple areas of behavior
- the change is difficult enough that direct implementation would likely create avoidable rework without an explicit spec
- the user is defining a larger feature, workflow, or product behavior rather than asking for an implementation-ready change
- the request is technically or architecturally complex even if the desired outcome seems clear
- the implementation would require coordination across several files, systems, or decisions and is no longer a fairly simple change
- the user explicitly asks for feedback, flaw analysis, or gap identification alongside the request — this signals requirements are not yet settled, even if a draft spec or document is provided
- a provided spec or document has multiple identified gaps or open questions that must be resolved before implementation can begin safely

Borderline cases may stay on the direct implementation path only when they still look fairly simple in practice. If the work feels meaningfully complex, prefer `spec-define` even if the request sounds implementation-ready.

### spec-define cost and routing threshold

`spec-define` is a multi-round workflow: it inspects the codebase silently, runs question rounds, and spawns a cold-read subagent on every spec update before any code is written. This overhead is justified only when the work genuinely benefits from explicit requirements capture.

**Use `spec-define` — the overhead pays off when:**
- Wrong assumptions about requirements would likely cause significant rework
- The feature touches multiple systems or requires coordinated decisions across several files
- Architectural or design decisions must be settled before coding starts safely
- The scope is broad enough that a direct attempt would require revisiting decisions mid-implementation
- The feature will span multiple sessions or needs to be agreed on before implementation begins
- The user is defining a new behavior, flow, or product capability from scratch

**Do NOT use `spec-define` — the overhead is not justified when:**
- The change is confined to one or a few files with obvious scope
- A bug fix with a clear root cause and no ambiguous behavior involved
- A routine refactor where the boundaries are already agreed
- The user already knows exactly what they want and the task is straightforward
- Adding or updating a small, well-understood behavior with no unclear requirements

**Borderline rule:** ask yourself — *"Would wrong assumptions here force a significant rewrite?"* If yes, route to `spec-define`. If no, stay on the direct path.

## 3. Execute the chosen path

If the route is direct response:
- Answer the user's question directly.
- If the answer depends on missing context or a user preference, ask one concise clarifying question instead of guessing.
- Do not edit files or run implementation workflows unless the user asks for that.
- Do not mention routing unless it helps the user.

If the route is direct implementation:
- Proceed directly with the user's request as a normal implementation task.
- If a required decision is unclear or the safe implementation depends on missing information, ask one concise clarifying question before editing.
- Do not mention routing unless it helps the user.

If the route is `spec-define`:
- State briefly that the request is better handled through the specification workflow because it needs clearer requirements, broader definition, or reduced rework risk.
- Continue into `spec-define` when the runtime can invoke that skill directly. If it cannot, tell the user to continue with `/spec-define` or to explicitly ask for `spec-define` so the dedicated workflow can take over.
- Use this handoff structure:

```text
Handoff from do-make to spec-define

Original request:
[user request]

Why routed here:
- [brief reason 1]
- [brief reason 2]

Known constraints:
- [constraints from user or repo, if any]

Relevant repo context already observed:
- [only concrete findings already known]

Open questions already identified:
- [ambiguities, missing decisions, or complexity points that justify spec-definition]

Continue directly in specification mode. Do not redo routing. Focus on requirements and scope.
```

When the case is ambiguous:
- explain the likely route in one short paragraph
- ask whether the user wants to continue with direct implementation or `spec-define`
- if the user does not express a preference and there is no clear `spec-define` trigger, prefer direct implementation

## 4. Relationship to downstream paths

- `do-make` is the preferred user entry point for deciding whether work should be implemented directly or specified first.
- Direct response is the path for informational requests that do not require workspace changes.
- Direct implementation is the default path only for simple, clear, and bounded work.
- `spec-define` is the preferred path for complex work, whether the complexity comes from missing requirements or from the size and difficulty of the implementation itself.

## 5. Guardrails

- Do not keep complex work on the direct path just because the request sounds implementation-ready.
- Do not send trivial or routine work to `spec-define`.
- Do not treat incidental mentions of `spec-define` as override instructions.
- Keep routing analysis short. Delegate quickly when the route is `spec-define`.
- If you route toward `spec-define`, stay focused on requirements and scope rather than jumping into code changes.
