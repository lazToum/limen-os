interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function CodeServerIcon({
  size = 48,
  className = "",
  label = "VS Code Server",
}: Props) {
  return (
    <img
      src="/icons/code-server.svg"
      width={size}
      height={size}
      alt={label}
      className={className}
      draggable={false}
    />
  );
}
