import { useState } from 'react'
import SeverityBadge from './SeverityBadge'

const STATUS_COLORS = {
  BLOCKED: 'text-sev-critical',
  REVIEW_REQUIRED: 'text-sev-high',
  ADVISORY: 'text-sev-medium',
  INFO: 'text-sev-low',
  APPROVED: 'text-emerald-700',
}

export default function AuditHistory({ history, activeId, onSelect }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mt-6 border border-gray-200 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span>Recent Audits ({history.length})</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-2 font-medium">Time</th>
                <th className="text-left px-4 py-2 font-medium">Posting</th>
                <th className="text-left px-4 py-2 font-medium">Req</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Findings</th>
              </tr>
            </thead>
            <tbody>
              {history.map((cert) => {
                const isActive = cert.audit_id === activeId
                const counts = cert.audit_result.counts
                const status = cert.audit_result.overall_status
                const time = new Date(cert.audited_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

                return (
                  <tr
                    key={cert.audit_id}
                    onClick={() => onSelect(cert)}
                    className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 transition-colors ${isActive ? 'bg-vertiv-light/50' : ''}`}
                  >
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs">{time}</td>
                    <td className="px-4 py-2 text-gray-900 truncate max-w-[200px]">{cert.posting.title}</td>
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{cert.posting.req_number || '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`font-semibold text-xs ${STATUS_COLORS[status] || ''}`}>{status}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex gap-2 text-xs text-gray-500">
                        {counts.CRITICAL > 0 && <span className="text-sev-critical font-bold">{counts.CRITICAL}C</span>}
                        {counts.HIGH > 0 && <span className="text-sev-high font-bold">{counts.HIGH}H</span>}
                        {counts.MEDIUM > 0 && <span className="text-sev-medium">{counts.MEDIUM}M</span>}
                        {counts.LOW > 0 && <span className="text-sev-low">{counts.LOW}L</span>}
                        {cert.audit_result.total_findings === 0 && <span className="text-emerald-600">Clean</span>}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
