/**
 * Pure, deterministic logic helpers for herdr-file-editor.
 * No imports from "herdr", "gpui-kit", or "gpui-base" so this module
 * can be tested directly in Node.js test runners.
 */

/**
 * Splits a file path into its base filename, parent directory, and extension.
 * Normalizes backslashes to forward slashes.
 *
 * @param {string} [filePath]
 * @returns {{ base: string, dir: string, ext: string }}
 */
export function splitPathInfo(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    return { base: "", dir: "", ext: "" };
  }
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  const base = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";

  let ext = "";
  if (base === "." || base === "..") {
    return { base, dir, ext: "" };
  }

  const lastDot = base.lastIndexOf(".");
  if (lastDot > 0 && lastDot < base.length - 1) {
    ext = base.slice(lastDot + 1).toLowerCase();
  } else if (lastDot === 0 && base.length > 1) {
    // Dotfile without additional extension, e.g. .gitignore
    ext = base.slice(1).toLowerCase();
  }

  return { base, dir, ext };
}

/**
 * Normalizes root and file path parameters for tab mode initialization.
 * Strips redundant leading/trailing slashes and extracts root when an absolute file is passed.
 *
 * @param {Record<string, any>} [props]
 * @returns {{ root: string, file: string }}
 */
export function normalizeTabTarget(props) {
  const p = props || {};
  let rawRoot = typeof p.folder === "string" ? p.folder : typeof p.cwd === "string" ? p.cwd : "";
  let rawFile = typeof p.file === "string" ? p.file : "";

  rawRoot = rawRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  rawFile = rawFile.replace(/\\/g, "/");

  if (!rawRoot && rawFile.startsWith("/")) {
    const lastSlash = rawFile.lastIndexOf("/");
    if (lastSlash > 0) {
      rawRoot = rawFile.slice(0, lastSlash);
      rawFile = rawFile.slice(lastSlash + 1);
    }
  }

  if (rawRoot && rawFile.startsWith(rawRoot + "/")) {
    rawFile = rawFile.slice(rawRoot.length + 1);
  }

  rawFile = rawFile.replace(/^\/+/, "");

  return { root: rawRoot, file: rawFile };
}

/**
 * Language mapping table for EditorState syntax highlighting.
 * @type {Record<string, { language: string, label: string }>}
 */
const EXTENSION_MAP = {
  js: { language: "js", label: "JavaScript" },
  mjs: { language: "js", label: "JavaScript" },
  cjs: { language: "js", label: "JavaScript" },
  ts: { language: "js", label: "TypeScript" },
  mts: { language: "js", label: "TypeScript" },
  cts: { language: "js", label: "TypeScript" },
  jsx: { language: "js", label: "JSX" },
  tsx: { language: "js", label: "TSX" },
  json: { language: "json", label: "JSON" },
  jsonc: { language: "json", label: "JSON" },
  html: { language: "html", label: "HTML" },
  htm: { language: "html", label: "HTML" },
  css: { language: "css", label: "CSS" },
  scss: { language: "css", label: "SCSS" },
  sass: { language: "css", label: "SASS" },
  less: { language: "css", label: "LESS" },
  md: { language: "markdown", label: "Markdown" },
  markdown: { language: "markdown", label: "Markdown" },
  mdx: { language: "markdown", label: "MDX" },
  rs: { language: "rust", label: "Rust" },
  py: { language: "python", label: "Python" },
  go: { language: "go", label: "Go" },
  c: { language: "c", label: "C" },
  h: { language: "c", label: "C Header" },
  cpp: { language: "cpp", label: "C++" },
  cc: { language: "cpp", label: "C++" },
  cxx: { language: "cpp", label: "C++" },
  hpp: { language: "cpp", label: "C++ Header" },
  sh: { language: "bash", label: "Shell" },
  bash: { language: "bash", label: "Bash" },
  zsh: { language: "bash", label: "Zsh" },
  yaml: { language: "yaml", label: "YAML" },
  yml: { language: "yaml", label: "YAML" },
  toml: { language: "yaml", label: "TOML" },
  xml: { language: "xml", label: "XML" },
  svg: { language: "xml", label: "SVG" },
  sql: { language: "sql", label: "SQL" },
  vue: { language: "html", label: "Vue" },
  svelte: { language: "html", label: "Svelte" },
  java: { language: "java", label: "Java" },
  rb: { language: "ruby", label: "Ruby" },
  php: { language: "php", label: "PHP" },
  lua: { language: "lua", label: "Lua" },
  swift: { language: "swift", label: "Swift" },
  kt: { language: "kotlin", label: "Kotlin" },
  kts: { language: "kotlin", label: "Kotlin" },
  txt: { language: "text", label: "Text" },
};

