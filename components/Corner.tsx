// Corner bracket decoration — place inside a relative-positioned container
// size: length of each arm in px (default 8)
// weight: stroke width in px (default 1)
// color: tailwind border color class (default border-zinc-600)

interface CornerProps {
  size?: number;
  weight?: number;
  color?: string;
}

function TL({ size, weight, color }: Required<CornerProps>) {
  return (
    <span
      className={`absolute top-0 left-0 pointer-events-none ${color}`}
      style={{
        width: size,
        height: size,
        borderTop: `${weight}px solid currentColor`,
        borderLeft: `${weight}px solid currentColor`,
      }}
    />
  );
}
function TR({ size, weight, color }: Required<CornerProps>) {
  return (
    <span
      className={`absolute top-0 right-0 pointer-events-none ${color}`}
      style={{
        width: size,
        height: size,
        borderTop: `${weight}px solid currentColor`,
        borderRight: `${weight}px solid currentColor`,
      }}
    />
  );
}
function BL({ size, weight, color }: Required<CornerProps>) {
  return (
    <span
      className={`absolute bottom-0 left-0 pointer-events-none ${color}`}
      style={{
        width: size,
        height: size,
        borderBottom: `${weight}px solid currentColor`,
        borderLeft: `${weight}px solid currentColor`,
      }}
    />
  );
}
function BR({ size, weight, color }: Required<CornerProps>) {
  return (
    <span
      className={`absolute bottom-0 right-0 pointer-events-none ${color}`}
      style={{
        width: size,
        height: size,
        borderBottom: `${weight}px solid currentColor`,
        borderRight: `${weight}px solid currentColor`,
      }}
    />
  );
}

export default function Corners({
  size = 8,
  weight = 1,
  color = 'text-zinc-600',
}: CornerProps) {
  return (
    <>
      <TL size={size} weight={weight} color={color} />
      <TR size={size} weight={weight} color={color} />
      <BL size={size} weight={weight} color={color} />
      <BR size={size} weight={weight} color={color} />
    </>
  );
}
