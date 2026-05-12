---
name: plannify
description: Convert a prompt or spec document into complete, self-contained implementation plan files. Invoked via /plannify.
---

# plannify

Convert a user prompt or existing spec document into one or more complete, self-contained implementation plan files. Act as a Senior Software Architect + Product Designer + Execution Strategist + Critical Auditor. Never write code; only write plan documents.

Run this skill only when:
- The user types `/plannify` with or without arguments.
- The user explicitly asks to use `plannify` by name.

Do not trigger on ambiguous mentions of planning, specs, or implementation plans.

## Senior Dev Lens

The senior dev lens is always active. Every plan you generate must reflect best practices for the target language, framework, and project structure derived from the source and `rulesContent`. Lens dimensions:

- **Performance**: identify high-frequency queries, N+1 risks, caching opportunities, or hot-path bottlenecks.
- **Scalability**: flag concurrent write contention, large data volume patterns, or architectural choices that limit horizontal growth.
- **Maintainability**: prefer explainable structure, avoid over-engineering, keep complexity proportional to the problem.
- **DX**: clean API design, meaningful naming, logical folder organization, documentation hints (when to add JSDoc, README updates, or inline comments for non-obvious logic). Code-level style is out of scope.

**Inline enrichment**: Enrich existing sections (Architecture, Core Logic, Performance, Testing Strategy, Conventions) with concise quality notes. No new required section is added. Each note must be one sentence and directly actionable. Only surface concerns significant enough to influence an architecture or implementation decision.

**Visibility indicator**: Every plan's `Execution Strategy` section must include the line: `Quality lens: best practices, performance, scalability, DX applied.`

**Proactive requirement injection**: When the lens identifies a non-trivial concern — high-frequency queries, concurrent writes, large data volumes, or a public-facing API whose ergonomics affect multiple callers — add it to the requirement inventory as a `should` or `optional` requirement with the appropriate type. Minor quality considerations are noted inline without becoming REQ-NNN entries.

**Rules vs. best practices**: `rulesContent` always prevails over best practices. When a project rule conflicts with a best practice and the conflict has a real impact on quality or long-term scalability, annotate it inline in the affected plan section. Minor conflicts are silently deferred to the rule with no annotation. The user may override a specific conflict during the planning session (e.g. "ignore rule X, use best practice here"); this overrides rules-win for that decision only.

## Workflow

### 1. Source Intake

Resolve config first:
- Read `ai-tools/local/sdd/sdd.config.json` using the Read tool.
- If it exists, parse JSON and use `outputPath`.
- If it is absent or `outputPath` is missing, use `ai-tools/local/sdd/` silently.

Handle input:
- No argument: ask `Please provide a prompt describing the feature, or the path to an existing spec file.` Stop until the user replies.
- File path argument: read the file using the Read tool. If it cannot be read, report `Could not read the spec file at <path>. Please verify the path and try again.` and stop.
- Free-text argument: use the text as the source.

Resolve session name:
- If the input path matches `<folder>/<folder>-specs.md`, use `<folder>`.
- Otherwise generate a kebab-case name from the first 3-5 significant words, excluding articles, prepositions, and conjunctions.
- For generated names, announce: `Session name: <name>. Plans will be written to <outputPath>/<name>/. Confirm or provide an alternative.` If the user provides an alternative, use it.
- If the target folder already exists, append `-v2`, `-v3`, etc. and notify the user.

Ensure output directory:
- Use `<outputPath>/<session-name>/`.
- Create it silently when needed by writing the first generated file into that path.

Load project rules:
- Attempt to read `CLAUDE.md` from the active project root.
- If unavailable, attempt `platforms/claude/CLAUDE.md` for development-workspace execution.
- If found, store the full content as `rulesContent`; it is an active constraint for all remaining steps. Do not re-read it.
- If absent or unreadable, say `No CLAUDE.md found - proceeding without project rules.` and continue with `rulesContent = null`.

### 2. Requirement Inventory

