interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function SinergymIcon({
  size = 24,
  className = "",
  label = "Sinergym",
}: Props) {
  return (
    <img
      src="/icons/sinergym.svg"
      width={size}
      height={size}
      alt={label}
      className={className}
      draggable={false}
      style={{ flexShrink: 0 }}
    />
  );
}
