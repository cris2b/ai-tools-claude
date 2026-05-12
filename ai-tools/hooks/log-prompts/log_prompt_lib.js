"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const CONFIG_PATH = path.resolve(__dirname, "log_prompt.config.json");

const PENDING_MARKER = "[#pending]";
const ERROR_MARKER = "[#error]";
const SENSITIVE_MARKER = "[#sensitive_information]";
const UNAVAILABLE_MARKER = "[#unavailable_content]";
const FILE_MARKER = "[#file]";
const FILE_TRUNCATED_MARKER = "[#file_truncated]";
const IMAGE_MARKER = "[#image]";
const AUDIO_MARKER = "[#audio]";
const TEXT_CONTAINER_LANGUAGE = "text";

const IMAGE_EXTENSIONS = new Set([
  ".bmp", ".gif", ".heic", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".tif", ".tiff", ".webp"
]);

const AUDIO_EXTENSIONS = new Set([
  ".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav", ".wma"
]);

const ENTRY_RE = /^(?<header>(?:(?:##|\*\*#) (?:\*\*)?.*? \[local\](?:\*\*)?|<div><strong># .*? \[local\]<\/strong><\/div>)\n(?:(?:##|\*\*#) (?:\*\*)?.*? \[utc\](?:\*\*)?|<div><strong># .*? \[utc\]<\/strong><\/div>)(?:\n{2,})(?:(?:###|\*\*#) (?:\*\*)?Prompt(?:\*\*)?|<div><strong># Prompt<\/strong><\/div>)\n\n)(?<prompt>.*?)(?<middle>\n\n(?:(?:###|\*\*#) (?:\*\*)?Response Summary(?:\*\*)?|<div><strong># Response Summary<\/strong><\/div>)\n\n)(?<summary>.*?)(?<tail>\n\n(?:(?:###|\*\*#) (?:\*\*)?Tags(?:\*\*)?|<div><strong># Tags<\/strong><\/div>)\n\n)(?<tags>.*)$/s;
const PROMPTLOG_RE = /<!--prompt-log\s+(.*?)\s*-->/gs;
const ENTRY_SEPARATOR = "--------------------------";

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function findProjectRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (
      fs.existsSync(path.join(current, ".git")) ||
      fs.existsSync(path.join(current, ".claude")) ||
      fs.existsSync(path.join(current, ".codex")) ||
      fs.existsSync(path.join(current, "AGENTS.md"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }
}

function expandHome(value) {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function expandEnvironment(value) {
  return value
    .replace(/%([^%]+)%/g, (_, key) => process.env[key] ?? "")
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => process.env[key] ?? "");
}

function resolvePath(root, value) {
  const expanded = expandEnvironment(expandHome(value));
  if (path.isAbsolute(expanded)) {
    return path.resolve(expanded);
  }
  return path.resolve(root, expanded);
}

function computePaths(utcDate, root, config) {
  const logRoot = resolvePath(root, String(config.log_root));
  const year = utcDate.getUTCFullYear();
  const month = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utcDate.getUTCDate()).padStart(2, "0");
  const monthDir = path.join(logRoot, `${year}-${month}`);
  return {
    monthDir,
    dailyFile: path.join(monthDir, `${year}-${month}-${day}.md`)
  };
}

function formatTimestamps(now) {
  const utc = new Date(now.getTime());
  utc.setMilliseconds(0);
  const utcLine = `## ${utc.toISOString().replace(".000Z", "Z")} [utc]`;

  try {
    const local = new Date(now.getTime());
    local.setMilliseconds(0);
    const offsetMinutes = -local.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absolute = Math.abs(offsetMinutes);
    const offsetHours = String(Math.floor(absolute / 60)).padStart(2, "0");
    const offsetRemainder = String(absolute % 60).padStart(2, "0");
    const yyyy = local.getFullYear();
    const mm = String(local.getMonth() + 1).padStart(2, "0");
    const dd = String(local.getDate()).padStart(2, "0");
    const hh = String(local.getHours()).padStart(2, "0");
    const mi = String(local.getMinutes()).padStart(2, "0");
    const ss = String(local.getSeconds()).padStart(2, "0");
    const localIso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${offsetHours}:${offsetRemainder}`;
    return {
      local: `## ${localIso} | ${hh}:${mi}:${ss} [local]`,
      utc: utcLine
    };
  } catch {
    return {
      local: "## Local timezone not available [local]",
      utc: utcLine
    };
  }
}

function normalizeForMatching(value) {
  return value.toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "");
}

function detectNoLog(prompt, config) {
  const normalized = normalizeForMatching(prompt);
  const keywords = readStringArray(config.no_log_keywords).map(normalizeForMatching);
  if (!hasExplicitNoLogRequest(normalized, keywords)) {
    return "none";
  }

  const ambiguousMarkers = readStringArray(config.nolog_ambiguous_markers).map(normalizeForMatching);
  if (ambiguousMarkers.some((marker) => keywordMatches(normalized, marker))) {
    return "ambiguous";
  }

  const sessionMarkers = readStringArray(config.nolog_scope_session).map(normalizeForMatching);
  if (sessionMarkers.some((marker) => keywordMatches(normalized, marker))) {
    return "session";
  }

  const todayMarkers = readStringArray(config.nolog_scope_today).map(normalizeForMatching);
  if (todayMarkers.some((marker) => keywordMatches(normalized, marker))) {
    return "today";
  }

  for (const pattern of readStringArray(config.nolog_scope_count_regex)) {
    const match = new RegExp(pattern, "i").exec(normalized);
    if (!match) {
      continue;
    }
    const count = Number.parseInt(match[1] ?? "", 10);
    if (count > 0) {
      return `count:${count}`;
    }
  }

  return "current";
}

function keywordMatches(text, keyword) {
  const words = keyword.split(/\s+/).map((part) => part.trim()).filter(Boolean).map(escapeRegex);
  if (words.length === 0) {
    return false;
  }
  return new RegExp(`(?<!\\w)${words.join("\\s+")}(?!\\w)`, "i").test(text);
}

function hasExplicitNoLogRequest(text, keywords) {
  for (const keyword of keywords) {
    for (const match of iterKeywordMatches(text, keyword)) {
      if (isExplicitDirectivePrefix(text, match.index)) {
        return true;
      }
    }
  }
  return false;
}

function iterKeywordMatches(text, keyword) {
  const words = keyword.split(/\s+/).map((part) => part.trim()).filter(Boolean).map(escapeRegex);
  if (words.length === 0) {
    return [];
  }

  const regex = new RegExp(`(?<!\\w)${words.join("\\s+")}(?!\\w)`, "gi");
  const matches = [];
  while (true) {
    const match = regex.exec(text);
    if (!match) {
      return matches;
    }
    matches.push(match);
  }
}

function isExplicitDirectivePrefix(text, matchStart) {
  const lastBoundary = Math.max(
    text.lastIndexOf(".", matchStart - 1),
    text.lastIndexOf("!", matchStart - 1),
    text.lastIndexOf("?", matchStart - 1),
    text.lastIndexOf("\n", matchStart - 1)
  );
  const prefix = text.slice(lastBoundary + 1, matchStart).trim();
  if (!prefix) {
    return true;
  }

  const allowedPrefixes = new Set([
    "por favor", "please", "puedes", "podrias", "quiero que", "haz que", "te pido que",
    "necesito que", "prefiero que", "solo", "solamente", "just", "simplemente"
  ]);

  if (/[,:()\-\[]$/.test(prefix)) {
    return true;
  }
  return allowedPrefixes.has(prefix);
}

function resolveReferences(prompt, cwd, _maxBytes) {
  const pattern = /(?<![\w/])@([^\s`"'<>()[\]{}]+)/g;
  return prompt.replace(pattern, (full, original) => {
    let reference = original;
    let trailing = "";
    while (reference && ".,;:!?)]}".includes(reference[reference.length - 1] ?? "")) {
      trailing = reference[reference.length - 1] + trailing;
      reference = reference.slice(0, -1);
    }
    if (!reference) {
      return full;
    }
    return `${resolveReference(reference, cwd)}${trailing}`;
  });
}

function resolveReference(reference, cwd) {
  const candidate = path.isAbsolute(reference)
    ? reference
    : path.resolve(cwd, expandEnvironment(expandHome(reference)));
  const resolved = path.resolve(candidate);
  const extension = path.extname(resolved).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) {
    return IMAGE_MARKER;
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return AUDIO_MARKER;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return UNAVAILABLE_MARKER;
  }
  return `[#file:${resolved}]`;
}

function renderEntry(localTimestamp, utcTimestamp, promptBody) {
  return `## **${stripHeadingMarker(localTimestamp)}**\n## **${stripHeadingMarker(utcTimestamp)}**\n\n### **Prompt**\n\n${renderTextContainer(promptBody)}\n\n### **Response Summary**\n\n${renderTextContainer(PENDING_MARKER)}\n\n### **Tags**\n\n${PENDING_MARKER}`;
}

function appendEntryLocked(dailyFile, entry) {
  const existing = fs.existsSync(dailyFile) ? fs.readFileSync(dailyFile, "utf8") : "";
  const prefix = existing ? `\n\n${ENTRY_SEPARATOR}\n\n` : "";
  const start = existing.length + prefix.length;
  const end = start + entry.length;
  writeTextSynced(dailyFile, `${existing}${prefix}${entry}`);
  return { start, end };
}

function extractPromptlogBlock(assistantText) {
  const candidates = [assistantText, ...extractTextCandidates(assistantText)];
  const payloads = [];
  for (const candidate of candidates) {
    payloads.push(...extractPromptlogBlocksFromText(candidate));
  }
  for (let index = payloads.length - 1; index >= 0; index -= 1) {
    if (!isPromptlogTemplatePayload(payloads[index])) {
      return payloads[index];
    }
  }
  return null;
}

function finalizeEntryLocked(dailyFile, start, end, summary, tags, sensitive) {
  const content = fs.readFileSync(dailyFile, "utf8");
  const entry = content.slice(start, end);
  const updated = updateEntry(entry, summary, tags, sensitive);
  writeTextSynced(dailyFile, `${content.slice(0, start)}${updated}${content.slice(end)}`);
}

function errorEntryLocked(dailyFile, start, end) {
  const content = fs.readFileSync(dailyFile, "utf8");
  const entry = content.slice(start, end);
  const updated = updateEntry(entry, ERROR_MARKER, [ERROR_MARKER], []);
  writeTextSynced(dailyFile, `${content.slice(0, start)}${updated}${content.slice(end)}`);
}

function updateEntry(entry, summary, tags, sensitive) {
  const match = ENTRY_RE.exec(entry);
  if (!match?.groups) {
    throw new Error("Entry does not match expected prompt log format.");
  }

  let promptBody = unwrapTextContainer(match.groups.prompt ?? "");
  for (const item of sensitive) {
    if (item.find) {
      promptBody = promptBody.split(item.find).join(item.replace || SENSITIVE_MARKER);
    }
  }

  return `${match.groups.header}${renderTextContainer(promptBody)}${match.groups.middle}${renderTextContainer(normalizeSummary(summary))}${match.groups.tail}${normalizeTags(tags)}`;
}

function normalizeSummary(summary) {
  let cleaned = repairMojibake(summary).trim().split(/\s+/).join(" ");
  if (cleaned === ERROR_MARKER) {
    return ERROR_MARKER;
  }
  if (!cleaned) {
    throw new Error("Response summary cannot be empty.");
  }

  const sentences = cleaned.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  if (sentences.length > 3) {
    cleaned = sentences.slice(0, 3).join(" ");
  }
  return cleaned;
}

function normalizeTags(tags) {
  if (tags.length === 1 && tags[0] === ERROR_MARKER) {
    return ERROR_MARKER;
  }

  const normalized = [];
  const seen = new Set();
  for (const tag of tags) {
    let compact = repairMojibake(String(tag)).trim().toLowerCase().split(/\s+/).join("-");
    compact = compact.replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
    if (!compact || seen.has(compact)) {
      continue;
    }
    seen.add(compact);
    normalized.push(compact);
  }

  if (normalized.length === 0) {
    throw new Error("At least one tag is required.");
  }

  return normalized.slice(0, 5).join(",");
}

function renderTextContainer(value) {
  const content = value.replace(/\s+$/u, "");
  const fence = selectCodeFence(content);
  return `${fence}${TEXT_CONTAINER_LANGUAGE}\n${content}\n${fence}`;
}

function selectCodeFence(value) {
  const matches = value.match(/`+/g) ?? [];
  const longest = matches.reduce((length, current) => Math.max(length, current.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}

function unwrapTextContainer(value) {
  const stripped = value.trim();
  const match = /^(`{3,})([^\n`]*)\n([\s\S]*)\n\1$/.exec(stripped);
  return match ? match[3] : value;
}

function writeTextSynced(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const handle = fs.openSync(filePath, "w");
  try {
    fs.writeFileSync(handle, content, { encoding: "utf8" });
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

function stripHeadingMarker(value) {
  return value.startsWith("## ") ? value.slice(3) : value;
}

function extractPromptlogBlockFromText(value) {
  const payloads = extractPromptlogBlocksFromText(value);
  return payloads.at(-1) ?? null;
}

function extractPromptlogBlocksFromText(value) {
  const payloads = [];
  for (const match of value.matchAll(PROMPTLOG_RE)) {
    try {
      const payload = JSON.parse(match[1]);
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        payloads.push(payload);
      }
    } catch {
      // Ignore malformed payloads.
    }
  }
  return payloads;
}

function isPromptlogTemplatePayload(payload) {
  const tagsValue = payload.tags;
  const tags = typeof tagsValue === "string"
    ? tagsValue.split(",").filter(Boolean)
    : Array.isArray(tagsValue)
      ? tagsValue.map(String)
      : [];
  const normalizedTags = tags.map((tag) => tag.trim().toLowerCase());
  return payload.summary === "<1-3 sentences in English>" && normalizedTags.length === 2 && normalizedTags[0] === "tag1" && normalizedTags[1] === "tag2";
}

function repairMojibake(value) {
  if (![0xc2, 0xc3, 0xe2].some((code) => value.includes(String.fromCharCode(code)))) {
    return value;
  }

  const latin1 = Buffer.from(value, "latin1").toString("utf8");
  if (latin1) {
    return latin1;
  }

  const cp1252 = Buffer.from(value, "binary").toString("utf8");
  return cp1252 || value;
}

function extractTextCandidates(rawText) {
  const values = [];
  try {
    collectTextValues(JSON.parse(rawText), values);
    return values;
  } catch {
    // Ignore full JSON parse failure and try JSONL.
  }

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    try {
      collectTextValues(JSON.parse(line), values);
    } catch {
      // Ignore invalid JSONL entries.
    }
  }

  return values;
}

function collectTextValues(value, output) {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTextValues(item, output));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectTextValues(item, output));
  }
}

function readStringArray(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  AUDIO_MARKER,
  appendEntryLocked,
  collectTextValues,
  computePaths,
  detectNoLog,
  ENTRY_SEPARATOR,
  ERROR_MARKER,
  errorEntryLocked,
  extractPromptlogBlock,
  extractPromptlogBlockFromText,
  extractPromptlogBlocksFromText,
  extractTextCandidates,
  FILE_MARKER,
  FILE_TRUNCATED_MARKER,
  finalizeEntryLocked,
  findProjectRoot,
  formatTimestamps,
  hasExplicitNoLogRequest,
  IMAGE_MARKER,
  isExplicitDirectivePrefix,
  isPromptlogTemplatePayload,
  keywordMatches,
  loadConfig,
  normalizeForMatching,
  normalizeSummary,
  normalizeTags,
  PENDING_MARKER,
  renderEntry,
  renderTextContainer,
  repairMojibake,
  resolvePath,
  resolveReference,
  resolveReferences,
  selectCodeFence,
  SENSITIVE_MARKER,
  stripHeadingMarker,
  TEXT_CONTAINER_LANGUAGE,
  UNAVAILABLE_MARKER,
  unwrapTextContainer,
  updateEntry,
  writeTextSynced
};
