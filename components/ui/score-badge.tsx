interface ScoreBadgeProps {
  score: number
  size?: number
}

export function ScoreBadge({ score, size = 48 }: ScoreBadgeProps) {
  const radius = (size - 6) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (Math.min(score, 100) / 100) * circumference

  const color = score >= 70 ? '#84cc16' : score >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e1e2e" strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={3} strokeDasharray={circumference} strokeDashoffset={circumference - progress} strokeLinecap="round" className="transition-all duration-500" />
      </svg>
      <span className="absolute font-mono text-xs font-bold" style={{ color }}>{score}</span>
    </div>
  )
}
