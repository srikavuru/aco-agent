import { useState, useRef, Fragment } from 'react'
import * as XLSX from 'xlsx'
import { REMEDIATION_TEMPLATES } from './FindingCard'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://aco-agent-func.azurewebsites.net'
const ORC_BASE = 'https://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job'

async function ensureWarm(setProgress) {
  setProgress('Warming up audit engine...')
  try {
    const res = await fetch(`${API_BASE}/api/warmup`, { signal: AbortSignal.timeout(120000) })
    if (res.ok) {
      const data = await res.json()
      if (data.ms > 5000) setProgress(`Engine warm (${Math.round(data.ms / 1000)}s cold start). Starting audit...`)
    }
  } catch {}
}

const SEV_BADGE = {
  CRITICAL: 'bg-sev-critical-bg text-sev-critical',
  HIGH: 'bg-sev-high-bg text-sev-high',
  MEDIUM: 'bg-sev-medium-bg text-sev-medium',
  LOW: 'bg-sev-low-bg text-sev-low',
}

const STATUS_COLORS = {
  BLOCKED: 'text-sev-critical',
  REVIEW_REQUIRED: 'text-sev-high',
  ADVISORY: 'text-sev-medium',
  INFO: 'text-sev-low',
  APPROVED: 'text-approved',
}

function parseResult(data) {
  return {
    title: data.posting?.title || '',
    req_number: data.posting?.req_number || '',
    region: data.posting?.region || '',
    overall_status: data.audit_result?.overall_status || '',
    counts: data.audit_result?.counts || {},
    findings_count: data.audit_result?.total_findings || 0,
    compliance_score: data.audit_result?.rules_evaluated
      ? Math.round(((data.audit_result.rules_evaluated - data.audit_result.total_findings) / data.audit_result.rules_evaluated) * 100)
      : 0,
    certificate: data,
  }
}

