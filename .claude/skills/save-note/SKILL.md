---
name: save-note
description: Save a note to the local monthly notes file at ai-tools/local/notes/YYYY-MM.md. Use when the user explicitly invokes /save-note or says "save as note", "guarda como nota", "take a note", or similar. If the intent or note content is unclear, ask a clarifying question instead of assuming. Never run automatically.
---

# Save Note

Append the user's note to the monthly notes file at `ai-tools/local/notes/<YYYY-MM>.md`.
Run this skill **only** when the user explicitly invokes it. Never run automatically.
If it is not clear whether the user wants to save a note, or it is not clear what text
should be saved, ask a clarifying question before writing anything.

## Trigger Patterns

Run this skill when the user:
- Types `/save-note <text>`
- Writes natural-language equivalents such as:
  - "save as note that..."
  - "save a note saying..."
  - "guarda como nota que..."
  - "take a note: ..."
  - Any phrase where the clear intent is to record a note via this skill

Do NOT run this skill when the request is ambiguous. If there is any reasonable doubt
about whether the user wants to save a note, ask first.

## Step 1 — Get Current Timestamps via PowerShell

Run this exact PowerShell command:

```powershell
$d = Get-Date; $u = $d.ToUniversalTime(); Write-Output "LOCAL:$($d.ToString('yyyy-MM-ddTHH:mm:sszzz'))"; Write-Output "UTC:$($u.ToString('yyyy-MM-ddTHH:mm:ss'))Z"
```

Parse the output as follows:
- The line starting with `LOCAL:` contains the full local ISO 8601 timestamp with UTC offset.
  Example: `LOCAL:2026-04-25T21:35:45+02:00`
- The line starting with `UTC:` contains the UTC ISO 8601 timestamp ending in `Z`.
  Example: `UTC:2026-04-25T19:35:45Z`
- From the LOCAL value, extract the **time-only portion**: the part between `T` and the
  offset sign (`+` or `-`). Example: `21:35:45`
- From the LOCAL value, extract the **year-month** for the filename: the first 7 characters.
  Example: `2026-04`

If the command fails entirely, fall back to any date/time information available in the
conversation context as the local timestamp, and skip UTC.

## Step 2 — Determine Target File

The target path (relative to project root) is:

```
ai-tools/local/notes/<YYYY-MM>.md
```

Where `<YYYY-MM>` is the year-month extracted in Step 1.
Example: `ai-tools/local/notes/2026-04.md`

## Step 3 — Ensure the Directory Exists

Run:

```powershell
New-Item -ItemType Directory -Force -Path "ai-tools/local/notes" | Out-Null
```

`-Force` is safe: it creates the directory if missing and does nothing if it already exists.

## Step 4 — Extract the Note Content

Identify the note text from the user's input:

- If invoked as `/save-note <text>`, the note content is `<text>` (everything after the
  command prefix).
- If invoked via natural language (e.g. "Guarda como nota que tengo que modificar el
  CLAUDE.md para que no añada comentarios"), strip only the invocation framing and keep
  the rest (e.g. `tengo que modificar el CLAUDE.md para que no añada comentarios`).
- Preserve all original wording, line breaks, and paragraphs.
- Make only the minimum corrections needed for readability (e.g. an obvious typo that
  causes confusion). Do NOT summarize, rewrite, reorganize, or embellish.
- Multi-line content must be preserved as-is.
- If the note content is missing, partial, or ambiguous after removing the invocation
  framing, ask the user a short clarifying question instead of guessing.
- If the user says something like `/save-note` with no text, or uses a vague request such
  as "save this as a note" without clear note content, do not write anything yet.
  Ask for the exact note text first.

## Step 5 — Build the Note Entry

Using the timestamps from Step 1 and the content from Step 4, construct the note entry.
Use a bold `Date` section heading, then place the timestamps as normal text lines under
it, followed by a `Note` section heading and a fenced `text` block containing the note.

**When both LOCAL and UTC are available:**

````
### **Date**

<local-iso> | <local-time> [local]

<utc-iso> [utc]

### **Note**

```text
<note content>
```
````

**When only LOCAL is available (UTC could not be obtained):**

````
### **Date**

<local-iso> | <local-time> [local]

### **Note**

```text
<note content>
```
````

Substitution reference:
- `<local-iso>` → full local timestamp with offset. Example: `2026-04-25T21:35:45+02:00`
- `<local-time>` → time only (no date, no offset). Example: `21:35:45`
- `<utc-iso>` → UTC timestamp ending in Z. Example: `2026-04-25T19:35:45Z`
- `<note content>` → extracted note text, preserving all original line breaks inside the
  fenced `text` block

## Step 6 — Write the Note to the File

**If the target file does NOT exist:**

Create the file. Its entire content is the note entry from Step 5. No trailing separator.

Example of a new file with one note (local + UTC available):

````markdown
### **Date**

2026-04-25T21:35:45+02:00 | 21:35:45 [local]

2026-04-25T19:35:45Z [utc]

### **Note**

```text
tengo que modificar el CLAUDE.md para que no añada comentarios
```
````

**If the target file already EXISTS:**

Read the existing content, then append the following block at the very end of the file:

```
<blank line>
--------------------------
<blank line>
<note entry from Step 5>
```

That is: a blank line, then `--------------------------` alone on its own line, then
another blank line, then the full note entry. Do not rewrite or reformat any of the
existing content.

Use the Edit tool to append, or read the full file and rewrite it with the new content
added at the end. Either approach is acceptable as long as the existing content is not
altered.

## Step 7 — Confirm to the User

After writing the file, report back to the user:
- The exact file path where the note was saved
- The timestamp used
- A brief one-line confirmation

Keep the confirmation short. Do not repeat the full note back unless the user asks.

Example:
> Note saved to `ai-tools/local/notes/2026-04.md` (2026-04-25T21:35:45+02:00).

## Edge Cases

| Scenario | Behavior |
|---|---|
| First note of the month | Create new file; write only the note entry, no trailing separator |
| Appending to an existing file | Add blank line + `--------------------------` + blank line before the new entry |
| UTC unavailable | Save with local timestamp only; omit the UTC heading line |
| Multi-line note | Preserve all lines verbatim inside the fenced `text` block |
| Empty or near-empty note | Save as-is without comment |
| Note contains markdown, backticks, or special characters | Preserve verbatim; do not escape or alter |
| Note written in any language | Preserve verbatim |
| Two notes saved the same second | Both are appended; neither overwrites the other |
| Invocation via `/save-note` | Strip only `/save-note ` prefix; use the rest as note content |
| Invocation via natural language | Strip only the invocation framing; preserve the actual note |
| Unclear whether a note should be saved | Ask the user instead of assuming |
| Unclear note content | Ask the user for the exact text before writing |
