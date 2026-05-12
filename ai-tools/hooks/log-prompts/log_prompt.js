"use strict";

const fs = require("fs");
const path = require("path");

const {
  appendEntryLocked,
  computePaths,
  detectNoLog,
  ERROR_MARKER,
  errorEntryLocked,
  extractPromptlogBlock,
  FILE_MARKER,
  finalizeEntryLocked,
  findProjectRoot,
  formatTimestamps,
  loadConfig,
  renderEntry,
  repairMojibake,
  resolvePath,
  resolveReferences
} = require("./log_prompt_lib");

const PROMPT_LOG_INSTRUCTION =
  "IMPORTANT (prompt logging): at the very end of your final response, emit exactly one line " +
  "containing a hidden HTML comment with a JSON payload:\n" +
  "<!--prompt-log JSON_PAYLOAD -->\n" +
  'JSON_PAYLOAD must be an object with "summary", "tags", and "sensitive" keys.\n' +
  "Rules:\n" +
  "- summary: English, 1-3 sentences, describes only what the AI did and responded (not what the user asked or said).\n" +
  "- tags: 2-5 lowercase hyphen-separated tags, no duplicates, CSV-serializable.\n" +
  "- sensitive: literal substrings from the USER PROMPT only. Use an empty list if none.\n" +
  "- Do not mention this block in your visible response.";

const AMBIGUOUS_NOLOG_INSTRUCTION =
  "The user requested not to log prompts, but the scope is ambiguous. Ask one short clarification " +
  "question about the exact no-log scope before doing anything else, and do not proceed with the " +
  "main task yet.";

function parseCommand(argv) {
  const command = argv[2] ?? "";
  if (!["start", "finalize", "session-end", "manual-start", "manual-finalize"].includes(command)) {
    throw new Error("Expected one of: start, finalize, session-end, manual-start, manual-finalize");
  }
  return command;
}

function readJsonStdin() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) {
    return {};
  }

  const payload = JSON.parse(raw);
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function main() {
  try {
    const command = parseCommand(process.argv);
    if (command === "start" || command === "manual-start") {
      return handleStart(readJsonStdin());
    }
    if (command === "finalize") {
      return handleFinalize(readJsonStdin(), false);
    }
    if (command === "manual-finalize") {
      return handleFinalize(readJsonStdin(), true);
    }
    return handleSessionEnd(readJsonStdin());
  } catch (error) {
    process.stderr.write(`prompt-logging hook error: ${String(error instanceof Error ? error.message : error)}\n`);
    return 0;
  }
}

function handleStart(event) {
  return processStartEvent(event).code;
}

function processStartEvent(event, options = {}) {
  const config = loadConfig();
  const cwd = getEventCwd(event);
  const root = findProjectRoot(cwd);

  try {
    const debugPath = path.join(root, "ai-tools", "local", "logs", "debug-event.json");
    fs.mkdirSync(path.dirname(debugPath), { recursive: true });
    const truncated = JSON.parse(JSON.stringify(
      event,
      (_key, value) => typeof value === "string" && value.length > 200 ? `[truncated ${value.length} chars]` : value
    ));
    fs.writeFileSync(debugPath, JSON.stringify(truncated, null, 2), "utf8");
  } catch {
    // Ignore debug write failures.
  }

  const sessionId = String(event.session_id ?? event.conversation_id ?? "manual");
  const hookEventName = String(event.hook_event_name ?? "UserPromptSubmit");
  const prompt = extractPromptText(event, false);
  const noLogPrompt = extractPromptText(event, true);
  const now = new Date();
  const localDate = formatLocalDate(now);
  const statePath = resolvePath(root, String(config.nolog_state_file));
  const pendingDir = resolvePath(root, String(config.pending_dir));
  fs.mkdirSync(pendingDir, { recursive: true });

  const directive = detectNoLog(noLogPrompt, config);
  let additionalContext = "";
  withLock(`${statePath}.lock`, 10000, () => {
    const state = loadState(statePath);

    if (directive === "ambiguous") {
      additionalContext = AMBIGUOUS_NOLOG_INSTRUCTION;
      saveState(statePath, state);
      return;
    }

    if (directive === "current") {
      saveState(statePath, state);
      return;
    }

    if (directive === "session") {
      state.sessions[sessionId] = { scope: "session" };
      saveState(statePath, state);
      return;
    }

    if (directive === "today") {
      state.sessions[sessionId] = { scope: "today", local_date: localDate };
      saveState(statePath, state);
      return;
    }

    if (directive.startsWith("count:")) {
      state.sessions[sessionId] = { scope: "count", remaining: Number.parseInt(directive.split(":")[1] ?? "0", 10) };
    } else if (shouldSkipForActiveScope(state, sessionId, localDate)) {
      saveState(statePath, state);
      return;
    }

    saveState(statePath, state);
  });

  if (directive !== "none") {
    if (additionalContext && !options.silentEmit) {
      emitUserPromptSubmit(hookEventName, additionalContext);
    }
    return { code: 0, directive, additionalContext };
  }

  let promptBody = resolveReferences(prompt, cwd, Number(config.inline_file_max_bytes ?? 32768));
  promptBody = collapseDuplicateFileMarkers(promptBody);
  const timestamps = formatTimestamps(now);
  const paths = computePaths(new Date(now.getTime()), root, config);
  fs.mkdirSync(paths.monthDir, { recursive: true });
  const entry = renderEntry(timestamps.local, timestamps.utc, promptBody);
  const appended = withLock(`${paths.dailyFile}.lock`, 10000, () => appendEntryLocked(paths.dailyFile, entry));

  const sidecarPath = path.join(pendingDir, buildSidecarName(sessionId));
  const sidecar = {
    session_id: sessionId,
    daily_file: paths.dailyFile,
    start: appended.start,
    end: appended.end,
    prompt_text_hash: createHash(prompt),
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
  };

  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), "utf8");
  additionalContext = PROMPT_LOG_INSTRUCTION;
  if (!options.silentEmit) {
    emitUserPromptSubmit(hookEventName, additionalContext);
  }
  return { code: 0, directive, additionalContext };
}

