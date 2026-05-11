import { useId } from "react";

export function WaldiezPlayerIcon({ size = 20 }: { size?: number }) {
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
        <linearGradient id={`wp-play-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id={`wp-ring-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" stroke={`url(#wp-ring-${id})`} strokeWidth="4" />
      <circle cx="50" cy="50" r="38" fill="#0f172a" />
      <path d="M40 30 L40 70 L72 50 Z" fill={`url(#wp-play-${id})`} />
      <rect x="18" y="42" width="4" height="16" rx="2" fill="#6366f1" opacity="0.7" />
      <rect x="24" y="38" width="4" height="24" rx="2" fill="#8b5cf6" opacity="0.7" />
    </svg>
  );
}
