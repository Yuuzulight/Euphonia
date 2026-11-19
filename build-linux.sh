#!/usr/bin/env bash
#
# build-linux.sh — build the Euphonia AppImage from source on Linux.
#
# Detects the host package manager, installs whatever is missing, runs every
# build step in order, smoke-tests the resulting AppImage, and can drop a
# .desktop launcher in the repo root. Run it from the repo root with no
# arguments for the full build. See the README's "Linux" section for the short
# version, and electron/electron-builder.yml for the packaging config. See
# docs/building-linux.md for the manual steps and AppImage troubleshooting.

set -Eeuo pipefail

# --- paths, colours, logging -------------------------------------------------

# Resolve the repo root
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$SCRIPT_DIR"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  RED=$'\033[31m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  BLUE=$'\033[34m'
  CYAN=$'\033[36m'
  RESET=$'\033[0m'
else
  BOLD=
  DIM=
  RED=
  GREEN=
  YELLOW=
  BLUE=
  CYAN=
  RESET=
fi

log() { printf '%s\n' "$*"; }
info() { printf '%s%s%s\n' "$CYAN" "$*" "$RESET"; }
ok() { printf '%s%s%s\n' "$GREEN" "$*" "$RESET"; }
warn() { printf '%s%s%s\n' "$YELLOW" "$*" "$RESET" >&2; }
err() { printf '%s%s%s\n' "$RED" "$*" "$RESET" >&2; }
die() {
  err "ERROR: $*"
  exit 1
}
have() { command -v "$1" >/dev/null 2>&1; }

STEP_NO=0
STEP_TOTAL=9
step() {
  STEP_NO=$((STEP_NO + 1))
  printf '\n%s[%d/%d]%s %s%s%s\n' \
    "$BLUE" "$STEP_NO" "$STEP_TOTAL" "$RESET" "$BOLD" "$*" "$RESET"
}

# Any uncaught failure lands here, so the last line on screen names the step that failed
on_error() {
  local rc=$?
  err ""
  err "Build failed (exit $rc) at step $STEP_NO/$STEP_TOTAL."
  exit "$rc"
}
trap on_error ERR
trap 'err ""; err "Interrupted."; exit 130' INT

# --- flags -------------------------------------------------------------------

DESKTOP_MODE="ask" # ask | yes | no
SKIP_DEPS=0

usage() {
  cat <<'EOF'
build-linux.sh — build the Euphonia AppImage from source on Linux.

Usage:
  ./build-linux.sh                # full build, prompt for .desktop at the end
  ./build-linux.sh --desktop      # never prompt, always create the .desktop
  ./build-linux.sh --no-desktop   # never prompt, never create the .desktop
  ./build-linux.sh --skip-deps    # don't touch the package manager
  ./build-linux.sh --help

Exit codes: 0 success, 1 build/preflight failure, 130 interrupted.
EOF
  exit 0
}

while [ "$#" -gt 0 ]; do
  case "$1" in
  --desktop) DESKTOP_MODE="yes" ;;
  --no-desktop) DESKTOP_MODE="no" ;;
  --skip-deps) SKIP_DEPS=1 ;;
  -h | --help) usage ;;
  *) die "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

# --- banner + plan -----------------------------------------------------------

os_pretty() {
  grep -m1 '^PRETTY_NAME=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"' || true
}

START_SECONDS=$SECONDS

HOST_NAME="$(os_pretty)"
[ -n "$HOST_NAME" ] || HOST_NAME="$(uname -s)"