function handleFinalize(event, manual) {
  const config = loadConfig();
  const cwd = getEventCwd(event);
  const root = findProjectRoot(cwd);
  const sessionId = String(event.session_id ?? event.conversation_id ?? "manual");
  const pendingDir = resolvePath(root, String(config.pending_dir));
  const pending = findLatestPendingSidecar(pendingDir, sessionId);
  if (!pending) {
    return 0;
  }

  const { sidecarPath, sidecar } = pending;
  const payload = extractFinalizePayload(event, manual);
  if (!payload) {
    if (isCursorFinalizeEvent(event)) {
      const fallback = buildCursorFallbackPayload(event);
      if (fallback) {
        withLock(`${sidecar.daily_file}.lock`, 10000, () => {
          finalizeEntryLocked(sidecar.daily_file, sidecar.start, sidecar.end, fallback.summary, fallback.tags, []);
        });
        removeSidecar(sidecarPath);
        return 0;
      }
    }

    withLock(`${sidecar.daily_file}.lock`, 10000, () => {
      errorEntryLocked(sidecar.daily_file, sidecar.start, sidecar.end);
    });
    removeSidecar(sidecarPath);
    return 0;
  }

  try {
    const { summary, tags, sensitive } = validatePayload(payload);
    withLock(`${sidecar.daily_file}.lock`, 10000, () => {
      finalizeEntryLocked(sidecar.daily_file, sidecar.start, sidecar.end, summary, tags, sensitive);
    });
  } catch {
    withLock(`${sidecar.daily_file}.lock`, 10000, () => {
      errorEntryLocked(sidecar.daily_file, sidecar.start, sidecar.end);
    });
  }

  removeSidecar(sidecarPath);
  return 0;
}

function handleSessionEnd(event) {
  const config = loadConfig();
  const cwd = getEventCwd(event);
  const root = findProjectRoot(cwd);
  const sessionId = String(event.session_id ?? event.conversation_id ?? "manual");
  const pendingDir = resolvePath(root, String(config.pending_dir));
  const statePath = resolvePath(root, String(config.nolog_state_file));

  for (const pending of findPendingSidecars(pendingDir, sessionId)) {
    withLock(`${pending.sidecar.daily_file}.lock`, 10000, () => {
      errorEntryLocked(pending.sidecar.daily_file, pending.sidecar.start, pending.sidecar.end);
    });
    removeSidecar(pending.sidecarPath);
  }

  withLock(`${statePath}.lock`, 10000, () => {
    const state = loadState(statePath);
    delete state.sessions[sessionId];
    saveState(statePath, state);
  });

  return 0;
}

