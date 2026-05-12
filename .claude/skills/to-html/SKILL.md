---
name: to-html
description: Convert a markdown file or inline markdown text into a self-contained, interactive HTML file for human reading.
---

Convert a markdown document into a self-contained, interactive HTML file for human reading.

Core principle: optimize for human comprehension, not markdown fidelity. Markdown is the source structure, not the final layout. The output must feel like a designed reading experience, not like a `.md` file with buttons added.

## When This Skill Runs

User invokes `/to-html` or references `to-html` by name (e.g., "use to-html to convert this document").

---

## Step 1: Read the Embedded Library Assets

Before doing anything else, read these two files from the skill folder:

1. `.claude/skills/to-html/assets/mermaid.min.js` — store content as `MERMAID_JS`
2. `.claude/skills/to-html/assets/highlight.min.js` — store content as `HIGHLIGHT_JS`

If either file is unreadable, note which one failed. You will skip embedding that library if it cannot be read.

**Important:** Do NOT embed any JavaScript markdown parser library (e.g., marked.js, showdown, remark, commonmark) in the HTML output. The only JavaScript libraries embedded are Mermaid.js and Highlight.js — both read from the assets folder above. You (the AI agent) parse the markdown; no parser runs in the browser.

All hard-coded UI strings in the HTML output (button labels, section headings, placeholder text) must remain in English and must not be translated or localized.

---

## Step 2: Determine Input Mode and Theme

**Input mode:**
- If the user's prompt contains a token ending in `.md`:
  - Attempt to read the file at that path.
  - If readable → **file mode** (inputPath = that path).
  - If NOT readable → report "Could not read {path}. Stopping." and halt.
- If no `.md` token found → **inline mode** (use the markdown text in the prompt).

**Theme default:**
- If the user's prompt contains "light mode", "light theme", "in light mode", or "bright mode" (case-insensitive) → defaultTheme = `light`.
- Otherwise → defaultTheme = `dark`.

**Layout mode** (controls the visual style of the generated page):
- If the user's prompt contains "storytelling", "story mode", "story layout", or "narrative mode" (case-insensitive) → layoutMode = `storytelling`.
- If the user's prompt contains "dashboard", "dashboard mode", or "dashboard layout" (case-insensitive) → layoutMode = `dashboard`.
- Otherwise → layoutMode = `dashboard` (default).

> **layoutMode quick reference:**
> - `dashboard` — stats row, grid cards, colorful section types, data-dense. Good for specs, criteria, risk lists.
> - `storytelling` — flowing prose sections, top-border accents, comfortable reading width. Good for narratives, reports, long-form docs.

---

## Step 3: Read and Parse the Markdown

**File mode:** read the file at inputPath.
**Inline mode:** use the prompt text as the markdown source.

Parse the document into these components:

### 3a. Strip YAML Front Matter
If the document begins with `---` on its own line, find the closing `---` line. Extract the content between. Parse `title: value` if present — use as the HTML `<title>`. Strip the entire front matter block from the body. All other front matter fields are silently ignored.

### 3b. Detect Content Flags

After stripping front matter, scan the body and record:
- `hasMermaid` — any fenced code block with language tag `mermaid`
- `hasCodeBlocks` — any fenced code block at all (includes mermaid)
- `hasFootnotes` — any `[^identifier]` reference in text
- `hasAdmonitions` — any `> [!TYPE]` block or `:::type ... :::` block
- `headerCount` — total count of lines starting with `#` through `######`
- `h2h3Count` — total count of lines starting with `##` or `###`

### 3c. Collect Footnote Definitions
Scan for lines matching `[^identifier]: content`. Collect all definitions. Remove definition lines from the body (they will appear in a footnotes section at the bottom instead).

### 3d. Process Images
For each `![alt](src)` in the body:
- External URLs (`http://`, `https://`) → keep as-is (rendered as `<img src="...">`, browser fetches at read time).
- Local paths:
  - Resolve relative to: directory of inputPath (file mode) or SDD output dir (inline mode).
  - If readable: read, base64-encode, replace with `data:{mimeType};base64,{data}`. Do not reject local images based on file size.
  - Otherwise: replace the entire image markdown with a placeholder div (see HTML Components below).

---

## Step 4: Determine Output Path

**File mode:**
```
outputPath = same directory as inputPath / same filename with .html extension
```

**Inline mode:**
```
1. Read ai-tools/local/sdd/sdd.config.json from workspace root.
   Use its outputPath field as the output directory.
   If the file is absent or unreadable, use: ai-tools/local/sdd/
2. Find the first H1 heading in the body. Slugify its text:
   lowercase → replace spaces and non-alphanumeric chars with hyphens → collapse consecutive hyphens.
3. If no H1: use slug = "document-{YYYY-MM-DD}" (today's date).
   The <title> element also uses this slug value when no H1 and no YAML title exist.
4. Candidate: {outputDir}/{slug}.html
5. If that file exists: try {slug}-2.html, {slug}-3.html, ... up to {slug}-100.html.
   If all 100 are taken: report "Could not find a free filename for {slug}.html after 100 attempts." and stop.
```

