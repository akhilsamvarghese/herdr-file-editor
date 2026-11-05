import test from "node:test";
import assert from "node:assert/strict";
import {
  splitPathInfo,
  normalizeTabTarget,
  detectLanguage,
  isMarkdownFile,
  defaultViewMode,
  prepareFileText,
  shouldReloadWatchedFile,
  contentHash,
  splitMarkdownChunks,
  buildSyntaxTheme,
  resolveLocationState,
  resolveFileTab,
  mergeOpenTabEntry,
} from "../mods/file-editor/file-logic.js";

test("splitPathInfo - extracts base, dir, and ext correctly", () => {
  assert.deepEqual(splitPathInfo("src/components/Header.tsx"), {
    base: "Header.tsx",
    dir: "src/components",
    ext: "tsx",
  });

  assert.deepEqual(splitPathInfo("README.md"), {
    base: "README.md",
    dir: "",
    ext: "md",
  });

  // Windows backslash normalization
  assert.deepEqual(splitPathInfo("C:\\Users\\dev\\project\\main.js"), {
    base: "main.js",
    dir: "C:/Users/dev/project",
    ext: "js",
  });

  // Dotfiles
  assert.deepEqual(splitPathInfo(".gitignore"), {
    base: ".gitignore",
    dir: "",
    ext: "gitignore",
  });

  assert.deepEqual(splitPathInfo("nested/.eslintrc.json"), {
    base: ".eslintrc.json",
    dir: "nested",
    ext: "json",
  });

  // Files without extension
  assert.deepEqual(splitPathInfo("Makefile"), {
    base: "Makefile",
    dir: "",
    ext: "",
  });

  // Trailing dot and single/double dot edge cases
  assert.deepEqual(splitPathInfo("foo."), {
    base: "foo.",
    dir: "",
    ext: "",
  });
  assert.deepEqual(splitPathInfo("."), {
    base: ".",
    dir: "",
    ext: "",
  });
  assert.deepEqual(splitPathInfo(".."), {
    base: "..",
    dir: "",
    ext: "",
  });

  // Empty or invalid input
  assert.deepEqual(splitPathInfo(""), { base: "", dir: "", ext: "" });
  assert.deepEqual(splitPathInfo(null), { base: "", dir: "", ext: "" });
  assert.deepEqual(splitPathInfo(undefined), { base: "", dir: "", ext: "" });
});

test("normalizeTabTarget - cleans up root and file parameters", () => {
  // Standard folder and relative file
  assert.deepEqual(normalizeTabTarget({ folder: "/work/repo", file: "src/main.js" }), {
    root: "/work/repo",
    file: "src/main.js",
  });

  // Trailing slashes on root and cwd
  assert.deepEqual(normalizeTabTarget({ cwd: "/work/repo///", file: "README.md" }), {
    root: "/work/repo",
    file: "README.md",
  });

  // Absolute file with no root splits directory and basename
  assert.deepEqual(normalizeTabTarget({ file: "/Users/dev/project/index.js" }), {
    root: "/Users/dev/project",
    file: "index.js",
  });

  // File prefixed with root is stripped to relative path
  assert.deepEqual(normalizeTabTarget({ folder: "/work/repo", file: "/work/repo/src/app.js" }), {
    root: "/work/repo",
    file: "src/app.js",
  });

  // Windows backslash normalization
  assert.deepEqual(normalizeTabTarget({ folder: "C:\\work\\repo\\", file: "src\\app.js" }), {
    root: "C:/work/repo",
    file: "src/app.js",
  });

  // Empty and missing props
  assert.deepEqual(normalizeTabTarget({}), { root: "", file: "" });
  assert.deepEqual(normalizeTabTarget(null), { root: "", file: "" });
});

