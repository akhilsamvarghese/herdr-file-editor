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

/** A list item marker: indent, bullet or number, then whitespace. */
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( +)(.*)$/;

/** A code fence opener: up to 3 spaces of indent, then 3+ backticks or tildes, then an info string. */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;

/** ATX heading: 1-6 hashes, then text, with an optional closing sequence. */
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;

/** Thematic break: three or more of the same rule character. */
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/** Block quote marker. */
const QUOTE = /^ {0,3}>/;

/** Table delimiter row: pipes, colons and dashes, with at least one dash. */
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * Parses Markdown source into a block tree for a GitHub-style renderer.
 * Blocks: heading, paragraph, code, quote (nested blocks), list (items with nested
 * blocks and task state), table, hr. Inline Markdown stays raw in `text` fields.
 *
 * @param {string} text
 * @returns {MarkdownBlock[]}
 */
export function parseMarkdownBlocks(text) {
  const source = typeof text === "string" ? text : "";
  return parseBlocks(source.replace(/\r\n?/g, "\n").split("\n"));
}

/**
 * @typedef {{ type: "heading", level: number, text: string }
 *   | { type: "paragraph", text: string }
 *   | { type: "code", lang: string, text: string }
 *   | { type: "quote", blocks: MarkdownBlock[] }
 *   | { type: "list", ordered: boolean, start: number, items: Array<{ checked: boolean | null, blocks: MarkdownBlock[] }> }
 *   | { type: "table", align: string[], header: string[], rows: string[][] }
 *   | { type: "hr" }} MarkdownBlock
 */

/**
*/

/** @returns {number} Count of leading spaces (tabs count as 4). */
function indentOf(line) {
  let n = 0;
  for (const ch of line) {
    if (ch === " ") n++;
    else if (ch === "\t") n += 4;
    else break;
  }
  return n;
}

/**
 * Splits one table row into trimmed cell sources.
 *
 * @param {string} line
 * @returns {string[]}
 */
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

/**
 * True when a line starts a block that interrupts a paragraph.
 *
 * @param {string} line
 * @returns {boolean}
 */
function startsBlock(line) {
  return (
    FENCE_OPEN.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    (LIST_ITEM.test(line) && line.trim() !== "")
  );
}

/**
 * Parses a list of source lines into blocks.
 *
 * @param {string[]} lines
 * @returns {MarkdownBlock[]}
 */
function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      const marker = fence[1];
      const closer = new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`);
      const body = [];
      i++;
      while (i < lines.length && !closer.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: "code", lang: fence[2] || "", text: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] || "" });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(lines[i].replace(/^ {0,3}> ?/, ""));
        i++;
      }
      blocks.push({ type: "quote", blocks: parseBlocks(inner) });
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_DELIMITER.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const align = splitRow(lines[i + 1]).map((cell) =>
        cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left"
      );
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", align, header, rows });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item && indentOf(line) < 4) {
      const indent = indentOf(line);
      const ordered = /\d/.test(item[2][0]);
      const list = { type: "list", ordered, start: ordered ? Number.parseInt(item[2], 10) : 1, items: [] };
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]);
        if (!m || indentOf(lines[i]) !== indent || /\d/.test(m[2][0]) !== ordered) break;
        const contentIndent = m[1].length + m[2].length + m[3].length;
        const body = [m[4]];
        i++;
        while (i < lines.length) {
          const next = lines[i];
          if (next.trim() === "") {
            let j = i + 1;
            while (j < lines.length && lines[j].trim() === "") j++;
            if (j < lines.length && indentOf(lines[j]) > indent) {
              body.push("");
              i++;
              continue;
            }
            break;
          }
          if (indentOf(next) <= indent) break;
          body.push(next.slice(Math.min(indentOf(next), contentIndent)));
          i++;
        }
        const task = /^\[([ xX])\]\s+(.*)$/.exec(body[0]);
        if (task) body[0] = task[2];
        list.items.push({ checked: task ? task[1].toLowerCase() === "x" : null, blocks: parseBlocks(body) });
      }
      blocks.push(list);
      continue;
    }

    const para = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "paragraph", text: para.join(" ") });
  }
  return blocks;
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
 * Retains previousCwd when focusing a mod tab in the same space. Mod panes never supply a cwd;
 * a live terminal cwd in the active space is preferred over the stored space folder.
 *
 * @param {{
 *   props?: Record<string, any>,
 *   spaces?: Array<{ id: string, folder?: string, machine?: string | null, active?: boolean, tabs?: Array<{ id: string }> }>,
 *   focused?: { space?: string, pane?: string | null, terminal?: string | null, cwd?: string | null } | null,
 *   panes?: Array<{ pane: string, tab?: string, cwd?: string | null, terminal?: string | null }>,
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

  // A mod pane has no folder of its own, so focusing one must not borrow a cwd.
  let focusedCwd = null;
  let isModPane = false;
  if (isFocusedInActiveSpace) {
    const matchedPane = f.pane && Array.isArray(panes) ? panes.find((item) => item.pane === f.pane) : null;
    isModPane = Boolean(matchedPane && !matchedPane.terminal);
    if (!isModPane) {
      focusedCwd = matchedPane?.cwd || f.cwd || null;
    }
  }

  // Preserve previousCwd when focusing a mod pane or pane with no cwd in the same active space
  let retainedCwd = null;
  if (isFocusedInActiveSpace && (!focusedCwd || isModPane)) {
    if (previousSpace && spaceId && previousSpace === spaceId && previousCwd) {
      retainedCwd = previousCwd;
    }
  }

  // Live folder of a terminal in the active space, before the stored space folder, which
  // herdr can leave at $HOME or another space's repo for a freshly created space.
  const spaceTabIds = new Set((space?.tabs ?? []).map((t) => t.id));
  const spaceTerminals = (Array.isArray(panes) ? panes : []).filter(
    (pn) => pn.terminal && pn.cwd && spaceTabIds.has(pn.tab)
  );
  const spaceTerminalCwd = (spaceTerminals.find((pn) => pn.tab === f?.tab) || spaceTerminals[0])?.cwd || null;

  const cwd =
    p.folder || p.cwd || pinned || focusedCwd || retainedCwd || spaceTerminalCwd || space?.folder || null;

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

/**
 * Builds the shared openTabs entry for a file tab being registered.
 * Keeps a previously recorded tabName/tabId unless the incoming values supply
 * a fresher one, so a tab opened without a pane (e.g. via `tab.new`) cannot
 * overwrite a disambiguated name such as "lib/index.js" with its basename.
 *
 * @param {{ tabId?: string, tabName?: string } | null | undefined} existing - Current entry for this file, if any.
 * @param {{ root: string | null, file: string, tabName?: string | null, tabId?: string | null }} incoming - Values known for this open.
 * @returns {{ root: string | null, file: string, tabName: string, tabId?: string }}
 */
export function mergeOpenTabEntry(existing, incoming) {
  const prev = existing && typeof existing === "object" ? existing : {};
  const tabId = incoming.tabId || prev.tabId;
  const tabName = incoming.tabName || prev.tabName || splitPathInfo(incoming.file).base || "File";

  return {
    root: incoming.root,
    file: incoming.file,
    tabName,
    ...(tabId ? { tabId } : {}),
  };
}
