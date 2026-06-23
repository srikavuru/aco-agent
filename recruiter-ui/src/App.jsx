import { useState } from 'react'
import AuditForm from './components/AuditForm'
import AuditResult from './components/AuditResult'

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

export default function App() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(payload) {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/audit', {
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
    } catch (err) {
      setError('Cannot reach audit server. Is func start running on :7071?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-vertiv-red flex items-center justify-center">
            <span className="text-white font-bold text-sm">V</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 leading-tight">ACO Agent</h1>
            <p className="text-xs text-gray-500">Automated Compliance Auditor</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <AuditForm
          regions={REGIONS}
          roleTypes={ROLE_TYPES}
          onSubmit={handleSubmit}
          loading={loading}
        />

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {result && <AuditResult certificate={result} />}
      </main>

      <footer className="border-t border-gray-200 mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-4 text-xs text-gray-400 text-center">
          Decision support only — all publish decisions are human-owned.
        </div>
      </footer>
    </div>
  )
}
