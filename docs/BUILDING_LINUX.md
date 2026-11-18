# Building and running Euphonia on Linux

The upstream project ships Windows-only releases. This guide covers building the
AppImage yourself from source on Linux (x86-64).

---

## Prerequisites

Install these before you start. Version floors are what was tested; newer should work.

| Tool | Min version | How to install |
|------|-------------|----------------|
| Node.js + npm | 22 | package manager, or [nodejs.org](https://nodejs.org) |
| uv | 0.13 | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| ffmpeg | any | package manager (see §3 below) |
| ImageMagick | 7 | package manager — only needed once to convert the icon |

**Package manager quick-reference:**

```bash
# Arch / Manjaro
sudo pacman -S nodejs npm ffmpeg imagemagick

# Debian / Ubuntu
sudo apt install nodejs npm ffmpeg imagemagick

# Fedora
sudo dnf install nodejs npm ffmpeg imagemagick
```

> **Note on ffmpeg:** the system package is dynamically linked. The bundled binary
> inside the AppImage will only work on machines with compatible glibc and codec
> libraries. For a portable build you can share with others, replace it with a
> static build from
> [github.com/BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)
> (`ffmpeg-master-latest-linux64-gpl.tar.xz`, grab the `ffmpeg` binary inside).

---

## 1. Clone the repo

```bash
git clone https://github.com/Yuuzulight/Euphonia
cd Euphonia
```

---

## 2. Build the React dashboard

```bash
cd dashboard-react
npm install
npm run build
cd ..
```

Output: `dashboard-react/dist/`

---

## 3. Stage ffmpeg

The packaged app needs a ffmpeg binary at `electron/resources/ffmpeg/ffmpeg`.
The simplest option is copying your system binary:

```bash
mkdir -p electron/resources/ffmpeg
cp /usr/bin/ffmpeg electron/resources/ffmpeg/ffmpeg
```

If your ffmpeg is elsewhere (`which ffmpeg` to find it), adjust the source path.

---

## 4. Convert the icon

`electron-builder` on Linux rejects `.ico` files; it needs a PNG of at least 256×256.
Run this once — the output is already in the repo if you have done this before.

```bash
magick electron/resources/icon.ico[3] electron/resources/icon.png
```

`[3]` selects the 256×256 frame. If `magick` is not found, try `convert` (ImageMagick v6).
Confirm the output: `identify electron/resources/icon.png` should report `256x256`.

---

## 5. Freeze the Python sidecar

This bundles `analyze.py` and its dependencies (parselmouth/Praat, numpy) into a
single self-contained binary at `dist-sidecar/analyze`.

```bash
uv sync
uv run scripts/build_sidecar.py
```

This takes 1–3 minutes the first time (PyInstaller collects all C extensions).
Output: `dist-sidecar/analyze`

---

## 6. Install Electron dependencies

```bash
cd electron
npm install
```

---

## 7. Build the AppImage

```bash
npm run dist
```

This compiles the TypeScript main process, then runs `electron-builder` to package
everything into a single AppImage.

Output: `electron/release/Euphonia-<version>.AppImage`

---

## Running

```bash
./electron/release/Euphonia-0.5.1.AppImage
```

**If the app does not start**, add `--no-sandbox`:

```bash
./electron/release/Euphonia-0.5.1.AppImage --no-sandbox
```

This is required on systems where unprivileged user namespaces are disabled
(some hardened kernels, older Debian/Ubuntu defaults). It relaxes Chromium's
process sandbox — acceptable for a local desktop app, but be aware of the tradeoff.

To check/enable user namespaces instead of using `--no-sandbox`:

```bash
# Check current value (1 = enabled)
cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || \
  sysctl kernel.unprivileged_userns_clone

# Enable for this session
sudo sysctl -w kernel.unprivileged_userns_clone=1

# Persist across reboots (Debian/Ubuntu path)
echo 'kernel.unprivileged_userns_clone=1' | sudo tee /etc/sysctl.d/99-userns.conf
```

**If AppImage fails to mount** (`FUSE not available`):

```bash
./Euphonia-0.5.1.AppImage --appimage-extract-and-run
```

This extracts to a temp directory instead of mounting via FUSE. Slower startup,
no FUSE required.

Install FUSE for normal operation:

```bash
sudo apt install libfuse2   # Debian / Ubuntu (needs libfuse2, not libfuse3)
sudo pacman -S fuse2        # Arch
sudo dnf install fuse       # Fedora
```

---

## Known terminal noise (not errors)

These messages appear in the terminal on every launch and are harmless:

```
MESA-LOADER: failed to open nvidia-drm ...
GPU process exited unexpectedly
```

Vulkan and GBM driver loading errors from Chromium's GPU process. The app falls
back to software rendering automatically. `--disable-gpu-sandbox` is already set
in the build to allow the GPU process to reach system drivers; on some NVIDIA
setups it still fails and falls back gracefully.

```
Auto-update check failed: ... latest-linux.yml ... 404
```

The auto-updater checks GitHub Releases for a `latest-linux.yml` manifest. No
Linux release has been published to this repo (Windows only), so the check always
404s and is logged as an error. The app works fine on the version you built.
The error fires three times per launch (one check, two retries).

---

## Rebuilding after source changes

Only rebuild the parts that changed:

| What changed | Rebuild step |
|---|---|
| `dashboard-react/src/**` | §2 (`npm run build` in `dashboard-react/`) |
| `analyze.py` or Python deps | §5 (`uv run scripts/build_sidecar.py`) |
| `electron/src/**` | §7 (`npm run dist` in `electron/`) |
| Any of the above | §7 is always the final step |

After any source change, re-run §7 to repackage. Steps §3 and §4 only need to
run once unless you are changing the ffmpeg binary or icon.
