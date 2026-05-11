/**
 * OuroSLogo — Brand mark for Limen OS / OuroS.
 *
 * OuroS = Ouroboros + OS:
 *   - The snake eating its own tail → self-healing (.tic/.toc), infinite loop, true OS
 *   - The S at the center → Limen + the snake's natural S-curve body
 *   - Purple (tail/past) → Cyan (head/future) gradient → time flows forward, the OS heals itself
 *
 * "Proud member of the patato# group of the waldiez ecosystem"
 */

interface OuroSLogoProps {
  /** px size of the square SVG */
  size?: number;
  /** Show "OuroS" wordmark below the ring */
  wordmark?: boolean;
  /** Show "waldiez · patato⁵" ecosystem badge */
  badge?: boolean;
  /** Glow filter — disable for small sizes (<24px) */
  glow?: boolean;
  /** Extra class names on the SVG element */
  className?: string;
}

export function OuroSLogo({
  size = 48,
  wordmark = false,
  badge = false,
  glow = true,
  className,
}: OuroSLogoProps) {
  // Geometry
  const C = 120; // center x/y in 240×240 viewBox
  const R = 82; // ring radius
  const SW = 15; // stroke-width of snake body
  const circ = 2 * Math.PI * R; // ≈ 515.2
  const bodyLen = circ * (350 / 360); // 350° arc ≈ 500.2
  const gapLen = circ - bodyLen; // 10° gap ≈ 15.0
  // Half-gap offset centers the gap at 12 o'clock after rotate(-90)
  const dashOffset = gapLen / 2;

  // Head & tail tip positions (centered on gap at top)
  // 5° clockwise from top → head end of arc
  // head at angle = -90° + 5° = -85° from positive x
  const headAngle = (-90 + 5) * (Math.PI / 180);
  const tailAngle = (-90 - 5) * (Math.PI / 180);
  const hx = C + R * Math.cos(headAngle); // ≈ 127
  const hy = C + R * Math.sin(headAngle); // ≈ 35
  const tx = C + R * Math.cos(tailAngle); // ≈ 113
  // const ty = C + R * Math.sin(tailAngle); // ≈ 35

  return (
    <svg
      viewBox="0 0 240 240"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="OuroS — Limen OS"
      role="img"
    >
      <defs>
        {/* Snake body gradient: purple tail → cyan head (left→right covers the arc well) */}
        <linearGradient
          id="ouros-body"
          x1="38"
          y1="120"
          x2="202"
          y2="120"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="48%" stopColor="#0891b2" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>

        {/* Inner S gradient: top=cyan, bottom=purple */}
        <linearGradient
          id="ouros-s"
          x1="120"
          y1="50"
          x2="120"
          y2="185"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>

        {/* Head fill: bright cyan */}
        <linearGradient
          id="ouros-head"
          x1="113"
          y1="22"
          x2="132"
          y2="45"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>

        {glow && (
          <>
            {/* Ring glow */}
            <filter
              id="ouros-glow-ring"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* S glow */}
            <filter
              id="ouros-glow-s"
              x="-25%"
              y="-25%"
              width="150%"
              height="150%"
            >
              <feGaussianBlur stdDeviation="7" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </>
        )}
      </defs>

      {/* ── Ouroboros body — 350° arc, gap centered at 12 o'clock ── */}
      <circle
        cx={C}
        cy={C}
        r={R}
        stroke="url(#ouros-body)"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeDasharray={`${bodyLen} ${gapLen}`}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${C} ${C})`}
        filter={glow ? "url(#ouros-glow-ring)" : undefined}
      />

      {/* ── Snake head — positioned at the head-end of the arc (right of gap) ── */}
      {/* Head center: (hx, hy) ≈ (127, 35) — facing left toward tail */}
      <ellipse
        cx={hx}
        cy={hy}
        rx={10}
        ry={7.5}
        fill="url(#ouros-head)"
        filter={glow ? "url(#ouros-glow-ring)" : undefined}
      />
      {/* Upper jaw (extends left toward tail gap) */}
      <path
        d={`M ${hx - 8} ${hy - 3} Q ${hx - 14} ${hy - 1} ${hx - 12} ${hy + 4}`}
        fill="#22d3ee"
        opacity={0.9}
      />
      {/* Eye — small bright slit */}
      <ellipse cx={hx + 3} cy={hy - 3} rx={2.2} ry={1.8} fill="#001428" />
      <circle
        cx={hx + 3.5}
        cy={hy - 3.5}
        r={0.7}
        fill="rgba(255,255,255,0.55)"
      />
      {/* Forked tongue */}
      <path
        d={`M ${hx - 10} ${hy + 3} L ${hx - 14} ${hy + 8} M ${hx - 10} ${hy + 3} L ${hx - 7} ${hy + 8}`}
        stroke="#f43f5e"
        strokeWidth={1.4}
        strokeLinecap="round"
      />

      {/* ── Tail tip — purple dot at the tail-end of arc (left of gap) ── */}
      <circle
        cx={tx}
        cy={C + R * Math.sin(tailAngle)}
        r={SW / 2 - 1}
        fill="#7c3aed"
        opacity={0.85}
        filter={glow ? "url(#ouros-glow-ring)" : undefined}
      />

      {/* ── Inner S — Limen mark ── */}
      <text
        x={C}
        y={C + 30}
        textAnchor="middle"
        fontFamily="'SF Pro Display','Helvetica Neue',Arial,system-ui,sans-serif"
        fontWeight="900"
        fontSize="100"
        fill="url(#ouros-s)"
        filter={glow ? "url(#ouros-glow-s)" : undefined}
      >
        S
      </text>

      {/* ── Wordmark ── */}
      {wordmark && (
        <>
          <text
            x={C}
            y={C + 78}
            textAnchor="middle"
            fontFamily="'SF Pro Text','Helvetica Neue',system-ui,sans-serif"
            fontWeight="200"
            fontSize="14"
            letterSpacing="6"
            fill="rgba(255,255,255,0.72)"
          >
            OuroS
          </text>
          <text
            x={C}
            y={C + 94}
            textAnchor="middle"
            fontFamily="'SF Pro Text','Helvetica Neue',system-ui,sans-serif"
            fontWeight="300"
            fontSize="9"
            letterSpacing="3"
            fill="rgba(255,255,255,0.35)"
          >
            True OS
          </text>
        </>
      )}

      {/* ── Ecosystem badge ── */}
      {badge && (
        <text
          x={C}
          y={wordmark ? C + 110 : C + 80}
          textAnchor="middle"
          fontFamily="'JetBrains Mono','Fira Code',monospace"
          fontSize="7"
          letterSpacing="1.5"
          fill="rgba(255,255,255,0.25)"
        >
          waldiez · patato⁵
        </text>
      )}
    </svg>
  );
}

/**
 * Compact ring-only version — just the ouroboros, no S, no text.
 * Use as a favicon or 16px icon.
 */
export function OuroSRing({ size = 20 }: { size?: number }) {
  const C = 50,
    R = 40,
    SW = 9;
  const circ = 2 * Math.PI * R;
  const bodyLen = circ * (350 / 360);
  const gapLen = circ - bodyLen;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      aria-label="OuroS"
    >
      <defs>
        <linearGradient
          id="ouros-ring-sm"
          x1="10"
          y1="50"
          x2="90"
          y2="50"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle
        cx={C}
        cy={C}
        r={R}
        stroke="url(#ouros-ring-sm)"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeDasharray={`${bodyLen} ${gapLen}`}
        strokeDashoffset={gapLen / 2}
        transform={`rotate(-90 ${C} ${C})`}
      />
    </svg>
  );
}