printf '%s\n' "${BOLD}Euphonia — Linux AppImage builder${RESET}"
log "${DIM}Repo:  $ROOT"
log "Host:  $HOST_NAME ($(uname -m))${RESET}"
log ""
log "Steps:"
log "  1. Check/install system dependencies (Node.js, npm, ffmpeg, ImageMagick, uv)"
log "  2. Verify Node.js version"
log "  3. Build the React dashboard        -> dashboard-react/dist"
log "  4. Stage the ffmpeg binary          -> electron/resources/ffmpeg/ffmpeg"
log "  5. Convert the app icon to PNG      -> electron/resources/icon.png"
log "  6. Freeze the Python sidecar        -> dist-sidecar/analyze"
log "  7. Install Electron dependencies"
log "  8. Package the AppImage             -> electron/release/Euphonia-<version>.AppImage"
log "  9. Verify the built AppImage"

for f in analyze.py pyproject.toml \
  dashboard-react/package.json \
  electron/package.json electron/electron-builder.yml \
  scripts/build_sidecar.py; do
  [ -e "$ROOT/$f" ] || die "not a Euphonia checkout: missing $f (run this from the repo root)"
done

cd "$ROOT"

# --- package manager detection ----------------------------------------------

# One table per distro family. A distro that isn't listed here still builds with
# --skip-deps, as long as its tools are installed by hand.
PM=""
PKG_NODE=()
PKG_FFMPEG=()
PKG_IM=()
PKG_FUSE=()
PKG_CURL=()
SUDO=""

detect_pm() {
  if have pacman; then
    PM=pacman
  elif have apt-get; then
    PM=apt
  elif have dnf; then
    PM=dnf
  elif have zypper; then
    PM=zypper
  elif have apk; then
    PM=apk
  elif have xbps-install; then
    PM=xbps
  elif have eopkg; then
    PM=eopkg
  elif have emerge; then
    PM=emerge
  else
    PM=""
  fi

  case "$PM" in
  pacman)
    PKG_NODE=(nodejs npm)
    PKG_FFMPEG=(ffmpeg)
    PKG_IM=(imagemagick)
    PKG_FUSE=(fuse2)
    PKG_CURL=(curl)
    ;;
  apt)
    PKG_NODE=(nodejs npm)
    PKG_FFMPEG=(ffmpeg)
    PKG_IM=(imagemagick)
    PKG_FUSE=(libfuse2)
    PKG_CURL=(curl)
    ;;
  dnf)
    PKG_NODE=(nodejs npm)
    PKG_FFMPEG=(ffmpeg)
    PKG_IM=(ImageMagick)
    PKG_FUSE=(fuse)
    PKG_CURL=(curl)
    ;;
  zypper)
    PKG_NODE=(nodejs npm)
    PKG_FFMPEG=(ffmpeg)
    PKG_IM=(ImageMagick)
    PKG_FUSE=(fuse)
    PKG_CURL=(curl)
    ;;
  apk)
    PKG_NODE=(nodejs npm)
    PKG_FFMPEG=(ffmpeg)
    PKG_IM=(imagemagick)
    PKG_FUSE=(fuse)
    PKG_CURL=(curl)
    ;;
  xbps)
    PKG_NODE=(nodejs npm)
    PKG_FFMPEG=(ffmpeg)
    PKG_IM=(ImageMagick)
    PKG_FUSE=(fuse)
    PKG_CURL=(curl)
    ;;
  eopkg)
    PKG_NODE=(nodejs npm)
    PKG_FFMPEG=(ffmpeg)
    PKG_IM=(imagemagick)
    PKG_FUSE=(fuse)
    PKG_CURL=(curl)
    ;;
  emerge)
    PKG_NODE=(net-libs/nodejs)
    PKG_FFMPEG=(media-video/ffmpeg)
    PKG_IM=(media-gfx/imagemagick)
    PKG_FUSE=(sys-fs/fuse:0)
    PKG_CURL=(net-misc/curl)
    ;;
  esac
}

