//! Google Gemini API client (generativelanguage.googleapis.com).
//!
//! Uses the `generateContent` endpoint — different shape from OpenAI.
//! Roles: "user" / "model" (not "assistant").

use anyhow::{Context, Result};
use std::time::Instant;

use super::{AiRequest, AiResponse, ModelId};

fn model_name(model: &ModelId) -> &'static str {
    match model {
        ModelId::Gemini20Flash => "gemini-2.0-flash",
        _ => "gemini-2.0-flash",
    }
}

pub async fn complete(
    http: &reqwest::Client,
    model: &ModelId,
    req: &AiRequest,
    api_key: &str,
) -> Result<AiResponse> {
    let t0 = Instant::now();
    let name = model_name(model);
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{name}:generateContent?key={api_key}"
    );

    // Build contents array — Gemini uses "user"/"model" roles, not "assistant".
    let mut contents: Vec<serde_json::Value> = req
        .history
        .iter()
        .map(|m| {
            let role = if m.role == "assistant" {
                "model"
            } else {
                "user"
            };
            serde_json::json!({ "role": role, "parts": [{ "text": m.content }] })
        })
        .collect();
    contents.push(serde_json::json!({
        "role": "user",
        "parts": [{ "text": req.prompt }]
    }));

    let mut body = serde_json::json!({ "contents": contents });

    // System instruction (separate field in Gemini API).
    if let Some(ref system) = req.system {
        body["systemInstruction"] = serde_json::json!({
            "parts": [{ "text": system }]
        });
    }

    // Generation config.
    let mut gen_cfg = serde_json::json!({});
    if let Some(max) = req.max_tokens {
        gen_cfg["maxOutputTokens"] = serde_json::json!(max);
    }
    if let Some(temp) = req.temperature {
        gen_cfg["temperature"] = serde_json::json!(temp);
    }
    if gen_cfg.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
        body["generationConfig"] = gen_cfg;
    }

    let resp = http
        .post(&url)
        .json(&body)
        .send()
        .await
        .context("Gemini API request failed")?;

    let status = resp.status();
    let json: serde_json::Value = resp.json().await?;

    if !status.is_success() {
        anyhow::bail!("Gemini error {status}: {json}");
    }

    let content = json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Gemini token counts live under usageMetadata.
    let input_tokens = json["usageMetadata"]["promptTokenCount"]
        .as_u64()
        .unwrap_or(0) as u32;
    let output_tokens = json["usageMetadata"]["candidatesTokenCount"]
        .as_u64()
        .unwrap_or(0) as u32;

    Ok(AiResponse {
        content,
        model_used: model.clone(),
        input_tokens,
        output_tokens,
        latency_ms: t0.elapsed().as_millis() as u64,
        tool_calls: vec![],
    })
}
