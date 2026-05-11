//! # limen-display
//!
//! Display management integration for LIMEN OS.
//!
//! Phase 4+ features:
//!   - Query connected displays (resolution, refresh rate, HDR)
//!   - Set display configuration (rotation, scaling, multi-monitor layout)
//!   - Wayland layer-shell: position shell windows above all others
//!   - X11 fallback: EWMH hints for always-on-top, fullscreen
//!   - Lock screen protocol (ext-session-lock-v1)

pub mod window;

/// Current display configuration.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DisplayConfig {
    pub width: u32,
    pub height: u32,
    pub refresh_hz: f32,
    pub scale_factor: f32,
    pub hdr: bool,
}

impl Default for DisplayConfig {
    fn default() -> Self {
        Self {
            width: 1920,
            height: 1080,
            refresh_hz: 60.0,
            scale_factor: 1.0,
            hdr: false,
        }
    }
}
