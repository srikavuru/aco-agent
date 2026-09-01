import { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://aco-agent-func.azurewebsites.net'

export default function JdFetch() {
  const [reqInput, setReqInput] = useState('')
  const [generatedBy, setGeneratedBy] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [docs, setDocs] = useState([])
  const [copied, setCopied] = useState(null)
  const [preview, setPreview] = useState(null)

  const reqNumbers = reqInput
    .split(/[\s,;\n]+/)
    .map((r) => r.trim())
    .filter(Boolean)

  async function fetchOne(reqNumber) {
    const res = await fetch(`${API_BASE}/api/jd-lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ req_number: reqNumber, generated_by: generatedBy.trim() }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Server error (${res.status})`)
    return data
  }

  async function handleFetch(e) {
    e.preventDefault()
    if (!reqNumbers.length || loading) return

    setLoading(true)
    setError('')
    setDocs([])
    setPreview(null)

    const collected = []
    const failures = []

    for (const reqNumber of reqNumbers) {
      try {
        collected.push(await fetchOne(reqNumber))
      } catch (err) {
        failures.push(`${reqNumber}: ${err.message}`)
      }
    }

    setDocs(collected)
    if (collected.length === 1) setPreview(collected[0].filename)
    if (failures.length) setError(failures.join(' · '))
    setLoading(false)
  }

  function download(doc) {
    const blob = new Blob([doc.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function downloadAll() {
    docs.forEach((doc, i) => setTimeout(() => download(doc), i * 250))
  }

  async function copyMarkdown(doc) {
    try {
      await navigator.clipboard.writeText(doc.markdown)
      setCopied(doc.filename)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      setError('Clipboard blocked by the browser. Use Download instead.')
    }
  }

  return (
    <div>
      {/* Purpose */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h2 className="text-[15px] font-bold text-gray-800 mb-1">Get JD by Req Number</h2>
        <p className="text-[12px] text-gray-500 leading-relaxed">
          Pulls the live posting for a requisition and hands it back as a Markdown file.
          Save it into the folder where you keep that req&apos;s resumes so your screening
          assistant reads the actual posted description — verbatim, not a summary.
        </p>

        <form onSubmit={handleFetch} className="mt-4">
          <label className="field-label" htmlFor="req-input">
            Requisition number(s)
          </label>
          <input
            id="req-input"
            className="field-input"
            value={reqInput}
            onChange={(e) => setReqInput(e.target.value)}
            placeholder="20265195   or   20265195, 20260838, 20275155"
            autoComplete="off"
          />
          <p className="text-[11px] text-gray-400 mt-1.5">
            Separate multiple reqs with commas, spaces, or new lines. REQ- prefixes are fine.
          </p>

          <div className="mt-3">
            <label className="field-label" htmlFor="req-by">
              Your email <span className="normal-case font-normal tracking-normal">(optional — recorded in the file footer)</span>
            </label>
            <input
              id="req-by"
              className="field-input"
              value={generatedBy}
              onChange={(e) => setGeneratedBy(e.target.value)}
              placeholder="you@vertiv.com"
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !reqNumbers.length}
            className="mt-4 px-5 py-2.5 rounded-md bg-vertiv text-white text-[12px] font-semibold uppercase tracking-wider hover:bg-vertiv-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? 'Looking up...'
              : `Get JD${reqNumbers.length > 1 ? ` (${reqNumbers.length})` : ''}`}
          </button>
        </form>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-vertiv-bg border-l-4 border-vertiv rounded-r-lg text-[13px] text-vertiv font-medium">
          {error}
        </div>
      )}

      {/* Results */}
      {docs.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-gray-500">
              {docs.length} {docs.length === 1 ? 'requisition' : 'requisitions'} retrieved
            </span>
            {docs.length > 1 && (
              <button
                onClick={downloadAll}
                className="px-3 py-1.5 rounded-md bg-vertiv text-white text-[11px] font-semibold uppercase tracking-wider hover:bg-vertiv-hover transition-colors"
              >
                Download all
              </button>
            )}
          </div>

          {docs.map((doc) => (
            <div key={doc.filename} className="border-b border-gray-100 last:border-b-0">
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-gray-800 truncate">
                      {doc.title}
                    </p>
                    <p className="text-[12px] text-gray-500 mt-0.5">
                      Req {doc.req_number}
                      {doc.location && ` · ${doc.location}`}
                      {doc.job_family && ` · ${doc.job_family}`}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1 font-mono truncate">
                      {doc.filename} · {doc.char_count.toLocaleString()} chars
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setPreview(preview === doc.filename ? null : doc.filename)}
                      className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 text-[11px] font-semibold uppercase tracking-wider hover:bg-gray-50 transition-colors"
                    >
                      {preview === doc.filename ? 'Hide' : 'Preview'}
                    </button>
                    <button
                      onClick={() => copyMarkdown(doc)}
                      className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 text-[11px] font-semibold uppercase tracking-wider hover:bg-gray-50 transition-colors"
                    >
                      {copied === doc.filename ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() => download(doc)}
                      className="px-3 py-1.5 rounded-md bg-vertiv text-white text-[11px] font-semibold uppercase tracking-wider hover:bg-vertiv-hover transition-colors"
                    >
                      Download .md
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  <a
                    href={doc.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-vertiv hover:underline font-medium"
                  >
                    View live posting
                  </a>
                  {doc.matched_by === 'search' && (
                    <span className="text-gray-400">
                      matched by search — confirm this is the right req
                    </span>
                  )}
                </div>
              </div>

              {preview === doc.filename && (
                <pre className="px-5 py-4 bg-gray-50 border-t border-gray-100 text-[11px] leading-relaxed text-gray-700 font-mono whitespace-pre-wrap max-h-[420px] overflow-y-auto">
                  {doc.markdown}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
        This tool retrieves and formats a posting. It does not evaluate, score, or rank
        candidates — every screening and hiring decision stays with the recruiter.
      </p>
    </div>
  )
}
