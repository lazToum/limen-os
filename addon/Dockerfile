# LIMEN OS — Home Assistant Add-on Container
# ──────────────────────────────────────────────────────────────────────────────
# BUILD_FROM is injected by the HA Supervisor from build.yaml.
# During local `docker build`, pass it manually:
#   docker build --build-arg BUILD_FROM=homeassistant/amd64-base-debian:bookworm .
ARG BUILD_FROM
FROM ${BUILD_FROM}

# ── Build-time args ───────────────────────────────────────────────────────────
# TARGETARCH is set by Docker BuildKit (amd64 / arm64 / arm).
# We use it to download the correct ttyd binary.
ARG TARGETARCH

# ── Environment ───────────────────────────────────────────────────────────────
ENV LIMEN_ROOT=/opt/limen \
    BUN_INSTALL=/root/.bun \
    RUSTUP_HOME=/root/.rustup \
    CARGO_HOME=/root/.cargo \
    PATH="/root/.bun/bin:/root/.cargo/bin:${PATH}" \
    DEBIAN_FRONTEND=noninteractive

# ── System packages ───────────────────────────────────────────────────────────
# Core build & runtime deps in one layer to keep the image cache-friendly.
# - build-essential / pkg-config / libssl-dev: needed by Rust crates (ring, etc.)
# - x11vnc + xvfb: virtual display + VNC mirror
# - websockify + novnc: noVNC bridge (websockify ships the noVNC assets)
# - chromium: kiosk renderer for the Babylon.js shell
# - fonts-liberation + fonts-noto: sane font fallbacks inside Chromium
RUN apt-get update -q && \
    apt-get install -y --no-install-recommends \
      # system essentials
      ca-certificates curl wget git unzip \
      # build chain
      build-essential pkg-config libssl-dev \
      # virtual display + remote view
      xvfb x11vnc novnc websockify \
      # kiosk browser
      chromium \
      # fonts (Chromium needs these)
      fonts-liberation fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

# ── Bun (JavaScript runtime + package manager) ────────────────────────────────
# Install into /root/.bun so it's available to the root user that runs the add-on.
RUN curl -fsSL https://bun.sh/install | bash && \
    bun --version

# ── Rust (stable toolchain via rustup) ───────────────────────────────────────
# --no-modify-path: we already set PATH above.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
      sh -s -- -y --default-toolchain stable --no-modify-path && \
    cargo --version

# ── ttyd (web terminal — wraps limen-tui) ───────────────────────────────────
# Try GitHub releases first; fall back to apt (available in Debian 12+).
# Map Docker TARGETARCH → ttyd release naming convention.
RUN set -e; \
    case "${TARGETARCH}" in \
      amd64)  TTYD_ARCH="x86_64"   ;; \
      arm64)  TTYD_ARCH="aarch64"  ;; \
      arm)    TTYD_ARCH="armhf"    ;; \
      *)      TTYD_ARCH="x86_64"   ;; \
    esac; \
    TTYD_URL="https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.${TTYD_ARCH}"; \
    if curl -fsSL --max-time 30 "${TTYD_URL}" -o /usr/local/bin/ttyd 2>/dev/null; then \
      chmod +x /usr/local/bin/ttyd; \
      echo "ttyd installed from GitHub releases (arch: ${TTYD_ARCH})"; \
    else \
      echo "GitHub release download failed, trying apt..."; \
      apt-get update -q && apt-get install -y --no-install-recommends ttyd \
        && rm -rf /var/lib/apt/lists/* || \
        echo "WARNING: ttyd not available — TUI web terminal will be disabled"; \
    fi

# ── Application source ────────────────────────────────────────────────────────
# Copy the entire repo. The .dockerignore should exclude node_modules, target/,
# .git/, etc. to keep the context small.
COPY . /opt/limen
WORKDIR /opt/limen

# ── JavaScript dependencies ───────────────────────────────────────────────────
# --frozen-lockfile: fail if bun.lock is out of date (reproducible builds).
# Fall back to a plain `bun install` if the lock file isn't present yet.
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# ── Build the shell frontend ──────────────────────────────────────────────────
# Produces apps/shell/dist/ (served by serve.ts at runtime).
RUN bun run build

# ── Runtime symlinks / dirs ───────────────────────────────────────────────────
# /data — HA Supervisor mounts the add-on's persistent data here.
# /config/limen — will be symlinked at runtime by run.sh once /config is mounted.
RUN mkdir -p /data /etc/limen

# ── Exposed ports ─────────────────────────────────────────────────────────────
# 1420 — serve.ts SPA + proxy
# 6080 — noVNC (websockify → VNC)
# 7681 — ttyd web terminal
EXPOSE 1420 6080 7681

# ── Entrypoint ────────────────────────────────────────────────────────────────
CMD ["/opt/limen/addon/run.sh"]
