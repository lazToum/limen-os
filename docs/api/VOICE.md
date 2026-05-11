# LIMEN OS — Voice Intent API

The voice pipeline in LIMEN OS uses an AI-driven router (typically running in `limen-ai`) to transform raw transcripts into structured intent JSON.

---

## Intent Schema

Every voice command is parsed into the following JSON structure:

```json
{
  "intent": "string",
  "target": "string",
  "confidence": "number (0-1)",
  "context": "object (optional)"
}
```

---

## Supported Intents

### `open_app`
Launches a system application or a LIMEN plugin.
- **Target**: The name of the app (e.g., `"terminal"`, `"browser"`, `"weather"`).
- **Example**: "Hey Limen, open terminal"

### `close_app`
Closes the currently active or a specific application.
- **Target**: The name of the app or `"active"`.
- **Example**: "Close the weather app"

### `set_scene`
Changes the visual state of the Babylon.js frontend.
- **Target**: `"home"`, `"launcher"`, `"ambient"`, `"voice"`.
- **Example**: "Show my apps" (Target: `launcher`)

### `search`
Performs a local or web search.
- **Target**: The search query string.
- **Example**: "Search for recent files"

### `ai_query`
Routes the transcript to the LLM for a natural language response.
- **Target**: The user's full query.
- **Example**: "What's the weather like today?"

### `system`
Performs system-level operations.
- **Target**: `"lock"`, `"reboot"`, `"shutdown"`, `"sleep"`.
- **Example**: "Lock the screen"

---

## Router Logic

1. **Transcription**: `limen-voice` (Whisper ONNX) generates text from audio.
2. **Classification**: The transcript is sent to `limen-ai`.
3. **Intent Mapping**:
   - If `confidence > 0.85`: Execute the intent immediately.
   - If `0.5 < confidence < 0.85`: Ask for confirmation ("Did you mean to open terminal?").
   - If `confidence < 0.5`: Fallback to `ai_query`.

---

## Testing Intents

You can simulate intents via the Unix socket:

```bash
echo '{"command": "voice_command", "transcript": "go home"}' | nc -U /run/limen/core.sock
```
