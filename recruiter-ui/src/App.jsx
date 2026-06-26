import { useState, useEffect, useCallback } from 'react'
import AuditForm from './components/AuditForm'
import AuditResult from './components/AuditResult'
import AuditHistory from './components/AuditHistory'
import BatchScrape from './components/BatchScrape'
import ComplianceRules from './components/ComplianceRules'

const REGIONS = [
  { value: 'OH', label: 'Ohio' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CA', label: 'California' },
  { value: 'NY', label: 'New York' },
  { value: 'WA', label: 'Washington' },
  { value: 'IL', label: 'Illinois' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'TX', label: 'Texas' },
  { value: 'GA', label: 'Georgia' },
  { value: 'AZ', label: 'Arizona' },
]

const ROLE_TYPES = [
  { value: 'engineer', label: 'Engineer' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'research', label: 'Research' },
  { value: 'sales', label: 'Sales' },
  { value: 'general', label: 'General / Other' },
]

const API_BASE = import.meta.env.VITE_API_BASE || 'https://aco-agent-func.azurewebsites.net'

function warmup() {
  fetch(`${API_BASE}/api/warmup`).catch(() => {})
}

export default function App() {
  const [tab, setTab] = useState('audit')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])
  const [scrapedMeta, setScrapedMeta] = useState(null)

  useEffect(() => { warmup() }, [])

  async function handleSubmit(payload) {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Server error (${res.status})`)
        return
      }
      setResult(data)
      setHistory((prev) => [data, ...prev].slice(0, 10))
      if (data._scraped) setScrapedMeta(data._scraped)
    } catch (err) {
      setError('Cannot reach audit server. Check your network connection or try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleHistorySelect(cert) {
    setResult(cert)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Top accent bar */}
      <div className="h-1 bg-vertiv shrink-0" />

      {/* Header */}
      <header className="bg-vertiv sticky top-0 z-10 shadow-md">
        <div className="max-w-[900px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
              <span className="text-white font-bold text-lg leading-none">V</span>
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-white leading-tight tracking-wide">ACO Agent</h1>
              <p className="text-[11px] text-white/60">Automated Compliance Auditor</p>
            </div>
          </div>
          <div className="border border-white/30 rounded-full px-3 py-1">
            <span className="text-[10px] text-white/80 uppercase tracking-widest font-medium">Decision Support Only</span>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[900px] mx-auto px-6 flex gap-0">
          <button
            onClick={() => setTab('audit')}
            className={`px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
              tab === 'audit'
                ? 'border-vertiv text-vertiv'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Audit
          </button>
          <button
            onClick={() => { setTab('batch'); warmup() }}
            className={`px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
              tab === 'batch'
                ? 'border-vertiv text-vertiv'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Batch Scrape
          </button>
          <button
            onClick={() => setTab('rules')}
            className={`px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
              tab === 'rules'
                ? 'border-vertiv text-vertiv'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Rules
          </button>
          <button
            onClick={() => setTab('reporting')}
            className={`px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
              tab === 'reporting'
                ? 'border-vertiv text-vertiv'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Reporting
          </button>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 max-w-[900px] w-full mx-auto px-6 py-6">
        {tab === 'audit' && (
          <>
            <AuditForm
              regions={REGIONS}
              roleTypes={ROLE_TYPES}
              onSubmit={handleSubmit}
              loading={loading}
              scrapedMeta={scrapedMeta}
            />

            {history.length > 0 && (
              <AuditHistory
                history={history}
                activeId={result?.audit_id}
                onSelect={handleHistorySelect}
              />
            )}

            {error && (
              <div className="mt-5 px-4 py-3 bg-vertiv-bg border-l-4 border-vertiv rounded-r-lg text-[13px] text-vertiv font-medium">
                {error}
              </div>
            )}

            {result && <AuditResult certificate={result} />}
          </>
        )}

        {tab === 'batch' && <BatchScrape />}

        {tab === 'rules' && <ComplianceRules />}

        {tab === 'reporting' && (
          result ? (
            <>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 px-5 py-3 mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[15px] font-bold text-gray-900">{result.posting?.title}</div>
                  <div className="text-[12px] text-gray-400 mt-0.5">
                    {result.posting?.req_number && <span className="font-mono">{result.posting.req_number}</span>}
                    {result.posting?.req_number && <span className="mx-2 text-gray-200">|</span>}
                    Audited {new Date(result.audited_at).toLocaleDateString()} at {new Date(result.audited_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="text-[10px] text-gray-300 uppercase tracking-widest">Compliance Report</div>
              </div>
              <AuditResult certificate={result} />
            </>
          ) : (
            <div className="mt-12 text-center">
              <div className="text-[48px] text-gray-200 mb-4">
                <svg className="w-16 h-16 mx-auto text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-[14px] text-gray-400 font-medium">No audit to display</div>
              <div className="text-[12px] text-gray-300 mt-1">
                Run an audit from the <button onClick={() => setTab('audit')} className="text-vertiv underline font-semibold">Audit</button> tab first,
                then switch here to present the results.
              </div>
            </div>
          )
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-auto">
        <div className="max-w-[900px] mx-auto px-6 py-3 text-[11px] text-gray-400 text-center uppercase tracking-wide">
          Decision support only — all publish decisions are human-owned
        </div>
      </footer>
    </div>
  )
}
