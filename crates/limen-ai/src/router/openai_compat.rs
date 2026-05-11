//! OpenAI-compatible API client.
//!
//! Supports: OpenAI, Groq, Deepseek, Mistral, Together — all use the same API shape.

use anyhow::{Context, Result};
use std::time::Instant;

use super::{AiRequest, AiResponse, ModelId, RouterConfig};

fn endpoint_for(model: &ModelId, config: &RouterConfig) -> Option<(String, String, String)> {
    match model {
        ModelId::Gpt4o => Some((
            "https://api.openai.com/v1/chat/completions".into(),
            "gpt-4o".into(),
            config.openai_api_key.clone()?,
        )),
        ModelId::Gpt4oMini => Some((
            "https://api.openai.com/v1/chat/completions".into(),
            "gpt-4o-mini".into(),
            config.openai_api_key.clone()?,
        )),
        ModelId::DeepseekV3 => Some((
            "https://api.deepseek.com/v1/chat/completions".into(),
            "deepseek-chat".into(),
            config.deepseek_api_key.clone()?,
        )),
        ModelId::DeepseekR1 => Some((
            "https://api.deepseek.com/v1/chat/completions".into(),
            "deepseek-reasoner".into(),
            config.deepseek_api_key.clone()?,
        )),
        ModelId::GroqLlama33_70b => Some((
            "https://api.groq.com/openai/v1/chat/completions".into(),
            "llama-3.3-70b-versatile".into(),
            config.groq_api_key.clone()?,
        )),
        ModelId::Local { model } => Some((
            "http://localhost:11434/v1/chat/completions".into(),
            model.clone(),
            "ollama".into(),
        )),
        _ => None,
    }
}

pub async fn complete(
    http: &reqwest::Client,
    model: &ModelId,
    req: &AiRequest,
    config: &RouterConfig,
) -> Result<AiResponse> {
    let (url, model_name, api_key) =
        endpoint_for(model, config).ok_or_else(|| anyhow::anyhow!("No endpoint for {model:?}"))?;

    let t0 = Instant::now();

    let mut messages = vec![];
    if let Some(ref system) = req.system {
        messages.push(serde_json::json!({ "role": "system", "content": system }));
    }
    for m in &req.history {
        messages.push(serde_json::json!({ "role": m.role, "content": m.content }));
    }
    messages.push(serde_json::json!({ "role": "user", "content": req.prompt }));

    let mut body = serde_json::json!({
        "model": model_name,
        "messages": messages,
        "max_tokens": req.max_tokens.unwrap_or(4096),
    });

    if let Some(temp) = req.temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    let resp = http
        .post(&url)
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .context("OpenAI-compat API request failed")?;

    let status = resp.status();
    let json: serde_json::Value = resp.json().await?;

    if !status.is_success() {
        anyhow::bail!("API error {}: {}", status, json);
    }

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let input_tokens = json["usage"]["prompt_tokens"].as_u64().unwrap_or(0) as u32;
    let output_tokens = json["usage"]["completion_tokens"].as_u64().unwrap_or(0) as u32;

    Ok(AiResponse {
        content,
        model_used: model.clone(),
        input_tokens,
        output_tokens,
        latency_ms: t0.elapsed().as_millis() as u64,
        tool_calls: vec![],
    })
}
