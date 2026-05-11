# Home Assistant — Proxy Configuration for Limen OS

Limen OS proxies HA through the EC2 server via a reverse SSH tunnel.
For everything to work (login, WebSocket, auth) HA must trust the tunnel endpoint.

## 1. Add to `/config/configuration.yaml`

```yaml
http:
  # Trust the Limen OS SSH tunnel as a reverse proxy.
  # The tunnel arrives at HA from 127.0.0.1 on the host machine.
  use_x_forwarded_for: true
  trusted_proxies:
    - 127.0.0.1
    - ::1
  # Allow WebSocket and CORS requests from the public Limen OS URL.
  cors_allowed_origins:
    - https://io.waldiez.io
```

After editing, restart HA: **Settings → System → Restart**.

## 2. Install the persistent tunnel (on your Mac)

```bash
# Default: homeassistant.local:8123, SSH key ~/.ssh/id_rsa
make ha-tunnel-install

# Custom HA host or key:
HA_LOCAL_HOST=192.168.1.50 EC2_KEY=~/.ssh/id_ed25519 make ha-tunnel-install
```

This installs a macOS launchd service (`io.waldiez.ha-tunnel`) that:
- Starts automatically at login
- Restarts within 10 s if SSH drops
- Sends keep-alive pings every 30 s so the tunnel survives Mac sleep

```bash
make ha-tunnel-status    # check if it's running + recent logs
make ha-tunnel-uninstall # remove the service
```

## 3. Set HA_ORIGIN on the EC2 server

If not already set:

```bash
ssh limen@io.waldiez.io
sudo tee /etc/limen/serve.env <<'EOF'
HA_ORIGIN=http://127.0.0.1:8124
LIMEN_AUTH_PASS=your_limen_password
EOF
sudo systemctl restart limen-serve
```

## How it works

```
Browser  →  nginx (io.waldiez.io)  →  serve.ts (1420)
                                           │  HTTP
                                           ↓
                               SSH tunnel (EC2 127.0.0.1:8124)
                                           │
                                      ─────────────
                                      LAN / internet
                                           │
                               homeassistant.local:8123
```

- `/ha/` — HA HTML, assets, auth flow
- `/api/websocket` — HA real-time WebSocket (same tunnel)
- `/auth/*` — HA OAuth (authorize, token, callback)
