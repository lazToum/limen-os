//! Intent recognition — converts voice transcripts to structured actions.

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::router::{AiRequest, AiRouter, ModelId};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Intent {
    pub kind: IntentKind,
    pub target: String,
    pub confidence: f32,
    pub raw_transcript: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IntentKind {
    OpenApp,
    CloseApp,
    SetScene,
    Search,
    AiQuery,
    SystemCommand,
    /// Control the media player (play/pause/next/prev/stop/volume).
    MediaControl,
    Unknown,
}

const INTENT_SYSTEM: &str = r#"You are LIMEN OS, a voice-controlled desktop shell.
Parse the user's voice command and respond with JSON only (no markdown, no explanation):
{
  "kind": "open_app|close_app|set_scene|search|ai_query|system_command|media_control|unknown",
  "target": "string  (for media_control: play|pause|next|prev|stop|volume_up|volume_down)",
  "confidence": 0.0-1.0
}"#;

pub async fn recognize(transcript: &str, router: &AiRouter) -> Result<Intent> {
    let req = AiRequest {
        prompt: transcript.to_string(),
        system: Some(INTENT_SYSTEM.to_string()),
        model_hint: Some(ModelId::GroqLlama33_70b), // fast for intent
        max_tokens: Some(200),
        temperature: Some(0.0),
        tools: vec![],
        history: vec![],
        skip_context: true, // intent recognition is internal — don't pollute conversation context
    };

    let resp = router.complete(req).await?;

    let parsed: serde_json::Value = serde_json::from_str(&resp.content).unwrap_or_else(
        |_| serde_json::json!({ "kind": "unknown", "target": "", "confidence": 0.0 }),
    );

    Ok(Intent {
        kind: serde_json::from_value(parsed["kind"].clone()).unwrap_or(IntentKind::Unknown),
        target: parsed["target"].as_str().unwrap_or("").to_string(),
        confidence: parsed["confidence"].as_f64().unwrap_or(0.0) as f32,
        raw_transcript: transcript.to_string(),
    })
}