pm_install() {
  [ "$#" -gt 0 ] || return 0
  [ -n "$PM" ] || return 1
  info "  -> installing: $*"
  case "$PM" in
  apt) DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y --no-install-recommends "$@" ;;
  pacman) $SUDO pacman -S --needed --noconfirm "$@" ;;
  dnf) $SUDO dnf install -y "$@" ;;
  zypper) $SUDO zypper --non-interactive install "$@" ;;
  apk) $SUDO apk add --no-cache "$@" ;;
  xbps) $SUDO xbps-install -Sy "$@" ;;
  eopkg) $SUDO eopkg install -y "$@" ;;
  emerge) $SUDO emerge --ask=n --noreplace "$@" ;;
  *) return 1 ;;
  esac
}

# --- Step 1 — dependencies ---------------------------------------------------

step "Checking and installing dependencies"

detect_pm
log "  Detected package manager: ${PM:-none}"

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
elif have sudo; then
  SUDO="sudo"
else
  SUDO=""
  warn "  Not root and no sudo found — package installation will likely fail."
fi

if [ "$SKIP_DEPS" -eq 0 ]; then
  if [ "$PM" = apt ]; then
    info "  -> refreshing apt index"
    DEBIAN_FRONTEND=noninteractive $SUDO apt-get update -qq || warn "  apt-get update failed; continuing anyway"
  fi

  # Install only what's actually missing, so a machine that already has most of
  # it isn't churned by a blanket install of everything.
  NEED=()
  have node && have npm || NEED+=("${PKG_NODE[@]}")
  have ffmpeg || NEED+=("${PKG_FFMPEG[@]}")
  { have magick || have convert; } || NEED+=("${PKG_IM[@]}")

  if [ "${#NEED[@]}" -gt 0 ]; then
    if [ -z "$PM" ]; then
      die "missing dependencies (${NEED[*]}) and no supported package manager was found; install them manually and re-run with --skip-deps"
    fi
    pm_install "${NEED[@]}" || die "package installation failed"
  else
    ok "  All build tools already present."
  fi

  # FUSE is only needed to *run* an AppImage, never to build one, and the package
  # name differs per family — so this is best-effort and never fatal.
  if [ -z "$(ldconfig -p 2>/dev/null | grep -m1 'libfuse\.so\.2' || true)" ] &&
    [ ! -e /usr/lib/libfuse.so.2 ] && [ ! -e /usr/lib64/libfuse.so.2 ]; then
    info "  -> libfuse2 not found; installing (needed to run the AppImage)"
    pm_install "${PKG_FUSE[@]}" || warn "  could not install FUSE runtime; run the AppImage with --appimage-extract-and-run instead"
  fi
else
  warn "  --skip-deps: not touching the package manager."
fi

# uv isn't reliably packaged, so fall back to the official installer. It lands
# in ~/.local/bin, which isn't always on PATH for a non-login shell.
if ! have uv; then
  info "  -> uv not found; installing from astral.sh"
  if ! have curl && ! have wget; then
    pm_install "${PKG_CURL[@]}" || die "need curl or wget to install uv"
  fi
  if have curl; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
  else
    wget -qO- https://astral.sh/uv/install.sh | sh
  fi
  export PATH="$HOME/.local/bin:$PATH"
fi
have uv || die "uv is still not on PATH (expected in ~/.local/bin); add it and re-run"
ok "  uv: $(uv --version)"

# --- Step 2 — Node.js version ------------------------------------------------

step "Verifying Node.js version"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
NODE_FULL="$(node --version 2>/dev/null || echo 'missing')"
log "  node $NODE_FULL, npm $(npm --version 2>/dev/null || echo missing)"
# Vite 8 needs Node ^20.19 or >=22, so below 20 the dashboard build cannot work
# at all; this build is tested on 22, so 20/21 is allowed but called out.
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js $NODE_FULL is too old — Vite 8 needs Node ^20.19 or >=22. Install a current Node (nvm, or nodejs.org) and re-run."
elif [ "$NODE_MAJOR" -lt 22 ]; then
  warn "  Node.js $NODE_FULL works, but 22 or newer is recommended."
else
  ok "  Node.js version is fine."
fi

