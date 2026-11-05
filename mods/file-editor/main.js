/**
 * Herdr File Editor Mod (Dual-Mode: Files Pane Tree & Dedicated File Viewer Tab).
 *
 * Mode 1 (Files Pane): When props().file is not set, renders the directory browser tree.
 * Clicking a file opens it in its own Herdr tab via run("tab.new", { mod: "file-editor", ... }).
 *
 * Mode 2 (File Editor Tab): When props().file is set, renders a full-pane editor tab with:
 * - Syntax highlighting (Editor / EditorState) for code and configuration files.
 * - GitHub-style Markdown preview (markdown-view.js) for .md / .markdown / .mdx.
 * - Soft-wrap toggle, copy button, file reload, and live disk watching.
 */

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import {
  spaces,
  panes,
  focused,
  exec,
  readTextFile,
  watchFolder,
  theme,
  settings,
  window,
  run,
  shared,
  setShared,
  notify,
  props,
} from "herdr";
import {
  splitPathInfo,
  normalizeTabTarget,
  detectLanguage,
  isMarkdownFile,
  defaultViewMode,
  prepareFileText,
  shouldReloadWatchedFile,
  buildSyntaxTheme,
  resolveLocationState,
  resolveFileTab,
  mergeOpenTabEntry,
} from "./file-logic.js";
import { renderMarkdownDocument } from "./markdown-view.js";

/** Max entries displayed per directory and total tree bounds. */
const PER_FOLDER = 500;
const TOTAL = 5000;

/**
 * Lists the contents of a directory using PowerShell on Windows and POSIX sh on Unix/macOS.
 *
 * @param {string} path - Absolute directory path.
 * @param {string | null} on - Remote machine target if applicable.
 * @returns {Promise<Array<{ name: string, dir: boolean }>>}
 */
async function directory(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses console code page; exec decodes UTF-8.
    const r = await exec(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" +
          path.replace(/['‘’‚‛]/g, "$&$&") +
          "'",
      ],
      { on }
    );
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };

  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script =
    'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try {
    r = await exec("sh", ["-c", script, "files", path], { on });
  } catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0");
  const out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  }
  return out;
}

export default class FileEditor extends View {
  /**
   * Initializes the view based on whether props().file is provided.
   *
   * @param {Record<string, any>} _props
   * @param {import("gpui-kit").ViewContext} cx
   */
  init(_props, cx) {
    this.closed = false;
    const p = props() || {};
    this.tabMode = typeof p.file === "string" && p.file.length > 0;

    if (this.tabMode) {
      this.initTabMode(p, cx);
    } else {
      this.initPaneMode(p, cx);
    }
  }

  /**
   * Lifecycle cleanup: marks view closed, releases EditorState, and invalidates active watchers.
   *
   * @param {import("gpui-kit").AsyncContext} _cx
   */
  async close(_cx) {
    this.closed = true;
    this.watched = null;
    this.watchToken = null;
    this.editorSignature = null;
    if (this.code) {
      this.code.release();
      this.code = null;
    }
  }

  /* ========================================================================
   * Tab Mode Implementation
   * ======================================================================== */

  /**
   * Sets up state and listeners for dedicated file viewer tab mode.
   *
   * @param {Record<string, any>} p
   * @param {import("gpui-kit").ViewContext} cx
   */
  initTabMode(p, cx) {
    const { root, file } = normalizeTabTarget(p);
    this.file = file;
    this.root = root;
    this.on = typeof p.on === "string" ? p.on : null;

    const requestedMode = typeof p.viewMode === "string" ? p.viewMode : null;
    this.viewMode = defaultViewMode(this.file, requestedMode);

    this.explicitWrap = typeof p.wrap === "boolean";
    const savedWrap = shared("file-editor.wrap");
    this.wrap = this.explicitWrap ? p.wrap : savedWrap === true;

    this.rawText = null;
    this.preparedText = null;
    this.fileError = null;
    this.lineCount = 0;
    this.isBinary = false;
    this.isTruncated = false;
    this.loading = false;
    this.reloadPending = false;
    this.code = null;
    this.editorSignature = null;
    this.watched = null;
    this.watchToken = null;

    // Register this open tab in shared state
    this.registerOpenTab(p);

    this.loadFile(cx);
    this.watchTab(this.root, cx);

    // Sync theme, font, and shared wrap setting periodically
    cx.timer.every(500, (cx) => this.syncTabConfig(cx));
  }

