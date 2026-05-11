interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function SmartCitiesIcon({
  size = 24,
  className = "",
  label = "Smart Cities",
}: Props) {
  return (
    <img
      src="/icons/smartcities.svg"
      width={size}
      height={size}
      alt={label}
      className={className}
      draggable={false}
      style={{ flexShrink: 0 }}
    />
  );
}