function createOpenCodeLogPromptsPlugin() {
  const pendingInstructionBySession = new Map();
  const lastUserPromptBySession = new Map();
  const textPartsByMessage = new Map();
  const finalizedAssistantMessages = new Set();

  function getMessageText(messageID) {
    const parts = textPartsByMessage.get(messageID);
    if (!parts) {
      return "";
    }
    return [...parts.values()].join("\n").trim();
  }

  function upsertMessageText(part) {
    if (!part || part.type !== "text" || typeof part.messageID !== "string") {
      return;
    }

    let parts = textPartsByMessage.get(part.messageID);
    if (!parts) {
      parts = new Map();
      textPartsByMessage.set(part.messageID, parts);
    }

    parts.set(part.id, typeof part.text === "string" ? part.text : "");
  }

  function clearMessageState(messageID, sessionID) {
    if (typeof messageID === "string" && messageID) {
      textPartsByMessage.delete(messageID);
      finalizedAssistantMessages.add(messageID);
    }

    if (typeof sessionID === "string" && sessionID) {
      lastUserPromptBySession.delete(sessionID);
    }
  }

  function finalizeAssistantMessage(info, directory) {
    if (!info || info.role !== "assistant" || !info.time?.completed || finalizedAssistantMessages.has(info.id)) {
      return;
    }

    const assistantText = getMessageText(info.id);
    if (!assistantText || info.error) {
      handleFinalize({ session_id: info.sessionID, cwd: info.path?.cwd || directory }, false);
      clearMessageState(info.id, info.sessionID);
      return;
    }

    const payload = extractPromptlogBlock(assistantText)
      ?? buildAutoSummaryPayload(
        {
          prompt: lastUserPromptBySession.get(info.sessionID) ?? "",
          response: assistantText
        },
        {
          agentTag: "opencode"
        }
      );

    handleFinalize(
      {
        session_id: info.sessionID,
        cwd: info.path?.cwd || directory,
        payload
      },
      true
    );
    clearMessageState(info.id, info.sessionID);
  }

  return async ({ directory, client }) => {
    await client.app.log({
      body: {
        service: "log-prompts-opencode",
        level: "info",
        message: "OpenCode prompt logging plugin initialized"
      }
    });

    return {
      "chat.message": async (input, output) => {
        lastUserPromptBySession.set(input.sessionID, output.parts);

        const result = processStartEvent(
          {
            session_id: input.sessionID,
            cwd: directory,
            prompt: output.parts,
            hook_event_name: "opencode.chat.message"
          },
          { silentEmit: true }
        );

        if (result.additionalContext) {
          pendingInstructionBySession.set(input.sessionID, result.additionalContext);
        }
      },

      "experimental.chat.system.transform": async (input, output) => {
        const instruction = input.sessionID ? pendingInstructionBySession.get(input.sessionID) : undefined;
        if (!instruction) {
          return;
        }

        output.system.push(instruction);
        pendingInstructionBySession.delete(input.sessionID);
      },

      event: async ({ event }) => {
        if (event.type === "message.part.updated") {
          upsertMessageText(event.properties.part);
          return;
        }

        if (event.type === "message.updated") {
          finalizeAssistantMessage(event.properties.info, directory);
          return;
        }

        if (event.type === "session.error" && event.properties.sessionID) {
          handleFinalize({ session_id: event.properties.sessionID, cwd: directory }, false);
          lastUserPromptBySession.delete(event.properties.sessionID);
          pendingInstructionBySession.delete(event.properties.sessionID);
          return;
        }

        if (event.type === "session.deleted") {
          const sessionID = event.properties.info.id;
          handleSessionEnd({ session_id: sessionID, cwd: directory });
          lastUserPromptBySession.delete(sessionID);
          pendingInstructionBySession.delete(sessionID);
        }
      }
    };
  };
}

function getEventCwd(event) {
  if (typeof event.cwd === "string" && event.cwd) {
    return event.cwd;
  }
  if (process.env.CLAUDE_PROJECT_DIR) {
    return process.env.CLAUDE_PROJECT_DIR;
  }
  const roots = event.workspace_roots;
  if (Array.isArray(roots) && typeof roots[0] === "string" && roots[0]) {
    return roots[0];
  }
  return process.cwd();
}

function hasNonTextParts(value) {
  return findMediaMarker(value) !== null;
}

function extractPromptText(event, forDetection) {
  let prompt = firstPresent(event, "prompt", "input", "user_prompt", "message", "text", "content");
  if (prompt === undefined) {
    prompt = findPromptLikeValue(event);
  }

  if (!forDetection && typeof prompt === "string") {
    const transcriptPrompt = findLatestUserPromptFromTranscript(event);
    if (hasNonTextParts(transcriptPrompt)) {
      prompt = transcriptPrompt;
    }
  }

  if (prompt === undefined) {
    prompt = findLatestUserPromptFromTranscript(event);
  }

  if (typeof prompt === "string") {
    return forDetection ? stripInjectedContext(prompt) : sanitizePromptForLogging(prompt);
  }
  if (Array.isArray(prompt)) {
    const combined = prompt.map((part) => renderPromptPart(part, forDetection)).filter(Boolean).join("\n");
    return forDetection ? combined : sanitizePromptForLogging(combined);
  }
  if (prompt && typeof prompt === "object") {
    const rendered = renderPromptPart(prompt, forDetection);
    return forDetection ? rendered : sanitizePromptForLogging(rendered);
  }
  return "";
}