/**
 * Exact filename mapping for special build and configuration files.
 * @type {Record<string, { language: string, label: string }>}
 */
const SPECIAL_FILE_MAP = {
  dockerfile: { language: "dockerfile", label: "Dockerfile" },
  containerfile: { language: "dockerfile", label: "Containerfile" },
  makefile: { language: "makefile", label: "Makefile" },
  gnumakefile: { language: "makefile", label: "Makefile" },
  "cmakelists.txt": { language: "cmake", label: "CMake" },
  gemfile: { language: "ruby", label: "Ruby" },
  rakefile: { language: "ruby", label: "Ruby" },
  "cargo.lock": { language: "yaml", label: "TOML" },
  "package.json": { language: "json", label: "JSON" },
  ".gitignore": { language: "text", label: "Gitignore" },
  ".npmignore": { language: "text", label: "Ignore" },
  ".dockerignore": { language: "text", label: "Ignore" },
};

/**
 * Detects the programming language and human-readable label for a given file path.
 *
 * @param {string} filePath
 * @returns {{ language: string, label: string }}
 */
export function detectLanguage(filePath) {
  const { base, ext } = splitPathInfo(filePath);
  const lowerBase = base.toLowerCase();

  if (SPECIAL_FILE_MAP[lowerBase]) {
    return SPECIAL_FILE_MAP[lowerBase];
  }

  if (ext && EXTENSION_MAP[ext]) {
    return EXTENSION_MAP[ext];
  }

  return {
    language: ext || "text",
    label: ext ? ext.toUpperCase() : "Text",
  };
}

/**
 * Checks if a given file path is a Markdown document.
 *
 * @param {string} [filePath]
 * @returns {boolean}
 */
export function isMarkdownFile(filePath) {
  const { ext } = splitPathInfo(filePath);
  return ext === "md" || ext === "markdown" || ext === "mdx";
}

/**
 * Determines the default view mode for a file ("preview" or "code").
 * Markdown files default to "preview" unless explicitly set to "code".
 * All other files always use "code".
 *
 * @param {string} filePath
 * @param {string} [requestedMode]
 * @returns {"preview" | "code"}
 */
export function defaultViewMode(filePath, requestedMode) {
  if (!isMarkdownFile(filePath)) {
    return "code";
  }
  return requestedMode === "code" ? "code" : "preview";
}

/**
 * Maximum character threshold before text truncation.
 */
export const DEFAULT_MAX_CHARS = 400000;

/**
 * Prepares file text for rendering: checks for missing file, binary null bytes,
 * line count (subtracting trailing newline to match Editor gutter count), and truncates large files.
 *
 * @param {string | null | undefined} rawText
 * @param {number} [maxChars=400000]
 * @returns {{
 *   error: string | null,
 *   text: string | null,
 *   lineCount: number,
 *   isBinary: boolean,
 *   isTruncated: boolean
 * }}
 */
