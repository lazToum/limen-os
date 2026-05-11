# LIMEN OS — WID Integration

Every significant event in LIMEN OS is tagged with a Waldiez ID (WID) to maintain causality across distributed components.

---

## Format

WID follows a strict HLC (Hybrid Logical Clock) format:

```text
20260307T143052.0000Z-node01-a3f91c
(ISO-8601 Timestamp)  (Hostname) (Collision-resistant suffix)
```

---

## Usage in Limen OS

### 1. Causality Tracking
When a voice command triggers an AI response, the response's `caused_by` field matches the voice command's `id`:

```json
{
  "id": "20260307T143116.0042Z-d4e5f6",
  "type": "ai_response",
  "caused_by": "20260307T143115.1234Z-a3b2c1",
  "content": "Opening terminal..."
}
```

### 2. Audit Logging
The `limen-core` event bus writes all WID-tagged events to a rolling JSONL file at `/var/log/limen/events.jsonl`. This allows for exact replay and debugging.

### 3. State Sync
Frontend (Babylon.js) and Backend (Rust) synchronize their states by verifying the most recent WID. If a state update arrives with an older WID than the current one, it is discarded as stale.

---

## Generating WIDs

You can generate a WID using the system command:

```bash
limen-cli wid gen
```

Or programmatically in Rust:

```rust
use limen_core::wid::Wid;

let event_id = Wid::now();
println!("New event: {}", event_id);
```
