# LIMEN OS — Daemon IPC

`limen-core` runs as a system-level daemon, communicating with the frontend and plugins via a Unix Domain Socket (UDS).

---

## Socket Path

The default path for the IPC socket is:

```text
/run/limen/core.sock
```

---

## Communication Protocol

- **Transport**: Unix Domain Socket (Stream)
- **Format**: JSON-RPC-like newline-delimited JSON.

---

## Commands

### `voice_command`
Passes raw transcript for processing.
- **Request**: `{"command": "voice_command", "transcript": "..."}`
- **Response**: `{"status": "ok", "intent": {...}}`

### `set_scene`
Directly triggers a scene transition on the frontend.
- **Request**: `{"command": "set_scene", "target": "..."}`
- **Response**: `{"status": "ok"}`

### `launch_app`
Requests `limen-core` to execute a system command or plugin.
- **Request**: `{"command": "launch_app", "name": "..."}`
- **Response**: `{"status": "ok", "pid": 1234}`

### `ai_query`
Queries the LLM router directly.
- **Request**: `{"command": "ai_query", "query": "..."}`
- **Response**: `{"status": "ok", "response": "..."}`

---

## Error Codes

| Code | Meaning |
|---|---|
| `UNAUTHORIZED` | Plugin requested action without permission. |
| `NOT_FOUND` | Target app or scene does not exist. |
| `DAEMON_BUSY` | Daemon is currently processing a long-running request. |
| `INVALID_JSON` | Malformed command sent to the socket. |
