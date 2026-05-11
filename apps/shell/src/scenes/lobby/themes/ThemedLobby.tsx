import { useRef, useState, useEffect, useCallback } from "react";
import { Engine } from "@babylonjs/core";
import {
  LobbyTheme,
  getThemedLobbyConfig,
  LobbyExperience,
} from "./themes.config";
import { createCelestialScene, CelestialSceneControls } from "./celestialScene";
import { createGalleryScene, GallerySceneControls } from "./galleryScene";
import { createIslandsScene, IslandsSceneControls } from "./islandsScene";
import { createTreeScene, TreeSceneControls } from "./treeScene";
import "./themedLobby.css";

type SceneControls =
  | CelestialSceneControls
  | GallerySceneControls
  | IslandsSceneControls
  | TreeSceneControls;

interface ThemedLobbyProps {
  theme: LobbyTheme;
  onBack: () => void;
  onExperienceSelect?: (experience: LobbyExperience) => void;
}

/**
 * Load an experience script
 */
const loadExperience = (scriptPath: string): void => {
  document.body.innerHTML = '<div id="root"></div>';
  const script = document.createElement("script");
  script.type = "module";
  script.src = scriptPath;
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

/**
 * Arrow left icon
 */
const ArrowLeftIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const ThemedLobby: React.FC<ThemedLobbyProps> = ({
  theme,
  onBack,
  onExperienceSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneControlsRef = useRef<SceneControls | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredExperience, setHoveredExperience] =
    useState<LobbyExperience | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const config = getThemedLobbyConfig(theme);

  const handleExperienceSelect = useCallback(
    (experience: LobbyExperience) => {
      setIsExiting(true);

      setTimeout(() => {
        if (sceneControlsRef.current) {
          sceneControlsRef.current.dispose();
          sceneControlsRef.current = null;
        }
        if (engineRef.current) {
          engineRef.current.dispose();
          engineRef.current = null;
        }

        if (onExperienceSelect) {
          onExperienceSelect(experience);
        } else {
          loadExperience(experience.scriptPath);
        }
      }, 800);
    },
    [onExperienceSelect],
  );

  const handleExperienceHover = useCallback(
    (experience: LobbyExperience | null) => {
      setHoveredExperience(experience);
    },
    [],
  );

  const handleBack = useCallback(() => {
    setIsExiting(true);

    setTimeout(() => {
      if (sceneControlsRef.current) {
        sceneControlsRef.current.dispose();
        sceneControlsRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      onBack();
    }, 600);
  }, [onBack]);

  // Initialize scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!isWebGLSupported()) {
      setError("WebGL is not supported.");
      setIsLoading(false);
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
      setError("Failed to initialize 3D engine.");
      setIsLoading(false);
      return;
    }

    const callbacks = {
      onExperienceHover: handleExperienceHover,
      onExperienceSelect: handleExperienceSelect,
      onBackToVoid: handleBack,
      onSceneReady: () => setIsLoading(false),
    };

    // Create the appropriate scene based on theme
    let controls: SceneControls;
    switch (theme) {
      case "celestial":
        controls = createCelestialScene(canvas, engine, callbacks);
        break;
      case "gallery":
        controls = createGalleryScene(canvas, engine, callbacks);
        break;
      case "islands":
        controls = createIslandsScene(canvas, engine, callbacks);
        break;
      case "tree":
        controls = createTreeScene(canvas, engine, callbacks);
        break;
    }
    sceneControlsRef.current = controls;

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (sceneControlsRef.current) {
        sceneControlsRef.current.dispose();
      }
      if (engineRef.current) {
        engineRef.current.dispose();
      }
    };
  }, [theme, handleExperienceHover, handleExperienceSelect, handleBack]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!sceneControlsRef.current) return;

      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          sceneControlsRef.current.selectHoveredExperience();
          break;
        case "Escape":
          handleBack();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleBack]);

  return (
    <div
      className={`themed-lobby-container ${theme} ${isExiting ? "exiting" : ""}`}
    >
      <canvas ref={canvasRef} className="themed-lobby-canvas" />

      {/* Header */}
      {!isLoading && !error && (
        <div className="themed-lobby-header">
          <h1>{config.name}</h1>
          <p>{config.tagline}</p>
        </div>
      )}

      {/* Back Button */}
      {!isLoading && !error && (
        <div className="themed-lobby-back">
          <button onClick={handleBack}>
            <ArrowLeftIcon />
            Back to Void
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="themed-lobby-loading">
          <div className="themed-lobby-loading-spinner" />
          <p>Entering {config.name}...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="themed-lobby-loading">
          <p>{error}</p>
        </div>
      )}

      {/* Hovered Experience Info */}
      {hoveredExperience && !isLoading && (
        <div className="themed-lobby-info">
          <h2>{hoveredExperience.name}</h2>
          <p>{hoveredExperience.description}</p>
          <span className="cta">Click or Enter to Launch</span>
        </div>
      )}

      {/* Keyboard hints */}
      {!isLoading && !error && (
        <div className="themed-lobby-hints">
          <kbd>Enter</kbd> Select · <kbd>Esc</kbd> Back
        </div>
      )}
    </div>
  );
};

export default ThemedLobby;