---

## Step 5: Calculate Reading Time

Strip all markdown syntax from the body (remove `#`, `*`, `_`, backticks, `[`, `]`, etc.). Count whitespace-separated words. Divide by 200 (words per minute). Round up.

- Result < 1 → show "< 1 min read"
- Otherwise → show "{N} min read"

---

## Step 6: Generate the HTML

Build a complete HTML string using the structure and rules below. Write it to outputPath.

**Title fallback priority:** YAML `title` → first H1 text (stripped of markdown) → date slug (inline mode, e.g., "document-2026-05-10") → "Document".

### 6a. Reader-First Transformation Rules

Before rendering individual markdown elements, classify the document and apply layout-mode-specific visual design. The output must feel like a designed product — not a styled markdown file.

**Core design mandate:**
- The page must not look like a raw markdown preview or a GitHub wiki clone.
- Use vivid accent colors by content type, generous spacing, and cards with personality.
- Preserve all source content accurately but restructure the visual presentation for easy scanning.
- The reader must immediately understand what kind of document this is and where to look.

---

#### Layout mode: `dashboard` (default)

The dashboard mode is data-forward and visually rich. Think Linear, Notion, or a modern product spec tool.

- Open with a **full-width hero section** (`<section class="doc-hero">`) with a deep gradient background. Inside: large bold title, subtitle, hero chips (reading time, section count, criteria count, risk count, open items).
- Below the hero, render a **sticky quick-nav bar** (`<nav class="quick-nav">`) if the document has 4+ meaningful sections. Each link must have a color class matching its section type (`nav-objective`, `nav-criteria`, `nav-risk`, `nav-openitem`, `nav-state`, `nav-technical`) plus an emoji icon.
- After the quick-nav, render a **stats row** (`<div class="stats-row">`) with large-number stat cards for each countable item: criteria count, risk count, open items, reading time. Only include stat cards for counts > 0.
- Each recognized section becomes a **section card** (`<div class="section-card section-{type}">`) with a colored left border, colored header label, and content rendered inside. Unrecognized sections also get a generic card.
- State items → `state-grid` with individual `state-card` tiles (icon + name + trigger).
- Criteria bullets → `criteria-list` with styled `criteria-item` rows.
- Risk bullets → `risk-grid` with `risk-card` tiles.
- Open items/TBD bullets → `openitem-grid` with `openitem-card` tiles.

#### Layout mode: `storytelling`

The storytelling mode is prose-forward and comfortable. Think a well-designed blog or report.

- Open with the same **full-width hero section** but with a slightly lighter gradient feel.
- Add the **sticky quick-nav bar** (same rule: 4+ sections).
- Do NOT render a stats row.
- Each recognized section becomes a section card with a **top border** accent (not left border), centered feel, and max content width of 720px.
- Bullets and lists render as clean readable prose, not card grids.
- States → still use state-grid cards (visual interest is good here too).
- Risks → risk-cards.
- Open items → openitem-cards.
- Text-heavy sections render as flowing paragraphs with generous line height.

---

**Section type classification** (applies to both modes):

| Section heading pattern | Type | CSS class suffix | Quick-nav class | Emoji |
|---|---|---|---|---|
| Objective, Summary, Overview, Goal | objective | `section-objective` | `nav-objective` | 🎯 |
| Acceptance Criteria, Criteria, Requirements | criteria | `section-criteria` | `nav-criteria` | ✅ |
| States, Status, Workflow | state | `section-state` | `nav-state` | 🔄 |
| Risks, Blockers, Risks and Blockers | risk | `section-risk` | `nav-risk` | ⚠️ |
| TBD, Open Items, Questions, Unknowns | openitem | `section-openitem` | `nav-openitem` | ❓ |
| Technical Guidelines, Implementation, Platform, Context | technical | `section-technical` | `nav-technical` | ⚙️ |
| Current Problem, Problem, Background | problem | `section-problem` | — | 🔍 |
| Any unrecognized h2/h3 | — | `section-card` (no type) | — | — |

**Progressive disclosure:**
- Wrap dense technical sections in styled `<details>` (see collapsible section rules in 6b).
- Do not collapse hero, objective, core states, or acceptance criteria by default.

**Fallback:**
- Unrecognized sections → polished generic section card.
- Long bullet lists (> 5 items) → card grid or compact checklist rows when content type is known; otherwise a clean `<ul>` with good spacing.
- Use plain `<table>` only for genuinely tabular data with many columns where cards would reduce clarity.

### 6b. Element Rendering Rules

Use these rules inside semantic components and fallback sections:

