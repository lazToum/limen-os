/**
 * AIChatIcon — Synaptic Bloom
 * A stylized neuron radiating intelligence. Works at 16px–64px.
 */
export function AIChatIcon({ size = 20 }: { size?: number }) {
  const id = "ai-icon";
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#312e81" />
          <stop offset="100%" stopColor="#0d0b1e" />
        </radialGradient>
        <linearGradient id={`${id}-g1`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id={`${id}-g2`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter
          id={`${id}-softglow`}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background disc */}
      <circle cx="50" cy="50" r="48" fill={`url(#${id}-bg)`} />

      {/* Outer orbit ring */}
      <circle
        cx="50"
        cy="50"
        r="41"
        stroke={`url(#${id}-g1)`}
        strokeWidth="1"
        opacity="0.35"
        strokeDasharray="4 3"
      />

      {/* 6 radial arms — neuron dendrites */}
      {[0, 60, 120, 180, 240, 300].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x2 = 50 + 32 * Math.sin(rad);
        const y2 = 50 - 32 * Math.cos(rad);
        const nodeX = 50 + 37 * Math.sin(rad);
        const nodeY = 50 - 37 * Math.cos(rad);
        const r = i % 2 === 0 ? 3.5 : 3;
        return (
          <g key={deg} filter={`url(#${id}-glow)`}>
            <line
              x1="50"
              y1="50"
              x2={x2}
              y2={y2}
              stroke={i % 2 === 0 ? `url(#${id}-g1)` : `url(#${id}-g2)`}
              strokeWidth="1.4"
              opacity="0.8"
            />
            <circle
              cx={nodeX}
              cy={nodeY}
              r={r}
              fill={i % 2 === 0 ? "#a5b4fc" : "#67e8f9"}
              opacity="0.95"
            />
          </g>
        );
      })}

      {/* Subtle arc connecting alternating nodes */}
      {[0, 120, 240].map((deg) => {
        const r1 = (deg * Math.PI) / 180;
        const r2 = ((deg + 60) * Math.PI) / 180;
        const x1 = 50 + 37 * Math.sin(r1);
        const y1 = 50 - 37 * Math.cos(r1);
        const x2 = 50 + 37 * Math.sin(r2);
        const y2 = 50 - 37 * Math.cos(r2);
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#4338ca"
            strokeWidth="0.8"
            opacity="0.4"
          />
        );
      })}

      {/* Central nucleus — glow + core */}
      <circle
        cx="50"
        cy="50"
        r="14"
        fill="#1e1b4b"
        stroke={`url(#${id}-g1)`}
        strokeWidth="1.5"
        filter={`url(#${id}-softglow)`}
      />
      <circle cx="50" cy="50" r="9" fill={`url(#${id}-g2)`} opacity="0.7" />
      <circle cx="50" cy="50" r="5" fill="#e0e7ff" opacity="0.9" />

      {/* Inner spark — tiny plus */}
      <path
        d="M50 47.5v5M47.5 50h5"
        stroke="#0d0b1e"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
