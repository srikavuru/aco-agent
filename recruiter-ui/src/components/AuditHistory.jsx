import { useState } from 'react'

const STATUS_COLORS = {
  BLOCKED: 'text-sev-critical',
  REVIEW_REQUIRED: 'text-sev-high',
  ADVISORY: 'text-sev-medium',
  INFO: 'text-sev-low',
  APPROVED: 'text-approved',
}

export default function AuditHistory({ history, activeId, onSelect }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mt-5 bg-white rounded-lg shadow-sm border border-gray-200/80 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-[12px] font-semibold text-gray-600 uppercase tracking-wider hover:bg-gray-50 transition-colors"
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
        <div className="border-t border-gray-100">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-2 font-medium">Time</th>
                <th className="text-left px-3 py-2 font-medium">Posting</th>
                <th className="text-left px-3 py-2 font-medium">Req</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-right px-5 py-2 font-medium">Findings</th>
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
                    className={`cursor-pointer border-t border-gray-50 hover:bg-gray-50/80 transition-colors ${isActive ? 'bg-vertiv-bg/40' : ''}`}
                  >
                    <td className="px-5 py-2.5 text-gray-400 font-mono text-[11px]">{time}</td>
                    <td className="px-3 py-2.5 text-gray-800 truncate max-w-[200px]">{cert.posting.title}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-gray-400">{cert.posting.req_number || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`font-bold text-[11px] uppercase ${STATUS_COLORS[status] || ''}`}>{status}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <span className="inline-flex gap-2 text-[11px]">
                        {counts.CRITICAL > 0 && <span className="text-sev-critical font-bold">{counts.CRITICAL}C</span>}
                        {counts.HIGH > 0 && <span className="text-sev-high font-bold">{counts.HIGH}H</span>}
                        {counts.MEDIUM > 0 && <span className="text-sev-medium">{counts.MEDIUM}M</span>}
                        {counts.LOW > 0 && <span className="text-sev-low">{counts.LOW}L</span>}
                        {cert.audit_result.total_findings === 0 && <span className="text-approved font-medium">Clean</span>}
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
