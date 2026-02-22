# Arch Linux PKGBUILDs

This directory contains Arch Linux packaging files for Cherry Studio.

## `cherry-studio-bin`

Installs Cherry Studio from the official prebuilt AppImage release.

### Quick install

```bash
cd pkgbuilds/arch/cherry-studio-bin
makepkg -si
```

### Upgrade to a newer release

1. Edit `pkgver` in `pkgbuilds/arch/cherry-studio-bin/PKGBUILD`.
2. Rebuild and reinstall:

```bash
makepkg -si
```

### Notes

- Supports `x86_64` and `aarch64`.
- Uses release assets from:
  - `https://github.com/CherryHQ/cherry-studio/releases`

## `cherry-studio-patched-git`

Builds Cherry Studio from the patched source fork so your local install includes custom modifications.

### Quick install

```bash
cd pkgbuilds/arch/cherry-studio-patched-git
makepkg -si
```

### Notes

- Source repository:
  - `https://github.com/CamelliaV/cherry-studio-patched`
- Builds AppImage from source during package build, then installs it under `/opt/cherry-studio`.
- Replaces/conflicts with `cherry-studio` and `cherry-studio-bin`.

## `cherry-studio-patched-local`

Builds Cherry Studio from your current local repository working tree, so unpushed local patches are included.

### Quick install

```bash
cd pkgbuilds/arch/cherry-studio-patched-local
makepkg -si
```

### Notes

- Uses local repo path relative to this folder (`../../..`).
- Builds AppImage from local source, then installs it under `/opt/cherry-studio`.
- Replaces/conflicts with `cherry-studio`, `cherry-studio-bin`, and `cherry-studio-patched-git`.