export function prepareFileText(rawText, maxChars = DEFAULT_MAX_CHARS) {
  if (rawText === null || rawText === undefined) {
    return {
      error: "This file is no longer available",
      text: null,
      lineCount: 0,
      isBinary: false,
      isTruncated: false,
    };
  }

  if (typeof rawText !== "string") {
    return {
      error: "Cannot preview this file (binary, too large, or unreadable)",
      text: null,
      lineCount: 0,
      isBinary: false,
      isTruncated: false,
    };
  }

  if (rawText.includes("\0")) {
    return {
      error: "Binary file · no text preview",
      text: null,
      lineCount: 0,
      isBinary: true,
      isTruncated: false,
    };
  }

  const lineCount = rawText === "" ? 0 : rawText.split("\n").length - Number(rawText.endsWith("\n"));
  const isTruncated = rawText.length > maxChars;
  const text = isTruncated
    ? `${rawText.slice(0, maxChars)}\n… (file truncated)`
    : rawText;

  return {
    error: null,
    text,
    lineCount,
    isBinary: false,
    isTruncated,
  };
}

/**
 * Evaluates whether a batch of changed filesystem paths requires reloading an open file tab.
 *
 * @param {string[] | null | undefined} changedPaths
 * @param {string | null | undefined} root
 * @param {string | null | undefined} file
 * @returns {boolean}
 */
export function shouldReloadWatchedFile(changedPaths, root, file) {
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) {
    return true;
  }
  const normRoot = typeof root === "string" ? root.replace(/\\/g, "/").replace(/\/+$/, "") : "";
  const normFile = typeof file === "string" ? file.replace(/\\/g, "/").replace(/^\/+/, "") : "";
  const normFull = normRoot ? `${normRoot}/${normFile}` : normFile;

  for (const p of changedPaths) {
    if (typeof p !== "string") continue;
    const normP = p.replace(/\\/g, "/").replace(/\/+$/, "");
    // Batch overflow or root change:
    if (normP === normRoot) return true;
    // Exact file match:
    if (normP === normFull) return true;
    // Parent directory of the file was modified:
    if (normFull.startsWith(normP + "/")) return true;
    // Changed path is inside the file:
    if (normP.startsWith(normFull + "/")) return true;
  }
  return false;
}

/**
 * djb2 string hash, base-36. Cheap and stable across runs.
 *
 * @param {string} str
 * @returns {string}
 */
export function contentHash(str) {
  const source = typeof str === "string" ? str : "";
  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/** Minimum characters before closing a Markdown chunk. */
const MIN_CHUNK_CHARS = 1200;

/** Document-wide syntax a split could break: reference definitions, HTML blocks, containers, math. */
const DOCUMENT_WIDE = /^ {0,3}(?:\[[^\]\n]+\]:|<[A-Za-z!?/]|:::|\$\$)/m;

/** A code fence line: up to 3 spaces of indent, then 3+ backticks or tildes. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** A line that continues the block above it: indented, or a list item marker. */
const CONTINUATION = /^(?:\s|(?:[-*+]|\d+[.)])(?:\s|$))/;

/**
 * Greedy grouping of cut pieces into bounded chunks.
 *
 * @param {string[]} pieces
 * @returns {string[]}
 */
function groupPieces(pieces) {
  const chunks = [];
  let current = "";
  for (let i = 0; i < pieces.length; i++) {
    current += pieces[i];
    const isFinal = i === pieces.length - 1;
    if (!isFinal && current.length >= MIN_CHUNK_CHARS) {
      chunks.push(current);
      current = "";
    }
  }
  chunks.push(current);
  return chunks;
}

