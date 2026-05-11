# LIMEN OS — Packaging & Distribution Guide

> How to build, sign, and distribute LIMEN OS across every platform.
> Updated: 2026-03-12

---

## Table of Contents

1. [Quick Reference](#1-quick-reference)
2. [Architecture Support Matrix](#2-architecture-support-matrix)
3. [Linux — AppImage + .deb](#3-linux--appimage--deb)
   - 3.1 Ubuntu / Debian (x86_64) — This Machine
   - 3.2 Fedora / RHEL / openSUSE (.rpm)
   - 3.3 Arch Linux (AUR / PKGBUILD)
4. [Linux ARM64 — Raspberry Pi / Jetson / Orin](#4-linux-arm64--raspberry-pi--jetson)
   - 4.1 Raspberry Pi 4 (4 GB+)
   - 4.2 Raspberry Pi 5
   - 4.3 Self-hosted GitHub Actions Runner on Pi
   - 4.4 Cross-compile from x86_64
5. [macOS — .app + .dmg](#5-macos--app--dmg)
   - 5.1 Apple Silicon MacBook (M-series)
   - 5.2 Intel Mac
   - 5.3 Universal Binary
   - 5.4 Codesigning + Notarization
6. [Windows — .exe + .msi](#6-windows--exe--msi)
   - 6.1 Native Build on Windows
   - 6.2 Cross-compile from Linux (advanced)
   - 6.3 NSIS vs WiX
7. [CI/CD — GitHub Actions](#7-cicd--github-actions)
8. [TUI Binary — All Platforms](#8-tui-binary--all-platforms)
9. [Flutter Mobile (Android / iOS)](#9-flutter-mobile-android--ios)
10. [Artifact Naming Convention](#10-artifact-naming-convention)
11. [Checksums & Release Verification](#11-checksums--release-verification)

---

## 1. Quick Reference

| Platform | Bundle | Command | Output |
|----------|--------|---------|--------|
| Linux x86_64 | AppImage | `cargo tauri build --bundles appimage` | `target/release/bundle/appimage/*.AppImage` |
| Linux x86_64 | .deb | `cargo tauri build --bundles deb` | `target/release/bundle/deb/*.deb` |
| Linux ARM64 | AppImage | *(on ARM runner)* same command | `*.AppImage` |
| macOS (Universal) | .dmg | `cargo tauri build --target universal-apple-darwin --bundles dmg` | `target/universal-apple-darwin/release/bundle/dmg/*.dmg` |
| Windows | NSIS .exe | `cargo tauri build --bundles nsis` | `target/release/bundle/nsis/*.exe` |
| Windows | WiX .msi | `cargo tauri build --bundles msi` | `target/release/bundle/msi/*.msi` |
| TUI ARM64 | binary | `cargo build --release -p limen-tui --target aarch64-unknown-linux-gnu` | `target/aarch64-unknown-linux-gnu/release/limen-tui` |

**Always run from the repo root.** Tauri reads `apps/shell/src-tauri/tauri.conf.json`.
For shell bundles, `cd apps/shell` first so `cargo tauri` finds the right config.

---

## 2. Architecture Support Matrix

| Platform | Arch | Shell (GUI) | TUI | Mobile |
|----------|------|-------------|-----|--------|
| Ubuntu 22.04/24.04 | x86_64 | ✅ AppImage + .deb | ✅ | — |
| Ubuntu 22.04+ | ARM64 | ✅ AppImage + .deb | ✅ | — |
| Fedora 40+ | x86_64 | ✅ .rpm (build manually) | ✅ | — |
| Arch Linux | x86_64 | ✅ PKGBUILD | ✅ | — |
| Raspberry Pi 4 (4 GB+) | ARM64 | ⚠️ Slow (WebKit heavy) | ✅ Recommended | — |
| Raspberry Pi 5 | ARM64 | ✅ Usable | ✅ | — |
| macOS 13+ (Apple Silicon) | arm64 | ✅ .dmg | ✅ | ✅ iOS |
| macOS 13+ (Intel) | x86_64 | ✅ .dmg | ✅ | — |
| Windows 11 | x86_64 | ✅ .exe + .msi | ✅ (WSL2) | ✅ Android |
| Android | arm64-v8a | — | — | ✅ APK |
| iOS | arm64 | — | — | ✅ IPA |

> **Pi recommendation:** Use the **TUI** on Pi 4, or SSH + TUI. The full WebKit-based shell
> requires ~2 GB RAM and a GPU. Pi 5 handles it well; Pi 4 with 4 GB is marginal.

---

## 3. Linux — AppImage + .deb

### 3.1 Ubuntu / Debian x86_64 — This Machine (Ubuntu 24.04)

**Prerequisites** (one-time):

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-bin \
  patchelf \
  libglib2.0-dev \
  libssl-dev \
  pkg-config

# Static patchelf if sudo unavailable:
mkdir -p ~/.local/bin
curl -sL https://github.com/NixOS/patchelf/releases/download/0.18.0/patchelf-0.18.0-x86_64.tar.gz \
  | tar -xz -C ~/tmp-patchelf
cp ~/tmp-patchelf/bin/patchelf ~/.local/bin/patchelf
chmod +x ~/.local/bin/patchelf
export PATH="$HOME/.local/bin:$PATH"

# appimagetool (auto-downloaded by tauri-cli, or manually):
curl -sL https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage \
  -o ~/.local/bin/appimagetool
chmod +x ~/.local/bin/appimagetool
export PATH="$HOME/.local/bin:$PATH"
```

**Build:**

```bash
cd apps/shell

# AppImage only
APPIMAGE_EXTRACT_AND_RUN=1 cargo tauri build --bundles appimage

# .deb only
cargo tauri build --bundles deb

# Both at once
APPIMAGE_EXTRACT_AND_RUN=1 cargo tauri build --bundles appimage,deb
```

> `APPIMAGE_EXTRACT_AND_RUN=1` is needed when running inside a container or
> when FUSE is not available (HAOS, Docker, etc.).

**Artifacts:**
```
target/release/bundle/appimage/LIMEN OS_0.1.0_amd64.AppImage   (76 MB)
target/release/bundle/deb/LIMEN OS_0.1.0_amd64.deb             (4.7 MB)
```

**Install the .deb:**
```bash
sudo dpkg -i "target/release/bundle/deb/LIMEN OS_0.1.0_amd64.deb"
# Fix deps if needed:
sudo apt-get install -f
```

**Run the AppImage (no install):**
```bash
chmod +x "LIMEN OS_0.1.0_amd64.AppImage"
./LIMEN\ OS_0.1.0_amd64.AppImage
# Or with env:
GDK_BACKEND=x11 ./LIMEN\ OS_0.1.0_amd64.AppImage
```

---

### 3.2 Fedora / RHEL / openSUSE (.rpm)

Tauri can also produce `.rpm`. Install the RPM build tools, then:

```bash
# Fedora
sudo dnf install -y webkit2gtk4.1-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  patchelf \
  openssl-devel \
  pkg-config

cd apps/shell
APPIMAGE_EXTRACT_AND_RUN=1 cargo tauri build --bundles rpm
```

> Artifact: `target/release/bundle/rpm/*.rpm`

```bash
sudo rpm -i limen-os-*.rpm
# or
sudo dnf localinstall limen-os-*.rpm
```

---

### 3.3 Arch Linux (PKGBUILD)

Create a minimal `PKGBUILD` referencing the AppImage:

```bash
# pkgbase=limen-os
# pkgver=0.1.0
# source=(limen-os-0.1.0-linux-x86_64.AppImage)
# sha256sums=(SKIP)

# Build from source instead:
yay -S webkit2gtk-4.1 libappindicator-gtk3 patchelf librsvg
cd apps/shell
APPIMAGE_EXTRACT_AND_RUN=1 cargo tauri build --bundles appimage,deb
```

For a proper AUR package, ship the AppImage as the binary source.

---

## 4. Linux ARM64 — Raspberry Pi / Jetson

### 4.1 Raspberry Pi 4 (4 GB+ RAM)

**OS:** Raspberry Pi OS 64-bit (Bookworm, Debian 12) — **must be 64-bit**.

```bash
# On the Pi itself (SSH in or with keyboard):
sudo apt-get update
sudo apt-get install -y \
  curl build-essential git \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-bin \
  patchelf \
  libssl-dev \
  pkg-config

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Install Bun
curl -fsSL https://bun.sh/install | bash
source "$HOME/.bashrc"

# Install tauri-cli (takes ~15 min on Pi 4)
cargo install tauri-cli --version "^2" --locked

# Clone + build
git clone https://github.com/waldiez/limen-os.git
cd limen-os
bun install
make packages-build

cd apps/shell
APPIMAGE_EXTRACT_AND_RUN=1 cargo tauri build --bundles appimage,deb
```

> **Expected build time on Pi 4:** ~45–90 minutes for first build (Rust compile is slow).
> Subsequent incremental builds: ~10–15 minutes.
> **RAM:** Close all other apps before building. 4 GB is tight; use a swap file if needed:
> ```bash
> sudo dphys-swapfile swapoff
> sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
> sudo dphys-swapfile setup && sudo dphys-swapfile swapon
> ```

**Run on Pi (headless / Wayland / X11):**
```bash
# X11:
DISPLAY=:0 GDK_BACKEND=x11 ./LIMEN\ OS_0.1.0_arm64.AppImage

# Wayland (Pi 5 default):
./LIMEN\ OS_0.1.0_arm64.AppImage

# Headless → use TUI instead (recommended for Pi 4):
./limen-tui-0.1.0-linux-arm64
```

---

### 4.2 Raspberry Pi 5

Pi 5 has significantly more power (4× faster CPU, better GPU). Wayland/labwc works well.

```bash
# Same steps as Pi 4, but builds in ~20–30 minutes.
# Pi 5 can run the full WebGL shell at 1080p comfortably.
# Use bookworm 64-bit OS with the Wayland desktop.

# For Wayland display:
export WAYLAND_DISPLAY=wayland-1
./LIMEN\ OS_0.1.0_arm64.AppImage
```

---

### 4.3 Self-hosted GitHub Actions Runner on Pi

This lets CI builds happen natively on your Pi (no cross-compilation):

```bash
# On the Pi:
mkdir actions-runner && cd actions-runner
# Download from: https://github.com/your-org/limen-os/settings/actions/runners/new
# Select: Linux / ARM64
curl -o actions-runner-linux-arm64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.323.0/actions-runner-linux-arm64-2.323.0.tar.gz
tar xzf actions-runner-linux-arm64.tar.gz
./config.sh --url https://github.com/waldiez/limen-os --token YOUR_TOKEN
sudo ./svc.sh install && sudo ./svc.sh start
```

Then in the workflow, change:
```yaml
# linux-arm64 job:
runs-on: self-hosted  # instead of ubuntu-22.04-arm
```

---

### 4.4 Cross-compile from x86_64 (Faster, No Pi Needed)

Cross-compiling the **TUI** is easy. The **shell** (WebKit) is harder due to native libs.

**TUI cross-compile (works great):**

```bash
# Install cross-linker
sudo apt-get install -y gcc-aarch64-linux-gnu

# Add Rust target
rustup target add aarch64-unknown-linux-gnu

# Build
export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc
cargo build --release -p limen-tui --target aarch64-unknown-linux-gnu

# Output: target/aarch64-unknown-linux-gnu/release/limen-tui
# Copy to Pi and run directly — no install needed.
scp target/aarch64-unknown-linux-gnu/release/limen-tui pi@raspberrypi.local:~/
ssh pi@raspberrypi.local ./limen-tui
```

**Shell cross-compile (via Docker multi-arch):**

```bash
# Use cross tool (handles sysroot automatically)
cargo install cross
cross build --release -p limen-shell --target aarch64-unknown-linux-gnu
# Note: Tauri bundling (AppImage/deb) still requires native runner.
# Cross gives you the binary; bundle it separately on a Pi.
```

---

## 5. macOS — .app + .dmg

### 5.1 Apple Silicon MacBook (M1/M2/M3/M4)

```bash
# Prerequisites (one-time):
xcode-select --install

# Install Homebrew if not present:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup target add x86_64-apple-darwin   # for universal binary

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install tauri-cli
cargo install tauri-cli --version "^2" --locked

# Clone repo
git clone https://github.com/waldiez/limen-os.git
cd limen-os
bun install && make packages-build

# Build native arm64 .dmg
cd apps/shell
cargo tauri build --bundles dmg

# Artifact:
# target/aarch64-apple-darwin/release/bundle/dmg/*.dmg
```

---

### 5.2 Intel Mac

```bash
# Same as above, but native target is x86_64-apple-darwin.
# No extra rustup target needed for x86_64-only build.
cd apps/shell
cargo tauri build --bundles dmg
# target/x86_64-apple-darwin/release/bundle/dmg/*.dmg
```

---

### 5.3 Universal Binary (Intel + Apple Silicon in one .dmg)

```bash
# Must be run on macOS (either Intel or Apple Silicon)
rustup target add x86_64-apple-darwin aarch64-apple-darwin

cd apps/shell
cargo tauri build --target universal-apple-darwin --bundles app,dmg

# Artifact (runs natively on both Intel and M-series):
# target/universal-apple-darwin/release/bundle/dmg/*.dmg  (~150 MB)
```

---

### 5.4 Codesigning + Notarization

For distribution outside the App Store (direct download):

```bash
# Set environment:
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="your@apple.id"
export APPLE_PASSWORD="app-specific-password"   # from appleid.apple.com
export APPLE_TEAM_ID="YOURTEAMID"

# Add to tauri.conf.json → bundle → macOS:
# {
#   "signingIdentity": "Developer ID Application: ...",
#   "notarize": true
# }

cd apps/shell
cargo tauri build --target universal-apple-darwin --bundles dmg
```

> Without codesigning, macOS Gatekeeper will show "cannot be opened because Apple
> cannot check it for malicious software." Users can bypass via:
> `System Settings → Privacy & Security → Open Anyway`
> Or: `xattr -dr com.apple.quarantine LIMEN\ OS.app`

---

## 6. Windows — .exe + .msi

### 6.1 Native Build on Windows

Run in **PowerShell** or **Git Bash** on Windows 11:

```powershell
# Prerequisites:
# 1. Install Visual Studio Build Tools (C++ workload):
#    https://visualstudio.microsoft.com/visual-cpp-build-tools/
# 2. Install Rust:
winget install Rustlang.Rustup
# Or: https://win.rustup.rs/

# 3. Install Bun:
powershell -c "irm bun.sh/install.ps1 | iex"

# 4. WebView2 (pre-installed on Win 10/11, but for older systems):
#    https://developer.microsoft.com/microsoft-edge/webview2/

# 5. Install tauri-cli:
cargo install tauri-cli --version "^2" --locked

# 6. NSIS (for .exe installer):
winget install NSIS.NSIS
# Or: https://nsis.sourceforge.io/Download

# Clone and build:
git clone https://github.com/waldiez/limen-os.git
cd limen-os
bun install

# Build JS packages:
cd packages\voice-client && bun run build && cd ..\..
cd packages\ai-client && bun run build && cd ..\..
cd packages\ui && bun run build && cd ..\..
cd packages\smart-cities-client && bun run build && cd ..\..

# Build Windows installers:
cd apps\shell
cargo tauri build --bundles nsis,msi
```

**Artifacts:**
```
target\release\bundle\nsis\LIMEN OS_0.1.0_x64-setup.exe   (NSIS installer, ~80 MB)
target\release\bundle\msi\LIMEN OS_0.1.0_x64_en-US.msi    (WiX MSI, ~80 MB)
```

---

### 6.2 Cross-compile from Linux (Advanced)

Building Windows binaries from Linux (CI / no Windows machine):

```bash
# Install cargo-xwin (handles MSVC sysroot automatically)
cargo install cargo-xwin

# Add Windows target
rustup target add x86_64-pc-windows-msvc

# Cross-compile TUI (works great):
cargo xwin build --release -p limen-tui --target x86_64-pc-windows-msvc
# Output: target/x86_64-pc-windows-msvc/release/limen-tui.exe

# For the shell (Tauri + WebView2):
# Full bundling (NSIS installer) requires Windows runner.
# Use GitHub Actions windows-latest for this.
```

---

### 6.3 NSIS vs WiX

| Feature | NSIS (.exe) | WiX (.msi) |
|---------|-------------|------------|
| Size | Smaller | Larger |
| Look | Customizable (can add splash) | Standard Windows dialogs |
| Enterprise deployment | Manual | ✅ Group Policy / Intune |
| Silent install | `setup.exe /S` | `msiexec /i file.msi /quiet` |
| Auto-update | Via Tauri Updater | Via Tauri Updater |
| Recommended | ✅ End users | ✅ Enterprise/IT |

---

## 7. CI/CD — GitHub Actions

The workflow at `.github/workflows/release.yml` builds all platforms automatically.

**Trigger a release:**
```bash
git tag v0.2.0
git push origin v0.2.0
# GitHub Actions builds all 5 jobs in parallel and creates a release.
```

**Manual trigger (test without tag):**
```
GitHub → Actions → Release — Multi-platform Bundles → Run workflow
```

**Required secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose | Required for |
|--------|---------|-------------|
| `GITHUB_TOKEN` | Auto-provided, no setup needed | All platforms |
| `APPLE_CERTIFICATE` | Base64 `.p12` cert | macOS signed |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 password | macOS signed |
| `APPLE_SIGNING_IDENTITY` | "Developer ID Application: ..." | macOS signed |
| `APPLE_ID` | Your Apple ID email | macOS notarization |
| `APPLE_PASSWORD` | App-specific password | macOS notarization |
| `APPLE_TEAM_ID` | 10-char team ID | macOS notarization |

---

## 8. TUI Binary — All Platforms

The TUI (`apps/tui/`) is a single static binary — the most portable artifact.
**No WebKit, no GPU, no display server needed.** SSH-accessible.

```bash
# Native (whatever machine you're on):
cargo build --release -p limen-tui
./target/release/limen-tui

# Cross-compile targets:
rustup target add \
  x86_64-unknown-linux-gnu \
  aarch64-unknown-linux-gnu \
  x86_64-apple-darwin \
  aarch64-apple-darwin \
  x86_64-pc-windows-msvc

# Linux ARM64 (for Pi):
export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc
cargo build --release -p limen-tui --target aarch64-unknown-linux-gnu

# macOS Universal:
cargo build --release -p limen-tui --target x86_64-apple-darwin
cargo build --release -p limen-tui --target aarch64-apple-darwin
lipo -create \
  target/x86_64-apple-darwin/release/limen-tui \
  target/aarch64-apple-darwin/release/limen-tui \
  -output limen-tui-macos-universal
```

**SSH into any machine and use TUI:**
```bash
scp limen-tui-linux-arm64 pi@limen-pi.local:~/
ssh pi@limen-pi.local
./limen-tui
```

---

## 9. Flutter Mobile (Android / iOS)

### Android APK

```bash
# Prerequisites: Android SDK (ANDROID_HOME set), JDK 17+
# Already configured: ANDROID_HOME=/opt/limen/android

cd apps/mobile
flutter pub get
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk

# Sideload on device:
adb install build/app/outputs/flutter-apk/app-release.apk
```

### Android AAB (Google Play)

```bash
flutter build appbundle --release
# Output: build/app/outputs/bundle/release/app-release.aab
```

### iOS .ipa

Must be built on macOS with Xcode:

```bash
# On macOS:
cd apps/mobile
flutter build ipa --release
# Output: build/ios/ipa/*.ipa
# Upload to TestFlight or distribute via MDM.
```

---

## 10. Artifact Naming Convention

```
limen-os-{VERSION}-{PLATFORM}-{ARCH}{EXT}
```

| Token | Values |
|-------|--------|
| `VERSION` | `0.1.0`, `0.2.0-beta1` |
| `PLATFORM` | `linux`, `macos`, `windows` |
| `ARCH` | `x86_64`, `arm64`, `universal` |
| `EXT` | `.AppImage`, `.deb`, `.rpm`, `.dmg`, `.exe`, `.msi` |

Examples:
```
limen-os-0.2.0-linux-x86_64.AppImage
limen-os-0.2.0-linux-arm64.deb
limen-os-0.2.0-macos-universal.dmg
limen-os-0.2.0-windows-x64-setup.exe
limen-os-0.2.0-windows-x64.msi
limen-tui-0.2.0-linux-x86_64
limen-tui-0.2.0-linux-arm64
```

---

## 11. Checksums & Release Verification

**Generate checksums after build:**

```bash
cd target/release/bundle

# All bundles at once:
find . -type f \( -name "*.AppImage" -o -name "*.deb" -o -name "*.dmg" -o -name "*.exe" -o -name "*.msi" \) \
  -exec sha256sum {} \; > SHA256SUMS.txt

cat SHA256SUMS.txt
```

**Verify a downloaded file:**

```bash
# Linux / macOS:
sha256sum -c SHA256SUMS.txt

# Windows (PowerShell):
Get-FileHash limen-os-0.2.0-windows-x64-setup.exe -Algorithm SHA256
```

**Sign the checksums file (GPG):**

```bash
gpg --armor --detach-sign SHA256SUMS.txt
# Produces SHA256SUMS.txt.asc
# Publish both SHA256SUMS.txt and SHA256SUMS.txt.asc with the release.
```

---

## Quick Decision Tree

```
What machine do you have?
│
├─ Linux x86_64 laptop/desktop
│   ├─ Build NOW: make shell-build → AppImage + .deb ✅
│   └─ SSH into Pi: scp limen-tui-linux-arm64 pi@...
│
├─ macOS (Apple Silicon or Intel)
│   └─ cargo tauri build --target universal-apple-darwin --bundles dmg
│
├─ Windows
│   └─ cargo tauri build --bundles nsis,msi
│
├─ Raspberry Pi 4 (4 GB)
│   ├─ Recommended: run limen-tui binary (instant, tiny)
│   └─ Full shell: possible but slow to build (1h+), marginal at runtime
│
├─ Raspberry Pi 5
│   └─ Full shell: works well. Build natively or use self-hosted runner.
│
└─ No machine available / CI only
    └─ Push a version tag → GitHub Actions builds everything automatically
```
