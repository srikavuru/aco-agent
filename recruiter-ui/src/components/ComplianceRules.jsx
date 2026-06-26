import SeverityBadge from './SeverityBadge'

const CATEGORIES = [
  {
    id: 'REQUIRED_DISCLAIMERS',
    name: 'Required Disclaimers',
    description: 'Legally mandated statements that must appear in every posting.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    rules: [
      { id: 'RD-001', name: 'EEO Statement', severity: 'CRITICAL', desc: 'Equal Employment Opportunity statement required under Title VII and 41 CFR 60-1.4.' },
      { id: 'RD-002', name: 'Reasonable Accommodation (ADA)', severity: 'CRITICAL', desc: 'ADA accommodation language required for all U.S. postings.' },
      { id: 'RD-003', name: 'Pay Transparency Non-Discrimination', severity: 'HIGH', desc: 'Pay transparency notice required under Executive Order 13665 for federal contractors.' },
      { id: 'RD-004', name: 'E-Verify Participation', severity: 'MEDIUM', desc: 'E-Verify statement for federal contractor postings in mandatory states (AZ, AL, GA, NC, SC, TN, UT).' },
      { id: 'RD-005', name: 'Core Principals & Behaviors Block', severity: 'CRITICAL', desc: 'Safety, Integrity, Respect, Teamwork, Inclusion — plus Strategic Priorities and Vertiv Behaviors.' },
      { id: 'RD-006', name: 'Vertiv About Us Boilerplate', severity: 'HIGH', desc: 'Standard company description: NYSE: VRT, Westerville OH, ~34,000 employees, 130+ countries.' },
      { id: 'RD-007', name: 'Work Authorization & No Sponsorship', severity: 'CRITICAL', desc: 'Full visa exclusion list (E, F-1, H-1, H-2, L, B, J, TN) required on all U.S. postings.' },
    ],
  },
  {
    id: 'SALARY_TRANSPARENCY',
    name: 'Salary Transparency',
    description: 'Compensation disclosure requirements — varies by state/locality.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    rules: [
      { id: 'ST-001', name: 'Pay Range Disclosure — Mandatory States', severity: 'CRITICAL', desc: 'Specific dollar range required in CA, CO, CT, DC, HI, IL, MA, MD, ME, MN, NJ, NY, NYC, OH (Cleveland), VA, VT, WA.' },
      { id: 'ST-002', name: 'Benefits Disclosure', severity: 'HIGH', desc: 'Medical, dental, vision, disability, PTO, holiday pay, and 401k must be listed alongside pay range.' },
      { id: 'ST-003', name: 'Colorado Application Deadline', severity: 'HIGH', desc: 'CO postings must state an application deadline date, or note the role accepts applications on an ongoing basis.' },
      { id: 'ST-004', name: 'Pay Transparency Locality Reference', severity: 'HIGH', desc: 'Pay range must reference the specific state/locality (e.g. "in the [STATE] locality").' },
      { id: 'ST-005', name: 'Washington State Benefits Detail', severity: 'HIGH', desc: 'WA requires enhanced benefits disclosure including specific PTO details and holiday count (9 days).' },
      { id: 'ST-006', name: 'Interview-Only Disclosure (NV, RI)', severity: 'LOW', desc: 'NV and RI require pay range during interviews, not in the JD. Advisory reminder for hiring teams.' },
    ],
  },
  {
    id: 'PROHIBITED_LANGUAGE',
    name: 'Prohibited Language',
    description: 'Terms flagged for legal risk, discrimination, or brand violation.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    ),
    rules: [
      { id: 'PL-001', name: 'Age-Biased Language', severity: 'CRITICAL', desc: '"Young professional," "digital native," "fresh perspective" — violates ADEA for candidates 40+.' },
      { id: 'PL-002', name: 'Gender-Coded Language', severity: 'HIGH', desc: '"Rockstar," "ninja," "aggressive," "manpower" — reduces female applicant rates.' },
      { id: 'PL-003', name: 'Citizenship / National Origin', severity: 'CRITICAL', desc: '"Citizens only" language is discriminatory. "Authorization to work in the U.S." is acceptable.' },
      { id: 'PL-004', name: 'Competitor Mentions', severity: 'MEDIUM', desc: 'Naming competitors or using comparative brand language requires Legal/Brand approval.' },
      { id: 'PL-005', name: 'Salary Anchoring / Vague Compensation', severity: 'HIGH', desc: '"Competitive salary," "DOE," "TBD" do not satisfy pay range requirements in transparency states.' },
    ],
  },
  {
    id: 'STYLE_AND_STRUCTURE',
    name: 'Style & Structure',
    description: 'Vertiv posting quality standards for brand consistency and sourcing quality.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    rules: [
      { id: 'SS-001', name: 'Minimum Character Count', severity: 'MEDIUM', desc: 'Postings under 500 characters suppress Indeed/LinkedIn distribution and reduce apply rates.' },
      { id: 'SS-002', name: 'Maximum Character Count', severity: 'LOW', desc: 'Postings over 5,000 characters reduce mobile completion rates.' },
      { id: 'SS-003', name: 'Responsibilities Section', severity: 'MEDIUM', desc: 'A "what you\'ll do" or responsibilities block improves candidate clarity and SEO.' },
      { id: 'SS-004', name: 'Qualifications Section', severity: 'MEDIUM', desc: 'Missing qualifications block reduces ATS screening accuracy.' },
      { id: 'SS-005', name: 'Vertiv Company Boilerplate', severity: 'LOW', desc: 'Approved company description boilerplate must be included.' },
    ],
  },
  {
    id: 'EXPORT_CONTROL',
    name: 'Export Control',
    description: 'ITAR/EAR language for regulated technical roles.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    rules: [
      { id: 'EC-001', name: 'ITAR Notice for Regulated Roles', severity: 'HIGH', desc: 'Engineering, manufacturing, research, and systems roles require ITAR/EAR export control language.' },
    ],
  },
]

