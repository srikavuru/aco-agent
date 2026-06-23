const STYLES = {
  CRITICAL: 'bg-sev-critical/10 text-sev-critical border-sev-critical/25',
  HIGH: 'bg-sev-high/10 text-sev-high border-sev-high/25',
  MEDIUM: 'bg-sev-medium/10 text-sev-medium border-sev-medium/25',
  LOW: 'bg-sev-low/10 text-sev-low border-sev-low/25',
}

export default function SeverityBadge({ severity }) {
  const cls = STYLES[severity] || STYLES.LOW
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${cls}`}>
      {severity}
    </span>
  )
}
