import { HomeAssistantIcon } from "./HomeAssistantIcon";
import { CodeServerIcon } from "./CodeServerIcon";
import { JupyterLabIcon } from "./JupyterLabIcon";
import { WaldiezBabylonIcon } from "./WaldiezBabylonIcon";
import { WaldiezIcon } from "./WaldiezIcon";
import { WaldiezStudioIcon } from "./WaldiezStudioIcon";
import { WaldiezPlayerIcon } from "./WaldiezPlayerIcon";
import { NodeRedIcon } from "./NodeRedIcon";
import { PortainerIcon } from "./PortainerIcon";
import { GrafanaIcon } from "./GrafanaIcon";
import { SinergymIcon } from "./SinergymIcon";
import { SmartCitiesIcon } from "./SmartCitiesIcon";
import { AmmelieIcon } from "./AmmelieIcon";
import { LimenPlayerIcon } from "./LimenPlayerIcon";
import { ZedIcon } from "./ZedIcon";
import { AIChatIcon } from "./AIChatIcon";
import { AgentsComicIcon } from "./AgentsComicIcon";

/** Single source of truth for named SVG app icons across all paradigms. */
export function AppIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  if (icon === "ha-svg")               return <HomeAssistantIcon size={size} />;
  if (icon === "code-server-svg")      return <CodeServerIcon size={size} />;
  if (icon === "jupyterlab-svg")       return <JupyterLabIcon size={size} />;
  if (icon === "waldiez-babylon-svg")  return <WaldiezBabylonIcon size={size} />;
  if (icon === "waldiez-svg")          return <WaldiezIcon size={size} />;
  if (icon === "waldiez-studio-svg")   return <WaldiezStudioIcon size={size} />;
  if (icon === "waldiez-player-svg")   return <WaldiezPlayerIcon size={size} />;
  if (icon === "nodered-svg")          return <NodeRedIcon size={size} />;
  if (icon === "portainer-svg")        return <PortainerIcon size={size} />;
  if (icon === "grafana-svg")          return <GrafanaIcon size={size} />;
  if (icon === "sinergym-svg")         return <SinergymIcon size={size} />;
  if (icon === "smartcities-svg")      return <SmartCitiesIcon size={size} />;
  if (icon === "ammelie-svg")          return <AmmelieIcon size={size} />;
  if (icon === "limen-player-svg")     return <LimenPlayerIcon size={size} />;
  if (icon === "zed-svg")              return <ZedIcon size={size} />;
  if (icon === "ai-chat-svg")          return <AIChatIcon size={size} />;
  if (icon === "agents-comic-svg")     return <AgentsComicIcon size={size} />;
  return <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>{icon}</span>;
}
