#!/bin/bash
# Ensure HA configuration.yaml has the reverse-proxy http block.
# Called before /init so that nginx (127.0.0.1) is a trusted proxy.
# Safe to run on every container start — idempotent.

CONFIG=/config/configuration.yaml

if [ ! -f "$CONFIG" ]; then
  cat > "$CONFIG" << 'EOF'
# Limen OS — Home Assistant default configuration
homeassistant:

http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 127.0.0.1
    - ::1

default_config:
EOF
  echo "[limen] Created $CONFIG with reverse-proxy settings"
elif ! grep -q 'use_x_forwarded_for' "$CONFIG"; then
  cat >> "$CONFIG" << 'EOF'

# Limen OS nginx reverse-proxy support (auto-added)
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 127.0.0.1
    - ::1
EOF
  echo "[limen] Patched $CONFIG with reverse-proxy settings"
fi

exec /init "$@"
