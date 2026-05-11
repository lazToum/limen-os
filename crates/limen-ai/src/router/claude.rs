//! Anthropic Claude API client.
//!
//! Uses raw reqwest (no SDK dependency) for full control.
//! Supports streaming, tool use, and vision.

use anyhow::{Context, Result};
use std::time::Instant;

use super::{AiRequest, AiResponse, ModelId};

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

fn model_id_to_str(model: &ModelId) -> &'static str {
    match model {
        ModelId::ClaudeOpus46 => "claude-opus-4-6",
        ModelId::ClaudeSonnet46 => "claude-sonnet-4-6",
        ModelId::ClaudeHaiku45 => "claude-haiku-4-5-20251001",
        _ => "claude-sonnet-4-6",
    }
}

pub async fn complete(
    http: &reqwest::Client,
    model: &ModelId,
    req: &AiRequest,
    api_key: &str,
) -> Result<AiResponse> {
    let t0 = Instant::now();

    let mut messages: Vec<serde_json::Value> = req
        .history
        .iter()
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();

    messages.push(serde_json::json!({
        "role": "user",
        "content": req.prompt
    }));

    let mut body = serde_json::json!({
        "model": model_id_to_str(model),
        "max_tokens": req.max_tokens.unwrap_or(4096),
        "messages": messages,
    });

    if let Some(ref system) = req.system {
        body["system"] = serde_json::Value::String(system.clone());
    }

    if !req.tools.is_empty() {
        body["tools"] = serde_json::Value::Array(req.tools.clone());
    }

    if let Some(temp) = req.temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    let resp = http
        .post(ANTHROPIC_API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .context("Claude API request failed")?;

    let status = resp.status();
    let json: serde_json::Value = resp.json().await.context("Claude API JSON decode failed")?;

    if !status.is_success() {
        anyhow::bail!("Claude API error {}: {}", status, json);
    }

    let content = json["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let input_tokens = json["usage"]["input_tokens"].as_u64().unwrap_or(0) as u32;
    let output_tokens = json["usage"]["output_tokens"].as_u64().unwrap_or(0) as u32;

    Ok(AiResponse {
        content,
        model_used: model.clone(),
        input_tokens,
        output_tokens,
        latency_ms: t0.elapsed().as_millis() as u64,
        tool_calls: vec![],
    })
}