# --- npm install helper ------------------------------------------------------

# npm ci is the reproducible path and matches what CI runs; it fails hard when
# the lockfile and package.json have drifted, which is worth surfacing — but a
# contributor mid-upgrade shouldn't be blocked, so fall back to npm install.
npm_install_here() {
  if [ -f package-lock.json ]; then
    if ! npm ci --no-audit --no-fund; then
      warn "  npm ci failed — falling back to npm install"
      npm install --no-audit --no-fund
    fi
  else
    npm install --no-audit --no-fund
  fi
}

# --- Step 3 — React dashboard ------------------------------------------------

step "Building the React dashboard"
cd "$ROOT/dashboard-react"
npm_install_here
npm run build
[ -f "$ROOT/dashboard-react/dist/index.html" ] || die "dashboard build produced no dist/index.html"
ok "  dashboard-react/dist ready"

# --- Step 4 — stage ffmpeg ---------------------------------------------------

step "Staging the ffmpeg binary"
# The packaged app expects the binary at electron/resources/ffmpeg/ffmpeg (see
# extraResources in electron-builder.yml). That directory is gitignored, so
# every build stages it fresh from the host.
FFMPEG_SRC="$(command -v ffmpeg || true)"
[ -n "$FFMPEG_SRC" ] || die "ffmpeg not found on PATH"
mkdir -p "$ROOT/electron/resources/ffmpeg"
cp -f "$FFMPEG_SRC" "$ROOT/electron/resources/ffmpeg/ffmpeg"
chmod +x "$ROOT/electron/resources/ffmpeg/ffmpeg"
ok "  copied $FFMPEG_SRC -> electron/resources/ffmpeg/ffmpeg"
warn "  note: this is your distro's dynamically linked ffmpeg — the AppImage will only"
warn "        run it on machines with compatible glibc/codec libs. For a portable"
warn "        build, swap in a static ffmpeg from github.com/BtbN/FFmpeg-Builds."

# --- Step 5 — icon (.ico -> .png) -------------------------------------------

step "Converting the app icon to PNG"
# electron-builder rejects .ico for Linux targets, so the shared
# `icon: resources/icon.ico` in electron-builder.yml can't be used as-is. Frame
# [3] of the .ico is the 256x256 one — the smallest size desktop environments
# accept without blurring it.
ICON_ICO="$ROOT/electron/resources/icon.ico"
ICON_PNG="$ROOT/electron/resources/icon.png"
[ -f "$ICON_ICO" ] || die "missing $ICON_ICO"
if have magick; then
  IMAGEMAGICK=magick
elif have convert; then
  IMAGEMAGICK=convert # ImageMagick 6
else
  die "ImageMagick (magick/convert) not found"
fi
"$IMAGEMAGICK" "${ICON_ICO}[3]" "$ICON_PNG"
if have identify; then
  ICON_DIM="$(identify -format '%wx%h' "$ICON_PNG" 2>/dev/null || true)"
  [ "$ICON_DIM" = "256x256" ] || warn "  icon is ${ICON_DIM:-unknown}, expected 256x256"
  ok "  electron/resources/icon.png ($ICON_DIM)"
else
  ok "  electron/resources/icon.png written"
fi

# --- Step 6 — Python sidecar -------------------------------------------------

step "Freezing the Python sidecar (this can take a couple of minutes)"
# Back to the repo root first: the dashboard step left us in dashboard-react, and
# both commands below resolve their paths relative to the cwd.
cd "$ROOT"
uv sync
uv run scripts/build_sidecar.py
[ -x "$ROOT/dist-sidecar/analyze" ] || die "sidecar build produced no executable dist-sidecar/analyze"
ok "  dist-sidecar/analyze ready"

# --- Step 7 — Electron dependencies -----------------------------------------

step "Installing Electron dependencies"
cd "$ROOT/electron"
npm_install_here
ok "  electron/node_modules ready"

