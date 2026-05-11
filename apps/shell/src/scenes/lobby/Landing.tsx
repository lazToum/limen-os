import { useState, useEffect, useCallback, useMemo } from "react";
import "./landing.css";

interface LandingPageProps {
  onEnter: () => void;
}

interface TextLine {
  text: string;
  className?: string;
  delay: number; // delay before this line starts
}

const LINES: TextLine[] = [
  { text: "Waldiez", className: "title", delay: 500 },
  { text: "Xperiens", className: "subtitle", delay: 2000 },
];

const CHAR_DELAY = 80; // ms between each character

/**
 * Generates floating particles for ambient effect
 */
const generateParticles = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    animationDuration: `${15 + Math.random() * 20}s`,
    animationDelay: `${Math.random() * 15}s`,
    size: `${1 + Math.random() * 2}px`,
  }));
};

const Landing: React.FC<LandingPageProps> = ({ onEnter }) => {
  const [visibleChars, setVisibleChars] = useState<number>(0);
  const [showDecoLine, setShowDecoLine] = useState(false);
  const [showPortal, setShowPortal] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const particles = useMemo(() => generateParticles(20), []);

  // Calculate total characters and timing
  const totalChars = useMemo(() => {
    return LINES.reduce((acc, line) => acc + line.text.length, 0);
  }, []);

  // Calculate when each line should start based on previous lines
  const lineTimings = useMemo(() => {
    let currentTime = 0;
    return LINES.map((line, index) => {
      const startTime = index === 0 ? line.delay : currentTime;
      const duration = line.text.length * CHAR_DELAY;
      currentTime = startTime + duration + 300; // 300ms gap between lines
      return {
        startTime,
        charStartIndex: LINES.slice(0, index).reduce(
          (a, l) => a + l.text.length,
          0,
        ),
      };
    });
  }, []);

  // Animate characters one by one
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    LINES.forEach((line, lineIndex) => {
      const { startTime, charStartIndex } = lineTimings[lineIndex];

      for (let i = 0; i < line.text.length; i++) {
        const timer = setTimeout(
          () => {
            setVisibleChars(charStartIndex + i + 1);
          },
          startTime + i * CHAR_DELAY,
        );
        timers.push(timer);
      }
    });

    // Show decorative line after text
    const lastLineTiming = lineTimings[lineTimings.length - 1];
    const lastLineLength = LINES[LINES.length - 1].text.length;
    const decoLineDelay =
      lastLineTiming.startTime + lastLineLength * CHAR_DELAY + 500;

    const decoTimer = setTimeout(() => setShowDecoLine(true), decoLineDelay);
    timers.push(decoTimer);

    // Show portal button after decorative line
    const portalTimer = setTimeout(
      () => setShowPortal(true),
      decoLineDelay + 800,
    );
    timers.push(portalTimer);

    return () => timers.forEach(clearTimeout);
  }, [lineTimings]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleEnter();
      } else if (e.key === "Escape") {
        // Skip animation - show everything immediately
        setVisibleChars(totalChars);
        setShowDecoLine(true);
        setShowPortal(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalChars]);

  const handleEnter = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);

    // Wait for exit animation before calling onEnter
    setTimeout(() => {
      onEnter();
    }, 1000);
  }, [isExiting, onEnter]);

  // Render characters with individual animations
  const renderLine = (line: TextLine, lineIndex: number) => {
    const { charStartIndex } = lineTimings[lineIndex];

    return (
      <span
        key={lineIndex}
        className={`calligraphy-line ${line.className || ""}`}
      >
        {line.text.split("").map((char, charIndex) => {
          const globalIndex = charStartIndex + charIndex;
          const isVisible = globalIndex < visibleChars;
          const delay = `${charIndex * 0.03}s`;

          return (
            <span
              key={charIndex}
              className={`char ${char === " " ? "space" : ""}`}
              style={{
                animationDelay: delay,
                animationPlayState: isVisible ? "running" : "paused",
                opacity: isVisible ? undefined : 0,
              }}
            >
              {char}
            </span>
          );
        })}
      </span>
    );
  };

  return (
    <div className={`landing-container ${isExiting ? "exiting" : ""}`}>
      {/* Floating particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDuration: p.animationDuration,
            animationDelay: p.animationDelay,
          }}
        />
      ))}

      {/* Calligraphy text */}
      <div className="calligraphy-container">
        {LINES.map((line, index) => renderLine(line, index))}
      </div>

      {/* Decorative line */}
      <div className={`decorative-line ${showDecoLine ? "visible" : ""}`} />

      {/* Enter Portal Button */}
      <div className={`enter-portal ${showPortal ? "visible" : ""}`}>
        <button className="portal-button" onClick={handleEnter}>
          <span>Enter</span>
          <div className="portal-glow" />
        </button>
      </div>

      {/* Skip hint */}
      <div className="skip-hint">
        Press <kbd>Enter</kbd> to continue · <kbd>Esc</kbd> to skip animation
      </div>
    </div>
  );
};

export default Landing;
