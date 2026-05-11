"""
Smart Cities — Building Digital Twin server
============================================
Wraps the SAF simulation agents with a control API so the simulation
can be started, stopped, and reconfigured from the browser UI.

Endpoints
---------
GET  /              Enhanced index.html (control panel injected)
GET  /building.png  Floor-plan image
WS   /ws            Live telemetry stream (same protocol as demo/server.py)
GET  /api/sim/status   {state, config, step, episode, ...}
POST /api/sim/start    body: {weather?, episodes?, step_delay?, granularity?}
POST /api/sim/stop
POST /api/sim/restart  body: same as /start (optional — reuses last config)

Env-var knobs
-------------
  DEMO_PORT        TCP port (default 8091)
  EPLUS_PATH       EnergyPlus install dir (baked into image — /usr/local/EnergyPlus-25-2-0)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

# ── Path bootstrap ────────────────────────────────────────────────────────────
# Paths baked into the image at build time (see Dockerfile COPY vendor/ steps).
# vendor/demo/ → /app/demo/   (Babylon.js frontend HTML)
# vendor/saf/  → /app/saf/    (SAF Python package)
_DEMO_DIR  = Path("/app/demo")
_SAF_PATH  = Path("/app")          # parent of saf/ package dir
_EPLUS_DIR = os.environ.get("EPLUS_PATH", "/usr/local/EnergyPlus-25-2-0")

# pyenergyplus ships inside the EnergyPlus install dir — must be on sys.path
# so sinergym can do `from pyenergyplus.api import EnergyPlusAPI`.
sys.path.insert(0, _EPLUS_DIR)
sys.path.insert(0, str(_SAF_PATH))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse     # noqa: E402
from pydantic import BaseModel                               # noqa: E402

from saf import AgentRuntime                                 # noqa: E402
from saf.agents.rbc_hvac_agent import RBCHVACAgent          # noqa: E402
from saf.agents.sinergym_env_agent import SinergymEnvAgent  # noqa: E402

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("limen.smartcities")

# ── Config ────────────────────────────────────────────────────────────────────
PORT = int(os.environ.get("DEMO_PORT", "8091"))

SimState = Literal["idle", "running", "stopped", "error"]


@dataclass
class SimConfig:
    weather: str = "mixed"
    episodes: int = 1
    step_delay: float = 0.05
    granularity: str = "zone"


@dataclass
class SimStatus:
    state: SimState = "idle"
    config: SimConfig = field(default_factory=SimConfig)
    step: int = 0
    episode: int = 0
    reward: float = 0.0
    error: str = ""


_status = SimStatus()
_sim_task: asyncio.Task[None] | None = None

# ── Broadcast state ───────────────────────────────────────────────────────────
_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=4096)
_clients: set[WebSocket] = set()
_sim_generation: int = 0   # incremented on every new start; old transports check this


class BroadcastTransport:
    """Only forwards messages whose generation matches the current one.
    This silences stale SAF agent tasks that outlive a cancel/restart."""

    def __init__(self, generation: int) -> None:
        self._gen = generation

    async def connect(self) -> None: pass
    async def disconnect(self) -> None: pass

    async def publish(self, topic: str, payload: Any) -> None:
        if self._gen != _sim_generation:
            return  # stale session — drop silently
        # Track sim progress locally so /api/sim/status is always fresh
        if topic == "limen/meta/sinergym_progress":
            _status.step    = payload.get("step",    _status.step)
            _status.episode = payload.get("episode", _status.episode)
            _status.reward  = payload.get("reward",  _status.reward)
        msg = json.dumps({"topic": topic, "payload": payload})
        try:
            _queue.put_nowait(msg)
        except asyncio.QueueFull:
            pass

    async def subscribe(self, topic_pattern: str, handler: Any) -> None: pass

    async def health(self) -> dict[str, Any]:
        return {"connected": True, "backend": "broadcast"}


# ── Background tasks ──────────────────────────────────────────────────────────

async def _broadcast_loop() -> None:
    while True:
        msg = await _queue.get()
        dead: set[WebSocket] = set()
        for ws in list(_clients):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        _clients.difference_update(dead)


async def _run_simulation(cfg: SimConfig, generation: int) -> None:
    global _status
    _status.state   = "running"
    _status.step    = 0
    _status.episode = 0
    _status.reward  = 0.0
    _status.error   = ""
    logger.info(
        "Simulation starting  weather=%s  episodes=%d  step_delay=%.3fs  granularity=%s  gen=%d",
        cfg.weather, cfg.episodes, cfg.step_delay, cfg.granularity, generation,
    )
    runtime = None
    outcome: str = "stopped"
    try:
        transport = BroadcastTransport(generation=generation)
        runtime   = AgentRuntime(transport=transport)
        await runtime.start()

        rbc = await runtime.spawn_agent(
            RBCHVACAgent,
            config={"granularity": cfg.granularity, "structural": True},
        )
        await runtime.spawn_agent(
            SinergymEnvAgent,
            config={
                "weather":             cfg.weather,
                "episodes":            cfg.episodes,
                "controller_agent_id": rbc.agent_id,
                "step_delay":          cfg.step_delay,
            },
        )
        logger.info("Agents up (rbc=%s)", rbc.agent_id)

        # Wait until cancelled or the simulation naturally ends
        await asyncio.get_event_loop().create_future()

    except asyncio.CancelledError:
        logger.info("Simulation cancelled (gen=%d)", generation)
        outcome = "stopped"
        raise
    except Exception as exc:
        logger.exception("Simulation error (gen=%d)", generation)
        outcome = "error"
        _status.error = str(exc)
    finally:
        # Stop the SAF runtime so its agent tasks don't keep publishing after cancel
        if runtime is not None:
            try:
                await runtime.stop()
            except Exception:
                pass
        _drain_queue()   # discard any messages already in the pipe from this session
        _status.state = outcome if outcome != "error" else "error"
        _broadcast_meta(outcome, _status.error or ("Simulation finished" if outcome == "stopped" else ""))


def _drain_queue() -> None:
    """Discard all pending messages — call after stopping a simulation."""
    drained = 0
    while not _queue.empty():
        try:
            _queue.get_nowait()
            drained += 1
        except asyncio.QueueEmpty:
            break
    if drained:
        logger.info("Drained %d stale messages from queue", drained)


def _broadcast_meta(kind: str, message: str) -> None:
    topic = "limen/meta/error" if kind == "error" else "limen/meta/sim_state"
    msg   = json.dumps({"topic": topic, "payload": {"state": kind, "message": message}})
    try:
        _queue.put_nowait(msg)
    except asyncio.QueueFull:
        pass


# ── Control helpers ───────────────────────────────────────────────────────────

async def _start(cfg: SimConfig) -> None:
    global _sim_task, _status, _sim_generation
    await _stop()
    _sim_generation += 1   # old BroadcastTransport instances will now drop their messages
    _status.config = cfg
    _sim_task = asyncio.create_task(_run_simulation(cfg, _sim_generation))


async def _stop() -> None:
    global _sim_task, _sim_generation
    # Bump generation first so any in-flight publishes are dropped immediately
    _sim_generation += 1
    if _sim_task and not _sim_task.done():
        _sim_task.cancel()
        try:
            await _sim_task
        except asyncio.CancelledError:
            pass
    _sim_task = None


# ── FastAPI ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def _lifespan(app: FastAPI):
    asyncio.create_task(_broadcast_loop())
    # Auto-start with defaults so the UI has something to show immediately
    await _start(SimConfig())
    yield
    await _stop()


app = FastAPI(title="LIMEN Smart Cities", lifespan=_lifespan)


# ── Static files ──────────────────────────────────────────────────────────────

_CONTROL_PANEL_CSS = """
<style>
  .ctrl-select {
    width: 100%; padding: 4px 6px; border-radius: 4px; font-size: 10px;
    background: #111130; border: 1px solid var(--border);
    color: var(--text); cursor: pointer; font-family: inherit;
    color-scheme: dark;
  }
  .ctrl-select option { background: #111130; color: var(--text); }
  .ctrl-row { display: flex; flex-direction: column; gap: 2px; margin-bottom: 5px; }
  .ctrl-label { font-size: 9px; color: var(--dim); text-transform: uppercase; letter-spacing: 1px; }
  .ctrl-number {
    width: 100%; padding: 4px 6px; border-radius: 4px; font-size: 10px;
    background: #111130; border: 1px solid var(--border);
    color: var(--text); font-family: inherit;
  }
  .ctrl-number::-webkit-inner-spin-button { opacity: 0.5; }
  .ctrl-btns { display: flex; gap: 4px; margin-top: 6px; }
  .ctrl-btn {
    flex: 1; padding: 5px 4px; border-radius: 4px; font-size: 10px; cursor: pointer;
    border: 1px solid; font-family: inherit; font-weight: bold; letter-spacing: 0.5px;
    transition: opacity 0.15s;
  }
  .ctrl-btn:hover { opacity: 0.8; }
  .ctrl-btn:disabled { opacity: 0.35; cursor: default; }
  .btn-start   { background: rgba(34,197,94,0.15);  border-color: rgba(34,197,94,0.4);  color: #86efac; }
  .btn-stop    { background: rgba(239,68,68,0.15);  border-color: rgba(239,68,68,0.4);  color: #fca5a5; }
  .btn-restart { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.4); color: #a5b4fc; }
  .sim-state-badge {
    display: inline-block; padding: 2px 7px; border-radius: 10px;
    font-size: 9px; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase;
  }
  .state-idle    { background: rgba(90,96,128,0.25); color: var(--dim); }
  .state-running { background: rgba(34,197,94,0.2);  color: #86efac; }
  .state-stopped { background: rgba(99,102,241,0.2); color: #a5b4fc; }
  .state-error   { background: rgba(239,68,68,0.2);  color: #fca5a5; }
</style>
"""

_CONTROL_PANEL_HTML = """
<!-- ── Simulation control ──────────────────────────────────────────────── -->
<div class="card" id="ctrlCard">
  <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">
    <span>Simulation Control</span>
    <span class="sim-state-badge state-idle" id="stateBadge">idle</span>
  </div>

  <div class="ctrl-row">
    <div class="ctrl-label">Weather</div>
    <select class="ctrl-select" id="cfgWeather">
      <option value="mixed" selected>Mixed (default)</option>
      <option value="hot">Hot</option>
      <option value="cool">Cool</option>
    </select>
  </div>

  <div class="ctrl-row">
    <div class="ctrl-label">Episodes</div>
    <input class="ctrl-number" type="number" id="cfgEpisodes" min="1" max="20" value="1">
  </div>

  <div class="ctrl-row">
    <div class="ctrl-label">Step delay (s)</div>
    <input class="ctrl-number" type="number" id="cfgStepDelay" min="0" max="2" step="0.01" value="0.05">
  </div>

  <div class="ctrl-row">
    <div class="ctrl-label">Granularity</div>
    <select class="ctrl-select" id="cfgGranularity">
      <option value="zone" selected>Zone (15 zones)</option>
      <option value="floor">Floor (3 floors)</option>
      <option value="single">Single</option>
    </select>
  </div>

  <div class="ctrl-btns">
    <button class="ctrl-btn btn-start"   id="btnStart"   onclick="ctrlStart()">▶ Start</button>
    <button class="ctrl-btn btn-stop"    id="btnStop"    onclick="ctrlStop()"  disabled>■ Stop</button>
    <button class="ctrl-btn btn-restart" id="btnRestart" onclick="ctrlRestart()">↺ Restart</button>
  </div>
</div>
"""

_CONTROL_PANEL_JS = r"""
<script>
// ── Simulation control ────────────────────────────────────────────────────────
// Derive API base from the page path so all fetches work behind any nginx prefix.
// e.g. page at /smartcities/ → _apiBase = '/smartcities'
const _apiBase = location.pathname.replace(/\/[^/]*$/, '').replace(/\/+$/, '');

function _cfgFromForm() {
  return {
    weather:     document.getElementById('cfgWeather').value,
    episodes:    parseInt(document.getElementById('cfgEpisodes').value, 10),
    step_delay:  parseFloat(document.getElementById('cfgStepDelay').value),
    granularity: document.getElementById('cfgGranularity').value,
  };
}

function _setSimState(state) {
  const badge   = document.getElementById('stateBadge');
  const btnStart   = document.getElementById('btnStart');
  const btnStop    = document.getElementById('btnStop');
  const btnRestart = document.getElementById('btnRestart');
  badge.textContent = state;
  badge.className   = 'sim-state-badge state-' + state;
  const running = state === 'running';
  btnStart.disabled   = running;
  btnStop.disabled    = !running;
  btnRestart.disabled = false;
}

async function ctrlStart() {
  const cfg = _cfgFromForm();
  await fetch(_apiBase + '/api/sim/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  _setSimState('running');
}

async function ctrlStop() {
  await fetch(_apiBase + '/api/sim/stop', { method: 'POST' });
  _setSimState('stopped');
}

async function ctrlRestart() {
  const cfg = _cfgFromForm();
  await fetch(_apiBase + '/api/sim/restart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  _setSimState('running');
}

// Poll status every 3 s to sync badge if sim finishes naturally
setInterval(async () => {
  try {
    const r = await fetch(_apiBase + '/api/sim/status');
    if (!r.ok) return;
    const s = await r.json();
    _setSimState(s.state);
  } catch {}
}, 3000);

// Also update from WS sim_state messages
const _origHandle = typeof handleMessage !== 'undefined' ? handleMessage : null;
window._handleMessageOrig = window.handleMessage;
window.handleMessage = function(topic, payload) {
  if (topic === 'limen/meta/sim_state') {
    _setSimState(payload.state);
  }
  if (window._handleMessageOrig) window._handleMessageOrig(topic, payload);
};
</script>
"""


def _build_html() -> str:
    """Read demo/index.html and inject the control panel."""
    src = (_DEMO_DIR / "index.html").read_text()
    # Inject CSS into <head>
    src = src.replace("</head>", _CONTROL_PANEL_CSS + "\n</head>", 1)
    # Inject control card at position 2: right before the Simulation progress card
    # so it appears at the top of the panel below the Transport status
    src = src.replace(
        "  <!-- Simulation progress -->",
        _CONTROL_PANEL_HTML + "\n  <!-- Simulation progress -->",
        1,
    )
    # Inject control JS before </body>
    src = src.replace("</body>", _CONTROL_PANEL_JS + "\n</body>", 1)
    # Fix hardcoded ws:// URL in demo — derive protocol and path from location
    # so it works as wss:// over HTTPS and at any nginx prefix (e.g. /smartcities/).
    src = src.replace(
        "const url = `ws://${location.host}/ws`;",
        "const _wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';\n"
        "  const _wsBase = location.pathname.replace(/\\/[^/]*$/, '').replace(/\\/+$/, '');\n"
        "  const url = `${_wsProto}//${location.host}${_wsBase}/ws`;",
    )
    return src


@app.get("/")
async def index():
    try:
        html = _build_html()
        from fastapi.responses import HTMLResponse
        return HTMLResponse(html)
    except Exception as exc:
        logger.exception("Failed to build index.html")
        return JSONResponse({"error": str(exc)}, status_code=500)


@app.get("/building.png")
async def building_image():
    img = _SAF_PATH / "sinergym" / "building_architecture.png"
    return FileResponse(str(img), media_type="image/png") if img.exists() else \
        JSONResponse({"error": "not found"}, status_code=404)


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    _clients.add(ws)
    logger.info("Browser connected  total=%d", len(_clients))
    # Push current sim state immediately so the control badge is correct on connect
    await ws.send_text(json.dumps({
        "topic":   "limen/meta/sim_state",
        "payload": {"state": _status.state, "message": ""},
    }))
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _clients.discard(ws)
        logger.info("Browser disconnected  total=%d", len(_clients))


# ── Control API ───────────────────────────────────────────────────────────────

class StartBody(BaseModel):
    weather:     str   = "mixed"
    episodes:    int   = 1
    step_delay:  float = 0.05
    granularity: str   = "zone"


@app.get("/api/sim/status")
async def sim_status():
    d = asdict(_status)
    return JSONResponse(d)


@app.post("/api/sim/start")
async def sim_start(body: StartBody):
    cfg = SimConfig(
        weather=body.weather,
        episodes=body.episodes,
        step_delay=body.step_delay,
        granularity=body.granularity,
    )
    await _start(cfg)
    return JSONResponse({"ok": True, "config": asdict(cfg)})


@app.post("/api/sim/stop")
async def sim_stop():
    await _stop()
    _status.state = "stopped"
    return JSONResponse({"ok": True})


@app.post("/api/sim/restart")
async def sim_restart(body: StartBody):
    cfg = SimConfig(
        weather=body.weather,
        episodes=body.episodes,
        step_delay=body.step_delay,
        granularity=body.granularity,
    )
    await _start(cfg)
    return JSONResponse({"ok": True, "config": asdict(cfg)})


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
