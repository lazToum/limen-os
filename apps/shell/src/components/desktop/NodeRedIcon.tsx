interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function NodeRedIcon({
  size = 48,
  className = "",
  label = "Node-RED",
}: Props) {
  return (
    <img
      src="/icons/nodered.svg"
      width={size}
      height={size}
      alt={label}
      className={className}
      draggable={false}
    />
  );
}
