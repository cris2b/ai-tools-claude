---
name: flow-explainer-html
description: Explain code, repository flows, skills, features, endpoints, or any user-indicated subject and return both an ordered HTML UI content map and a full explanation. Use when the user asks to explain how something works and wants output suitable for generating an explainer HTML page.
---

# Flow Explainer HTML

Explain the requested subject with enough structure for another AI to generate an HTML explainer page from the response.

Use this skill when the user asks to explain code, a flow, a skill, a feature, an endpoint, a repository behavior, or any similar subject, especially when they want the result formatted for an explainer UI or HTML generator.

## Core Rules

- Inspect relevant local files before explaining any local code, local skill, repository flow, or platform feature.
- Do not invent missing details. If a field cannot be supported by available information, keep the field and write exactly: `Information not available, please do not show this in the UI`.
- Return all default labels and generated content in English unless the user explicitly requests another language for this specific explanation.
- Always return the two top-level blocks `What to show in the UI:` and `Full explanation:`.
- Keep every UI field listed in the required field order, even when unavailable.
- Put useful information that does not fit the HTML-derived fields under `Extra fields I would like to add to the HTML`.
- Repetition between the UI map and the full explanation is allowed when it helps the downstream HTML generator.
- If the target is broad, explain the main verified flow first and clearly state limits rather than expanding into speculation.

## Workflow

1. Identify the subject to explain and whether it is local code, a repository flow, an external concept, or conversation-only context.
2. If local files are relevant, inspect the smallest sufficient set of files before writing the explanation.
3. Gather evidence for structure, behavior, dependencies, entry points, important branches, risks, and examples.
4. Fill the required UI fields in order. Use the unavailable marker for any field that cannot be justified.
5. Write the full explanation after the UI map, with a clear narrative of how the subject works end to end.

## Required Output Shape

Use this exact top-level structure:

```text
What to show in the UI:
<ordered field map>

Full explanation:
<complete explanation>
```

## Required UI Field Order

Inside `What to show in the UI:`, output every field below in this order.

```text
UI generation instruction: Tell the downstream AI to generate an HTML explainer page from this field map, omit fields marked unavailable, and avoid inventing missing information.
Subject name: <name>
Subject kind: <kind>
Sidebar title: <title>
Sidebar current item: <current item>
Table of contents: <ordered sections and step subitems>
Top bar brand label: <brand/category label>
Top bar title: <title>
Mode labels: <simple, mixed, technical labels>
View controls: <theme, density, or other controls>
Hero eyebrow: <category/stack label>
Hero title: <main page title>
Hero lede: <intro paragraph>
Hero tags: <chips/tags>
Hero metadata: <key/value metadata>
TL;DR heading: <heading>
TL;DR simple explanation: <non-technical summary>
TL;DR technical explanation: <technical summary>
Analogy heading: <analogy title>
Analogy explanation: <analogy text>
Analogy visual brief: <visual illustration description>
Walkthrough heading: <step-by-step heading>
Walkthrough intro: <intro for steps>
Walkthrough steps: <ordered steps with number, title, simple explanation, technical explanation, callouts, and visual/code reference>
Code snippets: <file name, language, relevant lines, and code content>
Code annotations: <line-level or concept-level annotations>
UI screenshots or state mockups: <frontend state mockups or UI screenshots to draw>
Visualization heading: <heading>
Visualization description: <description>
Visualization diagram brief: <timeline, state comparison, sequence diagram, branch comparison, or other visual structure>
Visualization legend: <labels and meanings for colors, symbols, branches, lanes, actors, or events>
Flowchart heading: <heading>
Flowchart description: <description>
Flowchart nodes and edges: <ordered node/edge list with decisions, branches, success paths, and error paths>
Code review heading: <heading>
Code review intro: <intro>
Code review tabs: <review lenses such as Pitfalls, Looks incomplete, Doesn't quite add up, and Refactor / optimize>
Code review findings: <cards grouped by tab, with severity/status, category tag, title, explanation, and suggested fix>
Recap heading: <heading>
Recap intro: <intro>
Recap takeaways: <key takeaways>
Footer note: <footer copy>
Sources inspected: <files, folders, commands, docs, or conversation context used as evidence>
Confidence and limits: <what is verified and what could not be verified>
Glossary: <short definitions for important terms>
Open questions: <questions or missing inputs that would improve the explanation>
Extra fields I would like to add to the HTML: <additional useful fields outside the current HTML template>
```

## Unavailable Fields

If a field cannot be filled from available context, write this exact value:

```text
Information not available, please do not show this in the UI
```

Do not delete, rename, or reorder the field.

## Full Explanation Guidance

The `Full explanation:` block should include:

- What the subject is and where it lives.
- The entry point or trigger.
- The main flow from start to finish.
- Important branches, decisions, and failure paths.
- Relevant files, functions, modules, commands, or configuration.
- How pieces depend on each other.
- Risks, caveats, missing evidence, or non-obvious behavior.
- A concise recap.

Prefer concrete references over generic descriptions. If code was inspected, cite file paths and relevant symbols.
