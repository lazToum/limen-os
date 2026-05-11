# SECURITY & PERMISSIONS

LIMEN OS employs a multi-layered security model to protect user data and system integrity.

---

## 1. WASM Sandboxing
All plugins are loaded into a `wasmtime` sandbox. They have NO access to the host filesystem or network unless explicitly granted in their manifest.

## 2. IPC Restrictions
The Unix socket (`/run/limen/core.sock`) is locked to the `limen-api` group. Only authorized processes can send system-level commands.

## 3. Local-First Data
Sensitive data (Voice transcripts, Face biometric hashes, Session history) is stored locally. Cloud sync is only enabled via explicit Opt-In and uses end-to-end encryption.
