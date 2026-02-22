# Cherry Studio Patch Updates

[English](README.md) | [中文](docs/zh/README.md)

This README reflects only the new functionality added in this patch series.

## UI Preview

![Patched UI preview](imgs/patch-ui-showcase.png)

## Core Feature Updates

1. Transparent persistent multi-tab UI
- Multi-tab bar is fully transparent (not blurred card style).
- Middle-click closes tabs.
- Open tabs and active tab are restored after app restart.
- Tab strip horizontal scroll position is remembered.

2. Workspace-based tab groups
- Tabs can be grouped into separate workspaces.
- You can create, switch, rename, and delete workspaces.
- Each workspace keeps its own tab set and active conversation.
- Workspace state is persisted across app restarts.

3. Stylish timeline redesign
- Timeline no longer disappears while scrolling.
- First/last timeline node clipping is fixed.
- Node active state is aligned with navigation/viewport position.
- Hovering a node shows compact user/model preview snippets.

4. Timeline position persistence
- Conversation position is persisted by timeline node index.
- Reopening the app restores each conversation to its saved node.

5. Timeline hotkeys
- `Alt+ArrowUp`: jump to previous timeline node.
- `Alt+ArrowDown`: jump to next timeline node.
- `Alt+Shift+ArrowUp`: jump to first timeline node.
- `Alt+Shift+ArrowDown`: jump to last timeline node.

6. Model groups with routing modes
- Assistants can use either a single model or a model group.
- Model groups are global and shared across assistants.
- Model groups are user-defined (no same-model/provider restriction).
- Two routing modes are supported:
  - `order-first`: try models in group order (fallback to next when prior one is not accessible).
  - `round-robin`: request 1 -> model 1, request 2 -> model 2, then loop.
- You can switch source (single model vs group) from assistant settings and from the chat navbar model switcher.

7. Send while loading
- You can send the next message while a response is still generating.

8. Arch Linux PKGBUILD support
- Added Arch Linux package build files for easy installation:
  - `pkgbuilds/arch/cherry-studio-bin/PKGBUILD`
  - `pkgbuilds/arch/cherry-studio-bin/.SRCINFO`
  - `pkgbuilds/arch/README.md`
- Supports `x86_64` and `aarch64`.

## Arch Linux Quick Install

```bash
cd pkgbuilds/arch/cherry-studio-bin
makepkg -si
```
