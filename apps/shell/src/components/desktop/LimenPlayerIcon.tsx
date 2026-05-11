import { useId } from "react";

export function LimenPlayerIcon({ size = 20 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      width={size}
      height={size}
    >
      <defs>
        <linearGradient id={`li-bg-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a0a1e" />
          <stop offset="100%" stopColor="#0d0818" />
        </linearGradient>
        <linearGradient id={`li-bar1-${id}`} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <linearGradient id={`li-bar2-${id}`} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fb923c" />
        </linearGradient>
        <linearGradient id={`li-bar3-${id}`} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
        <linearGradient id={`li-bar4-${id}`} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#e11d48" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>
        <linearGradient id={`li-rim-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill={`url(#li-bg-${id})`} />
      <circle cx="50" cy="50" r="47" stroke={`url(#li-rim-${id})`} strokeWidth="3" />
      <rect x="18" y="58" width="8" height="20" rx="3" fill={`url(#li-bar1-${id})`} />
      <rect x="28" y="44" width="8" height="34" rx="3" fill={`url(#li-bar2-${id})`} />
      <rect x="38" y="34" width="8" height="44" rx="3" fill={`url(#li-bar3-${id})`} />
      <rect x="48" y="26" width="8" height="52" rx="3" fill={`url(#li-bar4-${id})`} />
      <rect x="58" y="38" width="8" height="40" rx="3" fill={`url(#li-bar3-${id})`} />
      <rect x="68" y="50" width="8" height="28" rx="3" fill={`url(#li-bar2-${id})`} />
      <rect x="78" y="60" width="4" height="18" rx="2" fill={`url(#li-bar1-${id})`} />
      <circle cx="52" cy="24" r="3" fill="#f472b6" opacity="0.9" />
    </svg>
  );
}
