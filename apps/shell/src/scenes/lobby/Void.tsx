import { useRef, useState, useEffect, useCallback } from "react";
import { Engine } from "@babylonjs/core";
import { createVoidScene, VoidSceneControls } from "./voidScene";
import { Experience, voidHints } from "./void.config";
import "./void.css";

interface VoidProps {
  onExperienceSelect?: (experience: Experience) => void;
}

/**
 * Load an experience by replacing the current page
 */
const loadExperience = (experienceScript: string): void => {
  document.body.innerHTML = '<div id="root"></div>';
  const script = document.createElement("script");
  script.type = "module";
  script.src = experienceScript;
  document.body.appendChild(script);
};

/**
 * Check WebGL support
 */
const isWebGLSupported = (): boolean => {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
};

interface VoidState {
  isLoading: boolean;
  error: string | null;
  showHint: boolean;
  currentHintIndex: number;
  hoveredExperience: Experience | null;
  isExiting: boolean;
}

const Void: React.FC<VoidProps> = ({ onExperienceSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneControlsRef = useRef<VoidSceneControls | null>(null);

  const [state, setState] = useState<VoidState>({
    isLoading: true,
    error: null,
    showHint: false,
    currentHintIndex: 0,
    hoveredExperience: null,
    isExiting: false,
  });

  // Handle experience selection
  const handleExperienceSelect = useCallback(
    (experience: Experience) => {
      setState((prev) => ({ ...prev, isExiting: true }));

      setTimeout(() => {
        // Clean up
        if (sceneControlsRef.current) {
          sceneControlsRef.current.dispose();
          sceneControlsRef.current = null;
        }
        if (engineRef.current) {
          engineRef.current.dispose();
          engineRef.current = null;
        }

        // If parent handles selection (for themed lobbies), use that
        if (onExperienceSelect && experience.lobbyTheme) {
          onExperienceSelect(experience);
        } else if (experience.scriptPath) {
          // Direct script loading
          loadExperience(experience.scriptPath);
        }
      }, 800);
    },
    [onExperienceSelect],
  );

  // Handle hover
  const handleExperienceHover = useCallback((experience: Experience | null) => {
    setState((prev) => ({ ...prev, hoveredExperience: experience }));
  }, []);

  // Initialize Babylon scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!isWebGLSupported()) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          "WebGL is not supported. Please try a different browser or enable hardware acceleration.",
      }));
      return;
    }

    let engine: Engine;

    try {
      engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        antialias: true,
      });
      engineRef.current = engine;
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Failed to initialize 3D engine.",
      }));
      return;
    }

    const sceneControls = createVoidScene(canvas, engine, {
      onExperienceHover: handleExperienceHover,
      onExperienceSelect: handleExperienceSelect,
      onSceneReady: () => {
        setState((prev) => ({ ...prev, isLoading: false }));
      },
    });
    sceneControlsRef.current = sceneControls;

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (sceneControlsRef.current) {
        sceneControlsRef.current.dispose();
        sceneControlsRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, [handleExperienceHover, handleExperienceSelect]);

  // Hint rotation
  useEffect(() => {
    const showTimer = setTimeout(() => {
      setState((prev) => ({ ...prev, showHint: true }));
    }, 1500);

    const rotateInterval = setInterval(() => {
      setState((prev) => ({
        ...prev,
        currentHintIndex: (prev.currentHintIndex + 1) % voidHints.length,
      }));
    }, 8000);

    const hideTimer = setTimeout(() => {
      setState((prev) => ({ ...prev, showHint: false }));
    }, 30000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearInterval(rotateInterval);
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!sceneControlsRef.current) return;

      switch (event.key) {
        case "Enter":
        case " ":
          event.preventDefault();
          sceneControlsRef.current.selectHoveredExperience();
          break;
        case "Escape":
          sceneControlsRef.current.resetCameraView();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const currentHint = voidHints[state.currentHintIndex];

  return (
    <div className={`void-container ${state.isExiting ? "exiting" : ""}`}>
      <canvas ref={canvasRef} className="void-canvas" />

      {/* Title */}
      {!state.isLoading && !state.error && (
        <div className="void-title">
          <h1>WALDIEZ</h1>
        </div>
      )}

      {/* Loading */}
      {state.isLoading && (
        <div className="void-loading">
          <div className="void-loading-spinner" />
          <p>Entering the Void...</p>
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="void-error">
          <h2>Unable to Load</h2>
          <p>{state.error}</p>
        </div>
      )}

      {/* Hints */}
      {state.showHint &&
        !state.isLoading &&
        !state.error &&
        !state.hoveredExperience && (
          <div className="void-hint" key={state.currentHintIndex}>
            <h3>{currentHint.title}</h3>
            <p dangerouslySetInnerHTML={{ __html: currentHint.text }} />
          </div>
        )}

      {/* Hovered Experience Info */}
      {state.hoveredExperience && !state.isLoading && (
        <div className="void-experience-info">
          <span className="portal-shape">
            {state.hoveredExperience.portalShape}
          </span>
          <h2>{state.hoveredExperience.name}</h2>
          <p>{state.hoveredExperience.description}</p>
          <span className="cta">Click or Enter to Launch</span>
        </div>
      )}

      {/* Keyboard hints */}
      {!state.isLoading && !state.error && (
        <div className="void-keyboard-hint">
          <kbd>Enter</kbd> Select · <kbd>Esc</kbd> Reset · <kbd>Scroll</kbd>{" "}
          Zoom
        </div>
      )}
    </div>
  );
};

export default Void;