# --- Step 8 — package the AppImage ------------------------------------------

step "Packaging the AppImage"
# `npm run dist` = tsc build + electron-builder. The Linux target, icon and
# category live in electron-builder.yml's `linux:` block, so nothing needs
# overriding here; the only Linux-specific input is the PNG from step 5, which
# that block points at.
cd "$ROOT/electron"
npm run dist

ok "  electron-builder finished"

# --- Step 9 — verify the AppImage -------------------------------------------

step "Verifying the AppImage"

# Prefer the artifact matching package.json's version; fall back to the newest
# AppImage so a stale release/ directory can't hide a fresh build.
VERSION="$(node -p "require('$ROOT/electron/package.json').version")"
EXPECTED="$ROOT/electron/release/Euphonia-$VERSION.AppImage"

if [ -f "$EXPECTED" ]; then
  APPIMAGE="$EXPECTED"
else
  APPIMAGE="$(find "$ROOT/electron/release" -maxdepth 1 -name '*.AppImage' -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2- || true)"
fi
if [ -z "$APPIMAGE" ] || [ ! -f "$APPIMAGE" ]; then
  die "no AppImage was produced in electron/release/"
fi

[ -x "$APPIMAGE" ] || chmod +x "$APPIMAGE"

# 1. AppImage type-2 files are ELF executables — cheap proof that we built a
#    binary and not, say, a truncated download.
MAGIC="$(head -c 4 "$APPIMAGE" | od -An -tx1 | tr -d ' \n')"
[ "$MAGIC" = "7f454c46" ] || die "$APPIMAGE is not a valid ELF binary (magic=$MAGIC)"

# 2. A real build is ~180MB; anything far under that is missing a payload.
SIZE_BYTES="$(stat -c '%s' "$APPIMAGE")"
SIZE_HUMAN="$(du -h "$APPIMAGE" | cut -f1)"
[ "$SIZE_BYTES" -gt 50000000 ] || warn "  AppImage looks small (${SIZE_HUMAN}); build may be incomplete"
ok "  executable ELF, ${SIZE_HUMAN}"

