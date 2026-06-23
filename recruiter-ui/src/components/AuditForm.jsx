import { useState } from 'react'

export default function AuditForm({ regions, roleTypes, onSubmit, loading }) {
  const [jd, setJd] = useState('')
  const [region, setRegion] = useState('OH')
  const [roleType, setRoleType] = useState('engineer')
  const [title, setTitle] = useState('')
  const [reqNumber, setReqNumber] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit({
      job_description: jd,
      region,
      role_type: roleType,
      posting_title: title || 'Untitled Posting',
      req_number: reqNumber,
      submitted_by: 'recruiter@vertiv.com',
    })
  }

  const charCount = jd.length

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-[1fr_200px] gap-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Posting Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Electrical Engineer — OneCore"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-vertiv-red/30 focus:border-vertiv-red"
          />
        </div>
        <div>
          <label htmlFor="reqNumber" className="block text-sm font-medium text-gray-700 mb-1">
            Req Number
          </label>
          <input
            id="reqNumber"
            type="text"
            value={reqNumber}
            onChange={(e) => setReqNumber(e.target.value)}
            placeholder="e.g. REQ-12345"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-vertiv-red/30 focus:border-vertiv-red"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="region" className="block text-sm font-medium text-gray-700 mb-1">
            Region
          </label>
          <select
            id="region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-vertiv-red/30 focus:border-vertiv-red"
          >
            {regions.map((r) => (
              <option key={r.value} value={r.value}>{r.label} ({r.value})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="roleType" className="block text-sm font-medium text-gray-700 mb-1">
            Role Type
          </label>
          <select
            id="roleType"
            value={roleType}
            onChange={(e) => setRoleType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-vertiv-red/30 focus:border-vertiv-red"
          >
            {roleTypes.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="jd" className="text-sm font-medium text-gray-700">
            Job Description
          </label>
          <span className={`text-xs ${charCount < 50 ? 'text-red-500' : 'text-gray-400'}`}>
            {charCount.toLocaleString()} chars
          </span>
        </div>
        <textarea
          id="jd"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={14}
          placeholder="Paste the full job description here..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-vertiv-red/30 focus:border-vertiv-red"
        />
      </div>

      <button
        type="submit"
        disabled={loading || charCount < 50}
        className="w-full py-2.5 px-4 bg-vertiv-red text-white font-semibold text-sm rounded-lg hover:bg-vertiv-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Running Audit...' : 'Run Compliance Audit'}
      </button>
    </form>
  )
}
