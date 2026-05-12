"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const CONFIG_PATH = path.resolve(__dirname, "protect-files.config.json");

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function expandHome(value) {
  if (!value.startsWith("~")) {
    return value;
  }

  const home = os.homedir();
  if (!home) {
    return value;
  }
  if (value === "~") {
    return home;
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(home, value.slice(2));
  }
  return value;
}

function normalize(value, cwd) {
  const expanded = path.resolve(cwd, expandHome(value.replace(/%([^%]+)%/g, (_, key) => process.env[key] ?? "")));
  const cwdResolved = path.resolve(cwd);
  const resolved = path.resolve(expanded);
  const candidates = new Set();

  candidates.add(resolved.split(path.sep).join("/"));
  candidates.add(path.basename(expanded));

  const relative = path.relative(cwdResolved, resolved).split(path.sep).join("/");
  if (relative && !relative.startsWith("..")) {
    candidates.add(relative);
    const parts = relative.split("/");
    for (let index = 0; index < parts.length; index += 1) {
      candidates.add(parts.slice(index).join("/"));
    }
  }

  return new Set([...candidates].map((candidate) => candidate.replace(/^[.][/\\]/, "")).filter(Boolean));
}

function allStrings(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => allStrings(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => allStrings(item));
  }
  return [];
}

function pathLikeValues(value) {
  const values = new Set([value]);
  const matches = value.match(/[^\s"'`;&|<>]+/g) ?? [];
  for (const match of matches) {
    values.add(match.replace(/^[()[\]{}:,]+|[()[\]{}:,]+$/g, ""));
  }
  return new Set([...values].filter(Boolean));
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const current = pattern[index];
    const next = pattern[index + 1];

    if (current === "*") {
      if (next === "*") {
        const after = pattern[index + 2];
        if (after === "/") {
          source += "(?:.*?/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }

    if (current === "?") {
      source += "[^/]";
      continue;
    }
    if (current === "/") {
      source += "/";
      continue;
    }
    source += escapeRegex(current);
  }
  source += "$";
  return new RegExp(source);
}

function matches(value, patterns, caseSensitive) {
  const checked = caseSensitive ? value : value.toLowerCase();
  for (const rawPattern of patterns) {
    const pattern = caseSensitive ? rawPattern : rawPattern.toLowerCase();
    if (globToRegExp(pattern).test(checked)) {
      return true;
    }
  }
  return false;
}

function isBlocked(value, cwd, config) {
  const caseSensitive = Boolean(config.case_sensitive);
  const blocked = Array.isArray(config.blocked_paths) ? config.blocked_paths.map(String) : [];
  const allowed = Array.isArray(config.allow_paths) ? config.allow_paths.map(String) : [];

  for (const candidate of normalize(value, cwd)) {
    if (matches(candidate, allowed, caseSensitive)) {
      return false;
    }
    if (matches(candidate, blocked, caseSensitive)) {
      return true;
    }
  }
  return false;
}

function findBlockedPath(toolInput, cwd, config) {
  for (const value of allStrings(toolInput)) {
    for (const candidate of pathLikeValues(value)) {
      if (isBlocked(candidate, cwd, config)) {
        return candidate;
      }
    }
  }

  return null;
}

function denyPreToolUse(reason) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  })}\n`);
}

function denyPermissionRequest(reason) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: "deny",
        message: reason
      }
    }
  })}\n`);
}

function denyCursorPreToolUse(reason) {
  process.stdout.write(`${JSON.stringify({ permission: "deny", user_message: reason })}\n`);
}

function createOpenCodeProtectFilesPlugin() {
  return async ({ directory, client }) => {
    await client.app.log({
      body: {
        service: "protect-files-opencode",
        level: "info",
        message: "OpenCode protect-files plugin initialized"
      }
    });

    return {
      "tool.execute.before": async (_input, output) => {
        const config = loadConfig();
        const cwd = String(output.args?.workdir ?? output.args?.cwd ?? directory);
        const candidate = findBlockedPath(output.args ?? {}, cwd, config);

        if (!candidate) {
          return;
        }

        throw new Error(`Blocked: access to protected file '${candidate}' is not allowed.`);
      }
    };
  };
}

function main() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) {
    return 0;
  }

  const event = JSON.parse(raw);
  const hookEvent = String(event.hook_event_name ?? "");
  if (!["PreToolUse", "PermissionRequest", "preToolUse"].includes(hookEvent)) {
    return 0;
  }

  const config = loadConfig();
  const cwd = String(event.cwd ?? process.cwd());
  const toolInput = event.tool_input ?? {};

  const candidate = findBlockedPath(toolInput, cwd, config);
  if (candidate) {
    const reason = `Blocked: access to protected file '${candidate}' is not allowed.`;
    if (hookEvent === "preToolUse") {
      denyCursorPreToolUse(reason);
    } else if (hookEvent === "PermissionRequest") {
      denyPermissionRequest(reason);
    } else {
      denyPreToolUse(reason);
    }
  }

  return 0;
}

module.exports = {
  createOpenCodeProtectFilesPlugin,
  findBlockedPath,
  isBlocked,
  loadConfig,
  main
};

if (require.main === module) {
  process.exitCode = main();
}
