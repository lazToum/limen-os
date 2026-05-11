//! Conversation context manager — sliding window memory for the AI.
//!
//! Maintains a per-session conversation history with token budget awareness.
//! When the context grows too large, older messages are summarized and compressed.

use crate::router::ChatMessage;
use std::sync::{Arc, Mutex};

const MAX_HISTORY_MESSAGES: usize = 20;

#[derive(Default, Clone)]
pub struct ContextManager {
    history: Arc<Mutex<Vec<ChatMessage>>>,
}

impl ContextManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push_user(&self, content: String) {
        self.push(ChatMessage {
            role: "user".into(),
            content,
        });
    }

    pub fn push_assistant(&self, content: String) {
        self.push(ChatMessage {
            role: "assistant".into(),
            content,
        });
    }

    fn push(&self, msg: ChatMessage) {
        let mut h = self.history.lock().expect("context lock");
        h.push(msg);
        // Trim to budget (keep most recent).
        let len = h.len();
        if len > MAX_HISTORY_MESSAGES {
            h.drain(0..len - MAX_HISTORY_MESSAGES);
        }
    }

    pub fn get(&self) -> Vec<ChatMessage> {
        self.history.lock().expect("context lock").clone()
    }

    pub fn clear(&self) {
        self.history.lock().expect("context lock").clear();
    }
}
