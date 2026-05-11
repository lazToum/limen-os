//! # limen-ai
//!
//! Multi-model AI orchestration for LIMEN OS.
//!
//! ## Model Priority Chain
//!
//! 1. **Claude** (Anthropic) — primary, best reasoning
//! 2. **GPT-4o** (OpenAI) — fallback
//! 3. **Gemini 2.0 Flash** (Google) — fast fallback
//! 4. **Deepseek-V3** — cheap/local fallback
//! 5. **Groq/Llama** — ultra-fast, low latency
//! 6. **Local** (Ollama/llama.cpp) — offline fallback

pub mod context;
pub mod intent;
pub mod router;

pub use router::{AiRequest, AiResponse, AiRouter, ModelId};
