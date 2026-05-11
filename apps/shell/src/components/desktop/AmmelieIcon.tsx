interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function AmmelieIcon({
  size = 48,
  className = "",
  label = "Ammelie",
}: Props) {
  return (
    <img
      src="/icons/ammelie.svg"
      width={size}
      height={size}
      alt={label}
      className={className}
      draggable={false}
    />
  );
}
