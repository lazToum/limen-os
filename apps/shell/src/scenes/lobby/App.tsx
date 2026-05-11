import { useState, useCallback } from "react";
import Landing from "./Landing";
import Void from "./Void";
import { ThemedLobby } from "./themes";
import type { LobbyTheme } from "./themes/themes.config";
import type { Experience } from "./void.config";

type AppScreen =
  | { type: "landing" }
  | { type: "void" }
  | { type: "themed-lobby"; theme: LobbyTheme };

/**
 * Main App component that orchestrates the full navigation flow:
 *
 * Landing Page (calligraphy)
 *     ↓ [Enter]
 * Void (Meta-Lobby with 4 portals)
 *     ↓ [Select Portal]
 * Themed Lobby (Celestial/Gallery/Islands/Tree)
 *     ↓ [Select Experience]
 * Actual Experience
 */
const App: React.FC = () => {
  const [screen, setScreen] = useState<AppScreen>({ type: "landing" });

  const handleEnterVoid = useCallback(() => {
    setScreen({ type: "void" });
  }, []);

  const handleSelectExperience = useCallback((experience: Experience) => {
    if (experience.lobbyTheme) {
      // Navigate to themed lobby
      setScreen({ type: "themed-lobby", theme: experience.lobbyTheme });
    } else if (experience.scriptPath) {
      // Direct experience loading (handled by Void component)
    }
  }, []);

  const handleBackToVoid = useCallback(() => {
    setScreen({ type: "void" });
  }, []);

  return (
    <>
      {screen.type === "landing" && <Landing onEnter={handleEnterVoid} />}

      {screen.type === "void" && (
        <Void onExperienceSelect={handleSelectExperience} />
      )}

      {screen.type === "themed-lobby" && (
        <ThemedLobby theme={screen.theme} onBack={handleBackToVoid} />
      )}
    </>
  );
};

export default App;
