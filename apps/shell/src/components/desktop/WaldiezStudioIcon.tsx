interface Props {
  size?: number;
  className?: string;
}

export function WaldiezStudioIcon({ size = 48, className = "" }: Props) {
  return (
    <img
      src="/icons/waldiez-studio.svg"
      width={size}
      height={size}
      alt="Waldiez Studio"
      className={className}
      draggable={false}
    />
  );
}
