interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function WaldiezBabylonIcon({
  size = 48,
  className = "",
  label = "Waldiez",
}: Props) {
  return (
    <img
      src="/icons/waldiez-babylon.svg"
      width={size}
      height={size}
      alt={label}
      className={className}
      draggable={false}
    />
  );
}
