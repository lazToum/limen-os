"""Sinergym Web Server — Limen OS integration

FastAPI server wrapping the RBC office HVAC simulation.
Exposes a web dashboard at /sinergym/ with live output streaming.

Environment variables:
  SINERGYM_DIR   Path to the sinergym project (default: /sinergym)
  E_PLUS_PATH    Path to EnergyPlus installation (default: /energyplus)
  BASE_PATH      URL base path for nginx proxy (default: /sinergym)
"""

# flake8: noqa: C501
# pyright: reportExplicitAny=false,reportAny=false,reportUnusedCallResult=false
# pylint: disable=missing-function-docstring

import asyncio
import os
import uuid
from collections import deque
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

# ── Config ────────────────────────────────────────────────────────────────────
SINERGYM_DIR = Path(os.environ.get("SINERGYM_DIR", "/sinergym"))
E_PLUS_PATH  = os.environ.get("EPLUS_PATH") or os.environ.get("E_PLUS_PATH", "/energyplus")
BASE_PATH    = os.environ.get("BASE_PATH", "/sinergym").rstrip("/")
RBC_SCRIPT   = SINERGYM_DIR / "rbc_office.py"

# Python to use for the subprocess — prefer the sinergym project's own venv,
# fall back to this container's /app/venv, then system python3.
_SINERGYM_VENV = SINERGYM_DIR / ".venv" / "bin" / "python"
_APP_VENV      = Path("/app/venv/bin/python")
PYTHON_BIN     = (
    str(_SINERGYM_VENV) if _SINERGYM_VENV.exists()
    else str(_APP_VENV) if _APP_VENV.exists()
    else "python3"
)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(root_path=BASE_PATH, title="Sinergym")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Job storage ───────────────────────────────────────────────────────────────
# job_id -> {"status": str, "lines": deque, "proc": Process|None, "rc": int|None}
jobs: dict[str, dict[str, Any]] = {}


# ── Models ────────────────────────────────────────────────────────────────────
class SimConfig(BaseModel):
    """Sim config."""

    granularity: str = "zone"   # zone | floor | single
    weather:     str = "mixed"  # hot | mixed | cool
    episodes:    int = 1
    structural:  bool = True