function findLatestUserPromptFromTranscript(event) {
  const transcriptPath = firstPresent(event, "transcript_path", "transcriptPath", "conversation_path", "conversationPath");
  if (typeof transcriptPath !== "string" || !transcriptPath) {
    return undefined;
  }

  try {
    const lines = fs.readFileSync(transcriptPath, "utf8").split(/\r?\n/).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const candidate = parseTranscriptLine(lines[index]);
      if (candidate !== undefined) {
        return candidate;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function parseTranscriptLine(line) {
  try {
    const payload = JSON.parse(line.replace(/^\uFEFF/, ""));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return undefined;
    }

    const object = payload;
    const message = object.message;
    const messageObject = message && typeof message === "object" && !Array.isArray(message) ? message : null;
    const role = String(object.role ?? messageObject?.role ?? object.type ?? "");
    if (role !== "user") {
      return undefined;
    }

    const candidates = [
      firstPresent(object, "prompt", "user_prompt", "input", "content", "text"),
      firstPresent(messageObject, "content", "text", "message"),
      messageObject?.content,
      messageObject?.message
    ];

    const richCandidate = candidates.find((candidate) => !isEmptyValue(candidate) && hasNonTextParts(candidate));
    if (richCandidate !== undefined) {
      return richCandidate;
    }

    return candidates.find((candidate) => !isEmptyValue(candidate));
  } catch {
    return undefined;
  }
}

function renderPromptPart(part, forDetection) {
  if (typeof part === "string") {
    return forDetection ? stripInjectedContext(part) : sanitizePromptForLogging(part);
  }
  if (Array.isArray(part)) {
    return part.map((item) => renderPromptPart(item, forDetection)).filter(Boolean).join("\n");
  }
  if (!part || typeof part !== "object") {
    return "";
  }

  const object = part;
  const partType = String(object.type ?? "");
  const text = object.text;

  if ((partType === "input_text" || partType === "text") && typeof text === "string") {
    return forDetection ? stripInjectedContext(text) : sanitizePromptForLogging(text);
  }
  if ("content" in part) {
    const marker = findMediaMarker(part);
    if (!forDetection && marker) {
      const nested = renderPromptPart(object.content ?? null, forDetection);
      return [marker, nested].filter(Boolean).join("\n");
    }
    return renderPromptPart(object.content ?? null, forDetection);
  }
  if ("message" in part) {
    return renderPromptPart(object.message ?? null, forDetection);
  }

  const marker = findMediaMarker(part);
  if (forDetection && marker) {
    return "";
  }
  if (marker === "[#file]") {
    return renderFilePart(object);
  }
  if (marker) {
    return marker;
  }
  if (typeof text === "string") {
    return forDetection ? stripInjectedContext(text) : sanitizePromptForLogging(text);
  }

  return "";
}

function findMediaMarker(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const marker = findMediaMarker(item);
      if (marker) {
        return marker;
      }
    }
    return null;
  }
  if (typeof value !== "object") {
    return null;
  }

  const part = value;
  const rawType = String(part.type ?? part.kind ?? part.media_type ?? "").toLowerCase();
  const mimeType = String(part.mime_type ?? part.mimeType ?? "").toLowerCase();

  if (isImageLike(rawType, mimeType, part)) {
    return "[#image]";
  }
  if (isAudioLike(rawType, mimeType, part)) {
    return "[#audio]";
  }
  if (isFileLike(rawType, mimeType, part)) {
    return "[#file]";
  }
  return null;
}

function isImageLike(partType, mimeType, part) {
  return (
    partType === "image" ||
    partType === "input_image" ||
    partType === "image_url" ||
    partType.endsWith("_image") ||
    mimeType.startsWith("image/") ||
    hasStructuredValue(part, "image", "image_url", "input_image")
  );
}

function isAudioLike(partType, mimeType, part) {
  return (
    partType === "audio" ||
    partType === "input_audio" ||
    partType === "audio_url" ||
    partType.endsWith("_audio") ||
    mimeType.startsWith("audio/") ||
    hasStructuredValue(part, "audio", "audio_url", "input_audio")
  );
}

function isFileLike(partType, mimeType, part) {
  return (
    partType === "file" ||
    partType === "input_file" ||
    partType.endsWith("_file") ||
    mimeType === "application/octet-stream" ||
    hasStructuredValue(part, "file", "file_url", "path")
  );
}

