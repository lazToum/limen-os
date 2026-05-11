interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function AgentFlowIcon({
  size = 24,
  className = "",
  label = "Workers",
}: Props) {
  return (
    <img
      src="/icons/agentflow.svg"
      width={size}
      height={size}
      alt={label}
      className={className}
      draggable={false}
      style={{ flexShrink: 0 }}
    />
  );
}
