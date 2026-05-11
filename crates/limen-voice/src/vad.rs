//! Voice Activity Detection — simple energy-based VAD.
//!
//! Uses RMS energy with a configurable threshold. Good enough for
//! wake-word gating; replace with a proper WebRTC VAD or Silero VAD
//! model when Phase 2 ONNX integration is complete.

/// Default RMS energy threshold for speech detection.
/// Tune based on your environment (quieter room → lower threshold).
const DEFAULT_THRESHOLD: f32 = 0.01;

/// Minimum consecutive active chunks before we declare speech started.
const MIN_ACTIVE_CHUNKS: usize = 2;

/// How many silent chunks after speech ends before we cut the segment.
const SILENCE_HANGOVER: usize = 8;

/// State of the VAD finite-state machine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VadState {
    Silence,
    MaybeSpeech { active: usize },
    Speech { silent_tail: usize },
}

pub struct Vad {
    threshold: f32,
    pub state: VadState,
}

impl Vad {
    pub fn new() -> Self {
        Self {
            threshold: DEFAULT_THRESHOLD,
            state: VadState::Silence,
        }
    }

    pub fn with_threshold(mut self, t: f32) -> Self {
        self.threshold = t;
        self
    }

    /// Feed a PCM chunk; returns `true` when a complete speech segment has ended.
    /// When `true`, the caller should consume the accumulated buffer as one utterance.
    pub fn process(&mut self, chunk: &[f32]) -> VadEvent {
        let rms = rms(chunk);
        let is_active = rms > self.threshold;

        match &self.state {
            VadState::Silence => {
                if is_active {
                    self.state = VadState::MaybeSpeech { active: 1 };
                }
                VadEvent::Silence
            }
            VadState::MaybeSpeech { active } => {
                let active = *active;
                if is_active {
                    if active + 1 >= MIN_ACTIVE_CHUNKS {
                        self.state = VadState::Speech { silent_tail: 0 };
                        VadEvent::SpeechStart
                    } else {
                        self.state = VadState::MaybeSpeech { active: active + 1 };
                        VadEvent::Silence
                    }
                } else {
                    self.state = VadState::Silence;
                    VadEvent::Silence
                }
            }
            VadState::Speech { silent_tail } => {
                if is_active {
                    self.state = VadState::Speech { silent_tail: 0 };
                    VadEvent::Speaking
                } else {
                    let tail = silent_tail + 1;
                    if tail >= SILENCE_HANGOVER {
                        self.state = VadState::Silence;
                        VadEvent::SpeechEnd
                    } else {
                        self.state = VadState::Speech { silent_tail: tail };
                        VadEvent::Speaking // still in hangover
                    }
                }
            }
        }
    }

    pub fn is_speech(&self) -> bool {
        matches!(self.state, VadState::Speech { .. })
    }
}

impl Default for Vad {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VadEvent {
    Silence,
    SpeechStart,
    Speaking,
    SpeechEnd,
}

fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sq_sum: f32 = samples.iter().map(|s| s * s).sum();
    (sq_sum / samples.len() as f32).sqrt()
}
