import { useState, useRef } from 'react'
import SeverityBadge from './SeverityBadge'

const LOCAL_ENDPOINT = 'http://localhost:7071/api/audit'

const STATUS_COLORS = {
  BLOCKED: 'text-sev-critical',
  REVIEW_REQUIRED: 'text-sev-high',
  ADVISORY: 'text-sev-medium',
  INFO: 'text-sev-low',
  APPROVED: 'text-approved',
}

const SAMPLE_URLS = `https://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/20265195
https://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/20259279
https://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/20264981`

export default function BatchScrape() {
  const [urls, setUrls] = useState('')
  const [results, setResults] = useState([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const abortRef = useRef(false)

  const urlList = urls.split('\n').map((u) => u.trim()).filter((u) => u.startsWith('http'))

  async function runBatch() {
    if (urlList.length === 0) return
    setRunning(true)
    setResults([])
    abortRef.current = false
    setProgress({ current: 0, total: urlList.length })

    const batchResults = []

    for (let i = 0; i < urlList.length; i++) {
      if (abortRef.current) break
      setProgress({ current: i + 1, total: urlList.length })

      const url = urlList[i]
      const entry = { url, status: 'running', title: '', req_number: '', region: '', overall_status: '', counts: null, error: null, certificate: null }
      batchResults.push(entry)
      setResults([...batchResults])

      try {
        const res = await fetch(LOCAL_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        })
        const data = await res.json()
        if (!res.ok) {
          entry.status = 'error'
          entry.error = data.error || `HTTP ${res.status}`
        } else {
          entry.status = 'done'
          entry.title = data.posting?.title || ''
          entry.req_number = data.posting?.req_number || ''
          entry.region = data.posting?.region || ''
          entry.overall_status = data.audit_result?.overall_status || ''
          entry.counts = data.audit_result?.counts || {}
          entry.findings_count = data.audit_result?.total_findings || 0
          entry.compliance_score = data.audit_result?.rules_evaluated
            ? Math.round(((data.audit_result.rules_evaluated - data.audit_result.total_findings) / data.audit_result.rules_evaluated) * 100)
            : 0
          entry.certificate = data
        }
      } catch (err) {
        entry.status = 'error'
        entry.error = 'Cannot reach local server. Is func start running on :7071?'
      }

      setResults([...batchResults])
    }

    setRunning(false)
  }

  function stopBatch() {
    abortRef.current = true
  }

  function exportCsv() {
    const completed = results.filter((r) => r.status === 'done')
    if (completed.length === 0) return

    const headers = ['Req Number', 'Title', 'Region', 'Status', 'Score %', 'Critical', 'High', 'Medium', 'Low', 'Total Findings', 'URL']
    const rows = completed.map((r) => [
      r.req_number,
      `"${(r.title || '').replace(/"/g, '""')}"`,
      r.region,
      r.overall_status,
      r.compliance_score,
      r.counts?.CRITICAL || 0,
      r.counts?.HIGH || 0,
      r.counts?.MEDIUM || 0,
      r.counts?.LOW || 0,
      r.findings_count,
      r.url,
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `aco-batch-audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const doneCount = results.filter((r) => r.status === 'done').length
  const errorCount = results.filter((r) => r.status === 'error').length

  return (
    <div className="space-y-5">
      {/* Input card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 p-6">
        <div className="flex items-center justify-between mb-2">
          <label className="field-label" style={{ marginBottom: 0 }}>Oracle HCM URLs</label>
          <button
            type="button"
            onClick={() => setUrls(SAMPLE_URLS)}
            className="text-[11px] text-vertiv hover:underline font-medium"
          >
            Load sample URLs
          </button>
        </div>
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={6}
          placeholder={"Paste Oracle HCM job URLs, one per line:\nhttps://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/20265195\nhttps://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/20259279"}
          className="field-input font-mono text-[12px] leading-relaxed"
          disabled={running}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-gray-400">
            {urlList.length} URL{urlList.length !== 1 ? 's' : ''} detected
          </span>
          <p className="text-[11px] text-amber-600 bg-amber-50 rounded px-2 py-1">
            Requires local server (<code className="text-[10px]">func start</code> on :7071)
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {!running ? (
          <button
            onClick={runBatch}
            disabled={urlList.length === 0}
            className="flex-1 py-3.5 px-4 bg-vertiv text-white font-semibold text-[15px] rounded-lg hover:bg-vertiv-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            Scrape & Audit All ({urlList.length})
          </button>
        ) : (
          <button
            onClick={stopBatch}
            className="flex-1 py-3.5 px-4 bg-gray-600 text-white font-semibold text-[15px] rounded-lg hover:bg-gray-700 transition-colors shadow-sm"
          >
            Stop ({progress.current}/{progress.total})
          </button>
        )}
        {doneCount > 0 && (
          <button
            onClick={exportCsv}
            disabled={running}
            className="inline-flex items-center gap-2 px-5 py-3.5 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <CsvIcon />
            Export CSV ({doneCount})
          </button>
        )}
      </div>

      {/* Progress bar */}
      {running && (
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-vertiv rounded-full transition-all duration-300"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
        </div>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-gray-600 uppercase tracking-wider">
              Results ({doneCount} complete{errorCount > 0 ? `, ${errorCount} failed` : ''})
            </span>
            {doneCount > 0 && !running && (
              <StatusSummary results={results.filter((r) => r.status === 'done')} />
            )}
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="text-left px-5 py-2 font-medium w-8">#</th>
                <th className="text-left px-3 py-2 font-medium">Title</th>
                <th className="text-left px-3 py-2 font-medium">Req</th>
                <th className="text-left px-3 py-2 font-medium">Region</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-center px-3 py-2 font-medium">Score</th>
                <th className="text-right px-5 py-2 font-medium">Findings</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-2.5 text-gray-300 text-[11px]">{i + 1}</td>
                  <td className="px-3 py-2.5 truncate max-w-[250px]">
                    {r.status === 'running' ? (
                      <span className="text-gray-400 animate-pulse">Fetching...</span>
                    ) : r.status === 'error' ? (
                      <span className="text-vertiv text-[12px]" title={r.error}>{r.error}</span>
                    ) : (
                      <span className="text-gray-800">{r.title}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-gray-400">{r.req_number || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-400 text-[12px]">{r.region || '—'}</td>
                  <td className="px-3 py-2.5">
                    {r.overall_status && (
                      <span className={`font-bold text-[11px] uppercase ${STATUS_COLORS[r.overall_status] || ''}`}>
                        {r.overall_status}
                      </span>
                    )}
                    {r.status === 'running' && <Spinner />}
                  </td>
                  <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">
                    {r.status === 'done' ? `${r.compliance_score}%` : ''}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {r.counts && (
                      <span className="inline-flex gap-1.5 text-[11px]">
                        {r.counts.CRITICAL > 0 && <span className="text-sev-critical font-bold">{r.counts.CRITICAL}C</span>}
                        {r.counts.HIGH > 0 && <span className="text-sev-high font-bold">{r.counts.HIGH}H</span>}
                        {r.counts.MEDIUM > 0 && <span className="text-sev-medium">{r.counts.MEDIUM}M</span>}
                        {r.counts.LOW > 0 && <span className="text-sev-low">{r.counts.LOW}L</span>}
                        {r.findings_count === 0 && <span className="text-approved font-medium">Clean</span>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusSummary({ results }) {
  const counts = {}
  results.forEach((r) => {
    counts[r.overall_status] = (counts[r.overall_status] || 0) + 1
  })
  return (
    <div className="flex gap-3 text-[11px]">
      {Object.entries(counts).map(([status, count]) => (
        <span key={status} className={`font-bold ${STATUS_COLORS[status] || 'text-gray-500'}`}>
          {count} {status}
        </span>
      ))}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin text-vertiv" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function CsvIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}
