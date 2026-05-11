# LIMEN-AI — The System Brain

`limen-ai` is the intent classification and LLM routing layer.

---

## 1. Intent Routing

When a transcript arrives from `limen-voice`, the AI router:
1. **Normalizes**: Strips filler words ("uh", "um").
2. **Classifies**: Matches the text against the [Voice Intent Schema](../api/VOICE.md).
3. **Targets**: Identifies if the target is a system command, a plugin, or an AI query.

---

## 2. Supported Providers

The router can be configured to use multiple LLM backends:

- **Local (Llama.cpp/Ollama)**: Our primary privacy-focused engine.
- **OpenAI/Claude/Gemini**: High-power cloud fallback (requires explicit user consent).
- **Groq**: Used for ultra-low latency intent classification (<200ms).

---

## 3. Context & History

The AI brain maintains a short-term sliding window of previous interactions.
This allows for conversational context:
- User: "What is the weather in Paris?"
- AI: "It is 15 degrees in Paris."
- User: "How about London?" (AI knows you are still asking about weather).
