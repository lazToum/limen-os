interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function HomeAssistantIcon({
  size = 48,
  className = "",
  label = "Home Assistant",
}: Props) {
  return (
    <img
      src="/icons/ha.svg"
      width={size}
      height={size}
      alt={label}
      className={className}
      draggable={false}
    />
  );
}
