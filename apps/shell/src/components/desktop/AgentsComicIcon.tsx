interface Props { size?: number }

export function AgentsComicIcon({ size = 24 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Dark card background */}
      <rect width="32" height="32" rx="6" fill="#0e0e0e"/>
      {/* Panel grid lines */}
      <line x1="16" y1="3" x2="16" y2="21" stroke="#2a2a2a" strokeWidth="1"/>
      <line x1="3" y1="12" x2="29" y2="12" stroke="#2a2a2a" strokeWidth="1"/>
      {/* Four panel corners — subtle fill */}
      <rect x="3" y="3" width="12" height="8" rx="1" fill="#161616"/>
      <rect x="17" y="3" width="12" height="8" rx="1" fill="#161616"/>
      <rect x="3" y="13" width="12" height="8" rx="1" fill="#161616"/>
      <rect x="17" y="13" width="12" height="8" rx="1" fill="#161616"/>
      {/* Gold italic A */}
      <text x="16" y="11.5" textAnchor="middle" dominantBaseline="middle"
        fontFamily="Georgia, serif" fontStyle="italic" fontWeight="600"
        fontSize="9" fill="#e8c97a">A</text>
      {/* Sparkle mark — bottom right */}
      <path d="M27 23 L27.8 25.5 L30 26 L27.8 26.5 L27 29 L26.2 26.5 L24 26 L26.2 25.5 Z"
        fill="#e8c97a" opacity="0.85"/>
    </svg>
  );
}