function hasStructuredValue(part, ...keys) {
  return keys.some((key) => {
    const value = part[key];
    if (typeof value === "string") {
      return value.length > 0;
    }
    return Boolean(value);
  });
}

function stripInjectedContext(value) {
  return value
    .replace(/<context\b[^>]*>[\s\S]*?<\/context>/gi, " ")
    .replace(/\[@[^\]]+\]\([^)]+\)/g, " ")
    .trim();
}

function sanitizePromptForLogging(value) {
  let sanitized = repairMojibake(value);
  sanitized = removeRedundantFileLinksBeforeContextBlocks(sanitized);
  sanitized = replaceContextBlocksWithFileMarkers(sanitized);
  sanitized = replaceFileLinksWithMarkers(sanitized);
  sanitized = replaceReadToolTranscriptsWithFileMarkers(sanitized);
  sanitized = collapseDuplicateFileMarkers(sanitized);
  sanitized = removeRepeatedStandaloneFileMarkers(sanitized);
  return sanitized.trim();
}

function renderFilePart(part) {
  if (typeof part.path === "string" && part.path) {
    return `[#file:${part.path}]`;
  }
  if (typeof part.url === "string") {
    const resolved = fileUriToPath(part.url);
    if (resolved) {
      return `[#file:${resolved}]`;
    }
  }
  return FILE_MARKER;
}

function replaceContextBlocksWithFileMarkers(value) {
  return value.replace(/<context\b(?<attrs>[^>]*)>[\s\S]*?<\/context>/gi, (...args) => {
    const groups = args.at(-1);
    const filePath = extractFilePathFromText(groups?.attrs ?? "");
    return filePath ? `[#file:${filePath}]` : " ";
  });
}

function removeRedundantFileLinksBeforeContextBlocks(value) {
  const pattern = /(?<link>\[[^\]]*\]\((?<link_target>file:\/\/\/[^)]+)\))(?<gap>\s*)(?<context><context\b(?<attrs>[^>]*)>[\s\S]*?<\/context>)/gi;
  return value.replace(pattern, (...args) => {
    const groups = args.at(-1);
    const linkPath = fileUriToPath(groups?.link_target ?? "");
    const contextPath = extractFilePathFromText(groups?.attrs ?? "");
    if (linkPath && contextPath && linkPath === contextPath) {
      return `${groups?.gap ?? ""}${groups?.context ?? ""}`;
    }
    return String(args[0]);
  });
}

function replaceFileLinksWithMarkers(value) {
  return value.replace(/\[[^\]]*\]\((?<target>file:\/\/\/[^)]+)\)/gi, (...args) => {
    const groups = args.at(-1);
    const filePath = fileUriToPath(groups?.target ?? "");
    return filePath ? `[#file:${filePath}]` : String(args[0]);
  });
}

function replaceReadToolTranscriptsWithFileMarkers(value) {
  const pattern = /\n?Called the Read tool with the following input:\s*\{[\s\S]*?"filePath"\s*:\s*"(?<filePath>(?:\\.|[^"\\])+)"[\s\S]*?\}\s*<path>[^<]*<\/path>\s*<type>file<\/type>\s*<content>[\s\S]*?<\/content>/gi;
  return value.replace(pattern, (...args) => {
    const groups = args.at(-1);
    const filePath = decodeJsonString(groups?.filePath ?? "");
    const marker = filePath ? `[#file:${filePath}]` : FILE_MARKER;
    const prefix = value.slice(0, Number(args[args.length - 3] ?? 0));
    return prefix.includes(marker) ? "" : `\n${marker}`;
  });
}

function extractFilePathFromText(value) {
  const match = /file:\/\/\/[^"')\s>]+/i.exec(value);
  return match ? fileUriToPath(match[0]) : null;
}

function fileUriToPath(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol.toLowerCase() !== "file:") {
      return null;
    }
    let pathname = decodeURIComponent(parsed.pathname);
    if (/^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }
    return pathname ? pathname.replace(/\//g, "\\") : null;
  } catch {
    return null;
  }
}

