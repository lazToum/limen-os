import { useRef, useState, useEffect, useCallback } from "react";
import { Engine } from "@babylonjs/core";
import { createLobbyScene, LobbySceneControls } from "./lobbyScene";
import { Experience, hintMessages } from "./experiences.config";
import "./lobby.css";

/**
 * Load an experience by replacing the current page content
 */
const loadExperience = (experienceScript: string): void => {
  document.body.innerHTML = '<div id="root"></div>';
  const script = document.createElement("script");
  script.type = "module";
  script.src = experienceScript;
  document.body.appendChild(script);
};

/**
 * Check if WebGL is supported in the browser
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

interface LobbyState {
  isLoading: boolean;
  error: string | null;
  showHint: boolean;
  currentHintIndex: number;
  hoveredExperience: Experience | null;
}

const Lobby: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneControlsRef = useRef<LobbySceneControls | null>(null);

  const [state, setState] = useState<LobbyState>({
    isLoading: true,
    error: null,
    showHint: false,
    currentHintIndex: 0,
    hoveredExperience: null,
  });

  // Memoized experience selection handler
  const handleExperienceSelect = useCallback((experience: Experience) => {
    // Dispose engine before loading new experience
    if (sceneControlsRef.current) {
      sceneControlsRef.current.dispose();
      sceneControlsRef.current = null;
    }
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    loadExperience(`/experiences/${experience.id}/index.js`);
  }, []);

  // Memoized hover handler
  const handleExperienceHover = useCallback((experience: Experience | null) => {
    setState((prev) => ({ ...prev, hoveredExperience: experience }));
  }, []);

  // Initialize Babylon scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check WebGL support
    if (!isWebGLSupported()) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          "WebGL is not supported in your browser. Please try a different browser or enable hardware acceleration.",
      }));
      return;
    }

    let engine: Engine;

    try {
      engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
      engineRef.current = engine;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          "Failed to initialize 3D engine. Please check your browser settings.",
      }));
      return;
    }

    // Create scene with callbacks
    const sceneControls = createLobbyScene(canvas, engine, {
      onExperienceHover: handleExperienceHover,
      onExperienceSelect: handleExperienceSelect,
      onSceneReady: () => {
        setState((prev) => ({ ...prev, isLoading: false }));
      },
    });
    sceneControlsRef.current = sceneControls;

    // Handle window resize
    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);

    // Cleanup
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

  // Hint rotation timer
  useEffect(() => {
    // Show hint after initial delay
    const showHintTimer = setTimeout(() => {
      setState((prev) => ({ ...prev, showHint: true }));
    }, 3000);

    // Rotate hints
    const hintRotationInterval = setInterval(() => {
      setState((prev) => ({
        ...prev,
        currentHintIndex: (prev.currentHintIndex + 1) % hintMessages.length,
      }));
    }, 10000);

    // Hide hint after some time when user is engaged
    const hideHintTimer = setTimeout(() => {
      setState((prev) => ({ ...prev, showHint: false }));
    }, 35000);

    return () => {
      clearTimeout(showHintTimer);
      clearTimeout(hideHintTimer);
      clearInterval(hintRotationInterval);
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!sceneControlsRef.current) return;

      switch (event.key) {
        case "Enter":
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

  const currentHint = hintMessages[state.currentHintIndex];

  return (
    <div className="lobby-container">
      <canvas ref={canvasRef} className="lobby-canvas" />

      {/* Loading State */}
      {state.isLoading && (
        <div className="lobby-loading">
          <div className="lobby-loading-spinner" />
          <p>Initializing Waldiez Experience...</p>
        </div>
      )}

      {/* Error State */}
      {state.error && (
        <div className="lobby-error">
          <h2>Unable to Load</h2>
          <p>{state.error}</p>
        </div>
      )}

      {/* Hint Toast */}
      {state.showHint && !state.isLoading && !state.error && (
        <div className="lobby-hint" key={state.currentHintIndex}>
          <h3>{currentHint.title}</h3>
          <p dangerouslySetInnerHTML={{ __html: currentHint.text }} />
        </div>
      )}

      {/* Hovered Experience Info */}
      {state.hoveredExperience && !state.isLoading && (
        <div className="lobby-experience-info">
          <h2>{state.hoveredExperience.name}</h2>
          <p>{state.hoveredExperience.description}</p>
          <span className="cta">Click or Press Enter to Launch</span>
        </div>
      )}

      {/* Keyboard Hints */}
      {!state.isLoading && !state.error && (
        <div className="lobby-keyboard-hint">
          <kbd>Enter</kbd> Select &nbsp;|&nbsp; <kbd>Esc</kbd> Reset View
        </div>
      )}
    </div>
  );
};

export default Lobby;
