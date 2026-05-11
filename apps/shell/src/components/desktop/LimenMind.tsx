/**
 * LimenMind — Interactive learning playground for Limen OS.
 *
 * Teaches the WID string system through live, self-demonstrating examples:
 *   ISO-8601 compact date → sequence padding → Z marker → OTP suffix
 *   → full WID: 20260314T075934.0001Z-a3f9c2
 *
 * The component IS its own subject: it shows a live WID in the header
 * that updates every second, demonstrating the very thing it teaches.
 *
 * Name: limenos.mind.is.cat.dot.toc
 *   = this app's identity is literally its own .toc timestamp
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useShellStore } from "../../store/shell";

// ── WID generation (browser-side, mirrors wid.ts logic) ──────────────────────

function zeroPad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface WidParts {
  date: string; // YYYYMMDD
  time: string; // HHMMSS
  seq: string; // 0001
  zone: string; // Z
  otp: string; // a3f9c2
  full: string; // full WID string
}

function buildWid(seq: number): WidParts {
  const now = new Date();
  const date = `${now.getUTCFullYear()}${zeroPad(now.getUTCMonth() + 1, 2)}${zeroPad(now.getUTCDate(), 2)}`;
  const time = `${zeroPad(now.getUTCHours(), 2)}${zeroPad(now.getUTCMinutes(), 2)}${zeroPad(now.getUTCSeconds(), 2)}`;
  const seqStr = zeroPad(seq, 4);
  const zone = "Z";
  const otp = randomHex(3);
  return {
    date,
    time,
    seq: seqStr,
    zone,
    otp,
    full: `${date}T${time}.${seqStr}${zone}-${otp}`,
  };
}

// ── OTP single-use key demo ───────────────────────────────────────────────────

function xorOtp(message: string, key: string): string {
  const msgBytes = new TextEncoder().encode(message.slice(0, key.length));
  const keyBytes = new TextEncoder().encode(key.slice(0, message.length));
  return Array.from(msgBytes)
    .map((b, i) => (b ^ (keyBytes[i] ?? 0)).toString(16).padStart(2, "0"))
    .join(" ");
}

// ── Lesson definitions ────────────────────────────────────────────────────────

interface Lesson {
  id: string;
  title: string;
  emoji: string;
  color: string; // Tailwind text color class
  glow: string; // hex for glow
  steps: LessonStep[];
}

interface LessonStep {
  label: string;
  code: string; // shell / pseudo-code shown
  live?: (wid: WidParts, custom: string) => string;
  note: string;
}

const LESSONS: Lesson[] = [
  {
    id: "date",
    title: "ISO Date Compact",
    emoji: "📅",
    color: "text-amber-400",
    glow: "#f59e0b",
    steps: [
      {
        label: "Get current UTC date",
        code: `date -u +"%Y%m%d"`,
        live: (w) => w.date,
        note: "YYYYMMDD — compact, sortable, unambiguous. No dashes = no parsing confusion.",
      },
      {
        label: "Add the time",
        code: `date -u +"%H%M%S"`,
        live: (w) => w.time,
        note: "HHMMSS in UTC. Together: YYYYMMDDTHHMMSS — the ISO-8601 basic format.",
      },
      {
        label: "Combine with T separator",
        code: `date -u +"%Y%m%dT%H%M%S"`,
        live: (w) => `${w.date}T${w.time}`,
        note: "T is the ISO-8601 date/time separator. Keeps date and time visually distinct.",
      },
    ],
  },
  {
    id: "pad",
    title: "Sequence Padding",
    emoji: "🔢",
    color: "text-cyan-400",
    glow: "#22d3ee",
    steps: [
      {
        label: "The problem: 1 vs 001 vs 0001",
        code: `# Without padding:\n1, 2, 10, 100  → sorts wrong lexicographically\n# With padding:\n0001, 0002, 0010, 0100  → always sorts correctly`,
        note: "String sort treats '10' < '2'. Zero-padding to N digits fixes this forever.",
      },
      {
        label: "Shell: printf zero-pad",
        code: `seq=1\nprintf "%04d" $seq   # → 0001\nprintf "%04d" 42     # → 0042\nprintf "%04d" 9999   # → 9999`,
        live: (w) => w.seq,
        note: "%04d = decimal, minimum 4 chars, pad with zeros. Same in C, Rust, Python.",
      },
      {
        label: "TypeScript: padStart",
        code: `const seq = 1;\nString(seq).padStart(4, '0')  // → "0001"\n\n// General rule:\nfunction zeroPad(n: number, width: number) {\n  return String(n).padStart(width, '0');\n}`,
        note: "padStart(width, char) fills from the left. Works on any string.",
      },
    ],
  },
  {
    id: "wid",
    title: "WID Assembly",
    emoji: "🧩",
    color: "text-purple-400",
    glow: "#8b5cf6",
    steps: [
      {
        label: "Add Z — UTC timezone marker",
        code: '# Z = Zulu time = UTC+0\n# Never omit it — ambiguous times cause real bugs\nts="${date}T${time}"\nwid_ts="${ts}.${seq}Z"  # → 20260314T075934.0001Z',
        live: (w) => `${w.date}T${w.time}.${w.seq}${w.zone}`,
        note: "Z anchors the timestamp to UTC. Without it, '14:00' could mean anything.",
      },
      {
        label: "OTP suffix — 3 random bytes → 6 hex chars",
        code: `# Shell:\notp=$(openssl rand -hex 3)  # → a3f9c2\n\n# Browser:\nconst otp = crypto.getRandomValues(new Uint8Array(3));\nconst hex = Array.from(otp).map(b => b.toString(16).padStart(2,'0')).join('');`,
        live: (w) => w.otp,
        note: "3 bytes = 2²⁴ = 16 million possibilities. Collision probability in 1 second: ~0.00006%.",
      },
      {
        label: "Full WID — the final form",
        code: 'wid="${date}T${time}.${seq}Z-${otp}"\n# → 20260314T075934.0001Z-a3f9c2\n#   ^^^^^^^^ ^^^^^^ ^^^^ ^ ^^^^^^\n#   date     time   seq  Z otp',
        live: (w) => w.full,
        note: "Sortable + unique + timestamped + collision-resistant. Used for every event, session, notification in Limen OS.",
      },
    ],
  },
  {
    id: "tic-toc",
    title: ".tic / .toc Pattern",
    emoji: "⏱️",
    color: "text-green-400",
    glow: "#10b981",
    steps: [
      {
        label: "The .tic file — mark the start",
        code: `# On session/event start:\nwid > .tic          # saves the start WID\ncat .tic            # → 20260314T075934.0001Z-a3f9c2`,
        note: ".tic = 'time-in-clock'. Marks when something STARTED. Like a stopwatch lap.",
      },
      {
        label: "The .toc file — running timestamp",
        code: `# Every heartbeat / event tick:\nif [ ! -f .tic ]; then wid > .tic; fi\nwid >> .toc          # append to .toc\ncat .toc | tail -1   # → latest timestamp`,
        note: ".toc = 'time-on-clock'. A running log of ticks. Diff .toc vs .tic = elapsed WIDs.",
      },
      {
        label: "if-then-else: self-healing pattern",
        code: `# The canonical Limen OS bootstrap:\nnow="$(wid)"\necho $now\nif [ ! -f ".tic" ]; then\n  echo "$now" > ".tic"  # first run: create .tic\nfi\ncat .tic >> .toc       # always append to .toc`,
        note: "Self-healing: the script creates .tic on first run and never fails on re-runs. Idempotent.",
      },
    ],
  },
  {
    id: "otp",
    title: "OTP Encryption Primer",
    emoji: "🔐",
    color: "text-red-400",
    glow: "#ef4444",
    steps: [
      {
        label: "What OTP means",
        code: `# One-Time Pad:\n# key = random bytes, same length as message\n# cipher = message XOR key\n# Unbreakable IF key is:\n#   1. Truly random\n#   2. Same length as message\n#   3. Never reused`,
        note: "The WID otp suffix is NOT a true OTP — it's just collision-avoidance entropy. True OTP requires key = message length.",
      },
      {
        label: "XOR: the core operation",
        code: `# XOR truth table:\n# 0 XOR 0 = 0   (same → 0)\n# 1 XOR 1 = 0   (same → 0)\n# 0 XOR 1 = 1   (different → 1)\n# 1 XOR 0 = 1   (different → 1)\n\n# Example: encrypt 'Hi' with key 0x4B 0x65\n# H = 0x48 XOR 0x4B = 0x03  → \\x03\n# i = 0x69 XOR 0x65 = 0x0C  → \\x0C`,
        note: "XOR is reversible: (A XOR K) XOR K = A. Encrypt and decrypt are the same operation.",
      },
      {
        label: "Try it: XOR your message with a WID key",
        code: `# The otp field of any WID is a valid 3-byte key.\n# Type a message below → see it XOR'd with the live otp.`,
        live: (w, custom) => {
          const msg = custom || "hello";
          return xorOtp(msg, w.otp);
        },
        note: "Each WID tick generates a fresh otp. This is how session tokens in Limen OS get entropy.",
      },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose?: () => void;
}

export function LimenMind({ onClose }: Props) {
  const [wid, setWid] = useState<WidParts>(() => buildWid(1));
  const [seq, setSeq] = useState(1);
  const [lesson, setLesson] = useState(0);
  const [step, setStep] = useState(0);
  const [custom, setCustom] = useState("hello");
  const [copied, setCopied] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const seqRef = useRef(seq);
  const openWindow = useShellStore((s) => s.openWindow);
  useEffect(() => {
    seqRef.current = seq;
  }, [seq]);

  // Live WID ticker
  useEffect(() => {
    const id = setInterval(() => {
      const next = (seqRef.current % 9999) + 1;
      setSeq(next);
      setWid(buildWid(next));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Reset step when lesson changes — done in the click handler to avoid effect setState lint
  const handleLesson = useCallback((i: number) => {
    setLesson(i);
    setStep(0);
  }, []);

  const currentLesson = LESSONS[lesson]!;
  const currentStep = currentLesson.steps[step]!;
  const liveOutput = currentStep.live?.(wid, custom) ?? null;

  const copyToClipboard = useCallback((text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1800);
  }, []);

  // Anatomy color map for WID parts
  const anatomy: { value: string; label: string; color: string }[] = [
    { value: wid.date, label: "date", color: "text-amber-400" },
    { value: "T", label: "", color: "text-slate-400" },
    { value: wid.time, label: "time", color: "text-cyan-400" },
    { value: ".", label: "", color: "text-slate-400" },
    { value: wid.seq, label: "seq", color: "text-purple-400" },
    { value: wid.zone, label: "zone", color: "text-green-400" },
    { value: "-", label: "", color: "text-slate-400" },
    { value: wid.otp, label: "otp", color: "text-red-400" },
  ];

  return (
    <div
      className="limen-mind selectable"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#080810",
        color: "#e2e8f0",
        fontFamily: "monospace",
      }}
    >
      {/* ── Header: live WID identity ────────────────────────────────────────── */}
      <div
        style={{
          padding: "16px 20px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(10,10,24,0.95)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 10,
              color: "#64748b",
              letterSpacing: "0.15em",
              marginBottom: 4,
            }}
          >
            LIMENOS.MIND.IS.CAT.DOT.TOC
          </div>
          {/* Animated WID anatomy */}
          <div
            style={{
              fontSize: 13,
              display: "flex",
              alignItems: "baseline",
              gap: 0,
              flexWrap: "wrap",
            }}
          >
            {anatomy.map((part, i) =>
              part.label ? (
                <span
                  key={i}
                  title={part.label}
                  style={{
                    color:
                      part.color === "text-amber-400"
                        ? "#f59e0b"
                        : part.color === "text-cyan-400"
                          ? "#22d3ee"
                          : part.color === "text-purple-400"
                            ? "#8b5cf6"
                            : part.color === "text-green-400"
                              ? "#10b981"
                              : part.color === "text-red-400"
                                ? "#ef4444"
                                : "#e2e8f0",
                    fontWeight: 600,
                  }}
                >
                  {part.value}
                </span>
              ) : (
                <span key={i} style={{ color: "#475569" }}>
                  {part.value}
                </span>
              ),
            )}
          </div>
          <div
            style={{
              marginTop: 4,
              display: "flex",
              gap: 12,
              fontSize: 10,
              color: "#475569",
            }}
          >
            {anatomy
              .filter((p) => p.label)
              .map((p, i) => (
                <span
                  key={i}
                  style={{
                    color:
                      p.color === "text-amber-400"
                        ? "#f59e0b"
                        : p.color === "text-cyan-400"
                          ? "#22d3ee"
                          : p.color === "text-purple-400"
                            ? "#8b5cf6"
                            : p.color === "text-green-400"
                              ? "#10b981"
                              : "#ef4444",
                    opacity: 0.7,
                  }}
                >
                  ↑{p.label}
                </span>
              ))}
          </div>
        </div>
        <button
          onClick={() => copyToClipboard(wid.full, "header")}
          style={{
            padding: "4px 10px",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            background: "rgba(255,255,255,0.04)",
            color: copied === "header" ? "#10b981" : "#64748b",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {copied === "header" ? "copied!" : "copy wid"}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "none",
              background: "#ef444488",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            ×
          </button>
        )}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── Lesson sidebar ───────────────────────────────────────────────────── */}
        <div
          style={{
            width: 180,
            flexShrink: 0,
            borderRight: "1px solid rgba(255,255,255,0.06)",
            padding: "12px 0",
            overflowY: "auto",
          }}
        >
          {LESSONS.map((l, i) => (
            <button
              key={l.id}
              onClick={() => handleLesson(i)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 16px",
                background:
                  lesson === i ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none",
                borderLeft:
                  lesson === i
                    ? `3px solid ${l.glow}`
                    : "3px solid transparent",
                color: lesson === i ? "#e2e8f0" : "#64748b",
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              <div>
                {l.emoji} {l.title}
              </div>
              <div style={{ fontSize: 10, marginTop: 2, opacity: 0.6 }}>
                {l.steps.length} steps
              </div>
            </button>
          ))}
        </div>

        {/* ── Main area ────────────────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Step progress bar */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "10px 20px 0",
              flexShrink: 0,
            }}
          >
            {currentLesson.steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                style={{
                  height: 4,
                  flex: 1,
                  borderRadius: 2,
                  border: "none",
                  background:
                    i <= step ? currentLesson.glow : "rgba(255,255,255,0.08)",
                  cursor: "pointer",
                  transition: "background 0.3s",
                }}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${lesson}-${step}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              style={{
                flex: 1,
                padding: "16px 20px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {/* Step label */}
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: currentLesson.glow,
                    letterSpacing: "0.1em",
                    marginBottom: 4,
                  }}
                >
                  {currentLesson.emoji} {currentLesson.title} · STEP {step + 1}/
                  {currentLesson.steps.length}
                </div>
                <div
                  style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}
                >
                  {currentStep.label}
                </div>
              </div>

              {/* Code block */}
              <div style={{ position: "relative" }}>
                <pre
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    padding: "14px 16px",
                    fontSize: 12,
                    lineHeight: 1.7,
                    overflowX: "auto",
                    color: "#94a3b8",
                    margin: 0,
                    borderLeft: `3px solid ${currentLesson.glow}`,
                  }}
                >
                  {currentStep.code}
                </pre>
                <button
                  onClick={() => copyToClipboard(currentStep.code, "code")}
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    padding: "3px 8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 4,
                    background: "rgba(0,0,0,0.4)",
                    color: copied === "code" ? "#10b981" : "#475569",
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  {copied === "code" ? "✓" : "copy"}
                </button>
              </div>

              {/* Live output */}
              {currentStep.live && (
                <div
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: `1px solid ${currentLesson.glow}44`,
                    borderRadius: 8,
                    padding: "12px 16px",
                  }}
                >
                  <div
                    style={{ fontSize: 10, color: "#475569", marginBottom: 6 }}
                  >
                    LIVE OUTPUT (updates every 1s)
                  </div>
                  {lesson === 4 && step === 2 ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontSize: 11, color: "#64748b" }}>
                          message:
                        </span>
                        <input
                          value={custom}
                          onChange={(e) => setCustom(e.target.value)}
                          style={{
                            flex: 1,
                            background: "transparent",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 4,
                            padding: "4px 8px",
                            color: "#e2e8f0",
                            fontSize: 12,
                            fontFamily: "monospace",
                          }}
                          maxLength={20}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>
                          key (otp):
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "#ef4444",
                            fontFamily: "monospace",
                          }}
                        >
                          {wid.otp}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>
                          cipher:
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: currentLesson.glow,
                            fontFamily: "monospace",
                          }}
                        >
                          {liveOutput}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <motion.div
                      key={liveOutput}
                      initial={{ opacity: 0.4 }}
                      animate={{ opacity: 1 }}
                      style={{
                        fontSize: 14,
                        color: currentLesson.glow,
                        fontFamily: "monospace",
                        fontWeight: 600,
                      }}
                    >
                      {liveOutput}
                    </motion.div>
                  )}
                </div>
              )}

              {/* Note */}
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 12,
                  color: "#94a3b8",
                  lineHeight: 1.6,
                  borderLeft: "2px solid rgba(255,255,255,0.1)",
                }}
              >
                💡 {currentStep.note}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* ── Navigation ──────────────────────────────────────────────────────── */}
          <div
            style={{
              padding: "10px 20px 14px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => {
                if (step > 0) setStep(step - 1);
                else if (lesson > 0) {
                  handleLesson(lesson - 1);
                  setStep(LESSONS[lesson - 1]!.steps.length - 1);
                }
              }}
              disabled={lesson === 0 && step === 0}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: lesson === 0 && step === 0 ? "#2d3748" : "#94a3b8",
                cursor: lesson === 0 && step === 0 ? "default" : "pointer",
                fontSize: 12,
              }}
            >
              ← prev
            </button>

            <div style={{ fontSize: 10, color: "#475569" }}>
              {lesson + 1}/{LESSONS.length} · step {step + 1}/
              {currentLesson.steps.length}
            </div>

            <button
              onClick={() => {
                if (step < currentLesson.steps.length - 1) setStep(step + 1);
                else if (lesson < LESSONS.length - 1) handleLesson(lesson + 1);
                else setDone(true);
              }}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "none",
                background:
                  lesson === LESSONS.length - 1 &&
                  step === currentLesson.steps.length - 1
                    ? "#fbbf24"
                    : currentLesson.glow,
                color: "#000",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {lesson === LESSONS.length - 1 &&
              step === currentLesson.steps.length - 1
                ? "finish ✓"
                : "next →"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Completion overlay ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(8,8,16,0.96)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
              gap: 24,
              zIndex: 10,
            }}
          >
            {/* Badge */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              style={{ fontSize: 56, lineHeight: 1 }}
            >
              🧠
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              style={{ textAlign: "center" }}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#e2e8f0",
                  marginBottom: 6,
                }}
              >
                Limen Mind complete.
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#64748b",
                  fontFamily: "monospace",
                }}
              >
                {wid.full}
              </div>
            </motion.div>

            {/* Limen Fin teaser card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              style={{
                width: "100%",
                maxWidth: 400,
                background:
                  "linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(245,158,11,0.04) 100%)",
                border: "1px solid rgba(251,191,36,0.25)",
                borderRadius: 14,
                padding: "20px 24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 28 }}>💰</span>
                <div>
                  <div
                    style={{ fontSize: 15, fontWeight: 700, color: "#fbbf24" }}
                  >
                    Limen Fin
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#92400e",
                      letterSpacing: "0.1em",
                    }}
                  >
                    NEXT EXPERIENCE
                  </div>
                </div>
                <div
                  style={{
                    marginLeft: "auto",
                    fontSize: 10,
                    color: "#78350f",
                    background: "rgba(251,191,36,0.12)",
                    border: "1px solid rgba(251,191,36,0.2)",
                    borderRadius: 20,
                    padding: "2px 10px",
                  }}
                >
                  coming soon
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#94a3b8",
                  lineHeight: 1.7,
                  marginBottom: 14,
                }}
              >
                Everything you learned — WID timestamps, sequence padding, OTP
                entropy — applied to a{" "}
                <span style={{ color: "#fbbf24" }}>live financial ledger</span>.
                Every transaction, budget entry, and payment gets a WID.
                Voice-first. Auditable. Self-healing.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  "WID ledger",
                  "voice payments",
                  "mood: wealth",
                  "OTP receipts",
                  "beacon reconciliation",
                ].map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 10,
                      color: "#92400e",
                      background: "rgba(251,191,36,0.1)",
                      border: "1px solid rgba(251,191,36,0.15)",
                      borderRadius: 20,
                      padding: "2px 8px",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </motion.div>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                onClick={() => {
                  import("../../constants/apps").then(({ getApp }) => {
                    const app = getApp("limen-fin");
                    if (app) openWindow(app);
                  });
                }}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "1px solid rgba(251,191,36,0.25)",
                  background: "rgba(251,191,36,0.15)",
                  color: "#fbbf24",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                💰 Open Limen Fin
              </button>
              <button
                onClick={() => {
                  setDone(false);
                  handleLesson(0);
                }}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "transparent",
                  color: "#64748b",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                ↩ review again
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "transparent",
                    color: "#64748b",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  close
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
