---
name: question-formatting
description: Format user-facing questions in a consistent, decision-oriented structure. Use whenever an agent is about to ask the user a question; include lettered options and a recommendation only when real options and enough context exist.
---

# Question Formatting

Use this skill before any user-facing question.

This skill does not decide whether a question is necessary. It only standardizes how the questions are presented.

## Purpose

Turn user-facing questions into concise, decision-oriented prompts that:
- explain why the answer matters
- offer concrete options when valid choices are known
- include a recommendation when there is enough context to justify one
- minimize back-and-forth

## When To Use

Use this skill whenever the agent is about to ask the user any user-facing question.

The agent must first decide that the question is necessary. This skill only controls presentation.

Do not use this skill when:
- the answer is already clear from the repo or conversation
- the agent can safely self-resolve the issue
- the user asked for brainstorming instead of a concrete decision

## Formatting Rules

- Group related questions by topic when there is more than one.
- Ask only real questions. Do not ask for information that is already known or inferable.
- Keep the number of questions per round as low as practical.
- Every question must include a short title line and one or two sentences explaining why the answer matters.
- Include lettered options only when there are concrete, valid choices to present. Do not invent options just to satisfy a format.
- Include a recommendation only when repo context, user-stated preference, project rules, or clear risk reduction supports it. Do not invent or guess a recommendation.
- If the choice is purely preference-based, say so and omit the recommendation unless the user asked for one.
- Use a stable letter-plus-number reference such as `Q1` for each question instead of a bare numeric label.
- Keep question references incremental and stable within the same chat.
- Do not use hyphens in question references.
- Prefer concrete options over open-ended prompts.
- If a free-form answer is genuinely needed, include it only after presenting the concrete options.

## Required Format

Use this structure when concrete options and a recommendation are available:

```text
Q1. [Question title]

[Why this matters in one or two sentences.]

Options:
  a) Option A - description
  b) Option B - description
  c) Option C - description

Recommendation: b - reason
```

Use the same pattern for each additional question.

If concrete options or a recommendation are not available, omit those sections:

```text
Q1. [Question title]

[Why this matters in one or two sentences.]

Answer needed: [specific free-form information needed]
```

## Writing Guidance

- Make titles specific, not generic.
- Make options mutually understandable and easy to compare.
- Use recommendations to reduce decision effort, not to pressure the user.
- Ground recommendations in repo context, user-stated preference, project rules, or clear risk reduction.
- Do not manufacture options or recommendations from insufficient information.
- Keep the language direct and low-noise.
- Avoid implementation detail unless it materially affects the decision.

## Quality Check

Before sending the questions, confirm:
- each question is actually blocking progress or quality
- each option is actionable when options are provided
- the recommendation is explicit when a recommendation is provided
- there are no redundant or obvious questions