Extract all requirements from the source. No requirement may be omitted.

Format:

```markdown
| REQ-NNN | Description | Source reference | Type | Priority |
```

Type values: `feature` | `UI` | `data` | `integration` | `performance` | `security` | `constraint` | `test`

Priority values: `must` | `should` | `optional`

When `rulesContent` is non-null, add any applicable project constraints to the inventory. For example, a mandated file structure, naming convention, or workflow is a `must` constraint.

Apply the **Senior Dev Lens** (see above): identify non-trivial quality concerns and add them to the inventory as `should` or `optional` requirements before presenting. Minor concerns are reserved for inline enrichment at plan generation time.

Present the inventory inline before proceeding.

### 3. Depth Classification

Classify after the requirement inventory is complete:

| Mode | Condition | Auditors invoked |
|---|---|---|
| LIGHT | 1 plan expected and <=5 requirements | Requirement + Coverage |
| STANDARD | 1-3 plans expected and 6-20 requirements | Requirement + Coverage |
| DEEP | >20 requirements, >=4 plans expected, or shared foundation work likely | Requirement + Decomposition if multi-plan + Testing + Coverage |

When ambiguous between LIGHT and STANDARD, default to STANDARD. When ambiguous between STANDARD and DEEP, default to DEEP.

Announce: `Depth mode: STANDARD.`

### 4. Requirement Auditor

Always invoke `plan-requirement-auditor` via the Agent tool with:
- The complete requirement inventory table inline.
- Source: pass the file path and instruct the agent to read it when the input was a file; otherwise pass the free text inline.

Expected schema:

```text
FINDINGS: none
OR
FINDINGS:
F1. [REQ-ID or source section] | [issue-type] | [explanation]
```

Process findings:
- `missing`: add the missing requirement and re-number.
- `duplicate`: merge or remove the duplicate and update IDs if needed.
- `over-broad` or `vague`: split or refine the requirement inline.
- `misclassified-type` or `misclassified-priority`: correct the field.

Apply fixes silently and present the updated inventory. If the auditor fails or returns unparseable output, proceed with the current inventory and say `Requirement Auditor was unavailable this round - proceeding with current inventory.`

### 5. Clarification Gate

Ask questions only if ambiguity blocks architecture, data model, UX behavior, system boundaries, integrations, or plan decomposition.

Do not ask about:
- Trivial details resolvable by convention.
- Things already defined in the source or `rulesContent`.
- Implementation choices that do not affect plan structure.

If questions exist, use the `question-formatting` skill when available; otherwise use the Q-format below. Group thematically. Ask at most 15 questions. Include options and a recommendation only when real options and enough context exist. Do not invent options or recommendations. Do not continue until the user answers.

If no questions exist, continue without mentioning this step.

### 6. Planning Strategy

Decide whether to generate a single plan or multiple plans.

Generate multiple plans when at least one is true:
- Domains are clearly separable with independent implementation paths.
- The system is large enough that one plan would be hard to execute safely.
- Shared foundation work exists across multiple domains.

Do not create extra plan files unless they improve execution safety, clarity, reviewability, or implementation-context manageability.

Single plan:
- Name it `01-<session-name>.md`.

Multiple plans:
- Split by domain, not by layer.
- Map the dependency graph before naming files.
- Each implementation plan must be implementable from first file to final test without reading another generated plan, unless a minimal explicit dependency is unavoidable.
- Use `00-core-plan.md` only when multiple implementation plans share genuine core work such as shared architecture, shared types, base services, configuration, shared components, database schema, auth, testing infrastructure, or repository conventions.
- Do not create `00-core-plan.md` for several fully independent plans.
- Name plans in dependency order: `01-<domain-a>.md`, `02-<domain-b>.md`, etc.
- Plans with the same numeric prefix must be fully parallelizable.
- Higher numeric prefixes depend on all lower-numbered plans unless a narrower dependency is explicitly stated.
- Announce the plan list and order before writing files. Include `00-core-plan.md` only when core work exists.
- When a plan uses context from `00-core-plan.md`, inline that context in the plan. Never rely on `00-core-plan.md` as required implementation reading.