# 3. Structural check: unpack and confirm the payload actually made it inside.
#    --appimage-extract needs no FUSE, so this works headless and in CI, and it
#    catches an extraResources step silently dropping a directory.
EXTRACT_DIR="$(mktemp -d)"
SQ_OK=0
if (cd "$EXTRACT_DIR" && "$APPIMAGE" --appimage-extract >/dev/null 2>&1); then
  SQ="$EXTRACT_DIR/squashfs-root"
  MISSING=()
  [ -x "$SQ/AppRun" ] || MISSING+=("AppRun")
  [ -f "$SQ/resources/dashboard/index.html" ] || MISSING+=("resources/dashboard/index.html")
  [ -x "$SQ/resources/sidecar/analyze" ] || MISSING+=("resources/sidecar/analyze")
  [ -x "$SQ/resources/ffmpeg/ffmpeg" ] || MISSING+=("resources/ffmpeg/ffmpeg")
  ls "$SQ"/*.desktop >/dev/null 2>&1 || MISSING+=("*.desktop")
  if [ "${#MISSING[@]}" -eq 0 ]; then
    SQ_OK=1
    ok "  payload intact (dashboard, sidecar, ffmpeg, desktop entry)"
  else
    warn "  AppImage is missing: ${MISSING[*]}"
  fi
else
  warn "  could not unpack the AppImage to inspect it"
fi
rm -rf "$EXTRACT_DIR"

# 4. Best-effort GUI smoke test: launch the app on a hidden virtual display for
#    a few seconds, just long enough to prove it starts, then let timeout end it.
#    Non-fatal — a headless box may lack xvfb-run, and Chromium's GPU noise on a
#    real display doesn't mean the build is broken.
GUI_OK="skipped"
GUI_WINDOW=8
if have xvfb-run && have timeout; then
  info "  The app will briefly open now to confirm it starts."
  info "  It is running on a hidden virtual display and closes itself after ${GUI_WINDOW}s."
  # `|| RC=$?` keeps a non-zero timeout from tripping the ERR trap, which fires
  # on any failing command regardless of errexit.
  RC=0
  timeout "$GUI_WINDOW" xvfb-run -a "$APPIMAGE" --no-sandbox --appimage-extract-and-run >/dev/null 2>&1 || RC=$?
  if [ "$RC" -eq 0 ] || [ "$RC" -eq 124 ]; then
    GUI_OK="passed"
    ok "  launched cleanly and stayed up for the ${GUI_WINDOW}s window"
  else
    GUI_OK="failed"
    warn "  app exited early under Xvfb (rc=$RC); it may still work on a real display"
  fi
fi

# The unpacked payload is the part that must be right; the GUI test is a bonus.
if [ "$SQ_OK" -ne 1 ]; then
  die "AppImage verification failed — the packaged payload is incomplete"
fi

# --- report ------------------------------------------------------------------

ELAPSED=$((SECONDS - START_SECONDS))

printf '\n%s\n' "${BOLD}Build complete${RESET} in ${ELAPSED}s (GUI smoke test: $GUI_OK)."
log ""
ok "AppImage:"
log "  ${BOLD}$APPIMAGE${RESET}"
log "  (${SIZE_HUMAN})"
log ""
log "Run it with:"
log "  \"$APPIMAGE\" --no-sandbox"
log "${DIM}  --no-sandbox is needed where unprivileged user namespaces are disabled."
log "  If FUSE is unavailable, add --appimage-extract-and-run.${RESET}"

# --- optional .desktop launcher ---------------------------------------------

create_desktop_file() {
  local appimage="$1"
  local desktop="$ROOT/Euphonia.desktop"

  # Absolute paths, since the launcher may be installed anywhere; %U keeps the
  # file-manager "open with" affordance working. StartupWMClass matches the
  # AppImage's own desktop entry, so the window associates with this launcher.
  cat >"$desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Euphonia
GenericName=Voice Trainer
Comment=Voice-training recorder and analyzer
Exec="$appimage" %U
Icon=$ICON_PNG
Terminal=false
Categories=AudioVideo;Player;Recorder;
Keywords=voice;singing;training;pitch;recording;
StartupWMClass=Euphonia
EOF
  chmod +x "$desktop"

  if have desktop-file-validate; then
    if desktop-file-validate "$desktop"; then
      ok "  wrote and validated $desktop"
    else
      warn "  wrote $desktop but desktop-file-validate reported problems"
    fi
  else
    ok "  wrote $desktop"
  fi
  log "  ${DIM}Install it system-wide with:"
  log "    install -Dm644 \"$desktop\" ~/.local/share/applications/Euphonia.desktop${RESET}"
}

case "$DESKTOP_MODE" in
yes)
  printf '\n%s\n' "${BOLD}Creating .desktop launcher${RESET}"
  create_desktop_file "$APPIMAGE"
  ;;
no)
  log ""
  log "Skipping .desktop launcher (--no-desktop)."
  ;;
ask)
  REPLY="n"
  # Only prompt on a real terminal; a piped or CI run must not block on read.
  if [ -t 0 ]; then
    printf '\n%sCreate a .desktop launcher in the project root (%s)? [y/N] %s' \
      "$BOLD" "$ROOT/Euphonia.desktop" "$RESET"
    read -r REPLY || REPLY="n"
  else
    log ""
    log "Not an interactive terminal — skipping the .desktop prompt (use --desktop to create it)."
  fi
  case "$REPLY" in
  [yY] | [yY][eE][sS]) create_desktop_file "$APPIMAGE" ;;
  *) log "No .desktop file created." ;;
  esac
  ;;
esac

printf '\n%sAll done.%s\n' "$GREEN$BOLD" "$RESET"