export default function BatchScrape() {
  const [mode, setMode] = useState('reqs')
  const [urls, setUrls] = useState('')
  const [limit, setLimit] = useState(25)
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [batchError, setBatchError] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)
  const [copiedFinding, setCopiedFinding] = useState(null)

  // Upload Reqs state
  const [fileData, setFileData] = useState(null)   // { headers: [], rows: [] }
  const [fileName, setFileName] = useState('')
  const [selectedCol, setSelectedCol] = useState('')
  const fileInputRef = useRef(null)

  const urlList = urls.split('\n').map((u) => u.trim()).filter((u) => u.startsWith('http'))

  const reqNumbers = fileData && selectedCol
    ? [...new Set(fileData.rows.map((r) => String(r[selectedCol] || '').trim()).filter((v) => v && /^\d{5,}$/.test(v)))]
    : []

  // ── File upload handler ────────────────────────────────────────────────
  function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setSelectedCol('')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        if (json.length === 0) { setFileData(null); return }
        const headers = Object.keys(json[0])
        setFileData({ headers, rows: json })
        const autoCol = headers.find((h) =>
          /req|requisition|job.?id|posting.?id/i.test(h)
        )
        if (autoCol) setSelectedCol(autoCol)
      } catch {
        setFileData(null)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // ── Run methods ────────────────────────────────────────────────────────
  function startRun() {
    setRunning(true)
    setResults([])
    setSummary(null)
    setBatchError('')
    setExpandedRow(null)
  }

  // Audits a list of { url, req_number?, fallbackTitle } sequentially,
  // streaming results into the table as each completes.
  async function runSequentialBatch(items, progressLabel) {
    startRun()
    await ensureWarm(setProgress)
    const batchResults = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      setProgress(`Auditing ${i + 1}/${items.length}${progressLabel ? `: ${progressLabel(item)}` : '...'}`)
      try {
        const res = await fetch(`${API_BASE}/api/audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url }),
        })
        const data = await res.json()
        batchResults.push(res.ok
          ? parseResult(data)
          : { req_number: item.req_number || '', title: item.fallbackTitle, error: data.error, overall_status: '' })
      } catch (err) {
        batchResults.push({ req_number: item.req_number || '', title: item.fallbackTitle, error: err.message, overall_status: '' })
      }
      setResults([...batchResults])
    }
    setProgress('')
    setRunning(false)
  }

  function runReqBatch() {
    if (reqNumbers.length === 0) return
    return runSequentialBatch(
      reqNumbers.map((req) => ({ url: `${ORC_BASE}/${req}`, req_number: req, fallbackTitle: `Req ${req}` })),
      (item) => item.req_number,
    )
  }

  function runUrlBatch() {
    if (urlList.length === 0) return
    return runSequentialBatch(
      urlList.map((url) => ({ url, fallbackTitle: url.slice(-20) })),
    )
  }

  async function runCrawlAll() {
    startRun()
    await ensureWarm(setProgress)
    setProgress(`Crawling ${limit} postings from Vertiv careers...`)
    try {
      const res = await fetch(`${API_BASE}/api/audit-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit, offset: 0 }),
      })
      const data = await res.json()
      if (!res.ok) { setBatchError(`Crawl failed: ${data.error || `server error (${res.status})`}`); return }
      const audited = (data.results || []).filter((r) => r.audit_result)
      setResults(audited.map(parseResult))
      setSummary({
        total_jobs: data.total_jobs, audited: data.audited, skipped: data.skipped,
        errors: data.errors, elapsed: data.elapsed_seconds,
        status_breakdown: data.summary?.status_breakdown || {},
        total_findings: data.summary?.total_findings || 0,
      })
    } catch (err) { setBatchError(`Crawl failed: ${err.message}`) }
    finally { setProgress(''); setRunning(false) }
  }

  function copyRemediation(key, text) {
    navigator.clipboard.writeText(text)
    setCopiedFinding(key)
    setTimeout(() => setCopiedFinding((cur) => (cur === key ? null : cur)), 1500)
  }

  function exportCsv() {
    const valid = results.filter((r) => r.overall_status)
    if (valid.length === 0) return
    const headers = ['Req Number', 'Title', 'Region', 'Status', 'Score %', 'Critical', 'High', 'Medium', 'Low', 'Total Findings']
    const rows = valid.map((r) => [
      r.req_number, `"${(r.title || '').replace(/"/g, '""')}"`, r.region,
      r.overall_status, r.compliance_score,
      r.counts?.CRITICAL || 0, r.counts?.HIGH || 0, r.counts?.MEDIUM || 0, r.counts?.LOW || 0,
      r.findings_count,
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `aco-batch-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const doneCount = results.filter((r) => r.overall_status).length
  const runHandler = mode === 'crawl' ? runCrawlAll : mode === 'urls' ? runUrlBatch : runReqBatch
  const canRun = mode === 'crawl' ? true : mode === 'urls' ? urlList.length > 0 : reqNumbers.length > 0
  const btnLabel = running
    ? progress || 'Processing...'
    : mode === 'crawl'
      ? `Crawl & Audit ${limit} Postings`
      : mode === 'urls'
        ? `Audit ${urlList.length} URLs`
        : `Audit ${reqNumbers.length} Req Numbers`

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="inline-flex border border-gray-200 rounded-full overflow-hidden">
            {[
              ['reqs', 'Upload Reqs'],
              ['crawl', 'Crawl All'],
              ['urls', 'Specific URLs'],
            ].map(([key, label], i) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  i > 0 ? 'border-l border-gray-200' : ''
                } ${mode === key ? 'bg-vertiv text-white' : 'bg-white text-gray-500 hover:text-gray-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Upload Reqs mode ──────────────────────────────────────── */}
        {mode === 'reqs' && (
          <div className="space-y-4">
            <div>
              <label className="field-label">Upload Spreadsheet</label>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.tsv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={running}
                  className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <UploadIcon />
                  {fileName || 'Choose File'}
                </button>
                <span className="text-[11px] text-gray-400">CSV, Excel (.xlsx), or TSV</span>
              </div>
            </div>

            {fileData && (
              <>
                <div>
                  <label className="field-label">Select Req Number Column</label>
                  <select
                    value={selectedCol}
                    onChange={(e) => setSelectedCol(e.target.value)}
                    className="field-input w-64"
                    disabled={running}
                  >
                    <option value="">-- Select column --</option>
                    {fileData.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Preview */}
                <div className="bg-surface rounded-lg border border-gray-200/80 overflow-hidden">
                  <div className="px-4 py-2 text-[11px] text-gray-400 border-b border-gray-100">
                    Preview: {fileData.rows.length} rows, {fileData.headers.length} columns
                    {selectedCol && <span className="ml-2 text-vertiv font-semibold"> | {reqNumbers.length} valid req numbers found</span>}
                  </div>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr>
                          {fileData.headers.map((h) => (
                            <th
                              key={h}
                              className={`text-left px-3 py-1.5 font-medium text-[10px] uppercase tracking-wider whitespace-nowrap ${
                                h === selectedCol ? 'bg-vertiv-light text-vertiv' : 'text-gray-400'
                              }`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fileData.rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-t border-gray-50">
                            {fileData.headers.map((h) => (
                              <td
                                key={h}
                                className={`px-3 py-1.5 whitespace-nowrap ${
                                  h === selectedCol ? 'bg-vertiv-light/30 font-mono font-semibold text-gray-800' : 'text-gray-500'
                                }`}
                              >
                                {String(row[h] || '').substring(0, 40)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {fileData.rows.length > 5 && (
                    <div className="px-4 py-1.5 text-[11px] text-gray-400 border-t border-gray-100">
                      ...and {fileData.rows.length - 5} more rows
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Crawl All mode ────────────────────────────────────────── */}
        {mode === 'crawl' && (
          <div>
            <label className="field-label">Number of Postings to Audit</label>
            <div className="flex items-center gap-3">
              <input
                type="number" min={1} max={50} value={limit}
                onChange={(e) => setLimit(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                className="field-input w-24" disabled={running}
              />
              <span className="text-[12px] text-gray-400">Max 50 per batch (Vertiv has 2,200+ active postings)</span>
            </div>
          </div>
        )}

        {/* ── Specific URLs mode ────────────────────────────────────── */}
        {mode === 'urls' && (
          <div>
            <label className="field-label">Oracle HCM URLs</label>
            <textarea
              value={urls} onChange={(e) => setUrls(e.target.value)} rows={5}
              placeholder="Paste Oracle HCM job URLs, one per line"
              className="field-input font-mono text-[12px] leading-relaxed" disabled={running}
            />
            <span className="text-[11px] text-gray-400 mt-1 block">{urlList.length} URLs detected</span>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="flex gap-3">
        <button
          onClick={runHandler}
          disabled={running || !canRun}
          className="flex-1 py-3.5 px-4 bg-vertiv text-white font-semibold text-[15px] rounded-lg hover:bg-vertiv-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          {btnLabel}
        </button>
        {doneCount > 0 && !running && (
          <button
            onClick={exportCsv}
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
          <div className="h-full bg-vertiv rounded-full animate-pulse w-full" />
        </div>
      )}

      {/* Batch error */}
      {batchError && !running && (
        <div className="px-4 py-3 bg-vertiv-bg border-l-4 border-vertiv rounded-r-lg text-[13px] text-vertiv font-medium">
          {batchError}
        </div>
      )}

      {/* Summary banner */}
      {summary && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-gray-700">
              <span className="font-semibold">{summary.audited}</span> audited
              {summary.skipped > 0 && <span className="text-gray-400"> / {summary.skipped} skipped</span>}
              {summary.errors > 0 && <span className="text-vertiv"> / {summary.errors} errors</span>}
              <span className="text-gray-400"> of {summary.total_jobs?.toLocaleString()} total</span>
              <span className="text-gray-300 mx-2">|</span>
              <span className="text-gray-500">{summary.total_findings} findings</span>
              <span className="text-gray-300 mx-2">|</span>
              <span className="text-gray-400">{summary.elapsed}s</span>
            </div>
            <div className="flex gap-3 text-[11px]">
              {Object.entries(summary.status_breakdown).map(([status, count]) => (
                <span key={status} className={`font-bold ${STATUS_COLORS[status] || 'text-gray-500'}`}>
                  {count} {status}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 overflow-hidden">
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
                <Fragment key={i}>
                  <tr
                    className={`border-t border-gray-50 cursor-pointer transition-colors ${
                      expandedRow === i ? 'bg-gray-50' : 'hover:bg-gray-50/50'
                    }`}
                    onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                  >
                    <td className="px-5 py-2.5 text-gray-300 text-[11px]">{i + 1}</td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      <div className="flex items-center gap-1.5">
                        <ChevronIcon open={expandedRow === i} />
                        {r.error
                          ? <span className="text-vertiv text-[12px] truncate" title={r.error}>{r.error}</span>
                          : <span className="text-gray-800 truncate">{r.title}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px]">
                      {r.req_number
                        ? (
                          <a
                            href={`${ORC_BASE}/${r.req_number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-vertiv hover:underline"
                          >
                            {r.req_number}
                          </a>
                        )
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 text-[12px]">{r.region || '—'}</td>
                    <td className="px-3 py-2.5">
                      {r.overall_status && (
                        <span className={`font-bold text-[11px] uppercase ${STATUS_COLORS[r.overall_status] || ''}`}>
                          {r.overall_status.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">
                      {r.overall_status ? `${r.compliance_score}%` : ''}
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

                  {/* Expanded findings row */}
                  {expandedRow === i && (
                    <tr className="bg-gray-50/80">
                      <td colSpan={7} className="px-6 pb-4 pt-1">
                        {r.certificate?.findings?.length > 0 ? (
                          <div className="space-y-1.5">
                            {r.certificate.findings.map((f, fi) => {
                              const remediation = REMEDIATION_TEMPLATES[f.remediation_template]
                              const copyKey = `${i}-${fi}`
                              return (
                                <div key={fi} className="flex items-start gap-3 bg-white rounded-lg border border-gray-100 px-4 py-2.5">
                                  <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded mt-0.5 ${SEV_BADGE[f.severity] || 'bg-gray-100 text-gray-500'}`}>
                                    {f.severity}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-mono text-gray-400">{f.rule_id}</span>
                                      <span className="text-[12px] font-semibold text-gray-800">{f.rule_name}</span>
                                    </div>
                                    {f.failure_message && (
                                      <div className="text-[11px] text-gray-400 mt-0.5">{f.failure_message}</div>
                                    )}
                                    {f.matched_terms?.length > 0 && (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {f.matched_terms.map((term, ti) => (
                                          <span key={ti} className="inline-flex px-1.5 py-0.5 bg-vertiv-bg text-vertiv text-[10px] rounded font-mono">
                                            {term}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {remediation && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); copyRemediation(copyKey, remediation) }}
                                      title="Copy remediation"
                                      className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold transition-colors ${
                                        copiedFinding === copyKey ? 'text-approved' : 'text-gray-300 hover:text-vertiv'
                                      }`}
                                    >
                                      {copiedFinding === copyKey ? <><CheckIcon /> Copied</> : <CopyIcon />}
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-[12px] text-approved font-medium py-1">No findings — posting is compliant</div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
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

function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-3 h-3 shrink-0 text-gray-300 transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
