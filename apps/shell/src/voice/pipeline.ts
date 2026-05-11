/**
 * Voice pipeline for LIMEN OS shell.
 *
 * Delegates to @limen-os/voice-client for the actual recognition logic,
 * then routes final transcripts through the Tauri `voice_command` command.
 */

import { VoiceClient } from "@limen-os/voice-client";
import { invoke } from "@tauri-apps/api/core";
import { useShellStore } from "../store/shell";

export class VoicePipeline {
  private client: VoiceClient;
  private pttClient: VoiceClient | null = null;
  private pttDispatched = false;
  onSpectrum?: (data: Uint8Array<ArrayBuffer>) => void;

  constructor() {
    const whisperUrl =
      (import.meta.env.VITE_WHISPER_URL as string | undefined) ?? "";
    this.client = new VoiceClient({
      wakeWord: "hey limen",
      ...(whisperUrl ? { whisperUrl } : {}),
      onTranscript: (e) => {
        useShellStore.getState().setVoiceTranscript(e.text);
        if (e.isFinal && e.containsWakeWord) {
          const command = e.text
            .toLowerCase()
            .replace(/hey limen[,.]?\s*/i, "")
            .trim();
          if (command) void this.dispatch(command);
        }
      },
      onSpectrum: (data) => this.onSpectrum?.(data),
      onError: (err) => console.error("[Voice]", err),
    });
  }

  async start() {
    useShellStore.getState().setVoiceActive(true);
    await this.client.start();
  }

  stop() {
    this.client.stop();
    useShellStore.getState().setVoiceActive(false);
  }

  /** Push-to-talk: start recording immediately without wake-word requirement. */
  startPTT() {
    if (this.pttClient) return; // already active
    this.pttDispatched = false;
    const store = useShellStore.getState();
    store.setVoiceActive(true);
    this.pttClient = new VoiceClient({
      wakeWord: "", // no wake word — record everything
      onTranscript: (e) => {
        store.setVoiceTranscript(e.text);
        if (e.isFinal && e.text.trim() && !this.pttDispatched) {
          this.pttDispatched = true;
          void this.dispatch(e.text.trim());
        }
      },
      onSpectrum: (data) => this.onSpectrum?.(data),
      onError: (err) => console.error("[PTT]", err),
    });
    void this.pttClient.start();
  }

  /** Push-to-talk: stop recording and dispatch whatever was captured. */
  stopPTT() {
    if (!this.pttClient) return;
    this.pttClient.stop();
    this.pttClient = null;
    useShellStore.getState().setVoiceActive(false);
  }

  private async dispatch(command: string) {
    const store = useShellStore.getState();
    store.setAiThinking(true);
    try {
      const result = await invoke<{ intent: string; action: string }>(
        "voice_command",
        { transcript: command },
      );
      console.info("[Voice] intent:", result.intent, "action:", result.action);
    } catch (e) {
      console.error("[Voice] dispatch error:", e);
    } finally {
      store.setAiThinking(false);
    }
  }
}

export const voicePipeline = new VoicePipeline();