const SEVERITY_GATE = {
  CRITICAL: { label: 'BLOCKED', desc: 'Do not publish. Must be resolved first.', color: 'text-sev-critical' },
  HIGH: { label: 'REVIEW REQ.', desc: 'HM + Legal sign-off required.', color: 'text-sev-high' },
  MEDIUM: { label: 'ADVISORY', desc: 'Publish after recruiter review.', color: 'text-sev-medium' },
  LOW: { label: 'INFO', desc: 'Publish at discretion.', color: 'text-sev-low' },
}

export default function ComplianceRules() {
  const totalRules = CATEGORIES.reduce((sum, c) => sum + c.rules.length, 0)
  const severityCounts = {}
  CATEGORIES.forEach(c => c.rules.forEach(r => {
    severityCounts[r.severity] = (severityCounts[r.severity] || 0) + 1
  }))

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900">Compliance Rules</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {totalRules} rules across {CATEGORIES.length} categories — all sourced from <span className="font-mono text-gray-500">rules.json</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => (
              <div key={sev} className="flex items-center gap-1">
                <SeverityBadge severity={sev} />
                <span className="text-[11px] text-gray-400 font-mono">{severityCounts[sev] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Severity legend */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 px-5 py-3">
        <div className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Severity Levels & Publish Gates</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => {
            const gate = SEVERITY_GATE[sev]
            return (
              <div key={sev} className="flex items-center gap-2">
                <SeverityBadge severity={sev} />
                <span className={`text-[11px] font-bold ${gate.color}`}>{gate.label}</span>
                <span className="text-[11px] text-gray-400">— {gate.desc}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Category sections */}
      {CATEGORIES.map(cat => (
        <div key={cat.id} className="bg-white rounded-lg shadow-sm border border-gray-200/80 overflow-hidden">
          {/* Category header */}
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <span className="text-vertiv">{cat.icon}</span>
              <div>
                <h3 className="text-[13px] font-bold text-gray-900">{cat.name}</h3>
                <p className="text-[11px] text-gray-400">{cat.description}</p>
              </div>
              <span className="ml-auto text-[11px] text-gray-300 font-mono">{cat.rules.length} rule{cat.rules.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Rules table */}
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-2 w-[72px]">ID</th>
                <th className="text-left px-2 py-2">Rule</th>
                <th className="text-left px-2 py-2 w-[90px]">Severity</th>
              </tr>
            </thead>
            <tbody>
              {cat.rules.map((rule, i) => (
                <tr key={rule.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-vertiv-bg/30 transition-colors`}>
                  <td className="px-5 py-2.5 text-[11px] font-mono text-gray-400 align-top">{rule.id}</td>
                  <td className="px-2 py-2.5 align-top">
                    <div className="text-[12px] font-semibold text-gray-800">{rule.name}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{rule.desc}</div>
                  </td>
                  <td className="px-2 py-2.5 align-top">
                    <SeverityBadge severity={rule.severity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Footer note */}
      <div className="text-center text-[11px] text-gray-300 py-2">
        Rules are maintained in <span className="font-mono">aco-agent/data/rules/rules.json</span> — no code changes required for updates.
      </div>
    </div>
  )
}