function collapseDuplicateFileMarkers(value) {
  const lines = value.split(/\r?\n/);
  const collapsed = [];
  let previousMarker = null;

  for (const line of lines) {
    const stripped = line.trim();
    const marker = /^\[#file:[^\]]+\]$/.test(stripped) ? stripped : null;
    if (marker && marker === previousMarker) {
      continue;
    }
    collapsed.push(line);
    previousMarker = marker;
  }

  return `${collapsed.join("\n")}${value.endsWith("\n") ? "\n" : ""}`;
}

function removeRepeatedStandaloneFileMarkers(value) {
  const lines = value.split(/\r?\n/);
  const seenMarkers = new Set();
  const filtered = [];

  for (const line of lines) {
    const stripped = line.trim();
    const marker = /^\[#file:[^\]]+\]$/.test(stripped) ? stripped : null;
    if (!marker) {
      for (const match of line.match(/\[#file:[^\]]+\]/g) ?? []) {
        seenMarkers.add(match);
      }
      filtered.push(line);
      continue;
    }

    if (seenMarkers.has(marker)) {
      continue;
    }

    seenMarkers.add(marker);
    filtered.push(line);
  }

  return `${filtered.join("\n")}${value.endsWith("\n") ? "\n" : ""}`;
}

function decodeJsonString(value) {
  if (!value) {
    return "";
  }

  try {
    return JSON.parse(`"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  } catch {
    return value.replace(/\\\\/g, "\\");
  }
}

function emitUserPromptSubmit(hookEventName, additionalContext) {
  if (hookEventName === "beforeSubmitPrompt") {
    process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
    return;
  }

  const payload = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      ...(additionalContext ? { additionalContext } : {})
    }
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function extractFinalizePayload(event, manual) {
  if (manual) {
    if (event && typeof event === "object" && !Array.isArray(event) && event.payload && typeof event.payload === "object") {
      return event.payload;
    }
    return event;
  }

  const transcriptPath = firstPresent(
    event,
    "transcript_path",
    "transcriptPath",
    "conversation_path",
    "conversationPath",
    "stop_hook_active_transcript_path"
  );

  if (typeof transcriptPath !== "string" || !transcriptPath) {
    const transcript = findTranscriptText(event);
    return transcript ? extractPromptlogBlock(transcript) : null;
  }

  try {
    const transcript = fs.readFileSync(transcriptPath, "utf8");
    return extractPromptlogBlock(transcript);
  } catch {
    const transcript = findTranscriptText(event);
    return transcript ? extractPromptlogBlock(transcript) : null;
  }
}

function isCursorFinalizeEvent(event) {
  const hookEventName = String(event.hook_event_name ?? "").toLowerCase();
  return (
    "cursor_version" in event ||
    hookEventName === "stop" ||
    hookEventName === "afteragentresponse" ||
    hookEventName === "beforesubmitprompt"
  );
}

function buildAutoSummaryPayload(event, options = {}) {
  const assistantText = extractLatestAssistantText(event);
  if (!assistantText) {
    return null;
  }

  const cleaned = normalizeAssistantText(assistantText);
  if (!cleaned) {
    return null;
  }

  const prompt = extractPromptText(event, true);

  return {
    summary: summarizeAssistantText(cleaned, prompt),
    tags: deriveFallbackTags(event, cleaned, options.agentTag ?? "auto-summary")
  };
}

function buildCursorFallbackPayload(event) {
  return buildAutoSummaryPayload(event, { agentTag: "cursor" });
}

function extractLatestAssistantText(event) {
  const direct = firstPresent(event, "text", "response", "output", "message");
  const renderedDirect = renderAssistantValue(direct);
  if (renderedDirect) {
    return renderedDirect;
  }

  const transcriptPath = firstPresent(
    event,
    "transcript_path",
    "transcriptPath",
    "conversation_path",
    "conversationPath",
    "stop_hook_active_transcript_path"
  );

  if (typeof transcriptPath === "string" && transcriptPath) {
    try {
      const lines = fs.readFileSync(transcriptPath, "utf8").split(/\r?\n/).filter(Boolean);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const candidate = parseAssistantTranscriptLine(lines[index]);
        if (candidate) {
          return candidate;
        }
      }
    } catch {
      // Ignore transcript read failures.
    }
  }

  return renderAssistantValue(findAssistantLikeValue(event));
}

function parseAssistantTranscriptLine(line) {
  try {
    const payload = JSON.parse(line.replace(/^\uFEFF/, ""));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const object = payload;
    const message = object.message;
    const messageObject = message && typeof message === "object" && !Array.isArray(message) ? message : null;
    const role = String(object.role ?? messageObject?.role ?? object.type ?? "");
    if (role !== "assistant") {
      return null;
    }

    const candidates = [
      firstPresent(object, "text", "content", "message", "response", "output"),
      firstPresent(messageObject, "content", "text", "message"),
      messageObject?.content,
      messageObject?.message
    ];

    for (const candidate of candidates) {
      const rendered = renderAssistantValue(candidate);
      if (rendered) {
        return rendered;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function renderAssistantValue(value) {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (Array.isArray(value)) {
    const combined = value.map((item) => renderAssistantValue(item)).filter(Boolean).join("\n");
    return combined.trim() || null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  if (typeof value.text === "string" && value.text.trim()) {
    return value.text.trim();
  }
  if ("content" in value) {
    return renderAssistantValue(value.content ?? null);
  }
  if ("message" in value) {
    return renderAssistantValue(value.message ?? null);
  }
  return null;
}

function findAssistantLikeValue(payload) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const role = String(payload.role ?? payload.type ?? "");
    if (role === "assistant") {
      return firstPresent(payload, "text", "content", "message", "response", "output");
    }
    for (const value of Object.values(payload)) {
      const found = findAssistantLikeValue(value);
      if (!isEmptyValue(found)) {
        return found;
      }
    }
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findAssistantLikeValue(item);
      if (!isEmptyValue(found)) {
        return found;
      }
    }
  }
  return undefined;
}

function normalizeAssistantText(value) {
  return value.replace(/<!--prompt-log[\s\S]*?-->/gi, " ").replace(/\s+/g, " ").trim();
}

function summarizeAssistantText(value, prompt = "") {
  const topic = summarizePromptTopic(prompt);
  const normalized = value.replace(/```[\s\S]*?```/g, " code block ").replace(/\s+/g, " ").trim();

  if (topic) {
    if (/\b(fixed|resolved|updated|implemented|added|changed|created|refactored|removed)\b/i.test(normalized)) {
      return `Assistant completed the user's request about ${topic} and described the resulting changes.`;
    }
    if (/\b(cannot|can't|unable|error|failed|issue|problem)\b/i.test(normalized)) {
      return `Assistant responded to the user's request about ${topic} and reported a limitation or issue encountered.`;
    }
    return `Assistant responded to the user's request about ${topic} and provided the requested result or guidance.`;
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length > 0) {
    return `Assistant provided the requested result: ${sentences[0].slice(0, 180).trim()}`;
  }
  return "Assistant provided the requested result.";
}

function summarizePromptTopic(prompt) {
  const normalized = sanitizePromptForLogging(String(prompt ?? ""))
    .replace(/\[#file:[^\]]+\]/g, " ")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "the request";
  }

  const withoutLeadIn = normalized
    .replace(/^(please|por favor|puedes|podrias|podrías|can you|could you|help me|ayudame|ayúdame)\s+/i, "")
    .replace(/^(tell me|dime|haz|make|do|fix|update|add)\s+/i, "");

  return withoutLeadIn.slice(0, 96).trim() || "the request";
}

function deriveFallbackTags(event, assistantText, agentTag = "auto-summary") {
  const prompt = extractPromptText(event, true);
  const source = `${prompt} ${assistantText}`.toLowerCase();
  const stopwords = new Set([
    "about", "after", "again", "agent", "answer", "before", "build", "cursor", "does", "file", "from", "have",
    "into", "just", "make", "need", "prompt", "response", "that", "this", "used", "user", "with", "without"
  ]);

  const contentTags = [];
  for (const token of source.match(/[a-z0-9]+/g) ?? []) {
    if (token.length < 4 || stopwords.has(token)) {
      continue;
    }
    if (!contentTags.includes(token)) {
      contentTags.push(token);
    }
    if (contentTags.length >= 3) {
      break;
    }
  }

  return [agentTag, "auto-summary", ...contentTags];
}

function firstPresent(payload, ...keys) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function findPromptLikeValue(payload) {
  const preferredKeys = ["prompt", "input", "user_prompt", "message", "text", "content"];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    for (const key of preferredKeys) {
      if (key in payload && !isEmptyValue(payload[key])) {
        return payload[key];
      }
    }
    for (const value of Object.values(payload)) {
      const found = findPromptLikeValue(value);
      if (!isEmptyValue(found)) {
        return found;
      }
    }
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findPromptLikeValue(item);
      if (!isEmptyValue(found)) {
        return found;
      }
    }
  }
  return undefined;
}

function findTranscriptText(payload) {
  const candidates = [];
  collectStringCandidates(payload, candidates);
  return candidates.filter((candidate) => candidate.includes("<!--prompt-log")).join("\n");
}

function collectStringCandidates(payload, output) {
  if (typeof payload === "string") {
    output.push(payload);
    return;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item) => collectStringCandidates(item, output));
    return;
  }
  if (payload && typeof payload === "object") {
    Object.values(payload).forEach((item) => collectStringCandidates(item, output));
  }
}

function validatePayload(payload) {
  const summary = payload.summary;
  let tags = payload.tags;
  const sensitive = payload.sensitive ?? [];

  if (typeof summary !== "string") {
    throw new Error("Missing summary.");
  }
  if (summary.trim() === "<1-3 sentences in English>") {
    throw new Error("Template summary is not allowed.");
  }
  if (typeof tags === "string") {
    tags = tags.split(",").filter(Boolean);
  }
  if (!Array.isArray(tags)) {
    throw new Error("Missing tags.");
  }
  const normalizedTemplateTags = tags.map((tag) => String(tag).trim().toLowerCase());
  if (normalizedTemplateTags.length === 2 && normalizedTemplateTags[0] === "tag1" && normalizedTemplateTags[1] === "tag2") {
    throw new Error("Template tags are not allowed.");
  }
  if (!Array.isArray(sensitive)) {
    throw new Error("Invalid sensitive payload.");
  }

  const renderedSensitive = [];
  for (const item of sensitive) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const find = item.find;
    const replace = item.replace ?? "[#sensitive_information]";
    if (typeof find === "string" && find) {
      renderedSensitive.push({ find, replace: String(replace) });
    }
  }

  return { summary, tags: tags.map(String), sensitive: renderedSensitive };
}

function buildSidecarName(sessionId) {
  const safeSession = sessionId.replace(/[^A-Za-z0-9._-]/g, "_");
  return `${safeSession}-${Date.now()}-${process.hrtime.bigint().toString()}.json`;
}

function loadState(statePath) {
  if (!fs.existsSync(statePath)) {
    return { sessions: {} };
  }
  try {
    const payload = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { sessions: {} };
    }
    const sessionsValue = payload.sessions;
    if (!sessionsValue || typeof sessionsValue !== "object" || Array.isArray(sessionsValue)) {
      return { sessions: {} };
    }
    return { sessions: sessionsValue };
  } catch {
    return { sessions: {} };
  }
}