### 7. Decomposition Auditor

Invoke `plan-decomposition-auditor` only when generating multiple plans.

Prompt it with:
- The requirement inventory.
- The planned list of plan files and scopes.
- Whether `00-core-plan.md` is present, required, or intentionally absent; if present, include its planned section list.

Expected schema:

```text
FINDINGS: none
OR
FINDINGS:
F1. [type] | [affected-plans] | [explanation] | [suggested-fix]
```

Issue types: `hidden-dependency` | `incomplete-core-plan` | `unnecessary-core-plan` | `non-independent-plan` | `missing-plan` | `over-split`

Process findings before generating files. If the auditor fails, proceed with the current split and notify the user.

### 8. Plan Generation

Generate each plan file under `<outputPath>/<session-name>/` using the Write tool.

Rules:
- Every implementation plan must include the full Plan Template below.
- Omit only sections marked as omittable when not applicable.
- Each plan must be self-sufficient: it must be implementable without reading any other generated file.
- Never write `see core-plan.md`, `as defined elsewhere`, or similar external references.
- Inline shared contracts, architecture, paths, types, and conventions wherever they are used.
- If `rulesContent` exists, treat it as a hard constraint. Generated plans must not contradict its file structures, paths, naming conventions, commands, or workflows.
- Apply the **Senior Dev Lens** to every generated plan (see Senior Dev Lens section): enrich Architecture, Core Logic, Performance, Testing Strategy, and Conventions sections with quality notes where warranted. Include the visibility indicator line in every `Execution Strategy` section. When a `rulesContent` rule conflicts with a best practice and the impact on quality or scalability is real, annotate it inline in the affected section.

### 9. Testing Auditor

Invoke `plan-testing-auditor` when either condition is true:
- Depth mode is DEEP.
- Any generated plan contains persistence, business rules, multi-step workflows, or external integrations.

Prompt it with:
- The file paths of all generated plan files; instruct the agent to read each file.
- The requirement inventory inline.

Expected schema:

```text
FINDINGS: none
OR
FINDINGS:
F1. [type] | [affected-plan] | [behavior] | [explanation] | [suggested-test]
```

Apply findings to the Testing Strategy section of affected plans. If the auditor fails, proceed without it and notify the user.

### 10. Coverage and Reconciliation

Always invoke `plan-coverage-auditor` after plan generation.

Prompt it with:
- The requirement inventory inline.
- Source: file path if input was a file; inline text otherwise.
- The file paths of all generated plan files; instruct the agent to read each file.
- If `rulesContent` exists: `Rules content: <full text>. Check that no generated plan contradicts a project rule. Report violations as ambiguity findings with source-ref identifying the violated rule.`

Expected schema:

```text
FINDINGS: none
OR
FINDINGS:
F1. [issue-id] | [type] | [source-ref] | [affected-plan] | [explanation] | [needs-clarification: yes/no] | [clarification question if yes]
```

Reconciliation loop:
- Round counter starts at 0.
- For each finding, determine if it is auto-fixable using only the source, `rulesContent`, or the current conversation.
- Apply auto-fixable findings silently to affected plans and re-write those files.
- Findings requiring user judgment or new information are not auto-fixable.
- Increment the round counter after processing findings.
- If counter < 2 and auto-fixes were applied, re-invoke Coverage Auditor.
- If counter = 2 and unresolved non-auto-fixable findings remain, present them clearly and pause until the user provides input.
- Reset counter to 0 after the user provides input.
- When all findings are resolved, proceed to the summary.

### 11. Implementation Summary

This is the final output of the skill.

For single-plan sessions, output only:

```text
Plan written to <path>/01-<name>.md
```

For multi-plan sessions, output:

```text
Plans written to <outputPath>/<session-name>/

Implementation order:

1. 00-core-plan.md - implement first

2. Parallel - implement simultaneously:
   01-<name-a>.md
   01-<name-b>.md

3. After step 2:
   02-<name-c>.md - depends on: 01-<name-a>.md
```

