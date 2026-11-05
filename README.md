# Herdr File Editor

A native, dual-mode **File Browser & Editor Tab** mod for Herdr featuring directory tree navigation, Git status porcelain badges, dedicated tabbed file viewing, theme-aware syntax highlighting, and rich Markdown previews powered directly by GPUI.

Instead of opening raw code files inside the narrow Files panel, `file-editor` opens files into their own dedicated Herdr tabs with full-pane syntax highlighting and Markdown rendering, keeping your directory tree accessible and intact.

---

## Features

- **Dual-Mode Operation**:
  - **Files Pane Mode**: Sits in your sidebar panel or split pane, browsing the active space's workspace tree with Git status badges (`A`, `M`, `D`, `U`) and folder toggle chevrons.
  - **File Editor Tab Mode**: Opens files in full-size Herdr tabs (`#file-editor-tab`) with a clean 38px toolbar and full reading comfort.
- **Tab Deduplication & Disambiguation**:
  - Clicking a file reuses an existing open tab for that file instead of creating duplicate tabs.
  - Automatically disambiguates files with identical names from different directories (`dir/base`).
- **Syntax Highlighting & Code View**:
  - Powered by `EditorState` and `Editor` with line numbers, code folding, font family/size configuration, and colors derived dynamically from your active Herdr `theme()`.
  - Supports JavaScript, TypeScript, JSX/TSX, Python, Rust, Go, C/C++, Shell, HTML, CSS, JSON, YAML, TOML, Dockerfile, Makefile, and more.
- **Rendered Markdown Preview**:
  - For `.md`, `.markdown`, and `.mdx` files, defaults to a GitHub-style rendered preview (headings, code, tables, quotes, task lists) inside a centered, readable reading column.
  - Supports switching seamlessly between **Preview** and **Code** modes via a segmented header switcher.
- **Toolbar Craft**:
  - **Header Info**: Bold basename, truncated folder path, line count & language pill, and `Read-only` badge.
  - **Wrap Toggle**: Toggles soft line wrapping on and off, remembered in shared settings (`file-editor.wrap`).
  - **Copy Button**: Copies file text to the clipboard with an instant toast notification.
  - **Refresh Button**: Reloads file contents directly from disk.
- **Live Disk Watching**:
  - Integrates with `watchFolder` off the UI thread so external modifications or saves immediately reload the open tab.
- **Edge Case & Safety Protections**:
  - Friendly warnings for deleted or missing files (`"This file is no longer available"`).
  - Binary file detection (`"Binary file · no text preview"`).
  - Graceful truncation of files exceeding 400,000 characters.

---

## Requirements

- Herdr desktop app (`herdr-app`).
- Git installed on your system.
- Node.js (v18+) for running unit tests.

---

## Usage

### Replace the Files panel

In your personal Herdr layout clone (e.g. `~/.config/herdr-app/layouts/my-layout.json`), point the `files` block at `file-editor`:

```json
{
  "id": "files",
  "type": "block",
  "content": {
    "mod": "file-editor"
  }
}
```

This replaces the default `files` panel with `file-editor`. The directory tree behaves identically, but clicking any file opens it in a dedicated tab rather than taking over the sidebar.

### Open Files Browser in a Split Pane

```sh
herdr-app do pane.split --direction right --mod file-editor
```

Or target a specific workspace folder:

```sh
herdr-app do pane.split --direction right --mod file-editor --props '{"folder":"/path/to/project"}'
```

### Open a File Tab Directly

Open any file in a dedicated tab:

```sh
herdr-app do tab.new --name "README.md" --mod file-editor \
  --props '{"folder":"/path/to/project","file":"README.md"}'
```

Open a code file with soft wrap enabled:

```sh
herdr-app do tab.new --name "main.js" --mod file-editor \
  --props '{"folder":"/path/to/project","file":"src/main.js","wrap":true}'
```

Force Code view for a Markdown document:

```sh
herdr-app do tab.new --name "CHANGELOG.md" --mod file-editor \
  --props '{"folder":"/path/to/project","file":"CHANGELOG.md","viewMode":"code"}'
```

---

## Testing

Run the automated test suite with Node's native test runner:

```sh
node --test test/
```

Run mod syntax and manifest validation:

```sh
herdr-app check mods/file-editor
```

---

## Install & Sync

To install or sync the mod into your live Herdr configuration:

```sh
./sync.sh
```

Then check that the mod passes validation:

```sh
herdr-app check ~/.config/herdr-app/mods/file-editor
```

---

## Publishing to Herdr Marketplace

To publish `file-editor` to the Herdr marketplace (`herdr.dev/mods`):

1. Keep `mods/file-editor/` at the repository root.
2. Ensure `RECIPE.md` and `preview.png` are present.
3. Tag the repository with the GitHub topic `herdr-mod`:
   ```sh
   gh repo edit --add-topic herdr-mod
   ```
4. Verify repository visibility and metadata:
   ```sh
   gh repo view --json visibility,repositoryTopics,defaultBranchRef
   ```
