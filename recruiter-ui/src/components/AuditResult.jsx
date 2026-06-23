import SeverityBadge from './SeverityBadge'
import FindingCard from './FindingCard'

const STATUS_CONFIG = {
  BLOCKED: {
    bg: 'bg-sev-critical-bg',
    border: 'border-sev-critical/30',
    text: 'text-sev-critical',
    label: 'BLOCKED',
    description: 'Critical compliance violations — do not publish.',
  },
  REVIEW_REQUIRED: {
    bg: 'bg-sev-high-bg',
    border: 'border-sev-high/30',
    text: 'text-sev-high',
    label: 'REVIEW REQUIRED',
    description: 'High-severity issues require sign-off before publishing.',
  },
  ADVISORY: {
    bg: 'bg-sev-medium-bg',
    border: 'border-sev-medium/30',
    text: 'text-sev-medium',
    label: 'ADVISORY',
    description: 'Publishable, but review flagged items first.',
  },
  INFO: {
    bg: 'bg-sev-low-bg',
    border: 'border-sev-low/30',
    text: 'text-sev-low',
    label: 'INFO',
    description: 'Minor style notes. Publishable as-is.',
  },
  APPROVED: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-300/30',
    text: 'text-emerald-700',
    label: 'APPROVED',
    description: 'All compliance checks passed.',
  },
}

export default function AuditResult({ certificate }) {
  const { audit_result, findings, audit_id, posting } = certificate
  const status = STATUS_CONFIG[audit_result.overall_status] || STATUS_CONFIG.APPROVED
  const counts = audit_result.counts

  return (
    <div className="mt-8 space-y-6">
      {/* Status banner */}
      <div className={`${status.bg} border ${status.border} rounded-xl p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`text-2xl font-bold ${status.text}`}>{status.label}</div>
            <p className="text-sm text-gray-600 mt-1">{status.description}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-gray-400 font-mono">{audit_id}</div>
            {posting?.req_number && (
              <div className="text-xs text-gray-500 font-semibold mt-0.5">{posting.req_number}</div>
            )}
            <div className="text-xs text-gray-400 mt-0.5">{posting?.region} &middot; {posting?.role_type}</div>
          </div>
        </div>

        {/* Count pills */}
        <div className="flex gap-3 mt-4">
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
            <div key={sev} className="flex items-center gap-1.5">
              <SeverityBadge severity={sev} />
              <span className="text-sm font-semibold text-gray-700">{counts[sev] || 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation */}
      <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">
        <span className="font-semibold">Recommendation: </span>
        {audit_result.publish_recommendation}
      </div>

      {/* Findings */}
      {findings.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Findings ({findings.length})
          </h2>
          <div className="space-y-3">
            {findings.map((f, i) => (
              <FindingCard key={`${f.rule_id}-${i}`} finding={f} />
            ))}
          </div>
        </div>
      )}

      {findings.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          No findings — this posting passed all compliance checks.
        </div>
      )}
    </div>
  )
}