Rules:
- Always show the full list of plan files.
- `Parallel` means every listed plan can be started and finished independently.
- Do not label plans as parallel if any implementation-time dependency exists between them.
- If all non-core plans are independent, show them in one parallel group.
- If no parallelism exists, show sequential order with dependency annotations.
- Do not add partial-parallelism notes. Parallelism is plan-level only.

## Q-Format

Use stable `Q<N>` identifiers.
Include `Options` and `Recommendation` only when they can be provided without guessing.

```text
Q1. [Question title]

[Why this matters in one or two sentences.]

Options:
  a) Option A - description
  b) Option B - description

Recommendation: a - reason
```

If no concrete options or recommendation are available, use:

```text
Q1. [Question title]

[Why this matters in one or two sentences.]

Answer needed: [specific free-form information needed]
```

## Plan Template

Each implementation plan must include these sections:

```text
0. Execution Strategy - approach, key constraints, what this plan covers; must include the line: Quality lens: best practices, performance, scalability, DX applied.
1. Objective - what the plan implements and why
2. Key Decisions - irreversible vs reversible choices
3. Architecture - inlined, self-sufficient, no external references
4. Data Models - all types and schemas used
5. Core Logic - algorithms, workflows, business rules
6. Services / Components - what is built and its responsibilities
7. UI/UX - omit if not applicable
8. System States - state machine or state list with transitions
9. Error Handling - all failure modes and recovery behaviors
10. Persistence - what is stored, where, how
11. Integrations - omit if none
12. Performance - omit if none
13. Execution Phases - 5-10 phases; each phase has Objective, Tasks <=5, Expected Result, Validation, Failure Handling
14. Implementation Contracts - interfaces, file paths, naming rules
15. Assumptions - what is assumed true at implementation time
16. Testing Strategy - TDD / test-after / hybrid; unit tests; integration tests; edge cases; test files
17. Dependencies - informational generated-plan dependencies and external systems
```

## Core-Plan Template

Create `00-core-plan.md` only when multiple implementation plans share genuine core work that needs a coordinated reference. Write it first when used.

Required sections:
- Architecture: system layout and file structure.
- Shared Types: data models used by multiple plans.
- Base Services: shared utilities or foundational components.
- Configuration: env vars, config files, defaults.
- Shared Components: UI or logic shared across plans.
- Database Schema: if applicable.
- Auth: if applicable.
- Testing Infrastructure: test framework and shared fixtures.
- Conventions: naming, style, and error handling patterns.

## Error Handling

Subagent failure:
- Detect empty output, malformed output, schema mismatch, or tool failure.
- Recover with inline reasoning for that audit step.
- Notify the user which auditor was unavailable and that inline reasoning was used.
- Continue without retrying.

Config file missing:
- Use `ai-tools/local/sdd/` silently.

Output directory missing:
- Create it by writing the first generated file into the target path.
- If creation fails, stop and report the error.

Spec file not found:
- Report `Could not read the spec file at <path>. Please verify the path and try again.` and stop.

No requirements extracted:
- Report `Could not extract any requirements from the provided input. The input may be too vague or too short.`
- Ask the user for more detail and stop.

## Edge Cases

| # | Scenario | Behavior |
|---|---|---|
| E1 | No argument provided | Ask for input and stop |
| E2 | Spec file cannot be read | Report error and stop |
| E3 | No requirements extracted | Ask for more detail and stop |
| E4 | `sdd.config.json` absent | Use default outputPath silently |
| E5 | Output directory absent | Create silently when writing |
| E6 | Session name collides | Append `-v2`, `-v3`, etc. and notify user |
| E7 | Auditor fails or returns unparseable output | Use inline reasoning, notify user, continue |
| E8 | Reconciliation cap reached | Present unresolved findings and pause |
| E9 | Source could be path or free text | Treat as path only if it resolves to a readable file |
