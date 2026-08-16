import type { Zone } from "../zones";
import { zoneColor } from "../zones";
import { useThemeColors } from "../theme/ThemeProvider";

interface Props {
  zones: Zone[];
  value: number | null | undefined;
  lo: number;
  hi: number;
}

export function ZoneBar({ zones, value, lo, hi }: Props) {
  const colors = useThemeColors();
  const span = hi - lo;
  return (
    <>
      <div className="zonebar">
        {zones.map((z, i) => {
          const left = Math.max(0, (z.from - lo) / span) * 100;
          const w = ((Math.min(hi, z.to) - Math.max(lo, z.from)) / span) * 100;
          return (
            <div
              key={i}
              className="seg"
              style={{ left: `${left}%`, width: `${w}%`, background: zoneColor(z.color, colors) }}
            />
          );
        })}
        {value !== null && value !== undefined && (
          <div
            className="marker"
            style={{
              left: `${Math.min(100, Math.max(0, ((value - lo) / span) * 100))}%`,
            }}
          />
        )}
      </div>
      <div className="zone-labels">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </>
  );
}
