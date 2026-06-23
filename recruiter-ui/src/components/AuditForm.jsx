import { useState } from 'react'

export default function AuditForm({ regions, roleTypes, onSubmit, loading, scrapedMeta }) {
  const [mode, setMode] = useState('text')
  const [jd, setJd] = useState('')
  const [url, setUrl] = useState('')
  const [region, setRegion] = useState('OH')
  const [roleType, setRoleType] = useState('engineer')
  const [title, setTitle] = useState('')
  const [reqNumber, setReqNumber] = useState('')

  const prevScrapedRef = useState(null)
  if (scrapedMeta && scrapedMeta !== prevScrapedRef[0]) {
    prevScrapedRef[0] = scrapedMeta
    if (scrapedMeta.title && !title) setTitle(scrapedMeta.title)
    if (scrapedMeta.req_number && !reqNumber) setReqNumber(scrapedMeta.req_number)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (mode === 'url') {
      onSubmit({ url, submitted_by: 'recruiter@vertiv.com' })
    } else {
      onSubmit({
        job_description: jd,
        region,
        role_type: roleType,
        posting_title: title || 'Untitled Posting',
        req_number: reqNumber,
        submitted_by: 'recruiter@vertiv.com',
      })
    }
  }

  const canSubmit = mode === 'url'
    ? url.length > 10 && url.startsWith('http')
    : jd.length >= 50

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 p-6 space-y-5">
        {/* Title row */}
        <div className="grid grid-cols-[1fr_180px] gap-4">
          <div>
            <label htmlFor="title" className="field-label">Posting Title</label>
            <input
              id="title" type="text" value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Electrical Engineer — OneCore"
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="reqNumber" className="field-label">Req Number</label>
            <input
              id="reqNumber" type="text" value={reqNumber}
              onChange={(e) => setReqNumber(e.target.value)}
              placeholder="e.g. REQ-12345"
              className="field-input"
            />
          </div>
        </div>

        {/* Region / Role row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="region" className="field-label">Region</label>
            <select
              id="region" value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="field-input bg-white"
            >
              {regions.map((r) => (
                <option key={r.value} value={r.value}>{r.label} ({r.value})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="roleType" className="field-label">Role Type</label>
            <select
              id="roleType" value={roleType}
              onChange={(e) => setRoleType(e.target.value)}
              className="field-input bg-white"
            >
              {roleTypes.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Mode toggle */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="inline-flex border border-gray-200 rounded-full overflow-hidden">
              <button
                type="button"
                onClick={() => setMode('text')}
                className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  mode === 'text'
                    ? 'bg-vertiv text-white'
                    : 'bg-white text-gray-500 hover:text-gray-700'
                }`}
              >
                Paste Text
              </button>
              <button
                type="button"
                onClick={() => setMode('url')}
                className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors border-l border-gray-200 ${
                  mode === 'url'
                    ? 'bg-vertiv text-white'
                    : 'bg-white text-gray-500 hover:text-gray-700'
                }`}
              >
                Enter URL
              </button>
            </div>
            {mode === 'text' && (
              <span className={`text-[11px] font-medium ${jd.length < 50 ? 'text-vertiv' : 'text-gray-400'}`}>
                {jd.length.toLocaleString()} chars
              </span>
            )}
          </div>

          {mode === 'text' ? (
            <textarea
              id="jd" value={jd}
              onChange={(e) => setJd(e.target.value)}
              rows={12}
              placeholder="Paste the full job description here..."
              className="field-input font-mono text-[12px] leading-relaxed resize-y"
            />
          ) : (
            <div className="space-y-2">
              <input
                id="url" type="url" value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/..."
                className="field-input font-mono text-[12px]"
              />
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Paste an Oracle HCM job posting URL. ACO will scrape the title, req number, location, and job description automatically. Region and role type will be auto-detected.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Submit button — outside the card for visual weight */}
      <button
        type="submit"
        disabled={loading || !canSubmit}
        className="mt-4 w-full py-3.5 px-4 bg-vertiv text-white font-semibold text-[15px] rounded-lg hover:bg-vertiv-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      >
        {loading
          ? mode === 'url' ? 'Fetching & Auditing...' : 'Running Audit...'
          : mode === 'url' ? 'Fetch & Audit' : 'Run Compliance Audit'}
      </button>
    </form>
  )
}