test("detectLanguage - identifies common languages and special filenames", () => {
  assert.deepEqual(detectLanguage("main.js"), { language: "js", label: "JavaScript" });
  assert.deepEqual(detectLanguage("app.ts"), { language: "js", label: "TypeScript" });
  assert.deepEqual(detectLanguage("App.jsx"), { language: "js", label: "JSX" });
  assert.deepEqual(detectLanguage("Component.tsx"), { language: "js", label: "TSX" });
  assert.deepEqual(detectLanguage("data.json"), { language: "json", label: "JSON" });
  assert.deepEqual(detectLanguage("doc.md"), { language: "markdown", label: "Markdown" });
  assert.deepEqual(detectLanguage("main.rs"), { language: "rust", label: "Rust" });
  assert.deepEqual(detectLanguage("script.py"), { language: "python", label: "Python" });
  assert.deepEqual(detectLanguage("server.go"), { language: "go", label: "Go" });
  assert.deepEqual(detectLanguage("style.css"), { language: "css", label: "CSS" });
  assert.deepEqual(detectLanguage("config.yaml"), { language: "yaml", label: "YAML" });
  assert.deepEqual(detectLanguage("deploy.sh"), { language: "bash", label: "Shell" });

  // Special files
  assert.deepEqual(detectLanguage("Dockerfile"), { language: "dockerfile", label: "Dockerfile" });
  assert.deepEqual(detectLanguage("dockerfile"), { language: "dockerfile", label: "Dockerfile" });
  assert.deepEqual(detectLanguage("Makefile"), { language: "makefile", label: "Makefile" });
  assert.deepEqual(detectLanguage("CMakeLists.txt"), { language: "cmake", label: "CMake" });
  assert.deepEqual(detectLanguage(".gitignore"), { language: "text", label: "Gitignore" });

  // Case-insensitivity in extension
  assert.deepEqual(detectLanguage("NOTES.MD"), { language: "markdown", label: "Markdown" });
  assert.deepEqual(detectLanguage("INDEX.JS"), { language: "js", label: "JavaScript" });

  // Fallbacks
  assert.deepEqual(detectLanguage("custom.xyz"), { language: "xyz", label: "XYZ" });
  assert.deepEqual(detectLanguage("UNKNOWN"), { language: "text", label: "Text" });
});

test("isMarkdownFile - detects markdown extensions case-insensitively", () => {
  assert.equal(isMarkdownFile("README.md"), true);
  assert.equal(isMarkdownFile("guide.markdown"), true);
  assert.equal(isMarkdownFile("page.mdx"), true);
  assert.equal(isMarkdownFile("DOC.MD"), true);
  assert.equal(isMarkdownFile("sub/folder/notes.markdown"), true);

  assert.equal(isMarkdownFile("main.js"), false);
  assert.equal(isMarkdownFile("style.css"), false);
  assert.equal(isMarkdownFile("Makefile"), false);
  assert.equal(isMarkdownFile(""), false);
  assert.equal(isMarkdownFile(null), false);
});

test("defaultViewMode - markdown defaults to preview, others to code", () => {
  // Markdown
  assert.equal(defaultViewMode("README.md"), "preview");
  assert.equal(defaultViewMode("README.md", "preview"), "preview");
  assert.equal(defaultViewMode("README.md", "code"), "code");

  // Non-markdown (always code)
  assert.equal(defaultViewMode("main.js"), "code");
  assert.equal(defaultViewMode("main.js", "preview"), "code");
  assert.equal(defaultViewMode("style.css", "code"), "code");
  assert.equal(defaultViewMode("data.json"), "code");
});

test("prepareFileText - handles missing, binary, normal, trailing newlines, and truncated text", () => {
  // Missing file
  const missingNull = prepareFileText(null);
  assert.equal(missingNull.error, "This file is no longer available");
  assert.equal(missingNull.text, null);

  const missingUndef = prepareFileText(undefined);
  assert.equal(missingUndef.error, "This file is no longer available");

  // Non-string input
  const nonString = prepareFileText(12345);
  assert.equal(nonString.error, "Cannot preview this file (binary, too large, or unreadable)");

  // Binary file
  const binary = prepareFileText("hello\0world");
  assert.equal(binary.error, "Binary file · no text preview");
  assert.equal(binary.isBinary, true);
  assert.equal(binary.text, null);

  // Empty file
  const empty = prepareFileText("");
  assert.equal(empty.error, null);
  assert.equal(empty.text, "");
  assert.equal(empty.lineCount, 0);
  assert.equal(empty.isTruncated, false);

  // Normal text without trailing newline
  const normalNoTrailing = prepareFileText("line 1\nline 2\nline 3");
  assert.equal(normalNoTrailing.error, null);
  assert.equal(normalNoTrailing.text, "line 1\nline 2\nline 3");
  assert.equal(normalNoTrailing.lineCount, 3);

  // Trailing newline subtraction (matching Editor gutter)
  const singleTrailing = prepareFileText("hello\n");
  assert.equal(singleTrailing.lineCount, 1);

  const multiTrailing = prepareFileText("a\nb\n");
  assert.equal(multiTrailing.lineCount, 2);

  const justNewline = prepareFileText("\n");
  assert.equal(justNewline.lineCount, 1);

  // Truncated text
  const longText = "a".repeat(100);
  const truncated = prepareFileText(longText, 50);
  assert.equal(truncated.error, null);
  assert.equal(truncated.isTruncated, true);
  assert.equal(truncated.text, "a".repeat(50) + "\n… (file truncated)");
});

