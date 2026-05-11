#!/usr/bin/env bash
# ha-tunnel.sh — Reverse SSH tunnel: local HA → EC2 limen server
#
# Run this on the machine that has direct access to Home Assistant
# (e.g. your laptop, a Pi on the same LAN, or the HA host itself).
#
# What it does:
#   Opens a persistent reverse tunnel so the EC2 server can proxy
#   /ha/ requests to your local HA instance at HA_LOCAL_HOST:HA_LOCAL_PORT.
#
# Usage:
#   HA_LOCAL_HOST=192.168.1.50 HA_LOCAL_PORT=8123 ./scripts/ha-tunnel.sh
#   HA_LOCAL_HOST=homeassistant.local ./scripts/ha-tunnel.sh
#
# The tunnel binds 127.0.0.1:8123 on the EC2 server, which is exactly
# what limen-serve.service already expects (HA_ORIGIN=http://127.0.0.1:8123).
# No server-side changes needed.
set -euo pipefail

EC2_HOST="${EC2_HOST:-limen@io.waldiez.io}"
EC2_KEY="${EC2_KEY:-}"                    # path to SSH key, optional
HA_LOCAL_HOST="${HA_LOCAL_HOST:-homeassistant.local}"
HA_LOCAL_PORT="${HA_LOCAL_PORT:-8123}"
EC2_TUNNEL_PORT="${EC2_TUNNEL_PORT:-8124}"  # 8123 reserved for HA Docker container on EC2

SSH_OPTS=(-o "ServerAliveInterval=30" -o "ServerAliveCountMax=3" -o "ExitOnForwardFailure=yes")
[[ -n "$EC2_KEY" ]] && SSH_OPTS+=(-i "$EC2_KEY")

echo "▶ Opening reverse tunnel: $EC2_HOST:$EC2_TUNNEL_PORT → $HA_LOCAL_HOST:$HA_LOCAL_PORT"
echo "  Keep this running. Ctrl-C to close."
echo ""

# -N = no command, -T = no TTY, -R = reverse tunnel
# Binds 127.0.0.1:EC2_TUNNEL_PORT on the EC2 machine to HA_LOCAL_HOST:HA_LOCAL_PORT locally
exec ssh "${SSH_OPTS[@]}" \
  -N -T \
  -R "127.0.0.1:${EC2_TUNNEL_PORT}:${HA_LOCAL_HOST}:${HA_LOCAL_PORT}" \
  "$EC2_HOST"