- **Headings** — `# text` → `<h1 id="{slug}">text</h1>`. Slug: lowercase, non-alphanumeric to hyphens, collapse consecutive hyphens. Same for H2–H6.
- **Admonitions (GitHub-style)** — block quote whose first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` (case-insensitive) → admonition block (see HTML Components).
- **Admonitions (directive-style)** — `:::type` on its own line + content lines + `:::` on its own line → admonition block. If closing `:::` absent → render as plain `<blockquote>`.
- **Fenced code (mermaid)** — language tag `mermaid` → `<div class="mermaid">{raw content}</div>` (Mermaid.js auto-renders on load).
- **Fenced code (other)** — `<pre><code class="language-{lang}">{escaped content}</code></pre>`.
- **Inline code** — `<code>{escaped}</code>`.
- **Bold** — `<strong>text</strong>`. **Italic** — `<em>text</em>`. **Strikethrough** — `<del>text</del>`.
- **Links** — `<a href="{url}" target="_blank" rel="noopener">{label}</a>`.
- **Autolinks** — bare URLs and `<url>` → `<a href="{url}" target="_blank" rel="noopener">{url}</a>`.
- **Images** — see Step 3d (base64 or placeholder).
- **Tables** — `<table class="md-table"><thead>...</thead><tbody>...</tbody></table>`.
- **Task lists** — `- [x] text` → `<input type="checkbox" disabled checked>` ; `- [ ] text` → `<input type="checkbox" disabled>` (no `checked`).
- **Unordered lists** — `<ul><li>...</li></ul>`. **Ordered lists** — `<ol><li>...</li></ol>`.
- **Blockquotes** (non-admonition) — `<blockquote>text</blockquote>`.
- **Horizontal rules** — `<hr>`.
- **Paragraphs** — `<p>text</p>`.
- **Footnote references** — `[^id]` → `<sup><a href="#fn-{id}" id="fnref-{id}">{n}</a></sup>`.
- **Footnote definitions** — collected in Step 3c; appended as `<section class="footnotes">` (see HTML Components).
- **Escape** `<`, `>`, `&` as `&lt;`, `&gt;`, `&amp;` inside code blocks and literal contexts.

**Adaptive activation (do NOT include a component when its condition is false):**

| Component | Condition |
|-----------|-----------|
| TOC sidebar | `headerCount >= 3` |
| Collapsible sections | `h2h3Count >= 5` |
| Highlight.js embedding | `hasCodeBlocks == true` |
| Copy buttons | `hasCodeBlocks == true` |
| Mermaid.js embedding | `hasMermaid == true` |
| Footnote section | `hasFootnotes == true` |
| Admonition CSS classes | `hasAdmonitions == true` |
| Progress bar element | Always included |
| Reading time | Always included |

**Collapsible sections:** When `h2h3Count >= 5`, wrap each h2/h3 group at HTML generation time:
- Open: `<details open><summary><h2 id="{slug}">{heading text}</h2></summary><div class="section-body">`
- Close: `</div></details>` before the next h2/h3 or end of main.
- The `<h2>`/`<h3>` element with its `id` attribute is placed **inside `<summary>`** so TOC anchor links function correctly.

**Task lists:** A `<ul class="task-list">` is applied when any item in the list uses `- [ ]` or `- [x]` syntax. `- [x]` → `<input type="checkbox" disabled checked>`. `- [ ]` → `<input type="checkbox" disabled>` (no `checked` attribute). Regular items in the same list render as `<li>` without a checkbox.

### HTML Shell

```html
<!DOCTYPE html>
<html lang="en" data-theme="{dark|light}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style>{CSS above}</style>
</head>
<body class="layout-{dashboard|storytelling}">
  <div id="progress-bar"></div>
  <header>
    <div class="header-inner">
      <span class="reading-time">{N min read}</span>
      <button id="theme-toggle" aria-label="Toggle theme" title="Toggle light/dark mode">☀️</button>
    </div>
  </header>
  {HERO SECTION — always}
  {QUICK-NAV — only if document has 4+ meaningful sections}
  <div class="layout">
    {TOC SIDEBAR — only if headerCount >= 3}
    <main id="content">
      {STATS ROW — only in dashboard mode and only if any count > 0}
      {RENDERED MARKDOWN BODY — first H1 is suppressed here since it's already in the hero}
      {FOOTNOTES SECTION — only if hasFootnotes}
    </main>
  </div>
  <script>
    {HIGHLIGHT_JS content — only if hasCodeBlocks}
    {MERMAID_JS content — only if hasMermaid}
    {INLINE JAVASCRIPT below}
  </script>
</body>
</html>
```

### CSS (inline verbatim in `<style>`)

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root[data-theme="dark"] {
  --bg: #0a0f1e; --bg-secondary: #0d1526; --surface: #111827; --surface-hover: #1a2535;
  --border: #1e2d40; --border-subtle: #162030;
  --text: #e2e8f0; --text-muted: #64748b; --text-accent: #94a3b8;
  --link: #60a5fa; --heading: #f1f5f9;
  --code-bg: #0d1526; --code-text: #e2e8f0; --code-border: #1e2d40;
  --toc-bg: #111827; --progress-color: #60a5fa;
  --blockquote-border: #1e2d40; --table-header-bg: #111827; --table-row-alt: #0d1526; --hr-color: #1e2d40;
  --hero-gradient: linear-gradient(135deg, #1e1b4b 0%, #0f172a 60%, #0a0f1e 100%);
  --accent-objective: #38bdf8; --accent-criteria: #34d399; --accent-risk: #fbbf24;
  --accent-openitem: #a78bfa; --accent-state: #22d3ee; --accent-technical: #818cf8; --accent-problem: #f87171;
  --glow-objective: rgba(56,189,248,0.08); --glow-criteria: rgba(52,211,153,0.08);
  --glow-risk: rgba(251,191,36,0.08); --glow-openitem: rgba(167,139,250,0.08);
  --glow-state: rgba(34,211,238,0.08); --glow-technical: rgba(129,140,248,0.08); --glow-problem: rgba(248,113,113,0.08);
}
:root[data-theme="light"] {
  --bg: #f8fafc; --bg-secondary: #f1f5f9; --surface: #ffffff; --surface-hover: #f8fafc;
  --border: #e2e8f0; --border-subtle: #f1f5f9;
  --text: #1e293b; --text-muted: #64748b; --text-accent: #475569;
  --link: #2563eb; --heading: #0f172a;
  --code-bg: #f8fafc; --code-text: #1e293b; --code-border: #e2e8f0;
  --toc-bg: #ffffff; --progress-color: #2563eb;
  --blockquote-border: #e2e8f0; --table-header-bg: #f8fafc; --table-row-alt: #ffffff; --hr-color: #e2e8f0;
  --hero-gradient: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%);
  --accent-objective: #0284c7; --accent-criteria: #059669; --accent-risk: #d97706;
  --accent-openitem: #7c3aed; --accent-state: #0891b2; --accent-technical: #4f46e5; --accent-problem: #dc2626;
  --glow-objective: rgba(2,132,199,0.07); --glow-criteria: rgba(5,150,105,0.07);
  --glow-risk: rgba(217,119,6,0.07); --glow-openitem: rgba(124,58,237,0.07);
  --glow-state: rgba(8,145,178,0.07); --glow-technical: rgba(79,70,229,0.07); --glow-problem: rgba(220,38,38,0.07);
}

body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.7; font-size: 16px; }
a { color: var(--link); text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.15s, opacity 0.15s; }
a:hover { border-bottom-color: currentColor; opacity: 0.85; }

#progress-bar { position: fixed; top: 0; left: 0; height: 3px; width: 0%; background: linear-gradient(90deg, var(--accent-objective), var(--accent-openitem)); z-index: 1000; transition: width 0.1s; visibility: hidden; }

header { position: sticky; top: 0; z-index: 100; background: rgba(10,15,30,0.88); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid var(--border); padding: 0.5rem 1.5rem; }
[data-theme="light"] header { background: rgba(248,250,252,0.88); }
.header-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.reading-time { font-size: 0.78rem; color: var(--text-muted); letter-spacing: 0.04em; }
#theme-toggle { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.28rem 0.65rem; cursor: pointer; font-size: 0.95rem; color: var(--text); transition: border-color 0.2s; }
#theme-toggle:hover { border-color: var(--accent-objective); }

/* HERO */
.doc-hero { background: var(--hero-gradient); padding: 3.5rem 2rem 2.5rem; border-bottom: 1px solid rgba(255,255,255,0.07); }
.doc-hero-inner { max-width: 860px; margin: 0 auto; }
.doc-hero h1 { font-size: clamp(1.75rem, 4vw, 2.75rem); font-weight: 800; color: #fff; margin: 0 0 0.65rem; line-height: 1.2; letter-spacing: -0.025em; }
.doc-hero-subtitle { font-size: 1.05rem; color: rgba(255,255,255,0.6); margin-bottom: 1.5rem; max-width: 620px; line-height: 1.65; }
.hero-chips { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.hero-chip { display: inline-flex; align-items: center; gap: 0.35rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 0.22rem 0.7rem; font-size: 0.78rem; color: rgba(255,255,255,0.8); backdrop-filter: blur(8px); }

/* QUICK NAV */
.quick-nav { background: var(--surface); border-bottom: 1px solid var(--border); position: sticky; top: 49px; z-index: 90; overflow-x: auto; scrollbar-width: none; }
.quick-nav::-webkit-scrollbar { display: none; }
.quick-nav-inner { display: flex; max-width: 1200px; margin: 0 auto; padding: 0 1rem; min-width: max-content; }
.quick-nav a { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.65rem 0.9rem; font-size: 0.8rem; font-weight: 500; color: var(--text-muted); text-decoration: none; border: none; border-bottom: 2px solid transparent; white-space: nowrap; transition: color 0.15s, border-color 0.15s; }
.quick-nav a:hover { color: var(--text); border-bottom-color: var(--border); }
.quick-nav a.nav-objective:hover, .quick-nav a.nav-objective.active { color: var(--accent-objective); border-bottom-color: var(--accent-objective); }
.quick-nav a.nav-criteria:hover,  .quick-nav a.nav-criteria.active  { color: var(--accent-criteria);  border-bottom-color: var(--accent-criteria);  }
.quick-nav a.nav-risk:hover,      .quick-nav a.nav-risk.active      { color: var(--accent-risk);      border-bottom-color: var(--accent-risk);      }
.quick-nav a.nav-openitem:hover,  .quick-nav a.nav-openitem.active  { color: var(--accent-openitem);  border-bottom-color: var(--accent-openitem);  }
.quick-nav a.nav-state:hover,     .quick-nav a.nav-state.active     { color: var(--accent-state);     border-bottom-color: var(--accent-state);     }
.quick-nav a.nav-technical:hover, .quick-nav a.nav-technical.active { color: var(--accent-technical); border-bottom-color: var(--accent-technical); }

/* STATS ROW (dashboard mode) */
.stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.75rem; margin: 1.75rem 0; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1rem 0.75rem; text-align: center; transition: border-color 0.2s; }
.stat-card:hover { border-color: var(--accent-objective); }
.stat-number { font-size: 1.65rem; font-weight: 800; color: var(--heading); line-height: 1; margin-bottom: 0.25rem; }
.stat-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); }

/* LAYOUT */
.layout { display: flex; gap: 2rem; max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; align-items: flex-start; }
main#content { flex: 1; min-width: 0; }
body.layout-storytelling main#content { max-width: 740px; }

/* TOC SIDEBAR */
#toc-sidebar { width: 216px; flex-shrink: 0; position: sticky; top: 98px; max-height: calc(100vh - 120px); overflow-y: auto; background: var(--toc-bg); border: 1px solid var(--border); border-radius: 10px; padding: 1rem; font-size: 0.8rem; scrollbar-width: thin; }
#toc-sidebar h2 { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.09em; color: var(--text-muted); margin-bottom: 0.7rem; font-weight: 700; border: none; padding: 0; }
#toc-sidebar ul { list-style: none; padding: 0; }
#toc-sidebar li { margin: 0.18rem 0; }
#toc-sidebar a { color: var(--text-muted); text-decoration: none; border: none; display: block; padding: 0.18rem 0.55rem; border-radius: 5px; border-left: 2px solid transparent; transition: all 0.15s; font-size: 0.77rem; line-height: 1.4; }
#toc-sidebar a:hover, #toc-sidebar a.active { color: var(--link); border-left-color: var(--link); background: var(--surface-hover); }
#toc-sidebar li.toc-h3 a { padding-left: 1.2rem; }
#toc-sidebar li.toc-h4 a { padding-left: 1.9rem; }

/* HEADINGS (inside cards; hero h1 is separate) */
h1, h2, h3, h4, h5, h6 { color: var(--heading); line-height: 1.3; margin: 1.75rem 0 0.65rem; font-weight: 700; }
h1 { font-size: 1.75rem; } h2 { font-size: 1.3rem; } h3 { font-size: 1.1rem; }
h4 { font-size: 1rem; } h5, h6 { font-size: 0.9rem; }
p { margin: 0 0 1rem; }
hr { border: none; border-top: 1px solid var(--hr-color); margin: 2.5rem 0; }

/* CODE */
code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 0.84em; background: var(--code-bg); color: var(--accent-state); border: 1px solid var(--code-border); border-radius: 4px; padding: 0.15em 0.42em; }
pre { background: var(--code-bg); border: 1px solid var(--code-border); border-radius: 10px; padding: 1.25rem; overflow-x: auto; margin: 1.5rem 0; position: relative; }
pre code { background: none; border: none; padding: 0; font-size: 0.875rem; line-height: 1.6; color: var(--code-text); }
.copy-btn { position: absolute; top: 0.6rem; right: 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.22rem 0.6rem; font-size: 0.7rem; cursor: pointer; color: var(--text-muted); transition: all 0.2s; font-family: inherit; letter-spacing: 0.03em; }
.copy-btn:hover { color: var(--text); border-color: var(--accent-objective); }

/* TABLES */
.md-table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; overflow-x: auto; display: block; }
.md-table th, .md-table td { border: 1px solid var(--border); padding: 0.6rem 1rem; text-align: left; }
.md-table th { background: var(--surface); font-weight: 600; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.045em; color: var(--text-muted); }
.md-table tbody tr:hover { background: var(--surface-hover); }
.md-table tbody tr:nth-child(even) { background: var(--bg-secondary); }

/* BLOCKQUOTE */
blockquote { border-left: 4px solid var(--border); margin: 1.5rem 0; padding: 0.75rem 1.25rem; color: var(--text-muted); background: var(--surface); border-radius: 0 8px 8px 0; }
blockquote p { margin: 0; }

/* LISTS */
ul, ol { padding-left: 1.75rem; margin: 0 0 1rem; }
li { margin: 0.3rem 0; }
.task-list { list-style: none; padding-left: 0.25rem; }
.task-list li { display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.28rem 0; }
.task-list input[type="checkbox"] { margin-top: 0.25rem; accent-color: var(--accent-criteria); }

/* ADMONITIONS */
.admonition { border-left: 4px solid; border-radius: 0 10px 10px 0; padding: 1rem 1.25rem; margin: 1.5rem 0; }
.admonition-title { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; margin-bottom: 0.45rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; }
.admonition-body p:last-child { margin-bottom: 0; }
.admonition-note      { border-color: var(--accent-objective); background: var(--glow-objective); }
.admonition-note      .admonition-title { color: var(--accent-objective); }
.admonition-tip       { border-color: var(--accent-criteria);  background: var(--glow-criteria);  }
.admonition-tip       .admonition-title { color: var(--accent-criteria); }
.admonition-important { border-color: var(--accent-openitem);  background: var(--glow-openitem);  }
.admonition-important .admonition-title { color: var(--accent-openitem); }
.admonition-warning   { border-color: var(--accent-risk);      background: var(--glow-risk);      }
.admonition-warning   .admonition-title { color: var(--accent-risk); }
.admonition-caution   { border-color: var(--accent-problem);   background: var(--glow-problem);   }
.admonition-caution   .admonition-title { color: var(--accent-problem); }

/* SECTION CARDS — dashboard left border, storytelling top border */
.section-card { border-radius: 12px; border: 1px solid var(--border); background: var(--surface); padding: 1.5rem; margin: 1.5rem 0; }
.section-card-header { display: flex; align-items: center; gap: 0.55rem; margin-bottom: 1rem; padding-bottom: 0.65rem; border-bottom: 1px solid var(--border); }
.section-card-title { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; }

.section-objective  { border-left: 4px solid var(--accent-objective);  background: linear-gradient(135deg, var(--glow-objective),  var(--surface)); }
.section-objective  .section-card-title { color: var(--accent-objective); }
.section-criteria   { border-left: 4px solid var(--accent-criteria);   background: linear-gradient(135deg, var(--glow-criteria),   var(--surface)); }
.section-criteria   .section-card-title { color: var(--accent-criteria); }
.section-risk       { border-left: 4px solid var(--accent-risk);       background: linear-gradient(135deg, var(--glow-risk),       var(--surface)); }
.section-risk       .section-card-title { color: var(--accent-risk); }
.section-openitem   { border-left: 4px solid var(--accent-openitem);   background: linear-gradient(135deg, var(--glow-openitem),   var(--surface)); }
.section-openitem   .section-card-title { color: var(--accent-openitem); }
.section-state      { border-left: 4px solid var(--accent-state);      background: linear-gradient(135deg, var(--glow-state),      var(--surface)); }
.section-state      .section-card-title { color: var(--accent-state); }
.section-technical  { border-left: 4px solid var(--accent-technical);  background: linear-gradient(135deg, var(--glow-technical),  var(--surface)); }
.section-technical  .section-card-title { color: var(--accent-technical); }
.section-problem    { border-left: 4px solid var(--accent-problem);    background: linear-gradient(135deg, var(--glow-problem),    var(--surface)); }
.section-problem    .section-card-title { color: var(--accent-problem); }

/* Storytelling overrides: top border instead of left */
body.layout-storytelling .section-objective  { border-left: none; border-top: 4px solid var(--accent-objective); }
body.layout-storytelling .section-criteria   { border-left: none; border-top: 4px solid var(--accent-criteria); }
body.layout-storytelling .section-risk       { border-left: none; border-top: 4px solid var(--accent-risk); }
body.layout-storytelling .section-openitem   { border-left: none; border-top: 4px solid var(--accent-openitem); }
body.layout-storytelling .section-state      { border-left: none; border-top: 4px solid var(--accent-state); }
body.layout-storytelling .section-technical  { border-left: none; border-top: 4px solid var(--accent-technical); }
body.layout-storytelling .section-problem    { border-left: none; border-top: 4px solid var(--accent-problem); }

/* STATE GRID */
.state-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.7rem; margin-top: 0.75rem; }
.state-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 10px; padding: 1rem; text-align: center; transition: transform 0.18s, border-color 0.18s; cursor: default; }
.state-card:hover { transform: translateY(-2px); border-color: var(--accent-state); }
.state-icon { font-size: 1.75rem; margin-bottom: 0.35rem; }
.state-name { font-size: 0.82rem; font-weight: 600; color: var(--heading); margin-bottom: 0.2rem; }
.state-trigger { font-size: 0.73rem; color: var(--text-muted); line-height: 1.4; }

/* CRITERIA LIST */
.criteria-list { list-style: none; padding: 0; margin: 0; }
.criteria-item { display: flex; align-items: flex-start; gap: 0.7rem; padding: 0.55rem 0; border-bottom: 1px solid var(--border-subtle); }
.criteria-item:last-child { border-bottom: none; }
.criteria-check { width: 17px; height: 17px; border-radius: 4px; border: 1.5px solid var(--accent-criteria); flex-shrink: 0; margin-top: 0.18rem; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color: var(--accent-criteria); background: var(--glow-criteria); }

/* RISK CARDS */
.risk-grid { display: grid; gap: 0.65rem; margin-top: 0.75rem; }
.risk-card { background: var(--glow-risk); border: 1px solid rgba(251,191,36,0.18); border-radius: 10px; padding: 0.85rem 1rem; display: flex; gap: 0.7rem; align-items: flex-start; }
.risk-icon { font-size: 1rem; flex-shrink: 0; margin-top: 0.1rem; }
.risk-text { font-size: 0.9rem; color: var(--text); line-height: 1.55; }

/* OPEN ITEM CARDS */
.openitem-grid { display: grid; gap: 0.6rem; margin-top: 0.75rem; }
.openitem-card { background: var(--glow-openitem); border: 1px solid rgba(167,139,250,0.18); border-radius: 10px; padding: 0.8rem 1rem; display: flex; gap: 0.7rem; align-items: flex-start; }
.openitem-icon { font-size: 0.9rem; flex-shrink: 0; margin-top: 0.12rem; }
.openitem-text { font-size: 0.9rem; color: var(--text); line-height: 1.55; }

/* COLLAPSIBLE SECTIONS */
details { margin: 1.5rem 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
details summary { cursor: pointer; font-weight: 600; font-size: 0.98rem; color: var(--heading); padding: 0.9rem 1.25rem; list-style: none; display: flex; align-items: center; gap: 0.6rem; background: var(--surface); transition: background 0.15s; }
details summary:hover { background: var(--surface-hover); }
details summary::-webkit-details-marker { display: none; }
details summary::before { content: "▶"; font-size: 0.62em; transition: transform 0.2s; color: var(--text-muted); flex-shrink: 0; }
details[open] summary::before { transform: rotate(90deg); }
details .section-body { padding: 1.25rem; background: var(--bg); border-top: 1px solid var(--border); }

/* IMAGES */
.img-placeholder { border: 2px dashed var(--border); border-radius: 8px; padding: 2rem; text-align: center; color: var(--text-muted); font-style: italic; background: var(--surface); margin: 1rem 0; }
.md-img { max-width: 100%; height: auto; border-radius: 8px; margin: 0.75rem 0; box-shadow: 0 4px 20px rgba(0,0,0,0.22); }

/* FOOTNOTES */
.footnotes { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); font-size: 0.875rem; color: var(--text-muted); }
.footnotes h2 { font-size: 0.82rem; margin-bottom: 0.7rem; text-transform: uppercase; letter-spacing: 0.07em; }
.footnotes p { margin: 0.28rem 0; }
sup a { font-size: 0.72em; color: var(--accent-objective); text-decoration: none; }

/* MERMAID */
.mermaid { margin: 1.5rem 0; text-align: center; }

/* RESPONSIVE */
@media (max-width: 1100px) { #toc-sidebar { display: none; } .layout { padding: 1.5rem 1rem; } }
@media (max-width: 700px) {
  .doc-hero { padding: 2.25rem 1.25rem 1.75rem; }
  .quick-nav-inner { padding: 0 0.5rem; }
  h1 { font-size: 1.45rem; } h2 { font-size: 1.15rem; }
  .layout { padding: 1rem 0.75rem; }
  .stats-row { grid-template-columns: repeat(2, 1fr); }
  .state-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
}
```

### Inline JavaScript (place after Highlight.js and Mermaid.js content)

```javascript
(function() {
  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');
  var saved = localStorage.getItem('md-to-html-theme');
  if (saved) root.dataset.theme = saved;
  toggle.textContent = root.dataset.theme === 'dark' ? '☀️' : '🌙';
  toggle.addEventListener('click', function() {
    var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    toggle.textContent = next === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('md-to-html-theme', next);
  });

  var bar = document.getElementById('progress-bar');
  if (bar) {
    function updateBar() {
      var total = document.documentElement.scrollHeight - window.innerHeight;
      if (total > 0) {
        bar.style.visibility = 'visible';
        bar.style.width = (window.scrollY / total * 100) + '%';
      } else {
        bar.style.visibility = 'hidden';
        bar.style.width = '0%';
      }
    }
    window.addEventListener('scroll', updateBar, { passive: true });
    updateBar();
  }

  var tocLinks = document.querySelectorAll('#toc-sidebar a');
  if (tocLinks.length > 0) {
    var headings = Array.from(document.querySelectorAll('main h1,main h2,main h3,main h4,main h5,main h6'));
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          tocLinks.forEach(function(a) { a.classList.remove('active'); });
          var active = document.querySelector('#toc-sidebar a[href="#' + entry.target.id + '"]');
          if (active) active.classList.add('active');
        }
      });
    }, { rootMargin: '-10% 0px -80% 0px' });
    headings.forEach(function(h) { if (h.id) observer.observe(h); });
  }

  document.querySelectorAll('pre').forEach(function(pre) {
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', function() {
      var code = pre.querySelector('code');
      var text = code ? code.textContent : pre.textContent;
      navigator.clipboard.writeText(text).then(function() {
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
      });
    });
    pre.appendChild(btn);
  });

  if (typeof hljs !== 'undefined') {
    document.querySelectorAll('pre code').forEach(function(block) {
      hljs.highlightElement(block);
    });
  }

  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: true,
      theme: root.dataset.theme === 'dark' ? 'dark' : 'default',
      maxTextSize: Number.MAX_SAFE_INTEGER,
      flowchart: { maxEdges: Number.MAX_SAFE_INTEGER }
    });
  }
})();
```

### HTML Components Reference

**Hero section** (always; first H1 is rendered here and suppressed in `<main>`):
```html
<section class="doc-hero">
  <div class="doc-hero-inner">
    <h1>{title}</h1>
    <p class="doc-hero-subtitle">{first paragraph under Objective / first paragraph after H1 / one-sentence synthesis}</p>
    <div class="hero-chips">
      <span class="hero-chip">⏱ {N min read}</span>
      <!-- include only chips whose count > 0 -->
      <span class="hero-chip">📑 {N} sections</span>
      <span class="hero-chip">✅ {N} criteria</span>
      <span class="hero-chip">⚠️ {N} risks</span>
      <span class="hero-chip">❓ {N} open items</span>
    </div>
  </div>
</section>
```

**Quick-nav bar** (only when 4+ meaningful sections):
```html
<nav class="quick-nav" aria-label="Section navigation">
  <div class="quick-nav-inner">
    <!-- add only links to sections that exist; use matching nav-{type} class -->
    <a href="#{slug}" class="nav-objective">🎯 Overview</a>
    <a href="#{slug}" class="nav-criteria">✅ Criteria</a>
    <a href="#{slug}" class="nav-state">🔄 States</a>
    <a href="#{slug}" class="nav-risk">⚠️ Risks</a>
    <a href="#{slug}" class="nav-openitem">❓ Open Items</a>
    <a href="#{slug}" class="nav-technical">⚙️ Details</a>
  </div>
</nav>
```

**Stats row** (dashboard mode only, when any count > 0):
```html
<div class="stats-row">
  <!-- include only stat-cards for counts > 0 -->
  <div class="stat-card"><div class="stat-number">{N}</div><div class="stat-label">Criteria</div></div>
  <div class="stat-card"><div class="stat-number">{N}</div><div class="stat-label">Risks</div></div>
  <div class="stat-card"><div class="stat-number">{N}</div><div class="stat-label">Open Items</div></div>
  <div class="stat-card"><div class="stat-number">{N}</div><div class="stat-label">Min Read</div></div>
</div>
```

**Section card** (for each recognized or unrecognized h2/h3 section):
```html
<div class="section-card section-{type}" id="{slug}">
  <div class="section-card-header">
    <span class="section-card-icon">{emoji}</span>
    <span class="section-card-title">{Section Heading Text}</span>
  </div>
  {section content rendered here}
</div>
```

**State grid** (inside `section-state` card):
```html
<div class="state-grid">
  <div class="state-card">
    <div class="state-icon">{emoji}</div>
    <div class="state-name">{State Name}</div>
    <div class="state-trigger">{Trigger or description}</div>
  </div>
</div>
```

**Criteria list** (inside `section-criteria` card):
```html
<ul class="criteria-list">
  <li class="criteria-item">
    <span class="criteria-check">✓</span>
    <span>{criterion text}</span>
  </li>
</ul>
```

**Risk grid** (inside `section-risk` card):
```html
<div class="risk-grid">
  <div class="risk-card">
    <span class="risk-icon">⚠️</span>
    <span class="risk-text">{risk description}</span>
  </div>
</div>
```

**Open items grid** (inside `section-openitem` card):
```html
<div class="openitem-grid">
  <div class="openitem-card">
    <span class="openitem-icon">❓</span>
    <span class="openitem-text">{open item text}</span>
  </div>
</div>
```

**TOC Sidebar** (only when `headerCount >= 3`):
```html
<aside id="toc-sidebar">
  <h2>Contents</h2>
  <ul>
    <li class="toc-h2"><a href="#{slug}">Heading text</a></li>
    <li class="toc-h3"><a href="#{slug}">Heading text</a></li>
  </ul>
</aside>
```

**Admonition block** (types: note→ℹ️, tip→💡, important→‼️, warning→⚠️, caution→🔴):
```html
<div class="admonition admonition-{type}">
  <div class="admonition-title"><span>{emoji}</span><span>{TYPE LABEL}</span></div>
  <div class="admonition-body">{content}</div>
</div>
```

**Image placeholder:**
```html
<div class="img-placeholder"><span>Image not available: {original src}</span></div>
```

**Footnote reference** (inline): `<sup><a href="#fn-{id}" id="fnref-{id}">{n}</a></sup>`

**Footnotes section** (only when `hasFootnotes`):
```html
<section class="footnotes">
  <h2>Footnotes</h2>
  <p id="fn-{id}">{n}. {content} <a href="#fnref-{id}">↩</a></p>
</section>
```

---

## Step 7: Error Reporting

- Unreadable input file → report "Could not read {path}. Stopping." Do not generate HTML.
- Asset file unreadable → skip that library. If Mermaid.js missing, render mermaid blocks as plain code. If Highlight.js missing, code blocks remain unstyled.
- Malformed YAML front matter → skip front matter extraction; treat full document as body.
- Image unreadable → render placeholder; do not stop. Do not reject local images based on file size.
- Filename collision after 100 attempts → report error and stop.
- Output path unwritable → report "Could not write HTML to {path}: {reason}."
- SDD config unreadable → silently use `ai-tools/local/sdd/`.
