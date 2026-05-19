/**
 * シンプルな SVG レーダーチャート。
 * 軸数は categories.length。各軸 1〜5（max スコア）まで。
 */
export type RadarSeries = {
  label: string;
  values: (number | null)[];
  color: string;
  fillOpacity?: number;
};

export function RadarChart({
  axes,
  series,
  size = 360,
  max = 5,
}: {
  axes: string[];
  series: RadarSeries[];
  size?: number;
  max?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 36;
  const N = axes.length;

  function pointFor(axisIdx: number, value: number) {
    const angle = (-Math.PI / 2) + (2 * Math.PI * axisIdx) / N;
    const r = (radius * value) / max;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  const gridLevels = [1, 2, 3, 4, 5];

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="auto"
      style={{ display: "block", maxWidth: size }}
    >
      {/* 多角形のグリッド */}
      {gridLevels.map((lvl) => {
        const pts = axes
          .map((_, i) => {
            const p = pointFor(i, lvl);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={lvl}
            points={pts}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={lvl === max ? 1.4 : 0.8}
            strokeOpacity={lvl === max ? 0.5 : 0.3}
          />
        );
      })}

      {/* 軸 */}
      {axes.map((_, i) => {
        const p = pointFor(i, max);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="var(--color-border)"
            strokeOpacity={0.4}
            strokeWidth={0.8}
          />
        );
      })}

      {/* 系列 */}
      {series.map((s, si) => {
        // null をスキップして closed polygon は作らず、線でつなぐ
        if (s.values.every((v) => v === null)) return null;
        const pts: string[] = [];
        const dots: { x: number; y: number }[] = [];
        for (let i = 0; i < N; i++) {
          const v = s.values[i];
          if (v == null) continue;
          const p = pointFor(i, v);
          pts.push(`${p.x},${p.y}`);
          dots.push(p);
        }
        const isClosed = s.values.every((v) => v !== null);
        return (
          <g key={si}>
            {isClosed ? (
              <polygon
                points={pts.join(" ")}
                fill={s.color}
                fillOpacity={s.fillOpacity ?? 0.18}
                stroke={s.color}
                strokeWidth={1.5}
              />
            ) : (
              <polyline
                points={pts.join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={1.5}
              />
            )}
            {dots.map((d, di) => (
              <circle key={di} cx={d.x} cy={d.y} r={3.5} fill={s.color} />
            ))}
          </g>
        );
      })}

      {/* 軸ラベル */}
      {axes.map((label, i) => {
        const p = pointFor(i, max + 0.42);
        const anchor =
          Math.abs(p.x - cx) < 10 ? "middle" : p.x < cx ? "end" : "start";
        return (
          <text
            key={i}
            x={p.x}
            y={p.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize="11"
            fontFamily="var(--font-sans)"
            fill="var(--color-text)"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
