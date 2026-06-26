import SeverityBadge from './SeverityBadge'

const TIMELINE = [
  {
    date: 'June 25, 2026',
    tag: 'SAME-DAY',
    tagColor: 'bg-emerald-500',
    title: 'Pay Transparency V14 — 17 States Now Enforced',
    subtitle: 'Policy distributed → audit engine updated → live in production. Same day.',
    sections: [
      {
        heading: 'Expanded from 8 to 17 Mandatory States',
        content: (
          <div className="flex flex-wrap gap-4 mt-2">
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1.5">Previously Covered</div>
              <div className="flex flex-wrap gap-1">
                {['CA', 'CO', 'CT', 'IL', 'MA', 'NJ', 'NY', 'WA'].map(s => (
                  <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] font-mono rounded">{s}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-emerald-600 uppercase tracking-widest mb-1.5 font-semibold">+ Added in V14</div>
              <div className="flex flex-wrap gap-1">
                {['DC', 'HI', 'MD', 'ME', 'MN', 'NYC', 'OH', 'VA', 'VT'].map(s => (
                  <span key={s} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-mono rounded border border-emerald-200">{s}</span>
                ))}
              </div>
            </div>
          </div>
        ),
      },
      {
        heading: '4 New Compliance Rules',
        content: (
          <div className="mt-2 space-y-2">
            {[
              { id: 'ST-003', name: 'Colorado Application Deadline', severity: 'HIGH', desc: 'Standard postings must include a deadline date. Evergreen postings must state "accepts applications on an ongoing basis."' },
              { id: 'ST-004', name: 'Locality-Specific Pay Reference', severity: 'HIGH', desc: 'Pay range must reference the specific state/locality — e.g. "in the [STATE] locality."' },
              { id: 'ST-005', name: 'Washington Benefits Detail', severity: 'HIGH', desc: 'WA postings require specific PTO details and holiday count (9 days) beyond standard benefits language.' },
              { id: 'ST-006', name: 'NV & RI Interview Disclosure', severity: 'LOW', desc: 'Advisory: these states require pay range at interview, not in the JD. Reminder for hiring teams.' },
            ].map(rule => (
              <div key={rule.id} className="flex items-start gap-3 bg-gray-50/80 rounded-lg px-3 py-2">
                <span className="text-[11px] font-mono text-gray-400 mt-0.5 shrink-0">{rule.id}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-gray-800">{rule.name}</span>
                    <SeverityBadge severity={rule.severity} />
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{rule.desc}</div>
                </div>
              </div>
            ))}
          </div>
        ),
      },
      {
        heading: 'Why This Matters',
        content: (
          <div className="mt-2 bg-vertiv-bg/50 border border-vertiv/10 rounded-lg px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-vertiv/10 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-vertiv" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <div className="text-[12px] font-semibold text-gray-800">Same-day policy enforcement</div>
                <div className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  When Legal publishes a policy update, the ACO Agent's compliance engine can reflect it the same day.
                  Every job description drafted from this point forward is automatically checked against the latest V14 requirements — no manual checklist, no training lag, no gap between policy and practice.
                </div>
              </div>
            </div>
          </div>
        ),
      },
    ],
  },
  {
    date: 'June 2026',
    tag: 'LAUNCH',
    tagColor: 'bg-vertiv',
    title: 'ACO Agent v1.0 — Initial Release',
    subtitle: 'Automated compliance auditing for Vertiv job descriptions.',
    sections: [
      {
        heading: 'Core Capabilities',
        content: (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              { icon: '🛡️', label: '7 Required Disclaimers', desc: 'EEO, ADA, pay transparency, E-Verify, core principals, about us, work auth' },
              { icon: '💰', label: 'Salary Transparency', desc: 'Pay range detection, benefits disclosure, vague compensation flagging' },
              { icon: '🚫', label: 'Prohibited Language', desc: 'Age bias, gender coding, citizenship discrimination, competitor mentions' },
              { icon: '📄', label: 'Style & Structure', desc: 'Character limits, section detection, boilerplate verification' },
              { icon: '🌐', label: 'Export Control', desc: 'ITAR/EAR notices for regulated technical roles' },
              { icon: '📊', label: 'Audit Certificates', desc: 'Structured legal records with severity rankings and remediation' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-2 bg-gray-50/80 rounded-lg px-3 py-2">
                <span className="text-[14px]">{item.icon}</span>
                <div>
                  <div className="text-[11px] font-semibold text-gray-700">{item.label}</div>
                  <div className="text-[10px] text-gray-400">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        ),
      },
    ],
  },
]

export default function WhatsNew() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200/80 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900">What's New</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">Product updates and compliance rule changes</p>
          </div>
          <div className="border border-emerald-200 bg-emerald-50 rounded-full px-3 py-1">
            <span className="text-[10px] text-emerald-700 uppercase tracking-widest font-semibold">Latest: V14 Pay Transparency</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[19px] top-6 bottom-6 w-px bg-gray-200" />

        <div className="space-y-8">
          {TIMELINE.map((entry, idx) => (
            <div key={idx} className="relative flex gap-4">
              {/* Timeline dot */}
              <div className="relative z-10 shrink-0">
                <div className={`w-10 h-10 rounded-full ${entry.tagColor} flex items-center justify-center shadow-sm`}>
                  <span className="text-white text-[9px] font-bold tracking-wide">{entry.tag}</span>
                </div>
              </div>

              {/* Content card */}
              <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200/80 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <div className="text-[10px] text-gray-400 uppercase tracking-widest">{entry.date}</div>
                  <h3 className="text-[14px] font-bold text-gray-900 mt-0.5">{entry.title}</h3>
                  <p className="text-[12px] text-gray-400 mt-0.5">{entry.subtitle}</p>
                </div>

                <div className="px-5 py-4 space-y-5">
                  {entry.sections.map((section, sIdx) => (
                    <div key={sIdx}>
                      <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">{section.heading}</div>
                      {section.content}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
