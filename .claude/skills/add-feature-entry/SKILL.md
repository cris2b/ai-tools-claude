---
name: add-feature-entry
description: Add new entries to `features-implemented.md` using the repository's required markdown format. Use when Codex needs to document a newly added feature in that file, preserve numbering and spacing, and default the status to `IN PROGRESS` unless the user explicitly requests another status.
---

# Add Feature Entry

Update the root file `features-implemented.md` in this repository by appending a new feature entry that matches the existing format exactly.

## Workflow

1. Read `features-implemented.md`.
2. Keep the `**Features Implemented**` heading and the `Status Values:` legend unchanged unless the user explicitly asks to edit them.
3. Find the last numbered feature entry and use the next consecutive integer.
4. Append the new entry at the end of the file.
5. Use `IN PROGRESS` as the default status unless the user explicitly provides another status.
6. Preserve the existing spacing and separator style.

## Required Entry Format

Each new feature entry must use this exact structure:

```md
---

**<number>. <Feature Name>**

**Description:** <short description>

**Date:** <YYYY-MM-DD>

**Status:** <STATUS>
```

## Formatting Rules

- Use a horizontal rule `---` before each feature entry.
- Keep the blank lines exactly like the existing file: separator, blank line, title, blank line, each field on its own line with blank lines between them.
- Use bold labels exactly as shown: `**Description:**`, `**Date:**`, `**Status:**`.
- Keep statuses uppercase to match the file convention.
- Use the current date in `YYYY-MM-DD` format unless the user explicitly provides a different date.
- Do not renumber existing entries unless the user explicitly asks for a cleanup or reorder.

## Status Rules

- Default to `IN PROGRESS`.
- If the user specifies a status, use it instead.
- Prefer one of the statuses already documented in the file:
  `WORKING`, `DEPRECATED`, `FAILING`, `IN PROGRESS`.
- Do not add new status values unless the user explicitly asks for that change.

## Content Rules

- Keep the title concise and human-readable.
- Write the description as one short paragraph or sentence.
- Avoid adding extra fields such as owner, notes, tags, or links unless the user explicitly asks for them.
- Append the new feature to the end of the file unless the user asks to insert it elsewhere.

## Example

If the user asks to add a feature named `New CLI installer` with no explicit status, append an entry like:

```md
---

**3. New CLI installer**

**Description:** Adds a command-line installer flow for setting up the toolkit in a target workspace.

**Date:** 2026-04-25

**Status:** IN PROGRESS
```

## Final Check

- Confirm the numbering is consecutive.
- Confirm the markdown spacing matches the surrounding entries.
- Confirm the status is `IN PROGRESS` when the user did not specify one.
- Confirm only `features-implemented.md` was changed unless the user asked for more.
