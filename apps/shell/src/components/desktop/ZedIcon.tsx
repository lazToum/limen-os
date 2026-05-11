export function ZedIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      width={size}
      height={size}
    >
      <defs>
        <linearGradient id="zed-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a1a2e" />
          <stop offset="100%" stopColor="#0f0f1a" />
        </linearGradient>
        <linearGradient id="zed-text" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#84cc16" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="18" fill="url(#zed-bg)" />
      <rect x="4" y="4" width="92" height="92" rx="18" stroke="#84cc16" strokeWidth="2" opacity="0.4" />
      {/* Z letterform */}
      <path
        d="M24 28 L76 28 L76 38 L38 62 L76 62 L76 72 L24 72 L24 62 L62 38 L24 38 Z"
        fill="url(#zed-text)"
      />
    </svg>
  );
}
