interface Props {
  size?: number;
  className?: string;
}

export function WaldiezIcon({ size = 48, className = "" }: Props) {
  return (
    <img
      src="/icons/waldiez.svg"
      width={size}
      height={size}
      alt="Waldiez"
      className={className}
      draggable={false}
    />
  );
}
