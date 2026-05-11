# MOBILE-COMPANION — The Remote Interface

The `mobile` app allows a smartphone to act as a primary input device for LIMEN OS.

---

## 1. Connection Protocol

- **Discovery**: Uses mDNS/Avahi to find the main LIMEN OS instance on the local network.
- **Pairing**: A secure QR-code based handshake (part of the WID protocol).
- **Transport**: WebSockets for commands and WebRTC for low-latency microphone streaming.

---

## 2. Features

- **Remote Mic**: Stream high-quality audio to `limen-voice`.
- **Remote Touchpad**: Use the phone screen for precise cursor control.
- **Scene Switching**: Quickly toggle paradigms or visual scenes from your pocket.