test("shouldReloadWatchedFile - filters batch change events accurately", () => {
  const root = "/work/repo";
  const file = "src/main.js";

  // Batch overflow or empty/null signal -> always reloads
  assert.equal(shouldReloadWatchedFile(null, root, file), true);
  assert.equal(shouldReloadWatchedFile([], root, file), true);
  assert.equal(shouldReloadWatchedFile([root], root, file), true);

  // Exact file match
  assert.equal(shouldReloadWatchedFile([`${root}/${file}`], root, file), true);

  // Parent directory of the file changed
  assert.equal(shouldReloadWatchedFile([`${root}/src`], root, file), true);

  // Unrelated file changed -> do not reload
  assert.equal(shouldReloadWatchedFile([`${root}/package.json`, `${root}/README.md`], root, file), false);

  // Multiple changes with one relevant
  assert.equal(shouldReloadWatchedFile([`${root}/package.json`, `${root}/${file}`], root, file), true);
});

test("contentHash - produces deterministic djb2 hashes", () => {
  const h1 = contentHash("const x = 1;");
  const h2 = contentHash("const x = 1;");
  const h3 = contentHash("const x = 2;");

  assert.equal(typeof h1, "string");
  assert.equal(h1.length > 0, true);
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);

  assert.equal(contentHash(""), "45h");
  assert.equal(contentHash(null), "45h");
});

test("splitMarkdownChunks - splits markdown and preserves content across syntax edge cases", () => {
  // Empty & non-string
  assert.deepEqual(splitMarkdownChunks(""), [""]);
  assert.deepEqual(splitMarkdownChunks(null), [""]);

  // Short markdown remains single chunk
  const shortMd = "# Title\n\nParagraph 1.\n\nParagraph 2.";
  assert.deepEqual(splitMarkdownChunks(shortMd), [shortMd]);

  // CRLF stays in one chunk
  const crlfMd = "# Title\r\n\r\nParagraph with CRLF.";
  assert.deepEqual(splitMarkdownChunks(crlfMd), [crlfMd]);

  // Footnote bailout
  const footnoteMd = "A line with[^1] a footnote.";
  assert.deepEqual(splitMarkdownChunks(footnoteMd), [footnoteMd]);

  // Document-wide syntax bailouts (HTML block, math, container)
  const htmlMd = "<div>\ncustom block\n</div>";
  assert.deepEqual(splitMarkdownChunks(htmlMd), [htmlMd]);

  const mathMd = "$$\nx^2 + y^2 = z^2\n$$";
  assert.deepEqual(splitMarkdownChunks(mathMd), [mathMd]);

  const containerMd = "::: info\nNotice\n:::";
  assert.deepEqual(splitMarkdownChunks(containerMd), [containerMd]);

  // Long markdown (> 1200 chars) splits at blank lines
  const para1 = "Alpha ".repeat(250) + "\n\n";
  const para2 = "Beta ".repeat(250) + "\n\n";
  const para3 = "Gamma ".repeat(50);
  const full = para1 + para2 + para3;
  const chunks = splitMarkdownChunks(full);

  assert.equal(chunks.length > 1, true);
  assert.equal(chunks.join(""), full);

  // Backtick and Tilde code fences are preserved intact
  const tildeFence = "~~~sh\necho 'hello'\n".repeat(80) + "~~~\n\n";
  const tildeFull = tildeFence + para2;
  const tildeChunks = splitMarkdownChunks(tildeFull);
  assert.equal(tildeChunks.join(""), tildeFull);

  // Unclosed fence does not crash
  const unclosed = "```js\nconst a = 1;\n" + "x ".repeat(600);
  assert.deepEqual(splitMarkdownChunks(unclosed), [unclosed]);

  // List continuation after blank line does not break block
  const listContinuation = "1. First item\n\n   Continuation paragraph of first item\n\n2. Second item";
  assert.deepEqual(splitMarkdownChunks(listContinuation), [listContinuation]);
});

test("buildSyntaxTheme - maps ANSI colors correctly with fallbacks", () => {
  const theme = {
    ansi1: "#bf616a",
    ansi2: "#a3be8c",
    ansi3: "#ebcb8b",
    ansi4: "#81a1c1",
    ansi5: "#b48ead",
    ansi6: "#88c0d0",
    dim: "#616e88",
  };

  const syntax = buildSyntaxTheme(theme);
  assert.equal(syntax.keyword, "#b48ead");
  assert.equal(syntax.string, "#a3be8c");
  assert.equal(syntax.comment, "#616e88");
  assert.equal(syntax.function, "#81a1c1");
  assert.equal(syntax.type, "#ebcb8b");
  assert.equal(syntax.number, "#bf616a");
  assert.equal(syntax.constant, "#88c0d0");

  // Fallbacks
  const fallback = buildSyntaxTheme({});
  assert.equal(typeof fallback.keyword, "string");
  assert.equal(typeof fallback.string, "string");
});