  /**
   * Records this open tab in shared("file-editor.openTabs").
   *
   * @param {Record<string, any>} p
   */
  registerOpenTab(p) {
    const fileKey = this.root ? `${this.root}/${this.file}` : this.file;
    const openTabsMap = shared("file-editor.openTabs") || {};
    let tabId = null;
    let tabName = null;

    if (p.pane) {
      const matchedPane = (panes() || []).find((pn) => pn.pane === p.pane);
      if (matchedPane?.tab) {
        tabId = matchedPane.tab;
        for (const sp of spaces() || []) {
          const foundTab = (sp.tabs || []).find((t) => t.id === tabId);
          if (foundTab?.name) {
            tabName = foundTab.name;
            break;
          }
        }
      }
    }

    const updatedOpenTabs = {
      ...openTabsMap,
      [fileKey]: mergeOpenTabEntry(openTabsMap[fileKey], {
        root: this.root,
        file: this.file,
        tabName,
        tabId,
      }),
    };
    setShared("file-editor.openTabs", updatedOpenTabs);
  }

  /**
   * Synchronizes active EditorState with theme, font settings, and shared wrap.
   *
   * @param {import("gpui-kit").ViewContext} cx
   */
  syncTabConfig(cx) {
    if (this.closed) return;

    let changed = false;
    if (!this.explicitWrap) {
      const sharedWrap = shared("file-editor.wrap") === true;
      if (this.wrap !== sharedWrap) {
        this.wrap = sharedWrap;
        changed = true;
      }
    }

    const isCodeView = !isMarkdownFile(this.file) || this.viewMode === "code";
    if (isCodeView && this.preparedText !== null && !this.isBinary) {
      const appSettings = settings() || {};
      const syntax = buildSyntaxTheme(theme());
      const sig = JSON.stringify({
        file: this.file,
        text: this.preparedText,
        wrap: this.wrap,
        font: appSettings.font_family,
        syntax,
      });

      if (!this.code || this.editorSignature !== sig) {
        this.rebuildEditor();
        changed = true;
      }
    }

    if (changed) {
      cx.notify();
    }
  }

