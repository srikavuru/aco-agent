const STYLES = {
  CRITICAL: 'bg-sev-critical/10 text-sev-critical border-sev-critical/20',
  HIGH: 'bg-sev-high/10 text-sev-high border-sev-high/20',
  MEDIUM: 'bg-sev-medium/10 text-sev-medium border-sev-medium/20',
  LOW: 'bg-sev-low/10 text-sev-low border-sev-low/20',
}

export default function SeverityBadge({ severity }) {
  const cls = STYLES[severity] || STYLES.LOW
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-bold rounded border ${cls}`}>
      {severity}
    </span>
  )
}
