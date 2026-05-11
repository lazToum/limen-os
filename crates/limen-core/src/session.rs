//! Session management — login, lock, logout, identity.

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionState {
    /// Pre-login greeter screen.
    Greeter,
    /// Authenticated, active desktop.
    Active { user: String },
    /// Screen locked.
    Locked { user: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    /// WID that identifies this session lifecycle.
    pub wid: String,
    pub state: SessionState,
}

pub struct SessionManager {
    inner: Arc<RwLock<Option<Session>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(None)),
        }
    }

    pub fn start(&self, wid: String, user: String) {
        let mut guard = self.inner.write();
        *guard = Some(Session {
            wid,
            state: SessionState::Active { user },
        });
    }

    pub fn lock(&self) {
        let mut guard = self.inner.write();
        if let Some(ref mut s) = *guard
            && let SessionState::Active { ref user } = s.state.clone()
        {
            s.state = SessionState::Locked { user: user.clone() };
        }
    }

    pub fn unlock(&self) {
        let mut guard = self.inner.write();
        if let Some(ref mut s) = *guard
            && let SessionState::Locked { ref user } = s.state.clone()
        {
            s.state = SessionState::Active { user: user.clone() };
        }
    }

    pub fn end(&self) {
        let mut guard = self.inner.write();
        *guard = None;
    }

    pub fn get(&self) -> Option<Session> {
        self.inner.read().clone()
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}
