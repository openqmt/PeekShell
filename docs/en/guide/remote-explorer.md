---
title: Remote files
description: Browse remote directories in PeekShell, preview and edit files, upload and download, and manage transfers.
---

# Remote files

After connecting, use the remote file explorer to browse the remote tree, preview and edit files, and transfer data.

## Basics

- Enter directories, go up, or jump by path
- Preview text / images; edit text inline and save back to the host
- Upload local files and download remote files (drag-and-drop upload supported)
- Context menu: new item, rename, delete, permissions, copy path, and more
- Refresh the current listing

## Transfers

Open the transfers panel from the toolbar button:

- See running, queued, and finished jobs, plus batch progress
- **Stop** / **Continue** batch transfers
- **Clear finished** jobs
- Set a default download folder (if unset, you are asked each time)

## Explorer settings

Open **More settings** from the explorer blank area or context menu to configure:

### Preview file size

Files above the limit cannot be previewed or edited in-app; download them locally first.

### Tree kind display

How file kinds appear in the left tree:

| Option | Description |
|--------|-------------|
| Text (DIR / FILE) | Text labels for directories vs files |
| Icons | Outline icons colored by type |
| Windows style | Colored glyphs in a Windows Explorer style |
| macOS style | Finder-like folder and document icons |

Preferences are stored locally and can be reset to defaults.

## With the terminal

Use remote files for transfer and browsing; switch back to a terminal tab when you need to run commands or watch live output. Both share the same SSH connection context.