/**
 * Splits Markdown into chunks that each render independently.
 * Breaks only at clean blank lines outside code fences.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitMarkdownChunks(text) {
  const source = typeof text === "string" ? text : "";
  if (source === "" || source.includes("\r") || source.includes("[^") || DOCUMENT_WIDE.test(source)) {
    return [source];
  }
  const lines = source.split("\n");
  const pieces = [];
  let start = 0;
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE.exec(lines[i]);
    if (fence) {
      if (m && m[1][0] === fence.char && m[1].length >= fence.length && m[2].trim() === "") {
        fence = null;
      }
      continue;
    }
    if (m && (m[1][0] === "~" || !m[2].includes("`"))) {
      fence = { char: m[1][0], length: m[1].length };
      continue;
    }
    if (lines[i].trim() !== "") continue;
    const next = lines[i + 1];
    if (next === undefined || next.trim() === "" || CONTINUATION.test(next)) continue;
    pieces.push(`${lines.slice(start, i + 1).join("\n")}\n`);
    start = i + 1;
  }
  pieces.push(lines.slice(start).join("\n"));
  return groupPieces(pieces);
}

/**
 * Maps Herdr theme ANSI and semantic colors to EditorState syntax theme tokens.
 *
 * @param {Record<string, string>} [themeObj={}]
 * @returns {Record<string, string>}
 */
export function buildSyntaxTheme(themeObj = {}) {
  const t = themeObj || {};
  return {
    keyword: t.ansi5 || "#b48ead",
    string: t.ansi2 || "#a3be8c",
    comment: t.dim || "#616e88",
    function: t.ansi4 || "#81a1c1",
    type: t.ansi3 || "#ebcb8b",
    number: t.ansi1 || "#bf616a",
    constant: t.ansi6 || "#88c0d0",
  };
}

/**
 * Resolves the workspace location honoring active space, pinned location, focused cwd
 * strictly when focused space matches active space, and space folder fallback.
 * Retains previousCwd when focusing a mod tab in the same space.
 *
 * @param {{
 *   props?: Record<string, any>,
 *   spaces?: Array<{ id: string, folder?: string, machine?: string | null, active?: boolean }>,
 *   focused?: { space?: string, pane?: string | null, terminal?: string | null, cwd?: string | null } | null,
 *   panes?: Array<{ pane: string, cwd?: string | null, terminal?: string | null }>,
 *   pinnedLocations?: Record<string, string>,
 *   previousCwd?: string | null,
 *   previousSpace?: string | null
 * }} options
 * @returns {{ cwd: string | null, on: string | null, space: string | null }}
 */
export function resolveLocationState({
  props,
  spaces,
  focused,
  panes,
  pinnedLocations,
  previousCwd = null,
  previousSpace = null,
}) {
  const p = props || {};
  const spaceList = Array.isArray(spaces) ? spaces : [];
  const space = spaceList.find((s) => s.active) || null;
  const spaceId = space?.id ?? null;

  const pinned = spaceId && pinnedLocations ? pinnedLocations[spaceId] : null;
  const f = focused || null;
  const isFocusedInActiveSpace = Boolean(f && spaceId && f.space === spaceId);

  let focusedCwd = null;
  let isModPane = false;
  if (isFocusedInActiveSpace) {
    if (f.pane && Array.isArray(panes)) {
      const matchedPane = panes.find((item) => item.pane === f.pane);
      isModPane = Boolean(matchedPane && !matchedPane.terminal);
      focusedCwd = matchedPane?.cwd || f.cwd || null;
    } else {
      focusedCwd = f.cwd || null;
    }
  }

  // Preserve previousCwd when focusing a mod pane or pane with no cwd in the same active space
  let retainedCwd = null;
  if (isFocusedInActiveSpace && (!focusedCwd || isModPane)) {
    if (previousSpace && spaceId && previousSpace === spaceId && previousCwd) {
      retainedCwd = previousCwd;
    }
  }

  const cwd = p.folder || p.cwd || pinned || focusedCwd || retainedCwd || space?.folder || null;

  const remoteFromTerminal =
    isFocusedInActiveSpace && f?.pane === null && typeof f?.terminal === "string" && f.terminal.includes("/")
      ? f.terminal.split("/")[0]
      : null;
  const on = p.on !== undefined ? p.on : remoteFromTerminal || (space?.machine ?? null);

  return { cwd, on, space: spaceId };
}

