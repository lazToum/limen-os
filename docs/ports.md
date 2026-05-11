# LIMEN OS — Ports & Paths

## Service Ports

| Service | Container Port | Default Host Port | Docker Profile |
|---------|---------------|-------------------|----------------|
| Mosquitto MQTT (TCP) | 1883 | 1883 | core |
| Mosquitto MQTT (WS) | 9001 | 9001 | core |
| Whisper STT | 8000 | 8083 | core |
| JupyterLab | 8888 | 8888 | core |
| Waldiez Studio | 8000 | 8001 | core |
| VS Code Server | 8080 | 8080 | core |
| Node-RED | 1880 | 1880 | core |
| Sinergym | 8090 | 8090 | sinergym |
| Smart Cities | 8091 | 8091 | smartcities |
| AgentFlow monitor (WS) | 8889 | 8889 | agentflow |
| AgentFlow REST API | 8890 | 8890 | agentflow |
| Home Assistant | 8123 | 8123 (host net) | ha |
| Portainer | 9000 | 9090 | portainer |
| Grafana | 3000 | 3000 | grafana |

## EC2 / nginx Paths (proxied at `https://io.waldiez.io/...`)

| Path | Service |
|------|---------|
| `/` | Limen OS shell (SPA) |
| `/jupyter/` | JupyterLab |
| `/code/` | VS Code Server |
| `/studio/` | Waldiez Studio |
| `/ha/` | Home Assistant |
| `/nodered/` | Node-RED |
| `/sinergym/` | Sinergym (energy simulation) |
| `/smartcities/` | Smart Cities (Babylon.js twin) |
| `/af/` | AgentFlow monitor |
| `/af/api/` | AgentFlow REST API |
| `/portainer/` | Portainer |
| `/grafana/` | Grafana |
| `/player/` | Waldiez Player |
| `/proxy` | synapsd relay |
| `/ai` | synapsd AI router |

## Local Dev URLs (default)

| Service | URL |
|---------|-----|
| Shell (Vite) | http://localhost:1420 |
| VS Code | http://localhost:8080 |
| JupyterLab | http://localhost:8888/jupyter/?token=limen |
| Waldiez Studio | http://localhost:8001/studio/ |
| Sinergym | http://localhost:8090/sinergym/ |
| Smart Cities | http://localhost:8091/ |
| AgentFlow | http://localhost:8889 |
| Node-RED | http://localhost:1880 |
| Mosquitto MQTT | mqtt://localhost:1883 |
| Whisper STT | http://localhost:8083 |

## Env Var Overrides

| Var | Default | Used by |
|-----|---------|---------|
| `BIND_HOST` | `0.0.0.0` (dev) / `127.0.0.1` (EC2) | All Docker port bindings |
| `MQTT_PORT` | `1883` | Mosquitto |
| `MQTT_WS_PORT` | `9001` | Mosquitto WS |
| `WHISPER_PORT` | `8083` | Whisper |
| `JUPYTER_PORT` | `8888` | JupyterLab |
| `W_STUDIO_PORT` | `8001` | Waldiez Studio |
| `CODE_SERVER_PORT` | `8080` | VS Code Server |
| `NODERED_PORT` | `1880` | Node-RED |
| `SINERGYM_PORT` | `8090` | Sinergym |
| `SMARTCITIES_PORT` | `8091` | Smart Cities |
| `AF_PORT` | `8889` | AgentFlow monitor |
| `AF_API_PORT` | `8890` | AgentFlow REST |
| `GRAFANA_PORT` | `3000` | Grafana |
| `PORTAINER_PORT` | `9090` | Portainer |
