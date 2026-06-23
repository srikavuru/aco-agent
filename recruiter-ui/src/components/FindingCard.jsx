import { useState } from 'react'
import SeverityBadge from './SeverityBadge'

const BORDER_COLORS = {
  CRITICAL: 'border-l-sev-critical',
  HIGH: 'border-l-sev-high',
  MEDIUM: 'border-l-sev-medium',
  LOW: 'border-l-sev-low',
}

export default function FindingCard({ finding }) {
  const [copied, setCopied] = useState(false)

  const hasRemediation = !!finding.remediation_template
  const remediationText = REMEDIATION_TEMPLATES[finding.remediation_template]

  async function copyRemediation() {
    if (!remediationText) return
    await navigator.clipboard.writeText(remediationText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const borderCls = BORDER_COLORS[finding.severity] || BORDER_COLORS.LOW

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200/80 border-l-[3px] ${borderCls} p-4 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <SeverityBadge severity={finding.severity} />
          <span className="inline-flex px-2 py-0.5 bg-gray-100 text-[10px] font-mono text-gray-500 rounded">
            {finding.rule_id}
          </span>
          <span className="text-[13px] font-semibold text-gray-900 truncate">{finding.rule_name}</span>
        </div>
        <span className="inline-flex px-2 py-0.5 bg-gray-50 text-[10px] text-gray-400 rounded shrink-0 uppercase tracking-wider">
          {finding.match_type}
        </span>
      </div>

      <p className="mt-2.5 text-[13px] text-gray-600 leading-relaxed">
        {finding.failure_message}
      </p>

      {finding.semantic_score != null && (
        <div className="mt-2 text-[11px] text-gray-400">
          Similarity: <span className="font-mono">{finding.semantic_score}</span> / <span className="font-mono">{finding.semantic_threshold}</span> threshold
        </div>
      )}

      {finding.matched_terms?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {finding.matched_terms.map((term, i) => (
            <span key={i} className="inline-flex px-1.5 py-0.5 bg-vertiv-bg text-vertiv text-[11px] rounded font-mono">
              {term}
            </span>
          ))}
        </div>
      )}

      {finding.legal_citation && (
        <div className="mt-2 text-[11px] text-gray-400 italic">
          {finding.legal_citation}
        </div>
      )}

      {hasRemediation && remediationText && (
        <button
          onClick={copyRemediation}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-vertiv bg-vertiv-light rounded hover:bg-vertiv hover:text-white transition-colors"
        >
          <ClipboardIcon />
          {copied ? 'Copied!' : 'Copy Remediation Language'}
        </button>
      )}
    </div>
  )
}

function ClipboardIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  )
}

export const REMEDIATION_TEMPLATES = {
  vertiv_eeo_block_v3: `Vertiv is an Equal Opportunity/Affirmative Action employer. We promote equal opportunity for all applicants regardless of race, color, religion, sex, national origin, age, disability, veteran status, or other protected characteristics.

Vertiv will make reasonable accommodations for qualified individuals with disabilities. If you need accommodation during the application or hiring process, please contact HR at accommodations@vertiv.com.

Vertiv will not discharge or in any other manner discriminate against employees or applicants because they have inquired about, discussed, or disclosed their own pay or the pay of another employee or applicant.`,

  vertiv_core_principals_block: `The successful candidate will embrace Vertiv's Core Principals & Behaviors to help execute our Strategic Priorities.

OUR CORE PRINCIPALS: Safety. Integrity. Respect. Teamwork. Inclusion.

OUR STRATEGIC PRIORITIES
• High-Performance Culture
• Customer Focus
• Operational Excellence
• Innovation
• Financial Strength

VERTIV BEHAVIORS
• Own it
• Act with urgency
• Foster a customer-first mindset
• Think big and execute
• Lead by example
• Drive continuous improvement
• Learn and seek out development
• Promote transparent & open communication`,

  vertiv_about_us_block: `About Vertiv
Vertiv (NYSE: VRT) brings together hardware, software, analytics and ongoing services to enable its customers' vital applications to run continuously, perform optimally and grow with their business needs. Vertiv solves the most important challenges facing today's data centers, communication networks and commercial and industrial facilities with a portfolio of power, cooling and IT infrastructure solutions and services that extend from the cloud to the edge of the network. Headquartered in Westerville, Ohio, USA, Vertiv employs around 34,000 people and does business in more than 130 countries. Visit Vertiv.com to learn more.`,

  vertiv_work_auth_block: `Work Authorization
No calls or agencies please. Vertiv will only employ those who are legally authorized to work in the United States. This is not a position for which sponsorship will be provided. Individuals with temporary visas such as E, F-1, H-1, H-2, L, B, J, or TN or who need sponsorship for work authorization now or in the future, are not eligible for hire.`,
}