function saveState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

function shouldSkipForActiveScope(state, sessionId, localDate) {
  const sessionState = state.sessions[sessionId];
  if (!sessionState) {
    return false;
  }
  if (sessionState.scope === "session") {
    return true;
  }
  if (sessionState.scope === "today") {
    if (sessionState.local_date === localDate) {
      return true;
    }
    delete state.sessions[sessionId];
    return false;
  }
  if (sessionState.scope === "count") {
    let remaining = Number(sessionState.remaining ?? 0);
    if (remaining <= 0) {
      delete state.sessions[sessionId];
      return false;
    }
    remaining -= 1;
    if (remaining <= 0) {
      delete state.sessions[sessionId];
    } else {
      sessionState.remaining = remaining;
    }
    return true;
  }
  return false;
}

function findLatestPendingSidecar(pendingDir, sessionId) {
  const pending = findPendingSidecars(pendingDir, sessionId);
  if (pending.length === 0) {
    return null;
  }
  pending.sort((left, right) => {
    const leftStat = fs.statSync(left.sidecarPath);
    const rightStat = fs.statSync(right.sidecarPath);
    return leftStat.mtimeMs - rightStat.mtimeMs || left.sidecarPath.localeCompare(right.sidecarPath);
  });
  return pending.at(-1) ?? null;
}