test("resolveLocationState - honors precedence, machine on, and previousCwd rules", () => {
  const spaces = [
    { id: "space-1", folder: "/spaces/space-1", machine: null, active: true },
    { id: "space-2", folder: "/spaces/space-2", machine: "server1", active: false },
  ];

  // 1. props.folder / props.cwd takes top precedence
  const rProps = resolveLocationState({
    props: { folder: "/custom/folder" },
    spaces,
    focused: { space: "space-1", cwd: "/focused/dir" },
    pinnedLocations: { "space-1": "/pinned/space-1" },
  });
  assert.equal(rProps.cwd, "/custom/folder");

  // 2. pinnedLocations takes second precedence
  const rPinned = resolveLocationState({
    props: {},
    spaces,
    focused: { space: "space-1", cwd: "/focused/dir" },
    pinnedLocations: { "space-1": "/pinned/space-1" },
  });
  assert.equal(rPinned.cwd, "/pinned/space-1");

  // 3. focused pane cwd when focused.space === space.id
  const panes = [
    { pane: "p1", cwd: "/pane/cwd", terminal: "t1" },
    { pane: "p_mod", cwd: null, terminal: null },
  ];
  const rFocused = resolveLocationState({
    props: {},
    spaces,
    focused: { space: "space-1", pane: "p1", cwd: "/focused/fallback" },
    panes,
    pinnedLocations: {},
  });
  assert.equal(rFocused.cwd, "/pane/cwd");

  // 4. Fallback to f.cwd when f.pane is not found in panes
  const rPaneNotFound = resolveLocationState({
    props: {},
    spaces,
    focused: { space: "space-1", pane: "unknown_p", cwd: "/focused/direct" },
    panes,
  });
  assert.equal(rPaneNotFound.cwd, "/focused/direct");

  // 5. Preserving previousCwd when focusing a mod tab in the same space
  const rModPane = resolveLocationState({
    props: {},
    spaces,
    focused: { space: "space-1", pane: "p_mod", cwd: null },
    panes,
    previousCwd: "/remembered/project",
    previousSpace: "space-1",
  });
  assert.equal(rModPane.cwd, "/remembered/project");

  // 6. previousCwd ignored if space has changed
  const rModPaneOtherSpace = resolveLocationState({
    props: {},
    spaces,
    focused: { space: "space-1", pane: "p_mod", cwd: null },
    panes,
    previousCwd: "/remembered/project",
    previousSpace: "space-2",
  });
  assert.equal(rModPaneOtherSpace.cwd, "/spaces/space-1");

  // 7. focused cwd ignored when focused.space !== space.id -> falls back to space.folder
  const rInactiveFocus = resolveLocationState({
    props: {},
    spaces,
    focused: { space: "space-2", cwd: "/other/cwd" },
    panes: [],
    pinnedLocations: {},
  });
  assert.equal(rInactiveFocus.cwd, "/spaces/space-1");

  // 8. Remote "on" machine leaks prevented:
  // f in inactive space with terminal prefix must NOT leak to active space
  const rInactiveTerminalLeak = resolveLocationState({
    props: {},
    spaces,
    focused: { space: "space-2", pane: null, terminal: "remoteA/t1" },
  });
  assert.equal(rInactiveTerminalLeak.on, null);

  // Local terminal on remote space active -> space.machine
  const remoteSpaces = [
    { id: "space-rem", folder: "/remote/dir", machine: "remoteB", active: true },
  ];
  const rLocalTerminalOnRemote = resolveLocationState({
    props: {},
    spaces: remoteSpaces,
    focused: { space: "space-rem", pane: null, terminal: "t1" },
  });
  assert.equal(rLocalTerminalOnRemote.on, "remoteB");

  // Active space remote terminal prefix used when valid
  const rActiveRemoteTerminal = resolveLocationState({
    props: {},
    spaces: remoteSpaces,
    focused: { space: "space-rem", pane: null, terminal: "remoteC/t1" },
  });
  assert.equal(rActiveRemoteTerminal.on, "remoteC");

  // Explicit props.on overrides all
  const rExplicitOn = resolveLocationState({
    props: { on: "custom-host" },
    spaces,
    focused: null,
  });
  assert.equal(rExplicitOn.on, "custom-host");
});