/**
 * Resolves or generates the target tab for a given file.
 * Preserves tabs belonging to other roots/spaces during pruning.
 * Matches strictly by tabId once tabId is known.
 * Disambiguates colliding tab names iteratively with counters.
 *
 * @param {string} filePath
 * @param {string | null} root
 * @param {Array<{ id: string, name: string, settled?: boolean }>} activeTabs
 * @param {Record<string, { tabId?: string, tabName?: string, root?: string | null, file?: string }>} [openTabsMap={}]
 * @returns {{
 *   existingTabId: string | null,
 *   tabName: string,
 *   updatedOpenTabs: Record<string, { tabId?: string, tabName?: string, root?: string | null, file?: string }>
 * }}
 */
export function resolveFileTab(filePath, root, activeTabs, openTabsMap = {}) {
  const normFile = typeof filePath === "string" ? filePath.replace(/\\/g, "/") : "";
  const normRoot = typeof root === "string" ? root.replace(/\\/g, "/").replace(/\/+$/, "") : null;
  const fileKey = normRoot ? `${normRoot}/${normFile}` : normFile;

  const tabs = Array.isArray(activeTabs) ? activeTabs : [];
  const liveTabs = tabs.filter((t) => t && !t.settled);

  // Prune openTabsMap entries whose tab is no longer active and non-settled.
  // Preserve entries from other roots/spaces untouched!
  const updatedOpenTabs = {};
  if (openTabsMap && typeof openTabsMap === "object") {
    for (const [key, val] of Object.entries(openTabsMap)) {
      if (val && typeof val === "object") {
        const valRoot = typeof val.root === "string" ? val.root.replace(/\\/g, "/").replace(/\/+$/, "") : null;
        const isDifferentRoot = valRoot && normRoot && valRoot !== normRoot;
        if (isDifferentRoot) {
          updatedOpenTabs[key] = { ...val };
          continue;
        }

        // Strict tabId matching when tabId is known
        const isStillLive = liveTabs.some((t) => {
          if (typeof val.tabId === "string" && val.tabId.length > 0) {
            return t.id === val.tabId;
          }
          return typeof val.tabName === "string" && val.tabName.length > 0 && t.name === val.tabName;
        });

        if (isStillLive) {
          updatedOpenTabs[key] = { ...val };
        }
      }
    }
  }

  // Check if our file already has a live recorded tab
  const recorded = updatedOpenTabs[fileKey];
  if (recorded) {
    const matchedLiveTab = liveTabs.find((t) => {
      if (typeof recorded.tabId === "string" && recorded.tabId.length > 0) {
        return t.id === recorded.tabId;
      }
      return typeof recorded.tabName === "string" && recorded.tabName.length > 0 && t.name === recorded.tabName;
    });

    if (matchedLiveTab) {
      updatedOpenTabs[fileKey] = {
        ...recorded,
        tabId: matchedLiveTab.id,
        tabName: matchedLiveTab.name,
      };
      return {
        existingTabId: matchedLiveTab.id,
        tabName: matchedLiveTab.name,
        updatedOpenTabs,
      };
    }
  }

  // Deduce tab title
  const { base, dir } = splitPathInfo(normFile);
  const defaultTitle = base || "File";

  const hasCollision = (name) => liveTabs.some((t) => t.name === name);
  let tabName = defaultTitle;

  if (hasCollision(tabName)) {
    let candidate = "";
    if (dir) {
      candidate = `${dir}/${base}`;
    } else if (normRoot) {
      const rootBase = normRoot.split("/").filter(Boolean).pop() || "";
      candidate = rootBase ? `${rootBase}/${base}` : base;
    } else {
      candidate = base;
    }

    if (!hasCollision(candidate)) {
      tabName = candidate;
    } else {
      let n = 2;
      while (hasCollision(`${candidate} (${n})`)) {
        n++;
      }
      tabName = `${candidate} (${n})`;
    }
  }

  // Record into updatedOpenTabs
  updatedOpenTabs[fileKey] = {
    root: normRoot,
    file: normFile,
    tabName,
  };

  return {
    existingTabId: null,
    tabName,
    updatedOpenTabs,
  };
}
