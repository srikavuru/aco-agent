import { useState } from 'react'
import SeverityBadge from './SeverityBadge'
import FindingCard from './FindingCard'
import { REMEDIATION_TEMPLATES } from './FindingCard'
import generatePdf from './generatePdf'

const STATUS_CONFIG = {
  BLOCKED: {
    bg: 'bg-sev-critical-bg',
    border: 'border-sev-critical/30',
    text: 'text-sev-critical',
    barColor: 'bg-sev-critical',
    label: 'BLOCKED',
    description: 'Critical compliance violations — do not publish.',
  },
  REVIEW_REQUIRED: {
    bg: 'bg-sev-high-bg',
    border: 'border-sev-high/30',
    text: 'text-sev-high',
    barColor: 'bg-sev-high',
    label: 'REVIEW REQUIRED',
    description: 'High-severity issues require sign-off before publishing.',
  },
  ADVISORY: {
    bg: 'bg-sev-medium-bg',
    border: 'border-sev-medium/30',
    text: 'text-sev-medium',
    barColor: 'bg-sev-medium',
    label: 'ADVISORY',
    description: 'Publishable, but review flagged items first.',
  },
  INFO: {
    bg: 'bg-sev-low-bg',
    border: 'border-sev-low/30',
    text: 'text-sev-low',
    barColor: 'bg-sev-low',
    label: 'INFO',
    description: 'Minor style notes. Publishable as-is.',
  },
  APPROVED: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-300/30',
    text: 'text-emerald-700',
    barColor: 'bg-emerald-500',
    label: 'APPROVED',
    description: 'All compliance checks passed.',
  },
}

export default function AuditResult({ certificate }) {
  const [copiedAll, setCopiedAll] = useState(false)
  const { audit_result, findings, audit_id, posting } = certificate
  const status = STATUS_CONFIG[audit_result.overall_status] || STATUS_CONFIG.APPROVED
  const counts = audit_result.counts
  const showActionBar = ['BLOCKED', 'REVIEW_REQUIRED'].includes(audit_result.overall_status)

  const rulesEvaluated = audit_result.rules_evaluated || 0
  const rulesPassed = rulesEvaluated - audit_result.total_findings
  const complianceScore = rulesEvaluated > 0 ? Math.round((rulesPassed / rulesEvaluated) * 100) : 100

  const remediationFindings = findings.filter(
    (f) => f.status === 'FAIL' && f.remediation_template && REMEDIATION_TEMPLATES[f.remediation_template]
  )

  async function copyAllRemediation() {
    const blocks = remediationFindings.map((f) => {
      const header = `═══ ${f.rule_name} (${f.rule_id}) ═══`
      return `${header}\n\n${REMEDIATION_TEMPLATES[f.remediation_template]}`
    })
    await navigator.clipboard.writeText(blocks.join('\n\n\n'))
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  function downloadPdf() {
    generatePdf(certificate)
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(certificate, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${audit_id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mt-8 space-y-4">
      {/* Status banner */}
      <div className={`${status.bg} border ${status.border} rounded-xl p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`text-2xl font-bold ${status.text}`}>{status.label}</div>
            <p className="text-sm text-gray-600 mt-1">{status.description}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-gray-700">
              Compliance Score: {complianceScore}%
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {rulesPassed} of {rulesEvaluated} rules passed
            </div>
          </div>
        </div>

        {/* Compliance progress bar */}
        <div className="mt-3 h-2 bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${status.barColor}`}
            style={{ width: `${complianceScore}%` }}
          />
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

      {/* Audit ID / Req Number bar */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 text-sm">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-gray-400">Audit ID: </span>
            <span className="font-mono text-gray-700">{audit_id}</span>
          </div>
          {posting?.req_number && (
            <div>
              <span className="text-gray-400">Req: </span>
              <span className="font-semibold text-gray-700">{posting.req_number}</span>
            </div>
          )}
          <div>
            <span className="text-gray-400">{posting?.region}</span>
            <span className="text-gray-300 mx-1.5">/</span>
            <span className="text-gray-400">{posting?.role_type}</span>
          </div>
        </div>
        <div className="text-xs text-gray-400">
          {new Date(certificate.audited_at).toLocaleString()}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex gap-3">
        {showActionBar && remediationFindings.length > 0 && (
          <button
            onClick={copyAllRemediation}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-vertiv-red rounded-lg hover:bg-vertiv-dark transition-colors"
          >
            <ClipboardIcon />
            {copiedAll ? 'Copied All!' : `Copy All Remediation Language (${remediationFindings.length} blocks)`}
          </button>
        )}
        <button
          onClick={downloadPdf}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <PdfIcon />
          Download Certificate
        </button>
        <button
          onClick={downloadJson}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-400 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          title="Download raw JSON"
        >
          <DownloadIcon />
          JSON
        </button>
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

function ClipboardIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  )
}

function PdfIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-6 3h4" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}
