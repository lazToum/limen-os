# LIMEN OS — Build Orchestration
# cspell: disable
.DEFAULT_GOAL := help

.PHONY: help all setup vendor dev dev-full build check lint format test precommit smoke push \
        packages-build shell-dev shell-build shell-check \
        bundle-linux bundle-appimage bundle-deb bundle-tui \
        tui-dev tui-build tui-check \
        mobile-dev mobile-web mobile-web-server mobile-web-copy mobile-web-enable mobile-build mobile-check \
        tauri-android-init tauri-ios-init tauri-android-dev tauri-ios-dev tauri-android tauri-ios \
        rust-check rust-test rust-fmt \
        ts-check ts-test ts-fmt \
        flutter-check flutter-fmt flutter-test \
        py-fmt \
        docs docs-html \
        clean \
        server-build server-serve server-install server-install-spa server-install-kiosk server-status install-dist \
        stack-up stack-down stack-logs stack-workers stack-ha stack-sim \
        haos-stack-up haos-stack-down haos-stack-logs \
        dev-services-up dev-services-down dev-services-logs dev-sim-up dev-sim-down \
        docker-build docker-build-sim docker-build-agentflow \
        jupyter-setup jupyter-service nodered-setup nodered-service tui-setup tui-service services-setup services-status \
        deploy mock-agents sync-tools \
        ec2-pull pull pull-smoke push-synapsd \
        ha-tunnel ha-tunnel-install ha-tunnel-uninstall ha-tunnel-status \
        vagrant-up vagrant-kiosk vagrant-ssh vagrant-halt vagrant-destroy \
        vagrant-haos \
        bb-setup bb-kiosk bb-tui bb-haos \
        addon-install addon-dev

# ── Toolchain ─────────────────────────────────────────────────────────────────
# Prepend deb-installed toolchain dirs to PATH so all recipes (including sudo ones)
# pick up rustc 1.94 / cargo from ~/.local/deb instead of system rustc 1.85.
# Both $(HOME)/.local/deb/... (current user) and /home/limen/... (when sudo) are listed.
export PATH := /home/limen/.local/deb/cargo/bin:$(HOME)/.local/deb/cargo/bin:$(PATH)
export PATH := /home/limen/.local/deb/.bun/bin:$(HOME)/.local/deb/.bun/bin:$(PATH)
CARGO       := cargo
BUN         := bun
FLUTTER     := flutter
CARGO_ARGS  := --color always