  /**
   * Reads file contents from disk off the UI thread and prepares display state.
   * Queues concurrent reload requests rather than dropping them.
   *
   * @param {import("gpui-kit").ViewContext} cx
   */
  loadFile(cx) {
    if (!this.file || this.closed) return;
    if (this.loading) {
      this.reloadPending = true;
      return;
    }
    this.loading = true;
    const root = this.root;
    const file = this.file;
    const on = this.on;
    const fullPath = root ? `${root}/${file}` : file;

    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(fullPath, { on });
        if (this.closed) return;
        const { error, text: preparedText, lineCount, isBinary, isTruncated } = prepareFileText(text);

        this.rawText = isBinary ? null : text;
        this.preparedText = preparedText;
        this.fileError = error;
        this.lineCount = lineCount;
        this.isBinary = isBinary;
        this.isTruncated = isTruncated;

        if (this.preparedText !== null && !this.isBinary) {
          if (!isMarkdownFile(this.file) || this.viewMode === "code") {
            this.rebuildEditor();
          } else {
            this.code?.release();
            this.code = null;
            this.editorSignature = null;
          }
        } else {
          this.code?.release();
          this.code = null;
          this.editorSignature = null;
        }
      } catch {
        this.fileError = "Cannot preview this file (binary, too large, or unreadable)";
        this.rawText = null;
        this.preparedText = null;
        this.lineCount = 0;
        this.isBinary = false;
        this.isTruncated = false;
        this.code?.release();
        this.code = null;
        this.editorSignature = null;
      } finally {
        this.loading = false;
        cx.notify();
        if (this.reloadPending && !this.closed) {
          this.reloadPending = false;
          this.loadFile(cx);
        }
      }
    });
  }

  /**
   * Recreates the EditorState instance outside render() to preserve GPUI invariants.
   * Uses signature caching to preserve scroll/selection/fold state across identical reloads.
   */
  rebuildEditor() {
    if (this.preparedText === null || this.isBinary) {
      this.code?.release();
      this.code = null;
      this.editorSignature = null;
      return;
    }

    if (isMarkdownFile(this.file) && this.viewMode !== "code") {
      this.code?.release();
      this.code = null;
      this.editorSignature = null;
      return;
    }

    const { language } = detectLanguage(this.file);
    const t = theme();
    const appSettings = settings() || {};
    const syntax = buildSyntaxTheme(t);

    const sig = JSON.stringify({
      file: this.file,
      text: this.preparedText,
      wrap: this.wrap,
      font: appSettings.font_family,
      syntax,
    });

    if (this.code && this.editorSignature === sig) {
      return;
    }

    this.code?.release();
    this.code = null;

    this.code = EditorState.new({
      language,
      value: this.preparedText,
      readonly: true,
      line_numbers: true,
      folding: true,
      soft_wrap: this.wrap,
      font_family: appSettings.font_family,
      font_size: 13,
      syntax,
    });
    this.editorSignature = sig;
  }

  /**
   * Toggles soft wrapping, persists setting in shared state, and rebuilds editor.
   *
   * @param {boolean} wrap
   * @param {import("gpui-kit").ViewContext} cx
   */
  setWrap(wrap, cx) {
    if (this.wrap === wrap) return;
    this.wrap = wrap;
    setShared("file-editor.wrap", wrap);
    this.rebuildEditor();
    cx.notify();
  }

  /**
   * Toggles Markdown preview vs. raw code view mode.
   *
   * @param {"preview" | "code"} mode
   * @param {import("gpui-kit").ViewContext} cx
   */
  setViewMode(mode, cx) {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    if (mode === "code" && !this.code) {
      this.rebuildEditor();
    }
    cx.notify();
  }

  /**
   * Watches the root workspace folder to reload the active tab when modified externally.
   * Filters change events using shouldReloadWatchedFile to avoid unnecessary reloads.
   *
   * @param {string} root
   * @param {import("gpui-kit").ViewContext} cx
   */
  watchTab(root, cx) {
    if (this.on || !root || this.watched === root) return;
    this.watched = root;
    const token = (this.watchToken = {});
    cx.spawn(async (cx) => {
      try {
        while (this.watchToken === token && !this.closed) {
          const changed = await watchFolder(root);
          if (this.watchToken === token && !this.closed) {
            if (shouldReloadWatchedFile(changed, root, this.file)) {
              this.loadFile(cx);
            }
          }
        }
      } catch {
        if (this.watchToken === token) {
          this.watched = null;
          this.watchToken = null;
        }
      }
    });
  }

  /**
   * Renders the full-size file editor tab (header toolbar + code or markdown view).
   *
   * @param {import("gpui-kit").ViewContext} cx
   * @returns {import("gpui-kit").Element}
   */
  renderFileTab(cx) {
    const t = theme();
    const { base, dir } = splitPathInfo(this.file);
    const isMarkdown = isMarkdownFile(this.file);
    const { label: langLabel } = detectLanguage(this.file);
    const lineLabel = `${this.lineCount} line${this.lineCount === 1 ? "" : "s"} · ${langLabel}`;
    const isCodeView = !isMarkdown || this.viewMode === "code";

    return v_flex()
      .id("file-editor-tab")
      .size_full()
      .min_h(0)
      .bg(t.background)
      .text_color(t.foreground)
      .text_size(13)
      .child(
        h_flex()
          .h(38)
          .flex_none()
          .px(12)
          .gap(8)
          .items_center()
          .bg(t.chrome)
          .border_b(1)
          .border_color(t.border)
          .child(svg("mods/file-editor/file.svg").size(14).flex_none().text_color(t.muted))
          .child(div().font_semibold().text_size(12.5).truncate().child(base))
          .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(dir))
          .child(
            div()
              .flex_none()
              .px(6)
              .py(1)
              .rounded(4)
              .bg(t.raised)
              .text_size(10)
              .text_color(t.muted)
              .child(lineLabel)
          )
          .child(
            div()
              .flex_none()
              .px(6)
              .py(1)
              .rounded(4)
              .bg(t.raised)
              .text_size(10)
              .text_color(t.dim)
              .child("Read-only")
          )
          .when(isMarkdown, (e) =>
            e.child(
              h_flex()
                .flex_none()
                .items_center()
                .gap(2)
                .p(2)
                .rounded(6)
                .bg(t.raised)
                .child(
                  div()
                    .id("file-view-preview")
                    .px(7)
                    .py(2)
                    .rounded(4)
                    .text_size(10)
                    .cursor_pointer()
                    .when(this.viewMode === "preview", (btn) => btn.bg(t.selected).text_color(t.foreground))
                    .when(this.viewMode !== "preview", (btn) => btn.text_color(t.dim))
                    .hover((s) => s.bg(this.viewMode === "preview" ? t.selected : t.hover))
                    .tooltip("Rendered Markdown preview")
                    .on_click((_e, cx) => this.setViewMode("preview", cx))
                    .child("Preview")
                )
                .child(
                  div()
                    .id("file-view-code")
                    .px(7)
                    .py(2)
                    .rounded(4)
                    .text_size(10)
                    .cursor_pointer()
                    .when(this.viewMode === "code", (btn) => btn.bg(t.selected).text_color(t.foreground))
                    .when(this.viewMode !== "code", (btn) => btn.text_color(t.dim))
                    .hover((s) => s.bg(this.viewMode === "code" ? t.selected : t.hover))
                    .tooltip("Raw code and syntax view")
                    .on_click((_e, cx) => this.setViewMode("code", cx))
                    .child("Code")
                )
            )
          )
          .when(isCodeView, (e) =>
            e.child(
              div()
                .id("file-editor-wrap")
                .flex_none()
                .px(7)
                .py(2)
                .rounded(4)
                .text_size(10)
                .cursor_pointer()
                .when(this.wrap, (btn) => btn.bg(t.selected).text_color(t.foreground))
                .when(!this.wrap, (btn) => btn.text_color(t.dim))
                .hover((s) => s.bg(this.wrap ? t.selected : t.hover))
                .tooltip(
                  this.wrap
                    ? "Wrap long lines to the pane width"
                    : "Scroll long lines horizontally instead of wrapping"
                )
                .on_click((_e, cx) => this.setWrap(!this.wrap, cx))
                .child("Wrap")
            )
          )
          .child(
            h_flex()
              .id("file-editor-copy")
              .flex_none()
              .p(4)
              .rounded(4)
              .cursor_pointer()
              .hover((s) => s.bg(t.hover))
              .text_color(t.muted)
              .tooltip("Copy file content")
              .on_click((_e, cx) => {
                cx.write_to_clipboard(this.rawText ?? "");
                notify({ title: "File copied", body: base, level: "success", timeout: 1500 });
              })
              .child(svg("mods/file-editor/copy.svg").size(12))
          )
          .child(
            h_flex()
              .id("file-editor-refresh")
              .flex_none()
              .p(4)
              .rounded(4)
              .cursor_pointer()
              .hover((s) => s.bg(t.hover))
              .text_color(t.accent)
              .tooltip("Reload file from disk")
              .on_click((_e, cx) => this.loadFile(cx))
              .child(svg("mods/file-editor/refresh.svg").size(12))
          )
      )
      .child(
        Boolean(this.fileError)
          ? v_flex()
              .flex_1()
              .min_h(0)
              .p(24)
              .gap(8)
              .items_center()
              .justify_center()
              .child(
                div()
                  .max_w(620)
                  .text_size(12)
                  .text_color(t.dim)
                  .child(this.loading ? "Loading file…" : this.fileError)
              )
          : !isCodeView
            ? this.renderMarkdownView(t)
            : this.renderCodeView(t)
      );
  }

  /**
   * Renders the Markdown preview as a GitHub-style document, centered in a readable column.
   *
   * @param {Record<string, string>} t
   * @returns {import("gpui-kit").Element}
   */
  renderMarkdownView(t) {
    const codeFont = settings()?.font_family ?? null;
    return v_flex()
      .id("file-editor-markdown")
      .flex_1()
      .min_h(0)
      .overflow_y_scrollbar()
      .bg(t.background)
      .px(32)
      .py(24)
      .child(
        v_flex()
          .w_full()
          .items_center()
          .child(
            div()
              .w_full()
              .max_w(880)
              .child(renderMarkdownDocument(this.preparedText ?? "", { t, codeFont, idPrefix: `md-${this.file}` }))
          )
      );
  }

  /**
   * Renders syntax-highlighted code editor view.
   *
   * @param {Record<string, string>} t
   * @returns {import("gpui-kit").Element}
   */
  renderCodeView(t) {
    if (this.code) {
      return Editor.new(this.code).flex_1().min_h(0);
    }
    return v_flex()
      .flex_1()
      .min_h(0)
      .p(24)
      .items_center()
      .justify_center()
      .child(
        div()
          .text_size(12)
          .text_color(t.dim)
          .child(this.loading ? "Loading file…" : "No content")
      );
  }

  /* ========================================================================
   * Files Pane Mode Implementation
   * ======================================================================== */

  /**
   * Sets up state, location timers, and folder watcher for the Files pane mode.
   *
   * @param {Record<string, any>} _p
   * @param {import("gpui-kit").ViewContext} cx
   */
  initPaneMode(_p, cx) {
    this.saved = new Map();
    this.entries = new Map();
    this.folders = new Set();
    this.pending = new Set();
    this.marks = {};
    this.selectedFile = null;
    this.loading = false;
    this.refreshPending = false;
    this.watched = null;
    this.watchToken = null;
    this.error = null;
    this.limited = false;

    this.refresh(cx);
    // Poll location every 250ms in memory so space switches reload immediately
    cx.timer.every(250, (cx) => this.checkLocation(cx));
    // Full folder and git status refresh every 10s
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  /**
   * Computes the current workspace location.
   *
   * @returns {{ cwd: string | null, on: string | null, space: string | null }}
   */
  getLocation() {
    return resolveLocationState({
      props: props(),
      spaces: spaces(),
      focused: focused(),
      panes: panes(),
      pinnedLocations: shared("spaces.pinned_locations"),
      previousCwd: this.root,
      previousSpace: this.context?.space,
    });
  }

  /**
   * Serializes current location for state cache comparison.
   *
   * @returns {string}
   */
  key() {
    return JSON.stringify(this.getLocation());
  }

  /**
   * Checks for location transitions and triggers refresh when active space or cwd shifts.
   *
   * @param {import("gpui-kit").ViewContext} cx
   */
  checkLocation(cx) {
    if (this.key() !== this.context?.key) {
      this.refresh(cx);
    }
  }

  /**
   * Validates whether a background context is still the active one.
   *
   * @param {{ key: string }} context
   * @returns {boolean}
   */
  current(context) {
    return this.context === context && this.key() === context.key;
  }

  /**
   * Watches the current workspace folder for filesystem changes.
   * Uses watchToken to invalidate previous watchers when folder changes.
   *
   * @param {string} root
   * @param {import("gpui-kit").ViewContext} cx
   */
  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const token = (this.watchToken = {});
    const context = this.context;
    cx.spawn(async (cx) => {
      try {
        while (this.watchToken === token && this.context === context && !this.closed) {
          await watchFolder(root);
          if (this.watchToken === token && this.current(context) && !this.closed) {
            this.refresh(cx);
          }
        }
      } catch {
        if (this.watchToken === token && this.context === context) {
          this.watched = null;
          this.watchToken = null;
        }
      }
    });
  }

  /**
   * Asynchronously lists entries for a subfolder.
   *
   * @param {string} path
   * @param {{ key: string, cwd: string, on: string | null }} context
   */
  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;

    const used = [...this.entries.entries()]
      .filter(([p]) => p !== path)
      .reduce((n, [, e]) => n + e.length, 0);

    this.entries.set(
      path,
      entries
        .slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used)))
        .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
    );

    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) {
      this.limited = true;
    }
  }

  /**
   * Refreshes the directory tree and git status marks.
   *
   * @param {import("gpui-kit").ViewContext} cx
   */
  refresh(cx) {
    const { cwd, on, space } = this.getLocation();
    const next = this.key();

    if (next !== this.context?.key) {
      if (this.context) {
        this.saved.set(this.context.key, { folders: this.folders, selectedFile: this.selectedFile });
      }
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on, space };
      this.root = cwd;
      this.on = on;
      this.entries = new Map();
      this.folders = new Set(saved?.folders);
      this.pending = new Set();
      this.marks = {};
      this.selectedFile = saved?.selectedFile ?? null;
      this.watched = null;
      this.watchToken = null;
      this.error = null;
      this.limited = false;
      this.loading = false;
    }

    if (!cwd || this.loading) {
      if (this.loading) this.refreshPending = true;
      return;
    }
    const context = this.context;
    this.loading = true;
    this.limited = false;

    cx.spawn(async (cx) => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          if (path === "") {
            await this.loadFolder(path, context);
          } else {
            try {
              await this.loadFolder(path, context);
            } catch {
              for (const folder of [...this.folders]) {
                if (folder === path || folder.startsWith(path + "/")) {
                  this.folders.delete(folder);
                  this.entries.delete(folder);
                }
              }
            }
          }
        }

        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          const status = await exec(
            "git",
            ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"],
            { cwd, on }
          ).catch(() => null);

          if (status?.code === 0) {
            for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
              const xy = entry.slice(0, 2);
              marks[`${top.stdout.trim()}/${entry.slice(3)}`] =
                xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
            }
          }
        }

        if (!this.current(context)) return;
        this.marks = marks;
        this.error = null;
        this.watch(cwd, cx);
      } catch (e) {
        if (this.current(context)) this.error = String(e);
      } finally {
        if (this.context === context) {
          this.loading = false;
          cx.notify();
          if (this.refreshPending && !this.closed) {
            this.refreshPending = false;
            this.refresh(cx);
          }
        }
      }
    });
  }

  /**
   * Toggles folder expansion in the directory tree.
   *
   * @param {string} path
   * @param {import("gpui-kit").ViewContext} cx
   */
  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) {
        if (folder === path || folder.startsWith(path + "/")) {
          this.folders.delete(folder);
          this.entries.delete(folder);
        }
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async (cx) => {
          try {
            await this.loadFolder(path, context);
          } catch (e) {
            if (this.current(context)) this.error = String(e);
          } finally {
            if (this.context === context) this.pending.delete(path);
            cx.notify();
          }
        });
      }
    }
    cx.notify();
  }

  /**
   * Opens a file in its own Herdr tab, reusing an existing tab or creating a new one.
   *
   * @param {string} path
   * @param {import("gpui-kit").ViewContext} cx
   */
  openFileTab(path, cx) {
    this.selectedFile = path;
    const activeSpace = spaces().find((s) => s.active);
    const activeTabs = activeSpace?.tabs ?? [];
    const openTabsMap = shared("file-editor.openTabs") || {};

    const { existingTabId, tabName, updatedOpenTabs } = resolveFileTab(path, this.root, activeTabs, openTabsMap);
    setShared("file-editor.openTabs", updatedOpenTabs);

    if (existingTabId) {
      run("tab.select", { id: existingTabId });
      cx.notify();
      return;
    }

    const tabProps = { folder: this.root, file: path };
    if (this.on) tabProps.on = this.on;
    run("tab.new", { name: tabName, mod: "file-editor", props: tabProps });
    cx.notify();
  }

  /**
   * Builds rows of the files tree.
   *
   * @param {string} prefix
   * @param {number} depth
   * @param {Array<import("gpui-kit").Element>} out
   * @param {Record<string, string>} t
   * @returns {Array<import("gpui-kit").Element>}
   */
  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const open = this.folders.has(path);
      const mark = this.marks[`${this.root}/${path}`];
      const isSelected = this.selectedFile === path;

      out.push(
        h_flex()
          .id(`file-${path}`)
          .h(28)
          .flex_none()
          .pl(8 + depth * 18)
          .pr(8)
          .gap(7)
          .items_center()
          .rounded(7)
          .cursor_pointer()
          .when(isSelected, (el) => el.bg(t.selected))
          .hover((s) => s.bg(isSelected ? t.selected : t.hover))
          .on_click((_e, cx) => (entry.dir ? this.toggle(path, cx) : this.openFileTab(path, cx)))
          .child(
            entry.dir
              ? svg(`mods/file-editor/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim)
              : div().w(12).flex_none()
          )
          .child(svg(`mods/file-editor/${entry.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().min_w(0).truncate().child(entry.name))
          .when(Boolean(mark), (el) =>
            el.child(
              div()
                .text_size(11)
                .text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked)
                .child(mark)
            )
          )
      );
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  /**
   * Renders the Files pane browser tree.
   * Kept pure without inline side-effects.
   *
   * @param {import("gpui-kit").ViewContext} _cx
   * @returns {import("gpui-kit").Element}
   */
  renderFilesPane(_cx) {
    const t = theme();

    return v_flex()
      .id("files")
      .size_full()
      .min_h(0)
      .rounded(10)
      .overflow_hidden()
      .bg(t.background)
      .border_1()
      .border_color(t.border)
      .text_color(t.foreground)
      .text_size(13)
      .child(
        h_flex()
          .h(42)
          .flex_none()
          .px(14)
          .gap(8)
          .items_center()
          .border_b(1)
          .border_color(t.border)
          .child(div().font_semibold().child("Files"))
          .child(
            div()
              .flex_1()
              .min_w(0)
              .truncate()
              .text_right()
              .text_size(12)
              .text_color(t.dim)
              .child(this.root?.split(/[\\/]/).pop() ?? "")
          )
      )
      .child(
        v_flex()
          .id("files-tree")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .p(6)
          .children(this.rows("", 0, [], t))
          .when(Boolean(this.error) || !this.entries.get("")?.length, (el) =>
            el.child(
              div()
                .p(8)
                .text_size(12)
                .text_color(t.dim)
                .child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))
            )
          )
          .when(this.limited, (el) =>
            el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total"))
          )
      );
  }

  /**
   * Root render entrypoint. Dispatches to tab view or pane tree.
   *
   * @param {import("gpui-kit").ViewContext} cx
   * @returns {import("gpui-kit").Element}
   */
  render(cx) {
    if (this.tabMode) {
      return this.renderFileTab(cx);
    }
    return this.renderFilesPane(cx);
  }
}
