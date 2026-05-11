interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function GrafanaIcon({
  size = 48,
  className = "",
  label = "Grafana",
}: Props) {
  return (
    <img
      src="/icons/grafana.svg"
      width={size}
      height={size}
      alt={label}
      className={className}
      draggable={false}
    />
  );
}
