# herdr-file-editor

Source of truth for the `file-editor` Herdr app mod (`mods/file-editor/`): a dual-mode file browser panel and tabbed file editor with syntax highlighting, Markdown preview, and live filesystem watching built natively with GPUI.

## Rule: Always Update the Herdr Live Folder

Herdr reads active mods from `~/.config/herdr-app/mods/<name>`. After code changes in this repository, run:

```sh
./sync.sh
```

The script copies `mods/file-editor` to `~/.config/herdr-app/mods/file-editor` and runs `herdr-app check`. Never edit files in `~/.config/herdr-app/mods/` directly.

---

## Dual-Mode Architecture

The mod operates in two distinct modes based on whether `props().file` is provided:

1. **Files Pane Mode (`props().file` not set)**:
   - Renders the workspace file browser tree (`#files-tree`) inside `#files`.
   - Resolves workspace root via `resolveLocation` honoring:
     1. Explicit `props().folder` or `props().cwd`.
     2. Pinned space location (`spaces.pinned_locations[space.id]`).
     3. Focused pane or terminal cwd **only when `focused.space === space.id`**.
     4. Fallback to `space.folder`.
   - Polls location in memory every 250ms so switching active spaces or tabs updates the file tree immediately, in addition to the 10s refresh timer and `watchFolder(root)`.
   - **Clicking a file (`!entry.dir`) NEVER opens the file inline or replaces the tree**. It invokes `this.openFileTab(path, cx)` which checks existing non-settled tabs, reuses matching tabs via `tab.select`, or opens a new dedicated Herdr tab with `tab.new`.

2. **File Editor Tab Mode (`props().file` is a non-empty string)**:
   - Renders a full-size file viewer tab (`#file-editor-tab`) for `{ folder, file, on?, viewMode?, wrap? }`.
   - Reads file text via `readTextFile` off the UI thread and watches `root` via `watchFolder` so external edits reload automatically.
   - Header bar (`h(38)`, `bg(t.chrome)`) provides:
     - Basename, truncated parent path, line count, language pill, and `Read-only` badge.
     - For Markdown files (`.md`, `.markdown`, `.mdx`): segmented `Preview` / `Code` view switcher defaulting to `"preview"`.
     - In Code view: `Wrap` toggle button toggling soft wrapping on `EditorState` and persisting to `shared("file-editor.wrap")`.
     - Copy button writing text to clipboard with toast notification.
     - Refresh button reloading from disk.
   - Code rendering uses `EditorState.new` with syntax highlighting from `theme()` and font settings.
   - Markdown rendering is GitHub-style and built in `mods/file-editor/markdown-view.js`: `parseMarkdownBlocks` (file-logic.js) turns the source into blocks, which are drawn as headings with rules, code boxes, bordered tables, quote bars, list and task markers. Inline text (emphasis, code, links) goes through `TextView.markdown`, which takes no styling of its own.

---

## GPUI Invariants & Safety Rules

- **No `null` or `undefined` in `.child()`**: Re-rendering aborts with an error banner if null/undefined is passed to `.child()`. Always use `.when(cond, el => el.child(...))`.
- **No sync `cx` across `await`**: Event handler `cx` is valid only during synchronous delivery. Wrap all async tasks in `cx.spawn(async (cx) => ...)` and use the `AsyncContext`.
- **Never call `EditorState.new` inside `render()`**: Editor instances must be created or updated outside `render()` (in `loadFile` or event handlers). Always call `this.code?.release()` before recreating or in `async close(_cx)`.
- **Watch tokens**: Always use a per-loop `watchToken = {}` so changing directories or files invalidates stale watchers. Clear `watched` and `watchToken` in `close(_cx)` or when switching context.

---

## Validation & Testing

Run the automated test suite and mod validator:

```sh
herdr-app check mods/file-editor && node --test test/
```

- `mods/file-editor/file-logic.js`: Pure functions for path splitting, language detection, view mode defaults, file text preparation, Markdown block parsing, syntax theming, location resolution, and tab resolution.
- `test/file-logic.test.js`: Unit tests verifying contract, edge cases, and boundaries with `node:test` and `node:assert/strict`.

---

## Layout Wiring

To replace the default `files` panel block in your personal layout clone (`~/.config/herdr-app/layouts/<name>.json`):

```json
{
  "id": "files",
  "type": "block",
  "content": {
    "mod": "file-editor"
  }
}
```

### Direct Split and Tab Commands

Open the Files browser in a side split:
```sh
herdr-app do pane.split --direction right --mod file-editor
```

Open a specific file directly in a dedicated tab:
```sh
herdr-app do tab.new --name "README.md" --mod file-editor --props '{"folder":"/path/to/repo","file":"README.md"}'
```

Open a code file with soft wrap enabled:
```sh
herdr-app do tab.new --name "main.js" --mod file-editor --props '{"folder":"/path/to/repo","file":"src/main.js","wrap":true}'
```
