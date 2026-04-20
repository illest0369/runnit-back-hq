interface ScoreRingProps {
  score: number;
  size?: number;
}

function scoreColor(n: number) {
  return n >= 70 ? "#39ff14" : n >= 50 ? "#ffb400" : "#ff3b30";
}

export default function ScoreRing({ score, size = 48 }: ScoreRingProps) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ - (score / 100) * circ;
  const col = scoreColor(score);
  const cx = size / 2;
  const fs = Math.round(size * 0.3);

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={3} />
      <circle
        cx={cx} cy={cx} r={r}
        fill="none" stroke={col} strokeWidth={3}
        strokeDasharray={circ.toFixed(1)}
        strokeDashoffset={off.toFixed(1)}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
      />
      <text
        x={cx} y={cx + 1}
        textAnchor="middle" dominantBaseline="middle"
        fontFamily="Bebas Neue" fontSize={fs} fill={col}
      >
        {score}
      </text>
    </svg>
  );
}
