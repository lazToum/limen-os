# HLC-WID Specification

**WID (Waldiez/LIMEN Identifier)** is a time-ordered, human-readable, collision-resistant identifier format designed for distributed IoT and agent systems.

This document reflects the official specification from the [WID Repository](../../../wid/spec/SPEC.md).

---

## 1. Format

LIMEN OS primarily uses the **HLC-WID** variant for cross-component causality tracking.

### HLC-WID Structure
```text
TIMESTAMP "." LC "Z" "-" NODE [ "-" PAD ]
```

### Components

| Component | Format | Description |
| :--------- | :------ | :----------- |
| TIMESTAMP | `YYYYMMDDTHHMMSS` | UTC timestamp (ISO 8601 basic format) |
| LC | `[0-9]{4}` | Zero-padded logical counter (4 digits) |
| NODE | `[A-Za-z0-9_]+` | Node identifier (no hyphens, no spaces) |
| PAD | `[0-9a-f]{6}` | Random lowercase hex padding (optional) |

### Example
```text
20260307T143052.0000Z-node01-a3f91c
```

---

## 2. Design Goals

1. **Lexicographically sortable**: IDs sort chronologically as strings.
2. **Human-readable**: Timestamps are visible, not encoded.
3. **Collision-resistant**: Sequence counters + random padding.
4. **Distributed**: HLC variant supports node tagging for distributed systems.
5. **Causality-preserving**: Supports merging and observing remote clocks.

---

## 3. Usage in Limen OS

### Causality Tracking
When an event (like an AI Response) is triggered by another (like a Voice Command), the response's `caused_by` field matches the original event's WID.

### State Synchronization
The frontend and backend use WIDs to ensure state updates are processed in the correct order. If a message arrives with a WID older than the current local state, it is discarded as stale.

---

## 4. Generation Algorithm (HLC-WID)

```bash
function next_hlc_wid(W, Z, node):
    now = current_utc_seconds()
    
    # Update physical time
    if now > pt:
        pt = now
        lc = 0
    else:
        lc = lc + 1
    
    # Handle overflow
    if lc > 10^W - 1:
        pt = pt + 1
        lc = 0
    
    # Format components
    ts = format_timestamp(pt)
    lc_str = zero_pad(lc, W)
    pad = random_hex(Z)
    
    return ts + "." + lc_str + "Z-" + node + "-" + pad
```

---

## 5. Implementation Reference

The official implementations are available in the `wid` repository:
- **Rust**: `crates/wid`
- **TypeScript**: `packages/wid`
- **Python**: `python/wid`