# ── HTML Dashboard ────────────────────────────────────────────────────────────
_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sinergym — Building Energy Simulation</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:      #0d0d1a;
    --card:    rgba(255,255,255,.04);
    --border:  rgba(255,255,255,.08);
    --accent:  #7c6af7;
    --accent2: #4fc3f7;
    --green:   #4caf50;
    --red:     #ef5350;
    --text:    #e8e8f0;
    --muted:   #6b6b8a;
    --term-bg: #080810;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 24px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 24px;
  }
  header svg { flex-shrink: 0; }
  header h1 { font-size: 1.5rem; font-weight: 700; }
  header p  { font-size: .85rem; color: var(--muted); margin-top: 2px; }

  .grid {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 20px;
  }
  .card h2 { font-size: .95rem; font-weight: 600; margin-bottom: 16px; color: var(--accent2); }

  .field { margin-bottom: 14px; }
  .field label { display: block; font-size: .8rem; color: var(--muted); margin-bottom: 6px; }
  .field select,
  .field input[type=number] {
    width: 100%;
    background: rgba(255,255,255,.06);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: .9rem;
    padding: 8px 12px;
    outline: none;
    appearance: none;
  }
  .field select:focus,
  .field input[type=number]:focus { border-color: var(--accent); }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .toggle-row label { font-size: .85rem; }
  .toggle {
    position: relative;
    width: 40px;
    height: 22px;
  }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute;
    inset: 0;
    background: rgba(255,255,255,.12);
    border-radius: 22px;
    cursor: pointer;
    transition: background .2s;
  }
  .slider::before {
    content: '';
    position: absolute;
    width: 16px; height: 16px;
    left: 3px; top: 3px;
    background: white;
    border-radius: 50%;
    transition: transform .2s;
  }
  input:checked + .slider { background: var(--accent); }
  input:checked + .slider::before { transform: translateX(18px); }

  .btn-run {
    width: 100%;
    padding: 10px;
    background: linear-gradient(135deg, var(--accent), #5e9af5);
    color: white;
    font-size: .95rem;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: opacity .15s, transform .1s;
    margin-top: 4px;
  }
  .btn-run:hover  { opacity: .9; }
  .btn-run:active { transform: scale(.98); }
  .btn-run:disabled { opacity: .4; cursor: not-allowed; transform: none; }

  .btn-cancel {
    width: 100%;
    padding: 8px;
    background: rgba(239,83,80,.15);
    color: var(--red);
    font-size: .85rem;
    border: 1px solid rgba(239,83,80,.3);
    border-radius: 8px;
    cursor: pointer;
    margin-top: 8px;
    display: none;
  }
  .btn-cancel.visible { display: block; }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: .82rem;
    color: var(--muted);
    margin-bottom: 10px;
  }
  .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--muted);
    flex-shrink: 0;
  }
  .dot.running { background: var(--accent2); animation: pulse 1s infinite; }
  .dot.done    { background: var(--green); }
  .dot.error   { background: var(--red); }
  @keyframes pulse {
    0%,100% { opacity: 1; }
    50%      { opacity: .3; }
  }

  .terminal {
    background: var(--term-bg);
    border-radius: 10px;
    padding: 14px 16px;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
    font-size: .78rem;
    line-height: 1.6;
    color: #c8c8e0;
    height: 480px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .terminal .ln-info  { color: #4fc3f7; }
  .terminal .ln-warn  { color: #ffb74d; }
  .terminal .ln-err   { color: #ef5350; }
  .terminal .ln-ok    { color: #66bb6a; }
  .terminal .ln-sep   { color: #5c5c7a; }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: .82rem;
    margin-top: 12px;
  }
  .results-table th {
    text-align: left;
    color: var(--muted);
    font-weight: 500;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
  }
  .results-table td {
    padding: 7px 10px;
    border-bottom: 1px solid rgba(255,255,255,.04);
  }
  .results-table tr:last-child td { border-bottom: none; }
  .val-good { color: var(--green); font-weight: 600; }
  .val-warn { color: #ffb74d; font-weight: 600; }

  #results-section { display: none; margin-top: 16px; }
  #results-section.visible { display: block; }

  .env-note {
    background: rgba(124,106,247,.08);
    border: 1px solid rgba(124,106,247,.2);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: .78rem;
    color: var(--muted);
    margin-bottom: 16px;
    line-height: 1.5;
  }
  .env-note span { color: var(--accent); }
</style>
</head>
<body>

<header>
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="10" fill="rgba(124,106,247,.15)"/>
    <rect x="8" y="18" width="6" height="14" rx="1" fill="#7c6af7" opacity=".7"/>
    <rect x="17" y="12" width="6" height="20" rx="1" fill="#7c6af7"/>
    <rect x="26" y="15" width="6" height="17" rx="1" fill="#7c6af7" opacity=".7"/>
    <path d="M20 8 L18 13 L21 13 L17 20 L22 20 L19 26" stroke="#4fc3f7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>
  <div>
    <h1>Sinergym</h1>
    <p>Building Energy Simulation &amp; HVAC Control Research</p>
  </div>
</header>

<div class="grid">
  <!-- Config panel -->
  <div class="card">
    <h2>Simulation Config</h2>

    <div class="env-note">
      Building: <span>15-zone medium office</span> (ASHRAE 901, Denver)<br>
      Controller: <span>Rule-Based (RBC)</span> — comfort + energy trade-off
    </div>

    <div class="field">
      <label>Control Granularity</label>
      <select id="granularity">
        <option value="zone">Zone — 15 independent setpoint pairs</option>
        <option value="floor">Floor — 3 setpoint pairs (by floor)</option>
        <option value="single">Single — 1 setpoint pair (all zones)</option>
      </select>
    </div>

    <div class="field">
      <label>Weather Profile</label>
      <select id="weather">
        <option value="mixed" selected>Mixed — New York City</option>
        <option value="hot">Hot — Phoenix, Arizona</option>
        <option value="cool">Cool — Washington D.C.</option>
      </select>
    </div>

    <div class="field">
      <label>Episodes</label>
      <input type="number" id="episodes" value="1" min="1" max="10">
    </div>

    <div class="toggle-row">
      <label>Structural Awareness</label>
      <label class="toggle">
        <input type="checkbox" id="structural" checked>
        <span class="slider"></span>
      </label>
    </div>

    <button class="btn-run" id="btn-run" onclick="runSim()">▶ Run Simulation</button>
    <button class="btn-cancel" id="btn-cancel" onclick="cancelSim()">✕ Cancel</button>
  </div>

  <!-- Output panel -->
  <div class="card">
    <h2>Live Output</h2>
    <div class="status-bar">
      <div class="dot" id="dot"></div>
      <span id="status-text">Ready</span>
    </div>
    <div class="terminal" id="terminal">
      <span class="ln-sep">── Sinergym HVAC Simulation Ready ──────────────────────────────────────────</span>
<span class="ln-sep">  Configure simulation parameters on the left and press Run.</span>
<span class="ln-sep">  Output will stream here in real time.</span>
<span class="ln-sep">────────────────────────────────────────────────────────────────────────────</span>
    </div>

    <div id="results-section" class="card">
      <h2>Results Summary</h2>
      <table class="results-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody id="results-body"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
const BASE = document.location.pathname.replace(/\\/+$/, '');
let currentJobId = null;
let eventSource = null;

function classifyLine(line) {
  const l = line.toLowerCase();
  if (/error|exception|traceback|failed/.test(l)) return 'ln-err';
  if (/warn|warning/.test(l)) return 'ln-warn';
  if (/✓|success|done|complete|reward|energy|comfort|episode/.test(l)) return 'ln-ok';
  if (/^[-=─]{3,}/.test(line) || /^#{2,}/.test(line)) return 'ln-sep';
  if (/info|step|zone|floor|setpoint/.test(l)) return 'ln-info';
  return '';
}

function appendLine(text) {
  const term = document.getElementById('terminal');
  const cls  = classifyLine(text);
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = text;
  term.appendChild(span);
  term.appendChild(document.createTextNode('\\n'));
  term.scrollTop = term.scrollHeight;
}

function setStatus(state, msg) {
  const dot  = document.getElementById('dot');
  const txt  = document.getElementById('status-text');
  dot.className  = 'dot ' + state;
  txt.textContent = msg;
}

function extractResults(lines) {
  const rows = [];
  for (const line of lines) {
    const m = line.match(/([\\w\\s]+):\\s*([\\d.]+(?:[\\s\\w%°kWh]+)?)/i);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      if (/reward|energy|comfort|deviation|episode/i.test(key)) {
        rows.push([key, val]);
      }
    }
  }
  return rows;
}

async function runSim() {
  const config = {
    granularity: document.getElementById('granularity').value,
    weather:     document.getElementById('weather').value,
    episodes:    parseInt(document.getElementById('episodes').value, 10),
    structural:  document.getElementById('structural').checked,
  };

  // Reset terminal
  const term = document.getElementById('terminal');
  term.innerHTML = '';
  document.getElementById('results-section').classList.remove('visible');

  document.getElementById('btn-run').disabled = true;
  document.getElementById('btn-cancel').classList.add('visible');
  setStatus('running', 'Starting simulation…');

  try {
    const res = await fetch(BASE + '/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const { job_id } = await res.json();
    currentJobId = job_id;

    appendLine(`── Job ${job_id} ─ ${config.granularity.toUpperCase()} / ${config.weather} / ${config.episodes} episode(s) ─`);
    appendLine('');

    const allLines = [];
    eventSource = new EventSource(BASE + '/api/stream/' + job_id);
    eventSource.onmessage = (e) => {
      appendLine(e.data);
      allLines.push(e.data);
    };
    eventSource.addEventListener('done', (e) => {
      eventSource.close();
      const ok = e.data === 'done';
      setStatus(ok ? 'done' : 'error', ok ? 'Simulation complete' : 'Simulation failed');
      document.getElementById('btn-run').disabled = false;
      document.getElementById('btn-cancel').classList.remove('visible');

      // Try to extract summary rows
      const rows = extractResults(allLines);
      if (rows.length) {
        const tbody = document.getElementById('results-body');
        tbody.innerHTML = rows.map(([k, v]) => {
          const cls = /reward/i.test(k) ? '' :
                      /energy/i.test(k) ? 'val-warn' : 'val-good';
          return `<tr><td>${k}</td><td class="${cls}">${v}</td></tr>`;
        }).join('');
        document.getElementById('results-section').classList.add('visible');
      }
    });
    eventSource.onerror = () => {
      setStatus('error', 'Connection lost');
      document.getElementById('btn-run').disabled = false;
      document.getElementById('btn-cancel').classList.remove('visible');
    };
  } catch (err) {
    setStatus('error', 'Request failed: ' + err.message);
    document.getElementById('btn-run').disabled = false;
    document.getElementById('btn-cancel').classList.remove('visible');
  }
}

async function cancelSim() {
  if (!currentJobId) return;
  if (eventSource) eventSource.close();
  await fetch(BASE + '/api/cancel/' + currentJobId, { method: 'POST' });
  setStatus('error', 'Cancelled');
  document.getElementById('btn-run').disabled = false;
  document.getElementById('btn-cancel').classList.remove('visible');
}
</script>
</body>
</html>
"""


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def index() -> str:
    return _HTML


@app.post("/api/run")
async def start_run(config: SimConfig) -> dict[str, Any]:
    job_id = uuid.uuid4().hex[:8]
    jobs[job_id] = {"status": "running", "lines": deque(maxlen=5000), "proc": None, "rc": None}
    asyncio.create_task(_run_sim(job_id, config))
    return {"job_id": job_id}


@app.get("/api/stream/{job_id}")
async def stream_output(job_id: str):
    if job_id not in jobs:
        return JSONResponse({"error": "not found"}, status_code=404)

    async def generator() -> AsyncGenerator[dict[str, Any], None]:
        job  = jobs[job_id]
        sent = 0
        while True:
            lines = list(job["lines"])
            for line in lines[sent:]:
                yield {"data": line}
                sent += 1
            if job["status"] != "running":
                yield {"event": "done", "data": job["status"]}
                return
            await asyncio.sleep(0.15)

    return EventSourceResponse(generator())


@app.get("/api/status/{job_id}", response_class=JSONResponse)
async def job_status(job_id: str) -> Any:
    if job_id not in jobs:
        return JSONResponse({"error": "not found"}, status_code=404)
    j = jobs[job_id]
    return {"status": j["status"], "lines": len(j.get("lines", [])), "rc": j["rc"]}


@app.post("/api/cancel/{job_id}", response_class=JSONResponse)
async def cancel_job(job_id: str) -> Any:
    if job_id not in jobs:
        return JSONResponse({"error": "not found"}, status_code=404)
    j = jobs[job_id]
    if j["proc"] and j["status"] == "running":
        j["proc"].terminate()
        j["status"] = "cancelled"
    return {"ok": True}


# ── Simulation runner ─────────────────────────────────────────────────────────
async def _run_sim(job_id: str, config: SimConfig) -> None:
    job = jobs[job_id]

    cmd = [
        PYTHON_BIN, str(RBC_SCRIPT),
        "--granularity", config.granularity,
        "--weather",     config.weather,
        "--episodes",    str(config.episodes),
        "--structural" if config.structural else "--no-structural",
    ]

    env = os.environ.copy()
    env["EPLUS_PATH"]       = E_PLUS_PATH   # sinergym reads this
    env["E_PLUS_PATH"]      = E_PLUS_PATH   # rbc_office.py dotenv compat
    # PYTHONPATH: EnergyPlus dir first (for pyenergyplus), then existing path
    existing_pp = env.get("PYTHONPATH", "")
    env["PYTHONPATH"]       = f"{E_PLUS_PATH}:{existing_pp}" if existing_pp else E_PLUS_PATH
    # LD_LIBRARY_PATH: include EnergyPlus dir so bundled libs (libpython3.12.so.1.0 etc.)
    # are found by the dynamic linker when libenergyplusapi.so is loaded via ctypes
    existing_ldp = env.get("LD_LIBRARY_PATH", "")
    env["LD_LIBRARY_PATH"]  = f"{E_PLUS_PATH}:{existing_ldp}" if existing_ldp else E_PLUS_PATH
    env["PYTHONUNBUFFERED"] = "1"

    # pylint: disable=broad-exception-caught
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(SINERGYM_DIR),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        job["proc"] = proc

        assert proc.stdout is not None
        async for raw in proc.stdout:
            job["lines"].append(raw.decode("utf-8", errors="replace").rstrip())

        await proc.wait()
        job["rc"]     = proc.returncode
        job["status"] = "done" if proc.returncode == 0 else "error"

    except Exception as exc:  # noqa: BLE001
        job["lines"].append(f"[server error] {exc}")
        job["status"] = "error"
