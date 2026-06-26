import ComplianceDonut from './ComplianceDonut'
import SeverityBadge from './SeverityBadge'
import AuditResult from './AuditResult'

const STATUS_COLORS = {
  BLOCKED: '#E31837',
  REVIEW_REQUIRED: '#F97316',
  ADVISORY: '#EAB308',
  INFO: '#9CA3AF',
  APPROVED: '#16A34A',
}

const STATUS_BG = {
  BLOCKED: 'bg-sev-critical-bg',
  REVIEW_REQUIRED: 'bg-sev-high-bg',
  ADVISORY: 'bg-sev-medium-bg',
  INFO: 'bg-sev-low-bg',
  APPROVED: 'bg-approved-bg',
}

const STATUS_TEXT = {
  BLOCKED: 'text-sev-critical',
  REVIEW_REQUIRED: 'text-sev-high',
  ADVISORY: 'text-sev-medium',
  INFO: 'text-sev-low',
  APPROVED: 'text-approved',
}

export default function ReportingDashboard({ result, history, onTabSwitch }) {
  if (!result && history.length === 0) {
    return (
      <div className="mt-12 text-center">
        <svg className="w-16 h-16 mx-auto text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div className="text-[14px] text-gray-400 font-medium mt-4">No audit data yet</div>
        <div className="text-[12px] text-gray-300 mt-1">
          Run audits from the <button onClick={() => onTabSwitch('audit')} className="text-vertiv underline font-semibold">Audit</button> or{' '}
          <button onClick={() => onTabSwitch('batch')} className="text-vertiv underline font-semibold">Batch Scrape</button> tab to populate this dashboard.
        </div>
      </div>
    )
  }

  // Aggregate stats from history
  const audits = history.length > 0 ? history : (result ? [result] : [])
  const totalAudited = audits.length
  const statusCounts = {}
  let totalFindings = 0
  let totalRulesEvaluated = 0
  let totalRulesPassed = 0
  const severityTotals = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  const categoryHits = {}
  const topViolations = {}

  audits.forEach((cert) => {
    const ar = cert.audit_result
    const s = ar.overall_status
    statusCounts[s] = (statusCounts[s] || 0) + 1
    totalFindings += ar.total_findings
    totalRulesEvaluated += ar.rules_evaluated || 0
    totalRulesPassed += (ar.rules_evaluated || 0) - ar.total_findings

    Object.entries(ar.counts).forEach(([sev, count]) => {
      severityTotals[sev] += count
    })

    cert.findings?.forEach((f) => {
      const cat = f.category || 'OTHER'
      categoryHits[cat] = (categoryHits[cat] || 0) + 1
      const key = `${f.rule_id}: ${f.rule_name}`
      topViolations[key] = (topViolations[key] || { count: 0, severity: f.severity, rule_id: f.rule_id, rule_name: f.rule_name })
      topViolations[key].count++
    })
  })

  const avgScore = totalRulesEvaluated > 0 ? Math.round((totalRulesPassed / totalRulesEvaluated) * 100) : 100
  const avgStatus = statusCounts.BLOCKED ? 'BLOCKED' : statusCounts.REVIEW_REQUIRED ? 'REVIEW_REQUIRED' : statusCounts.ADVISORY ? 'ADVISORY' : 'APPROVED'
  const topViolationsList = Object.values(topViolations).sort((a, b) => b.count - a.count).slice(0, 5)
  const maxCategoryCount = Math.max(1, ...Object.values(categoryHits))

  const CATEGORY_LABELS = {
    REQUIRED_DISCLAIMERS: 'Required Disclaimers',
    SALARY_TRANSPARENCY: 'Salary Transparency',
    PROHIBITED_LANGUAGE: 'Prohibited Language',
    STYLE_AND_STRUCTURE: 'Style & Structure',
    EXPORT_CONTROL: 'Export Control',
  }

  return (
    <div className="space-y-5">
      {/* Dashboard header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-bold text-gray-900">Compliance Dashboard</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {totalAudited} posting{totalAudited !== 1 ? 's' : ''} audited &middot; {totalFindings} total findings
          </p>
        </div>
        <div className="text-[10px] text-gray-300 uppercase tracking-widest">Reporting</div>
      </div>

      {/* KPI cards row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Postings Audited" value={totalAudited} />
        <KpiCard label="Avg Compliance" value={`${avgScore}%`} valueColor={avgScore >= 70 ? 'text-approved' : avgScore >= 40 ? 'text-sev-medium' : 'text-sev-critical'} />
        <KpiCard label="Total Findings" value={totalFindings} />
        <KpiCard label="Critical Issues" value={severityTotals.CRITICAL} valueColor={severityTotals.CRITICAL > 0 ? 'text-sev-critical' : 'text-approved'} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Status breakdown */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 p-5">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-4">Status Breakdown</div>
          <div className="flex items-center gap-6">
            <div className="shrink-0">
              <ComplianceDonut score={avgScore} passed={totalRulesPassed} total={totalRulesEvaluated} status={avgStatus} />
            </div>
            <div className="flex-1 space-y-2">
              {Object.entries(statusCounts).sort(([,a],[,b]) => b - a).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2">
                  <div className="w-16 text-right">
                    <span className={`text-[11px] font-bold uppercase ${STATUS_TEXT[status] || ''}`}>{status.replace('_', ' ')}</span>
                  </div>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(count / totalAudited) * 100}%`, backgroundColor: STATUS_COLORS[status] || '#9CA3AF' }}
                    />
                  </div>
                  <span className="text-[12px] font-bold text-gray-700 w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Severity distribution */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 p-5">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-4">Severity Distribution</div>
          <div className="space-y-3">
            {[
              { sev: 'CRITICAL', color: '#E31837' },
              { sev: 'HIGH', color: '#F97316' },
              { sev: 'MEDIUM', color: '#EAB308' },
              { sev: 'LOW', color: '#9CA3AF' },
            ].map(({ sev, color }) => {
              const count = severityTotals[sev]
              const pct = totalFindings > 0 ? (count / totalFindings) * 100 : 0
              return (
                <div key={sev} className="flex items-center gap-3">
                  <SeverityBadge severity={sev} />
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-[12px] font-bold text-gray-700 w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Findings by category + Top violations */}
      <div className="grid grid-cols-2 gap-4">
        {/* Category breakdown */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 p-5">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-4">Findings by Category</div>
          <div className="space-y-2.5">
            {Object.entries(categoryHits).sort(([,a],[,b]) => b - a).map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-3">
                <div className="w-32 text-right shrink-0">
                  <span className="text-[11px] text-gray-600">{CATEGORY_LABELS[cat] || cat}</span>
                </div>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-vertiv/70" style={{ width: `${(count / maxCategoryCount) * 100}%` }} />
                </div>
                <span className="text-[12px] font-bold text-gray-700 w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top violations */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 p-5">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-4">Most Common Violations</div>
          <div className="space-y-2">
            {topViolationsList.map((v, i) => (
              <div key={i} className="flex items-center gap-2.5 bg-gray-50/80 rounded-lg px-3 py-2">
                <span className="text-[18px] font-bold text-gray-200 w-6">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-gray-400">{v.rule_id}</span>
                    <span className="text-[12px] font-semibold text-gray-800 truncate">{v.rule_name}</span>
                  </div>
                </div>
                <SeverityBadge severity={v.severity} />
                <span className="text-[13px] font-bold text-gray-700">{v.count}x</span>
              </div>
            ))}
            {topViolationsList.length === 0 && (
              <div className="text-[12px] text-gray-400 text-center py-4">No violations found</div>
            )}
          </div>
        </div>
      </div>

      {/* Current audit detail (if available) */}
      {result && (
        <>
          <div className="border-t border-gray-200 pt-5 mt-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 px-5 py-3 mb-4 flex items-center justify-between">
              <div>
                <div className="text-[15px] font-bold text-gray-900">{result.posting?.title}</div>
                <div className="text-[12px] text-gray-400 mt-0.5">
                  {result.posting?.req_number && <span className="font-mono">{result.posting.req_number}</span>}
                  {result.posting?.req_number && <span className="mx-2 text-gray-200">|</span>}
                  Audited {new Date(result.audited_at).toLocaleDateString()} at {new Date(result.audited_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div className="text-[10px] text-gray-300 uppercase tracking-widest">Latest Audit Detail</div>
            </div>
            <AuditResult certificate={result} />
          </div>
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value, valueColor = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 px-4 py-3.5">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</div>
      <div className={`text-[24px] font-bold mt-1 leading-none ${valueColor}`}>{value}</div>
    </div>
  )
}
