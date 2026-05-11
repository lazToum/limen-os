# Security Policy

## Supported versions

Limen OS is pre-release (v0.1.x alpha). Security fixes are applied to the
latest commit on `main`; no backport branches exist yet.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email **laztoum@protonmail.com** with:

- A clear description of the vulnerability and its impact
- Steps to reproduce or a proof-of-concept
- The component and version (or commit SHA) affected
- Whether you have a proposed fix

You will receive an acknowledgment within **72 hours** and a status update
within **7 days**. We follow coordinated disclosure: once a fix is ready we
will publish a security advisory and credit the reporter (unless you prefer
to remain anonymous).

## Scope

In scope:
- Remote code execution via the Tauri IPC bridge or WASM plugin host
- Voice/audio stream interception or unauthorized activation
- AI model prompt injection that exfiltrates user data
- Privilege escalation via the D-Bus/Wayland bridge
- Credential or API key exposure in build outputs

Out of scope:
- Vulnerabilities in upstream dependencies (report to their maintainers)
- Denial-of-service on a single-user local machine
- Issues requiring physical access to the device
