const STATUS_RING = {
  BLOCKED: '#E31837',
  REVIEW_REQUIRED: '#F97316',
  ADVISORY: '#EAB308',
  INFO: '#9CA3AF',
  APPROVED: '#16A34A',
}

export default function ComplianceDonut({ score, passed, total, status }) {
  const color = STATUS_RING[status] || STATUS_RING.APPROVED
  const radius = 38
  const stroke = 6
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="relative w-[96px] h-[96px] shrink-0">
      <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
        {/* Track */}
        <circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke="white"
          strokeOpacity="0.5"
          strokeWidth={stroke}
        />
        {/* Score arc */}
        <circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold text-gray-800 leading-none">{score}</span>
        <span className="text-[10px] text-gray-400 -mt-0.5">%</span>
        <span className="text-[9px] text-gray-400 mt-0.5">{passed}/{total}</span>
      </div>
    </div>
  )
}