# ── Common paths ──────────────────────────────────────────────────────────────
SHELL_DIR    := apps/shell
TUI_DIR      := apps/tui
MOBILE_DIR   := apps/mobile
STACK_FILE   := docker/stack.yml
HAOS_STACK   := docker/haos-stack.yml
AGENTFLOW    := docker/tools/agentflow
LIMEN_ROOT ?= /opt/limen
BIND         := BIND_HOST=127.0.0.1

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD  := \033[1m
CYAN  := \033[36m
GREEN := \033[32m
DIM   := \033[2m
RESET := \033[0m

# ─────────────────────────────────────────────────────────────────────────────
# TOP-LEVEL
# ─────────────────────────────────────────────────────────────────────────────

## help: Show this help
help:
	@printf "\n$(BOLD)LIMEN OS — available targets$(RESET)\n\n"
	@grep -E '^## [a-z]' $(MAKEFILE_LIST) \
	  | awk '{ printf "  $(CYAN)%-28s$(RESET) %s\n", $$2, substr($$0, index($$0,$$3)) }'
	@printf "\n$(DIM)Toolchain: cargo=$(CARGO)  bun=$(BUN)  flutter=$(FLUTTER)$(RESET)\n\n"

## all: Build everything
all: build

## setup: Install all dependencies (first-time setup)
setup:
	@printf "$(BOLD)>>> Setting up LIMEN OS...$(RESET)\n"
	$(CARGO) install tauri-cli --version "^2" --locked
	$(CARGO) install cargo-nextest --locked
	$(CARGO) install cargo-watch --locked
	$(BUN) install
	@$(MAKE) packages-build
	cd $(MOBILE_DIR) && $(FLUTTER) pub get
	@printf "$(GREEN)✓ Setup complete.$(RESET)\n"

## dev: Start shell + TUI in dev mode (hot reload)
dev:
	@$(MAKE) -j2 shell-dev tui-dev

## dev-full: Start shell + TUI + Flutter web companion all at once
dev-full:
	@$(MAKE) -j3 shell-dev tui-dev mobile-web-server

## build: Build all apps for release
build: shell-build tui-build mobile-build
	@printf "$(GREEN)✓ All builds complete.$(RESET)\n"

## check: Run all linters and type checks (Rust + TS + Flutter)
check: rust-check ts-check flutter-check
	@printf "$(GREEN)✓ All checks passed.$(RESET)\n"

## lint: Alias for check
lint: check

## format: Auto-format all code (Rust · TS/JS · Python · Dart)
format: rust-fmt ts-fmt py-fmt flutter-fmt
	@printf "$(GREEN)✓ All code formatted.$(RESET)\n"

## test: Run all test suites
test: rust-test ts-test flutter-test
	@printf "$(GREEN)✓ All tests passed.$(RESET)\n"

## precommit: Run pre-commit on all files (requires: pip install pre-commit && pre-commit install)
precommit:
	pre-commit run --all-files

## smoke: TS + Rust type-check + verify dist/ — run before every push
smoke:
	@bash scripts/ec2-push.sh smoke

# ─────────────────────────────────────────────────────────────────────────────
# SHELL (Tauri + React)
# ─────────────────────────────────────────────────────────────────────────────

## packages-build: Build all JS workspace packages (voice-client, ai-client, ui, smart-cities-client)
packages-build:
	@printf "$(BOLD)>>> Building JS workspace packages...$(RESET)\n"
	cd packages/voice-client        && $(BUN) run build
	cd packages/ai-client           && $(BUN) run build
	cd packages/ui                  && $(BUN) run build
	cd packages/smart-cities-client && $(BUN) run build

## shell-dev: Start Tauri shell in dev mode (hot reload)
shell-dev: packages-build
	cd $(SHELL_DIR) && GDK_BACKEND=x11 $(CARGO) tauri dev

## shell-build: Build Tauri shell for release
shell-build: packages-build
	cd $(SHELL_DIR) && $(CARGO) tauri build

## shell-check: Type-check shell frontend + Rust backend
shell-check:
	cd $(SHELL_DIR) && $(BUN) run check
	$(CARGO) check -p limen-shell $(CARGO_ARGS)

# ─────────────────────────────────────────────────────────────────────────────
# TUI (Ratatui)
# ─────────────────────────────────────────────────────────────────────────────

## tui-dev: Start TUI with cargo-watch (auto-rebuild on change)
tui-dev:
	$(CARGO) watch -x "run -p limen-tui" -w $(TUI_DIR)/src -w crates/

## tui-build: Build TUI binary for release
tui-build:
	$(CARGO) build --release -p limen-tui $(CARGO_ARGS)

## tui-check: Clippy on TUI
tui-check:
	$(CARGO) clippy -p limen-tui $(CARGO_ARGS) -- -D warnings

# ─────────────────────────────────────────────────────────────────────────────
# MOBILE (Flutter)
# ─────────────────────────────────────────────────────────────────────────────

## mobile-dev: Run Flutter app on connected device / emulator
mobile-dev:
	cd $(MOBILE_DIR) && $(FLUTTER) run

## mobile-web: Run Flutter app in Chrome (web mode, port 4174)
mobile-web:
	cd $(MOBILE_DIR) && $(FLUTTER) run -d chrome --web-port 4174

## mobile-web-server: Serve Flutter web headlessly for shell embedding (port 4174)
mobile-web-server:
	cd $(MOBILE_DIR) && $(FLUTTER) run -d web-server --web-port 4174 --web-hostname 0.0.0.0

## mobile-web-copy: Build Flutter web and copy into shell public/mobile/ (bundled by Vite)
mobile-web-copy:
	cd $(MOBILE_DIR) && $(FLUTTER) build web --release --base-href /mobile/
	mkdir -p $(SHELL_DIR)/public/mobile
	rsync -a --delete $(MOBILE_DIR)/build/web/. $(SHELL_DIR)/public/mobile/
	@printf "$(GREEN)✓ Flutter web copied to $(SHELL_DIR)/public/mobile/$(RESET)\n"

## mobile-web-enable: Add web platform support to the Flutter app (run once)
mobile-web-enable:
	cd $(MOBILE_DIR) && $(FLUTTER) create --platforms web .

## mobile-build: Build Flutter APK + web
mobile-build:
	cd $(MOBILE_DIR) && $(FLUTTER) build apk --release
	cd $(MOBILE_DIR) && $(FLUTTER) build web --release --base-href /mobile/

## mobile-check: flutter analyze
mobile-check:
	cd $(MOBILE_DIR) && $(FLUTTER) analyze

# ─────────────────────────────────────────────────────────────────────────────
# TAURI MOBILE (iOS / Android)
# ─────────────────────────────────────────────────────────────────────────────

## tauri-android-init: Initialize Tauri Android target (run once, requires Android SDK)
tauri-android-init:
	cd $(SHELL_DIR) && $(CARGO) tauri android init

## tauri-ios-init: Initialize Tauri iOS target (run once, requires Xcode on macOS)
tauri-ios-init:
	cd $(SHELL_DIR) && $(CARGO) tauri ios init

## tauri-android-dev: Run Tauri shell on Android device/emulator
tauri-android-dev: packages-build
	cd $(SHELL_DIR) && $(CARGO) tauri android dev

## tauri-ios-dev: Run Tauri shell on iOS simulator or device
tauri-ios-dev: packages-build
	cd $(SHELL_DIR) && $(CARGO) tauri ios dev

## tauri-android: Build Tauri Android APK
tauri-android: packages-build
	cd $(SHELL_DIR) && $(CARGO) tauri android build --apk

## tauri-ios: Build Tauri iOS IPA
tauri-ios: packages-build
	cd $(SHELL_DIR) && $(CARGO) tauri ios build

# ─────────────────────────────────────────────────────────────────────────────
# RUST
# ─────────────────────────────────────────────────────────────────────────────

## rust-check: cargo clippy on all crates
rust-check:
	$(CARGO) clippy --all $(CARGO_ARGS) -- -D warnings

## rust-test: cargo nextest on all crates
rust-test:
	$(CARGO) nextest run --all $(CARGO_ARGS)

## rust-fmt: format all Rust code
rust-fmt:
	$(CARGO) fmt --all

# ─────────────────────────────────────────────────────────────────────────────
# TYPESCRIPT / BUN
# ─────────────────────────────────────────────────────────────────────────────

## ts-check: tsc + ESLint across all TS packages
ts-check:
	$(BUN) run check

## ts-test: bun test all TS packages
ts-test:
	$(BUN) test

## ts-fmt: format all TS/JS/CSS files with Prettier
ts-fmt:
	$(BUN) run format

# ─────────────────────────────────────────────────────────────────────────────
# PYTHON (AgentFlow)
# ─────────────────────────────────────────────────────────────────────────────

## py-fmt: format and auto-fix Python code (agentflow) with ruff
py-fmt:
	cd $(AGENTFLOW) && ruff format . && ruff check --select=E9,F --fix . || true

# ─────────────────────────────────────────────────────────────────────────────
# FLUTTER / DART
# ─────────────────────────────────────────────────────────────────────────────

## flutter-check: flutter analyze
flutter-check:
	cd $(MOBILE_DIR) && $(FLUTTER) analyze

## flutter-fmt: format all Dart code
flutter-fmt:
	cd $(MOBILE_DIR) && dart format .

## flutter-test: flutter test
flutter-test:
	cd $(MOBILE_DIR) && $(FLUTTER) test

# ─────────────────────────────────────────────────────────────────────────────
# DOCS
# ─────────────────────────────────────────────────────────────────────────────

## docs: Generate all documentation (html pages + rustdoc)
docs: docs-html
	$(CARGO) doc --all --no-deps --open

## docs-html: Regenerate all docs/*.html from their *.md sources (requires pandoc)
docs-html:
	@bash scripts/docs-html.sh

# ─────────────────────────────────────────────────────────────────────────────
# UTILITIES
# ─────────────────────────────────────────────────────────────────────────────

## clean: Remove all build artifacts
clean:
	$(CARGO) clean
	rm -rf $(SHELL_DIR)/dist $(SHELL_DIR)/src-tauri/target
	rm -rf $(MOBILE_DIR)/build
	find . -name "node_modules" -type d -prune -exec rm -rf {} +
	find . -name ".dart_tool"   -type d -prune -exec rm -rf {} +

## vendor: Sync external sources into services/vendor/ dirs (set LIMEN_CODE_DIR)
vendor:
	@[ -n "$(LIMEN_CODE_DIR)" ] || { \
	  printf "$(BOLD)Error:$(RESET) LIMEN_CODE_DIR is not set.\n"; \
	  printf "Usage: make vendor LIMEN_CODE_DIR=/path/to/limen/code/limen\n"; \
	  exit 1; \
	}
	@printf "$(BOLD)>>> Vendoring demo/ ...$(RESET)\n"
	@rsync -a --delete \
	  --exclude='__pycache__' --exclude='*.pyc' \
	  "$(LIMEN_CODE_DIR)/demo/" services/smartcities/vendor/demo/
	@printf "$(BOLD)>>> Vendoring SAF agents ...$(RESET)\n"
	@rsync -a --delete \
	  --exclude='.venv' --exclude='venv' --exclude='__pycache__' \
	  --exclude='*.pyc' --exclude='*.egg-info' \
	  "$(LIMEN_CODE_DIR)/packages/agents/implementations/python/" \
	  services/smartcities/vendor/saf/
	@printf "$(BOLD)>>> Vendoring sinergym/ ...$(RESET)\n"
	@rsync -a --delete \
	  --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
	  --exclude='.venv' --exclude='venv' --exclude='*.epw' --exclude='*.egg-info' \
	  --exclude='.pytest_cache' --exclude='output/' \
	  "$(LIMEN_CODE_DIR)/sinergym/" services/sinergym/vendor/sinergym/
	@printf "$(GREEN)✓ Vendor dirs updated — run: make dev-sim-up$(RESET)\n"

## sync-tools: Copy agentflow source into docker/tools/agentflow/ (keeps Workers image up to date)
# Override: AGENTFLOW_SRC=/path/to/agentflow make sync-tools
_REAL_DIR := $(shell cd "$(CURDIR)" && pwd -P)
AGENTFLOW_SRC ?= $(shell \
  d1="$(_REAL_DIR)"; d2="$(CURDIR)"; \
  for base in "$$d1" "$$d2"; do \
    for up in .. ../.. ../../.. ../../../..; do \
      p="$$base/$$up/agentflow"; \
      [ -f "$$p/agentflow/__init__.py" ] && echo "$$p" && exit 0; \
    done; \
  done)

sync-tools:
	@if [ -d "$(AGENTFLOW_SRC)" ]; then \
	  printf "$(BOLD)>>> Syncing $(AGENTFLOW_SRC) → $(AGENTFLOW)/$(RESET)\n"; \
	  rsync -a --delete \
	    --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
	    --exclude='.venv' --exclude='venv' --exclude='dist' --exclude='*.egg-info' \
	    "$(AGENTFLOW_SRC)/" $(AGENTFLOW)/; \
	  printf "$(GREEN)✓ Done.$(RESET)\n"; \
	else \
	  printf "$(BOLD)agentflow source not found.$(RESET) Set AGENTFLOW_SRC=/path/to/agentflow\n"; \
	fi

## mock-agents: Run fake MQTT agent stream on ws://localhost:9001 (AgentFlow dev)
mock-agents:
	node scripts/mock-agents.mjs

# ─────────────────────────────────────────────────────────────────────────────
# EC2 / REMOTE PUSH
# ─────────────────────────────────────────────────────────────────────────────

## push: Smoke-test → build → rsync to EC2 (first run bootstraps, subsequent reloads)
push:
	@bash scripts/ec2-push.sh push

## push-synapsd: Build synapsd and rsync only the binary to EC2
## Usage:  make push-synapsd
##         CARGO_TARGET=x86_64-unknown-linux-gnu make push-synapsd  (cross via zigbuild)
push-synapsd:
	@set -e; \
	TARGET=$${CARGO_TARGET:-}; \
	if [ -n "$$TARGET" ]; then \
	    cargo zigbuild --release -p limen-core --bin synapsd --target $$TARGET; \
	    BIN="target/$$TARGET/release/synapsd"; \
	else \
	    cargo build --release -p limen-core --bin synapsd; \
	    BIN="target/release/synapsd"; \
	fi; \
	EC2_HOST=$${EC2_HOST:-limen@io.limen.io}; \
	EC2_KEY=$${EC2_KEY:-}; \
	SSH_OPTS=$$([ -n "$$EC2_KEY" ] && echo "-i $$EC2_KEY" || echo ""); \
	REMOTE_DIR=$${REMOTE_DIR:-/opt/limen}; \
	printf "$(BOLD)→ rsyncing $$BIN → $$EC2_HOST:$$REMOTE_DIR/target/release/synapsd$(RESET)\n"; \
	ssh $$SSH_OPTS $$EC2_HOST "mkdir -p $$REMOTE_DIR/target/release"; \
	rsync -az --progress $$SSH_OPTS $$BIN $$EC2_HOST:$$REMOTE_DIR/target/release/synapsd; \
	ssh $$SSH_OPTS $$EC2_HOST "sudo systemctl restart synapsd && printf '$(GREEN)✓ synapsd restarted$(RESET)\n'"

## ec2-pull: Pull latest code FROM Limen OS server → this machine
ec2-pull:
	@bash scripts/ec2-pull.sh

## pull: rsync source FROM Limen OS → laptop (set LAPTOP_HOST in .laptop.env)
pull:
	@bash scripts/laptop-push.sh push

## pull-smoke: Smoke-test only (no rsync)
pull-smoke:
	@bash scripts/laptop-push.sh smoke

## deploy: Build frontend, scp to remote (if LIMEN_HOST set), git push
deploy:
	@bash scripts/deploy.sh

# ─────────────────────────────────────────────────────────────────────────────
# HOME ASSISTANT TUNNEL
# ─────────────────────────────────────────────────────────────────────────────

## ha-agent: Bun WebSocket proxy agent — local HA → EC2 (outbound, no SSH/NAT needed)
## Usage:  make ha-agent
##         HA_LOCAL_HOST=192.168.1.50 make ha-agent
##         HA_LOCAL_HOST=homeassistant.local HA_AGENT_SECRET=mysecret make ha-agent
ha-agent:
	@source .ec2.env 2>/dev/null; \
	 EC2_WS_URL="wss://$${DOMAIN_NAME:-io.limen.io}/ha-agent" \
	 HA_LOCAL_HOST="$${HA_LOCAL_HOST:-homeassistant.local}" \
	 HA_LOCAL_PORT="$${HA_LOCAL_PORT:-8123}" \
	 HA_AGENT_SECRET="$${HA_AGENT_SECRET:-}" \
	 bun scripts/ha-agent.ts

## ha-tunnel: Reverse SSH tunnel — local HA → EC2 (foreground, Ctrl-C to stop)
## Usage:  HA_LOCAL_HOST=192.168.1.50 make ha-tunnel
##         HA_LOCAL_HOST=homeassistant.local EC2_KEY=~/.ssh/id_rsa make ha-tunnel
ha-tunnel:
	@bash scripts/ha-tunnel.sh

## ha-tunnel-install: Install persistent launchd tunnel service (macOS only, auto-restarts on login)
## Usage:  make ha-tunnel-install
##         HA_LOCAL_HOST=192.168.1.50 EC2_KEY=~/.ssh/id_ed25519 make ha-tunnel-install
ha-tunnel-install:
	@set -e; \
	HA_LOCAL_HOST=$${HA_LOCAL_HOST:-homeassistant.local}; \
	HA_LOCAL_PORT=$${HA_LOCAL_PORT:-8123}; \
	EC2_KEY=$${EC2_KEY:-$$HOME/.ssh/id_rsa}; \
	PLIST=$$HOME/Library/LaunchAgents/io.waldiez.ha-tunnel.plist; \
	sed -e "s|__HA_LOCAL_HOST__|$$HA_LOCAL_HOST|g" \
	    -e "s|__HA_LOCAL_PORT__|$$HA_LOCAL_PORT|g" \
	    -e "s|__EC2_KEY__|$$EC2_KEY|g" \
	    scripts/ha-tunnel.plist > "$$PLIST"; \
	launchctl unload "$$PLIST" 2>/dev/null || true; \
	launchctl load -w "$$PLIST"; \
	echo "✓ HA tunnel service installed and started"; \
	echo "  Tunnel: EC2:8124 → $$HA_LOCAL_HOST:$$HA_LOCAL_PORT"; \
	echo "  Logs:   /tmp/limen-ha-tunnel.{log,err}"; \
	echo "  Stop:   make ha-tunnel-uninstall"

## ha-tunnel-uninstall: Stop and remove the launchd tunnel service
ha-tunnel-uninstall:
	@PLIST=$$HOME/Library/LaunchAgents/io.waldiez.ha-tunnel.plist; \
	launchctl unload "$$PLIST" 2>/dev/null || true; \
	rm -f "$$PLIST"; \
	echo "✓ HA tunnel service removed"

## ha-cert: Issue/renew SSL cert for HA subdomain on EC2 (run once after DNS propagates)
## Usage:  make ha-cert
ha-cert:
	@source .ec2.env 2>/dev/null; \
	HA_DOMAIN=$${HA_DOMAIN:-ha.limen-os.io}; \
	EC2_HOST=$${EC2_HOST:?EC2_HOST not set}; \
	ssh $${EC2_KEY:+-i $$EC2_KEY} $$EC2_HOST \
	    "HA_DOMAIN=$$HA_DOMAIN CERTBOT_EMAIL=$${CERTBOT_EMAIL:-} \
	     sudo -E bash /opt/limen/scripts/setup.sh --nginx-only" && \
	echo "✓ SSL cert for $$HA_DOMAIN done — try https://$$HA_DOMAIN"

## ha-tunnel-status: Show tunnel service status and recent logs
ha-tunnel-status:
	@echo "=== launchctl ==="; \
	launchctl list | grep ha-tunnel || echo "(not loaded)"; \
	echo ""; echo "=== stdout ==="; tail -20 /tmp/limen-ha-tunnel.log 2>/dev/null || true; \
	echo ""; echo "=== stderr ==="; tail -20 /tmp/limen-ha-tunnel.err 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
# VAGRANT VM
# ─────────────────────────────────────────────────────────────────────────────

## vagrant-up: Start kiosk VM (Chromium → io.limen-os.io/limen/, noVNC on :6080)
## Usage:  make vagrant-up
##         LIMEN_VM_MODE=dev make vagrant-up        (GNOME desktop)
##         HA_HOST=192.168.1.50:8123 make vagrant-up  (with local HA)
vagrant-up:
	@vagrant up

## vagrant-kiosk: Open noVNC in browser (view the kiosk)
vagrant-kiosk:
	@open http://localhost:6080/vnc.html 2>/dev/null || xdg-open http://localhost:6080/vnc.html

## vagrant-ssh: SSH into the VM
vagrant-ssh:
	@vagrant ssh

## vagrant-halt: Stop the VM (keeps disk)
vagrant-halt:
	@vagrant halt

## vagrant-destroy: Destroy the VM completely
vagrant-destroy:
	@vagrant destroy -f

# ─────────────────────────────────────────────────────────────────────────────
# BEAGLEBONE
# ─────────────────────────────────────────────────────────────────────────────

## bb-setup: Full BeagleBone setup (kiosk + limen-tui cross-compile + deploy)
## Usage:  BB_HOST=192.168.1.xx make bb-setup
##         BB_HOST=192.168.1.xx KIOSK_URL=https://io.limen-os.io/limen/ make bb-setup
bb-setup:
	@bash scripts/beaglebone-setup.sh

## bb-kiosk: Install only Chromium kiosk on BeagleBone
bb-kiosk:
	@bash scripts/beaglebone-setup.sh --kiosk-only

## bb-tui: Cross-compile limen-tui for aarch64 and deploy to BeagleBone
bb-tui:
	@bash scripts/beaglebone-setup.sh --tui-only

## bb-haos: Install Home Assistant Supervised + Limen OS add-on on BeagleBone
## Usage:  BB_HOST=192.168.1.xx make bb-haos
##         BB_HOST=192.168.1.xx BB_USER=root BB_KEY=~/.ssh/id_rsa make bb-haos
##         BB_HOST=192.168.1.xx MACHINE=generic-aarch64 make bb-haos
bb-haos:
	@bash scripts/beaglebone-setup.sh --haos

## bb-standalone: Provision Armbian BeagleBone as standalone Limen OS node (no HAOS)
## Installs: Bun, limen-serve (port 1420), Chromium kiosk (Xvfb :99), x11vnc (:5900)
## Usage:  BB_HOST=192.168.1.xx make bb-standalone
##         BB_HOST=bb.local BB_USER=debian BB_KEY=~/.ssh/id_rsa make bb-standalone
##         BB_HOST=192.168.1.xx BB_TUI=1 make bb-standalone   # + limen-tui via ttyd
bb-standalone:
	@bash scripts/bb-standalone-setup.sh

## bb-headless: Provision BeagleBone headless (serve-only, no Xvfb/kiosk/VNC — recommended for low-RAM boards)
## Usage:  BB_HOST=192.168.1.xx make bb-headless
bb-headless:
	@SKIP_DISPLAY=1 bash scripts/bb-standalone-setup.sh

# ─────────────────────────────────────────────────────────────────────────────
# VAGRANT HAOS
# ─────────────────────────────────────────────────────────────────────────────

## vagrant-haos: Start a Debian 12 VM with HA Supervised + Limen OS add-on
## Usage:  make vagrant-haos
##         LIMEN_VM_RAM=6144 make vagrant-haos   (more RAM for heavy workloads)
## Access: http://localhost:8123  (HA UI)
##         http://localhost:6080/vnc.html  (noVNC kiosk view)
vagrant-haos:
	@LIMEN_VM_MODE=haos vagrant up

# ─────────────────────────────────────────────────────────────────────────────
# ADDON MANAGEMENT (run directly on a HAOS machine)
# ─────────────────────────────────────────────────────────────────────────────

## addon-install: Copy addon/ to /addons/local/limen_os/ and reload Supervisor
## Usage:  make addon-install                   (from inside the HAOS machine)
##         LIMEN_ROOT=/opt/limen make addon-install
addon-install:
	@echo "Installing Limen OS add-on to /addons/local/limen_os/ ..."
	@mkdir -p /addons/local
	@rm -rf /addons/local/limen_os
	@cp -r $(LIMEN_ROOT)/addon /addons/local/limen_os
	@echo "Reloading Supervisor add-on store..."
	@curl -s -o /dev/null -w "Supervisor reload: HTTP %{http_code}\n" \
	  -X POST http://localhost:4357/addons/reload || \
	  echo "WARNING: Supervisor API not reachable — reload manually"
	@echo "Done. Find 'Limen OS' in HA Settings → Add-ons → Local add-ons."

## addon-dev: Symlink /addons/local/limen_os → $(LIMEN_ROOT)/addon for live editing
## Changes to addon/ are immediately visible to the Supervisor (no copy needed).
## Usage:  make addon-dev
addon-dev:
	@echo "Setting up live-development symlink for Limen OS add-on..."
	@mkdir -p /addons/local
	@rm -rf /addons/local/limen_os
	@ln -sf $(LIMEN_ROOT)/addon /addons/local/limen_os
	@echo "Symlinked /addons/local/limen_os → $(LIMEN_ROOT)/addon"
	@echo "Reloading Supervisor add-on store..."
	@curl -s -o /dev/null -w "Supervisor reload: HTTP %{http_code}\n" \
	  -X POST http://localhost:4357/addons/reload || \
	  echo "WARNING: Supervisor API not reachable — reload manually"
	@echo "Done. Edit addon/ files live; restart add-on in HA UI to pick up changes."

# ─────────────────────────────────────────────────────────────────────────────
# SERVER / VM DEPLOYMENT
# ─────────────────────────────────────────────────────────────────────────────

## server-build: Build shell frontend for server (served at /limen/)
server-build:
	cd $(SHELL_DIR) && VITE_BASE_PATH=/limen/ $(BUN) run build
	@printf "$(GREEN)✓ dist/ ready in $(SHELL_DIR)/dist/$(RESET)\n"
	@if [ -d "$(LIMEN_ROOT)" ] && [ -w "$(LIMEN_ROOT)" ]; then $(MAKE) install-dist; fi

## install-dist: Copy built dist to $(LIMEN_ROOT)/dist
install-dist:
	cp -rp $(SHELL_DIR)/dist $(LIMEN_ROOT)/dist
	@printf "$(GREEN)✓ dist/ installed to $(LIMEN_ROOT)/dist$(RESET)\n"

## server-serve: Run Bun SPA server locally (port 1420)
server-serve:
	$(BUN) run scripts/serve.ts

## server-install: Install full stack on this machine (requires sudo)
server-install:
	bash scripts/server-setup.sh --full

## server-install-spa: SPA server only (no display, no kiosk)
server-install-spa:
	bash scripts/server-setup.sh --phase1

## server-install-kiosk: SPA + Xvfb + Chromium kiosk (no synapsd, no VNC)
server-install-kiosk:
	bash scripts/server-setup.sh --phase2

## server-status: Show status of all LIMEN OS systemd services
server-status:
	@bash scripts/server-setup.sh --status 2>/dev/null || \
	  systemctl status limen-static limen-xvfb limen-kiosk limen-tauri \
	                   limen-x11vnc limen-novnc synapsd --no-pager 2>/dev/null || \
	  echo "Services not installed on this machine."

# ─────────────────────────────────────────────────────────────────────────────
# DOCKER / SERVICES
# ─────────────────────────────────────────────────────────────────────────────

## dev-services-up: Start core dev services (mosquitto, whisper, jupyter, code-server, nodered)
dev-services-up:
	docker compose -f $(STACK_FILE) up -d
	@printf "  VS Code:    http://localhost:8080\n"
	@printf "  JupyterLab: http://localhost:8888  (token: limen)\n"
	@printf "  Studio:     http://localhost:8001\n"
	@printf "  MQTT:       localhost:1883\n"
	@printf "  Node-RED:   http://localhost:1880\n"
	@printf "  Whisper:    http://localhost:8083\n"

## dev-services-down: Stop all core dev services
dev-services-down:
	docker compose -f $(STACK_FILE) down

## dev-services-logs: Tail logs from dev services
dev-services-logs:
	docker compose -f $(STACK_FILE) logs -f

## dev-sim-up: Start core services + sinergym + smartcities (energy simulation)
dev-sim-up:
	docker compose -f $(STACK_FILE) --profile sinergym --profile smartcities up -d --build
	@printf "  Sinergym:    http://localhost:8090\n"
	@printf "  SmartCities: http://localhost:8091\n"

## dev-sim-down: Stop sinergym + smartcities
dev-sim-down:
	docker compose -f $(STACK_FILE) --profile sinergym --profile smartcities down

## stack-up: Start core production services (nginx-proxied)
stack-up:
	$(BIND) docker compose -f $(STACK_FILE) up -d
	@printf "  JupyterLab: proxied at /jupyter/\n"
	@printf "  VS Code:    proxied at /code/\n"
	@printf "  Studio:     proxied at /studio/\n"
	@printf "  Node-RED:   proxied at /nodered/\n"

## stack-down: Stop all production services
stack-down:
	docker compose -f $(STACK_FILE) down

## stack-logs: Tail logs from production stack
stack-logs:
	docker compose -f $(STACK_FILE) logs -f

## stack-workers: Start production stack + AgentFlow Workers
stack-workers:
	$(BIND) docker compose -f $(STACK_FILE) --profile agentflow up -d

## stack-ha: Start production stack + Home Assistant
stack-ha:
	$(BIND) docker compose -f $(STACK_FILE) --profile ha up -d

## stack-sim: Start production stack + sinergym + smartcities
stack-sim:
	$(BIND) docker compose -f $(STACK_FILE) --profile sinergym --profile smartcities up -d

## haos-stack-up: Start the full HAOS stack (code-server, jupyter, portainer, grafana, node-red)
haos-stack-up:
	docker compose -f $(HAOS_STACK) up -d
	@printf "  VS Code:    http://localhost:8080\n"
	@printf "  JupyterLab: http://localhost:8888  (token: limen)\n"
	@printf "  Portainer:  http://localhost:9090\n"
	@printf "  Grafana:    http://localhost:3000  (admin / limen)\n"
	@printf "  Node-RED:   http://localhost:1880\n"
	@printf "  MQTT:       localhost:1883  (opt-in: --profile mqtt)\n"

## haos-stack-down: Stop the full HAOS stack
haos-stack-down:
	docker compose -f $(HAOS_STACK) down

## haos-stack-logs: Tail logs from HAOS stack
haos-stack-logs:
	docker compose -f $(HAOS_STACK) logs -f

## docker-build: Build all locally-built images (sim + agentflow) without starting
docker-build: docker-build-sim docker-build-agentflow

## docker-build-sim: Build sinergym + smartcities images (run after: make vendor)
docker-build-sim:
	docker compose -f $(STACK_FILE) --profile sinergym --profile smartcities build sinergym smartcities

## docker-build-agentflow: Build AgentFlow image (run after: make sync-tools)
docker-build-agentflow:
	docker compose -f $(STACK_FILE) --profile agentflow build agentflow

## jupyter-setup: Install JupyterLab natively and configure for /jupyter/ nginx path
jupyter-setup:
	@bash scripts/services-setup.sh --jupyter

## jupyter-service: Install JupyterLab as a systemd service (requires sudo)
jupyter-service:
	@sudo bash scripts/services-setup.sh --jupyter-service

## nodered-setup: Install Node-RED natively and configure for /nodered/ nginx path
nodered-setup:
	@bash scripts/services-setup.sh --nodered

## nodered-service: Install Node-RED as a systemd service (requires sudo)
nodered-service:
	@sudo bash scripts/services-setup.sh --nodered-service

## tui-setup: Install ttyd for Limen TUI web terminal (requires sudo)
tui-setup:
	@sudo bash scripts/services-setup.sh --tui

## tui-service: Install Limen TUI as a systemd service via ttyd (requires sudo)
tui-service:
	@sudo bash scripts/services-setup.sh --tui-service

## tui-install: Build limen-tui binary and restart the service (no manual copy needed)
tui-install: tui-build
	@sudo systemctl restart limen-tui && printf "$(GREEN)✓ limen-tui restarted$(RESET)\n"

## services-setup: Install both JupyterLab and Node-RED natively
services-setup:
	@bash scripts/services-setup.sh --all

## services-status: Show running status of native services (jupyter, nodered, limen-tui)
services-status:
	@bash scripts/services-setup.sh --status

# ─────────────────────────────────────────────────────────────────────────────
# PACKAGING / DISTRIBUTION
# ─────────────────────────────────────────────────────────────────────────────

## bundle-linux: Build AppImage + .deb for this Linux machine
bundle-linux: bundle-appimage bundle-deb

## bundle-appimage: Build AppImage for this machine
bundle-appimage: packages-build
	APPIMAGE_EXTRACT_AND_RUN=1 \
	  PATH="$$HOME/.local/bin:$$PATH" \
	  $(CARGO) tauri build -C $(SHELL_DIR) --bundles appimage
	@printf "$(GREEN)✓ AppImage: $$(ls target/release/bundle/appimage/*.AppImage)$(RESET)\n"

## bundle-deb: Build .deb for this machine
bundle-deb: packages-build
	PATH="$$HOME/.local/bin:$$PATH" \
	  $(CARGO) tauri build -C $(SHELL_DIR) --bundles deb
	@printf "$(GREEN)✓ .deb: $$(ls 'target/release/bundle/deb/'*.deb)$(RESET)\n"

## bundle-tui: Cross-compile TUI binary for ARM64 (Raspberry Pi)
bundle-tui:
	rustup target add aarch64-unknown-linux-gnu 2>/dev/null || true
	CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
	  $(CARGO) build --release -p limen-tui --target aarch64-unknown-linux-gnu
	@printf "$(GREEN)✓ TUI ARM64: target/aarch64-unknown-linux-gnu/release/limen-tui$(RESET)\n"