test("resolveFileTab - manages cross-space tabs, strict tabId matching, and iterative disambiguation", () => {
  const rootA = "/work/repoA";
  const rootB = "/work/repoB";

  // Case 1: First file open -> creates tab with basename
  const r1 = resolveFileTab("src/index.js", rootA, [], {});
  assert.equal(r1.existingTabId, null);
  assert.equal(r1.tabName, "index.js");
  assert.equal(r1.updatedOpenTabs[`${rootA}/src/index.js`].tabName, "index.js");

  // Case 2: Cross-space tab preservation during pruning:
  // Entries from rootB must NOT be pruned when resolveFileTab is called with rootA and activeTabs from spaceA
  const openTabsMultiSpace = {
    [`${rootA}/src/index.js`]: { root: rootA, file: "src/index.js", tabName: "index.js", tabId: "tab-A1" },
    [`${rootB}/src/index.js`]: { root: rootB, file: "src/index.js", tabName: "index.js", tabId: "tab-B1" },
  };
  const activeTabsA = [{ id: "tab-A1", name: "index.js", settled: false, active: true }];
  const rCross = resolveFileTab("src/index.js", rootA, activeTabsA, openTabsMultiSpace);
  assert.equal(rCross.existingTabId, "tab-A1");
  // rootB entry is preserved intact!
  assert.equal(Boolean(rCross.updatedOpenTabs[`${rootB}/src/index.js`]), true);
  assert.equal(rCross.updatedOpenTabs[`${rootB}/src/index.js`].tabId, "tab-B1");

  // Case 3: Strict tabId matching:
  // If tabId is recorded as tab-1, but tab-1 was closed and a new unrelated tab is named "index.js" (tab-99),
  // it must NOT match tab-99!
  const staleTabMap = {
    [`${rootA}/src/index.js`]: { root: rootA, file: "src/index.js", tabName: "index.js", tabId: "tab-old" },
  };
  const activeTabsNew = [{ id: "tab-99", name: "index.js", settled: false, active: true }];
  const rStrict = resolveFileTab("src/index.js", rootA, activeTabsNew, staleTabMap);
  assert.equal(rStrict.existingTabId, null);
  // Disambiguates because tab-99 has name "index.js"
  assert.equal(rStrict.tabName, "src/index.js");

  // Case 4: Iterative disambiguation with counters:
  // When both base ("index.js") and dir/base ("lib/index.js") collide with live tabs
  const collidingTabs = [
    { id: "t1", name: "index.js", settled: false },
    { id: "t2", name: "lib/index.js", settled: false },
    { id: "t3", name: "lib/index.js (2)", settled: false },
  ];
  const rCounter = resolveFileTab("lib/index.js", rootA, collidingTabs, {});
  assert.equal(rCounter.existingTabId, null);
  assert.equal(rCounter.tabName, "lib/index.js (3)");

  // Case 5: Settled tabs are not treated as active matches
  const settledTabs = [{ id: "tab-1", name: "index.js", settled: true, active: false }];
  const rSettled = resolveFileTab("src/index.js", rootA, settledTabs, {
    [`${rootA}/src/index.js`]: { root: rootA, file: "src/index.js", tabName: "index.js", tabId: "tab-1" },
  });
  assert.equal(rSettled.existingTabId, null);
  assert.equal(rSettled.tabName, "index.js");
});

test("mergeOpenTabEntry - keeps recorded tabName and tabId when opened without a pane (R2-1)", () => {
  const existing = { root: "/r", file: "lib/index.js", tabName: "lib/index.js", tabId: "tab-7" };
  const merged = mergeOpenTabEntry(existing, { root: "/r", file: "lib/index.js", tabName: null, tabId: null });
  assert.deepEqual(merged, { root: "/r", file: "lib/index.js", tabName: "lib/index.js", tabId: "tab-7" });
});

test("mergeOpenTabEntry - fresh pane-derived name and tabId win over recorded values", () => {
  const existing = { root: "/r", file: "a.js", tabName: "old", tabId: "tab-1" };
  const merged = mergeOpenTabEntry(existing, { root: "/r", file: "a.js", tabName: "new", tabId: "tab-2" });
  assert.deepEqual(merged, { root: "/r", file: "a.js", tabName: "new", tabId: "tab-2" });
});

test("mergeOpenTabEntry - falls back to basename and omits tabId when nothing is known", () => {
  const merged = mergeOpenTabEntry(undefined, { root: "/r", file: "src/main.js", tabName: null, tabId: null });
  assert.deepEqual(merged, { root: "/r", file: "src/main.js", tabName: "main.js" });
  assert.equal("tabId" in merged, false);
});
