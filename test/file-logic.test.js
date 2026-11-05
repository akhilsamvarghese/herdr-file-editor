import test from "node:test";
import assert from "node:assert/strict";
import {
  splitPathInfo,
  detectLanguage,
  isMarkdownFile,
  defaultViewMode,
  prepareFileText,
  contentHash,
  splitMarkdownChunks,
  buildSyntaxTheme,
  resolveLocationState,
  resolveLocation,
  resolveFileTab,
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

  // Empty or invalid input
  assert.deepEqual(splitPathInfo(""), { base: "", dir: "", ext: "" });
  assert.deepEqual(splitPathInfo(null), { base: "", dir: "", ext: "" });
  assert.deepEqual(splitPathInfo(undefined), { base: "", dir: "", ext: "" });
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

test("prepareFileText - handles missing, binary, normal, and truncated text", () => {
  // Missing file
  const missingNull = prepareFileText(null);
  assert.equal(missingNull.error, "This file is no longer available");
  assert.equal(missingNull.text, null);

  const missingUndef = prepareFileText(undefined);
  assert.equal(missingUndef.error, "This file is no longer available");

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

  // Normal text
  const normal = prepareFileText("line 1\nline 2\nline 3");
  assert.equal(normal.error, null);
  assert.equal(normal.text, "line 1\nline 2\nline 3");
  assert.equal(normal.lineCount, 3);
  assert.equal(normal.isTruncated, false);

  // Truncated text
  const longText = "a".repeat(100);
  const truncated = prepareFileText(longText, 50);
  assert.equal(truncated.error, null);
  assert.equal(truncated.isTruncated, true);
  assert.equal(truncated.text, "a".repeat(50) + "\n… (file truncated)");
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

test("splitMarkdownChunks - splits markdown and preserves content", () => {
  // Empty
  assert.deepEqual(splitMarkdownChunks(""), [""]);

  // Short markdown remains single chunk
  const shortMd = "# Title\n\nParagraph 1.\n\nParagraph 2.";
  assert.deepEqual(splitMarkdownChunks(shortMd), [shortMd]);

  // CRLF stays in one chunk
  const crlfMd = "# Title\r\n\r\nParagraph with CRLF.";
  assert.deepEqual(splitMarkdownChunks(crlfMd), [crlfMd]);

  // Long markdown (> 1200 chars) splits at blank lines
  const para1 = "Alpha ".repeat(250) + "\n\n";
  const para2 = "Beta ".repeat(250) + "\n\n";
  const para3 = "Gamma ".repeat(50);
  const full = para1 + para2 + para3;
  const chunks = splitMarkdownChunks(full);

  assert.equal(chunks.length > 1, true);
  assert.equal(chunks.join(""), full);

  // Fences are not broken
  const fence = "```js\n" + "console.log('hi');\n".repeat(100) + "```\n\n";
  const fenceFull = fence + para2;
  const fenceChunks = splitMarkdownChunks(fenceFull);
  assert.equal(fenceChunks.join(""), fenceFull);
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

test("resolveLocationState - honors precedence rules", () => {
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
  const panes = [{ pane: "p1", cwd: "/pane/cwd" }];
  const rFocused = resolveLocationState({
    props: {},
    spaces,
    focused: { space: "space-1", pane: "p1", cwd: "/focused/fallback" },
    panes,
    pinnedLocations: {},
  });
  assert.equal(rFocused.cwd, "/pane/cwd");

  // 4. focused cwd ignored when focused.space !== space.id -> falls back to space.folder
  const rInactiveFocus = resolveLocationState({
    props: {},
    spaces,
    focused: { space: "space-2", cwd: "/other/cwd" },
    panes: [],
    pinnedLocations: {},
  });
  assert.equal(rInactiveFocus.cwd, "/spaces/space-1");

  // 5. Machine "on" resolution
  const rRemoteTerminal = resolveLocationState({
    props: {},
    spaces,
    focused: { space: "space-1", pane: null, terminal: "my-remote/term-1" },
  });
  assert.equal(rRemoteTerminal.on, "my-remote");

  const rPropsOn = resolveLocationState({
    props: { on: "explicit-host" },
    spaces,
    focused: null,
  });
  assert.equal(rPropsOn.on, "explicit-host");

  // Wrapper resolveLocation
  const rWrap = resolveLocation({ folder: "/wrap/test" }, spaces, null, [], {});
  assert.equal(rWrap.cwd, "/wrap/test");
});

test("resolveFileTab - manages tab deduplication, disambiguation, and pruning", () => {
  const root = "/work/repo";

  // Case 1: First file open -> creates tab with basename
  const r1 = resolveFileTab("src/index.js", root, [], {});
  assert.equal(r1.existingTabId, null);
  assert.equal(r1.tabName, "index.js");
  assert.equal(r1.updatedOpenTabs[`${root}/src/index.js`].tabName, "index.js");

  // Case 2: File is already open in an active tab -> selects existing
  const activeTabs = [{ id: "tab-1", name: "index.js", settled: false, active: true }];
  const r2 = resolveFileTab("src/index.js", root, activeTabs, r1.updatedOpenTabs);
  assert.equal(r2.existingTabId, "tab-1");
  assert.equal(r2.tabName, "index.js");

  // Case 3: Another file with same basename opens -> disambiguates with parent folder
  const r3 = resolveFileTab("lib/index.js", root, activeTabs, r2.updatedOpenTabs);
  assert.equal(r3.existingTabId, null);
  assert.equal(r3.tabName, "lib/index.js");
  assert.equal(r3.updatedOpenTabs[`${root}/lib/index.js`].tabName, "lib/index.js");

  // Case 4: Settled tabs are not treated as active matches
  const settledTabs = [{ id: "tab-1", name: "index.js", settled: true, active: false }];
  const r4 = resolveFileTab("src/index.js", root, settledTabs, r2.updatedOpenTabs);
  assert.equal(r4.existingTabId, null);
  assert.equal(r4.tabName, "index.js");

  // Case 5: Root file with conflict disambiguates with repo folder
  const r5 = resolveFileTab("README.md", root, [{ id: "t2", name: "README.md", settled: false }], {});
  assert.equal(r5.existingTabId, null);
  assert.equal(r5.tabName, "repo/README.md");
});
