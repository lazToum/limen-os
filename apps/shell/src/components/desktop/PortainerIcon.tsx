interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function PortainerIcon({
  size = 48,
  className = "",
  label = "Portainer",
}: Props) {
  return (
    <img
      src="/icons/portainer.svg"
      width={size}
      height={size}
      alt={label}
      className={className}
      draggable={false}
    />
  );
}
