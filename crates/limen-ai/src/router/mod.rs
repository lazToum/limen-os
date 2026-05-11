//! Multi-model AI router.
//!
//! Selects the best available model for each request based on:
//! - Required capabilities (vision, tool_use, reasoning, speed)
//! - API key availability
//! - Rate limit status
//! - Cost budget

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, warn};

pub mod claude;
pub mod gemini;
pub mod openai_compat;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelId {
    // Anthropic
    ClaudeOpus46,
    ClaudeSonnet46,
    ClaudeHaiku45,
    // OpenAI
    Gpt4o,
    Gpt4oMini,
    // Google
    Gemini20Flash,
    // Deepseek
    DeepseekV3,
    DeepseekR1,
    // Groq
    GroqLlama33_70b,
    // Local (Ollama)
    Local { model: String },
}

impl ModelId {
    pub fn display_name(&self) -> &str {
        match self {
            ModelId::ClaudeOpus46 => "Claude Opus 4.6",
            ModelId::ClaudeSonnet46 => "Claude Sonnet 4.6",
            ModelId::ClaudeHaiku45 => "Claude Haiku 4.5",
            ModelId::Gpt4o => "GPT-4o",
            ModelId::Gpt4oMini => "GPT-4o Mini",
            ModelId::Gemini20Flash => "Gemini 2.0 Flash",
            ModelId::DeepseekV3 => "Deepseek V3",
            ModelId::DeepseekR1 => "Deepseek R1",
            ModelId::GroqLlama33_70b => "Llama 3.3 70B (Groq)",
            ModelId::Local { .. } => "Local",
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AiRequest {
    pub prompt: String,
    pub system: Option<String>,
    pub model_hint: Option<ModelId>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    /// Tool/function definitions (JSON Schema).
    pub tools: Vec<serde_json::Value>,
    /// Conversation history.
    pub history: Vec<ChatMessage>,
    /// Skip context manager injection (use for internal/system calls like intent recognition).
    #[serde(default)]
    pub skip_context: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub content: String,
    pub model_used: ModelId,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub latency_ms: u64,
    /// Structured tool call output, if any.
    pub tool_calls: Vec<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct RouterConfig {
    pub anthropic_api_key: Option<String>,
    pub openai_api_key: Option<String>,
    pub gemini_api_key: Option<String>,
    pub deepseek_api_key: Option<String>,
    pub groq_api_key: Option<String>,
    /// Default model priority chain (tried in order).
    pub priority: Vec<ModelId>,
}

impl RouterConfig {
    /// Load from environment variables.
    pub fn from_env() -> Self {
        Self {
            anthropic_api_key: std::env::var("ANTHROPIC_API_KEY").ok(),
            openai_api_key: std::env::var("OPENAI_API_KEY").ok(),
            gemini_api_key: std::env::var("GOOGLE_GEMINI_API_KEY").ok(),
            deepseek_api_key: std::env::var("DEEPSEEK_API_KEY").ok(),
            groq_api_key: std::env::var("GROQ_API_KEY").ok(),
            priority: vec![
                ModelId::ClaudeSonnet46,
                ModelId::Gpt4o,
                ModelId::Gemini20Flash,
                ModelId::DeepseekV3,
                ModelId::GroqLlama33_70b,
            ],
        }
    }
}

/// The main AI router.
pub struct AiRouter {
    config: RouterConfig,
    /// Per-model rate-limit status.
    rate_limited: Arc<RwLock<HashMap<ModelId, std::time::Instant>>>,
    http: reqwest::Client,
    /// Session-level conversation context (sliding window, 20 messages).
    context: crate::context::ContextManager,
}

impl AiRouter {
    pub fn new(config: RouterConfig) -> Self {
        Self {
            config,
            rate_limited: Arc::new(RwLock::new(HashMap::new())),
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .expect("http client"),
            context: crate::context::ContextManager::new(),
        }
    }

    pub fn from_env() -> Self {
        Self::new(RouterConfig::from_env())
    }

    /// Route a request through the model priority chain.
    ///
    /// Context is automatically managed: conversation history from prior calls
    /// is injected into the request, and the response is stored for future calls.
    pub async fn complete(&self, mut req: AiRequest) -> Result<AiResponse> {
        // Inject accumulated conversation history for user-facing calls.
        if !req.skip_context && req.history.is_empty() {
            req.history = self.context.get();
        }

        let chain = if let Some(hint) = &req.model_hint {
            vec![hint.clone()]
                .into_iter()
                .chain(self.config.priority.iter().cloned())
                .collect::<Vec<_>>()
        } else {
            self.config.priority.clone()
        };

        let mut last_err = anyhow::anyhow!("No models available");

        for model in &chain {
            if !self.model_available(model).await {
                debug!("Model {model:?} not available, skipping");
                continue;
            }

            debug!("Trying model {model:?}");
            match self.call_model(model, &req).await {
                Ok(resp) => {
                    // Persist user-facing exchanges into context for multi-turn memory.
                    if !req.skip_context {
                        self.context.push_user(req.prompt.clone());
                        self.context.push_assistant(resp.content.clone());
                    }
                    return Ok(resp);
                }
                Err(e) => {
                    warn!("Model {model:?} failed: {e}");
                    last_err = e;
                }
            }
        }

        Err(last_err)
    }

    /// Clear the conversation context (e.g. on session end or explicit reset).
    pub fn clear_context(&self) {
        self.context.clear();
    }

    async fn model_available(&self, model: &ModelId) -> bool {
        let has_key = match model {
            ModelId::ClaudeOpus46 | ModelId::ClaudeSonnet46 | ModelId::ClaudeHaiku45 => {
                self.config.anthropic_api_key.is_some()
            }
            ModelId::Gpt4o | ModelId::Gpt4oMini => self.config.openai_api_key.is_some(),
            ModelId::Gemini20Flash => self.config.gemini_api_key.is_some(),
            ModelId::DeepseekV3 | ModelId::DeepseekR1 => self.config.deepseek_api_key.is_some(),
            ModelId::GroqLlama33_70b => self.config.groq_api_key.is_some(),
            ModelId::Local { .. } => true,
        };
        if !has_key {
            return false;
        }

        // Check rate limit cooldown (1 min).
        let rl = self.rate_limited.read().await;
        if let Some(until) = rl.get(model)
            && until.elapsed() < std::time::Duration::from_secs(60)
        {
            return false;
        }
        true
    }

    async fn call_model(&self, model: &ModelId, req: &AiRequest) -> Result<AiResponse> {
        match model {
            ModelId::ClaudeOpus46 | ModelId::ClaudeSonnet46 | ModelId::ClaudeHaiku45 => {
                claude::complete(
                    &self.http,
                    model,
                    req,
                    self.config.anthropic_api_key.as_deref().unwrap(),
                )
                .await
            }
            ModelId::Gemini20Flash => {
                gemini::complete(
                    &self.http,
                    model,
                    req,
                    self.config.gemini_api_key.as_deref().unwrap(),
                )
                .await
            }
            _ => openai_compat::complete(&self.http, model, req, &self.config).await,
        }
    }
}