function findPendingSidecars(pendingDir, sessionId) {
  if (!fs.existsSync(pendingDir)) {
    return [];
  }

  const matches = [];
  for (const name of fs.readdirSync(pendingDir)) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const sidecarPath = path.join(pendingDir, name);
    try {
      const payload = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
      if (String(payload.session_id) !== sessionId) {
        continue;
      }
      matches.push({ sidecarPath, sidecar: payload });
    } catch {
      // Ignore unreadable sidecars.
    }
  }

  return matches;
}

function removeSidecar(sidecarPath) {
  try {
    fs.unlinkSync(sidecarPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function withLock(lockPath, timeoutMs, callback) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      const handle = fs.openSync(lockPath, "wx");
      try {
        return callback();
      } finally {
        fs.closeSync(handle);
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // Ignore lock cleanup failures.
        }
      }
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out acquiring lock: ${lockPath}`);
      }
      sleepMs(50);
    }
  }
}

function sleepMs(ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    // Busy wait to avoid extra runtime dependencies in hook execution.
  }
}

function formatLocalDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isEmptyValue(value) {
  if (value === undefined || value === null || value === "") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
}

function createHash(value) {
  return require("crypto").createHash("sha256").update(value, "utf8").digest("hex");
}

module.exports = {
  AMBIGUOUS_NOLOG_INSTRUCTION,
  buildAutoSummaryPayload,
  createOpenCodeLogPromptsPlugin,
  PROMPT_LOG_INSTRUCTION,
  buildCursorFallbackPayload,
  handleFinalize,
  handleSessionEnd,
  handleStart,
  processStartEvent
};

if (require.main === module) {
  process.exitCode = main();
}
