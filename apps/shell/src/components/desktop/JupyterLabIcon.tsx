interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function JupyterLabIcon({
  size = 48,
  className = "",
  label = "JupyterLab",
}: Props) {
  return (
    <img
      src="/icons/jupyterlab.svg"
      width={size}
      height={size}
      alt={label}
      className={className}
      draggable={false}
    />
  );
}
