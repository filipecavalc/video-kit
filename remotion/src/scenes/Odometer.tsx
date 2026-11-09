import React from "react";

/** A number whose digits roll like an odometer. `value` may be fractional mid-animation: the ones column
 *  rolls continuously and each higher column turns over only while the column below wraps from 9 to 0. */
export const Odometer: React.FC<{ value: number; target: number; decimals?: number; style?: React.CSSProperties }> = ({ value, target, decimals = 0, style }) => {
  const scale = Math.pow(10, decimals);
  const v = Math.max(0, value * scale);
  const digits = Math.max(1, String(Math.round(Math.abs(target) * scale)).length);
  const columns = Math.max(digits, decimals + 1);
  const cells: React.ReactNode[] = [];
  for (let p = columns - 1; p >= 0; p--) {
    const unit = Math.pow(10, p);
    let pos: number;
    if (p === 0) {
      pos = v % 10;
    } else {
      const below = (v % unit) / unit; // 0..1 progress of the columns below through their cycle
      const turn = Math.max(0, (below - 0.9) / 0.1); // the last tenth of their cycle turns this column
      pos = (Math.floor(v / unit) % 10) + turn;
    }
    // Leading zeros fade out while the number is still small.
    const shown = p < Math.max(1, decimals + 1) || v >= unit * 0.9 ? 1 : 0;
    cells.push(
      <span
        key={p}
        style={{
          display: "inline-block",
          height: "1em",
          overflow: "hidden",
          lineHeight: 1,
          opacity: shown,
          width: shown ? undefined : 0,
          verticalAlign: "top",
          // Digits rolling past fade at the edges instead of being sliced.
          WebkitMaskImage: "linear-gradient(transparent 0%, black 12%, black 88%, transparent 100%)",
          maskImage: "linear-gradient(transparent 0%, black 12%, black 88%, transparent 100%)",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", transform: `translateY(${-pos}em)` }}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, i) => (
            <span key={i} style={{ height: "1em", lineHeight: 1 }}>
              {d}
            </span>
          ))}
        </span>
      </span>,
    );
    if (p === decimals && decimals > 0) cells.push(<span key="dot">.</span>);
  }
  return <span style={{ display: "inline-flex", fontVariantNumeric: "tabular-nums", lineHeight: 1, ...style }}>{cells}</span>;
};
