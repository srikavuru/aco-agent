import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const COLORS = {
  vertivRed: [227, 24, 55],
  CRITICAL: [227, 24, 55],
  HIGH: [249, 115, 22],
  MEDIUM: [234, 179, 8],
  LOW: [107, 114, 128],
  APPROVED: [22, 163, 74],
  black: [0, 0, 0],
  darkGray: [55, 65, 81],
  gray: [107, 114, 128],
  lightGray: [229, 231, 235],
  white: [255, 255, 255],
  pageBg: [249, 250, 251],
}

const STATUS_LABELS = {
  BLOCKED: { label: 'BLOCKED', color: COLORS.CRITICAL },
  REVIEW_REQUIRED: { label: 'REVIEW REQUIRED', color: COLORS.HIGH },
  ADVISORY: { label: 'ADVISORY', color: COLORS.MEDIUM },
  INFO: { label: 'INFO', color: COLORS.LOW },
  APPROVED: { label: 'APPROVED', color: COLORS.APPROVED },
}

const PAGE_W = 210
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2

export default function generatePdf(certificate) {
  const { audit_result, findings, audit_id, posting, audited_at, legal_record } = certificate
  const counts = audit_result.counts
  const rulesEvaluated = audit_result.rules_evaluated || 0
  const rulesPassed = rulesEvaluated - audit_result.total_findings
  const complianceScore = rulesEvaluated > 0 ? Math.round((rulesPassed / rulesEvaluated) * 100) : 100
  const statusCfg = STATUS_LABELS[audit_result.overall_status] || STATUS_LABELS.APPROVED
  const dateStr = new Date(audited_at).toLocaleString()

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGIN

  function addFooter(pageNum, totalPages) {
    const footerY = 285
    doc.setDrawColor(...COLORS.lightGray)
    doc.line(MARGIN, footerY - 3, PAGE_W - MARGIN, footerY - 3)
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.gray)
    doc.text('Decision support only — all publish decisions are human-owned.', MARGIN, footerY)
    doc.text(audit_id, PAGE_W / 2, footerY, { align: 'center' })
    doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_W - MARGIN, footerY, { align: 'right' })
  }

  function checkPage(needed) {
    if (y + needed > 270) {
      doc.addPage()
      y = MARGIN
    }
  }

  // ── Header ──────────────────────────────────────────────────────────────
  // Logo placeholder
  doc.setFillColor(...COLORS.vertivRed)
  doc.roundedRect(MARGIN, y, 10, 10, 1.5, 1.5, 'F')
  doc.setFontSize(14)
  doc.setTextColor(...COLORS.white)
  doc.text('V', MARGIN + 3.2, y + 7.5)

  doc.setTextColor(...COLORS.black)
  doc.setFontSize(14)
  doc.text('ACO Agent — Audit Certificate', MARGIN + 14, y + 4)
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.gray)
  doc.text('Automated Compliance Auditor', MARGIN + 14, y + 9)

  // Right-aligned ID + date
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.darkGray)
  doc.text(audit_id, PAGE_W - MARGIN, y + 4, { align: 'right' })
  doc.setTextColor(...COLORS.gray)
  doc.text(dateStr, PAGE_W - MARGIN, y + 9, { align: 'right' })

  y += 16
  doc.setDrawColor(...COLORS.lightGray)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 8

  // ── Summary Block ──────────────────────────────────────────────────────
  doc.setFillColor(...COLORS.pageBg)
  doc.roundedRect(MARGIN, y, CONTENT_W, 40, 2, 2, 'F')

  const sumX = MARGIN + 5
  let sumY = y + 7

  doc.setFontSize(9)
  doc.setTextColor(...COLORS.gray)
  doc.text('Posting Title', sumX, sumY)
  doc.setTextColor(...COLORS.black)
  doc.setFontSize(10)
  doc.text(posting.title || 'Untitled', sumX + 28, sumY)

  sumY += 6
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.gray)
  doc.text('Req Number', sumX, sumY)
  doc.setTextColor(...COLORS.black)
  doc.text(posting.req_number || '—', sumX + 28, sumY)

  doc.setTextColor(...COLORS.gray)
  doc.text('Region', sumX + 65, sumY)
  doc.setTextColor(...COLORS.black)
  doc.text(posting.region || '—', sumX + 80, sumY)

  doc.setTextColor(...COLORS.gray)
  doc.text('Role Type', sumX + 95, sumY)
  doc.setTextColor(...COLORS.black)
  doc.text(posting.role_type || '—', sumX + 115, sumY)

  sumY += 6
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.gray)
  doc.text('Submitted By', sumX, sumY)
  doc.setTextColor(...COLORS.black)
  doc.text(posting.submitted_by || '—', sumX + 28, sumY)

  // Status + score on right side
  const rightX = PAGE_W - MARGIN - 5
  doc.setFontSize(18)
  doc.setTextColor(...statusCfg.color)
  doc.text(statusCfg.label, rightX, y + 10, { align: 'right' })

  doc.setFontSize(10)
  doc.setTextColor(...COLORS.darkGray)
  doc.text(`Compliance Score: ${complianceScore}%`, rightX, y + 17, { align: 'right' })

  doc.setFontSize(8)
  doc.setTextColor(...COLORS.gray)
  doc.text(`${rulesPassed} of ${rulesEvaluated} rules passed`, rightX, y + 22, { align: 'right' })

  // Score bar
  const barX = rightX - 50
  const barY = y + 25
  const barW = 50
  const barH = 3
  doc.setFillColor(...COLORS.lightGray)
  doc.roundedRect(barX, barY, barW, barH, 1, 1, 'F')
  doc.setFillColor(...statusCfg.color)
  if (complianceScore > 0) {
    doc.roundedRect(barX, barY, barW * complianceScore / 100, barH, 1, 1, 'F')
  }

  y += 44

  // ── Severity Counts Bar ────────────────────────────────────────────────
  const severities = [
    { key: 'CRITICAL', color: COLORS.CRITICAL },
    { key: 'HIGH', color: COLORS.HIGH },
    { key: 'MEDIUM', color: COLORS.MEDIUM },
    { key: 'LOW', color: COLORS.LOW },
  ]

  let pillX = MARGIN
  severities.forEach(({ key, color }) => {
    const count = counts[key] || 0

    doc.setFillColor(...color)
    doc.roundedRect(pillX, y, 18, 6, 1.5, 1.5, 'F')
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.white)
    doc.text(key, pillX + 9, y + 4.2, { align: 'center' })

    doc.setTextColor(...COLORS.darkGray)
    doc.setFontSize(10)
    doc.text(String(count), pillX + 21, y + 4.5)

    pillX += 32
  })

  y += 12

  // ── Recommendation ─────────────────────────────────────────────────────
  doc.setFillColor(...COLORS.pageBg)
  const recText = audit_result.publish_recommendation || ''
  const recLines = doc.splitTextToSize(recText, CONTENT_W - 10)
  const recH = recLines.length * 4.5 + 8
  doc.roundedRect(MARGIN, y, CONTENT_W, recH, 2, 2, 'F')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.darkGray)
  doc.text('Recommendation:', MARGIN + 5, y + 6)
  doc.setTextColor(...COLORS.black)
  doc.text(recLines, MARGIN + 5, y + 11)
  y += recH + 6

  // ── Findings Table ─────────────────────────────────────────────────────
  if (findings.length > 0) {
    checkPage(20)
    doc.setFontSize(11)
    doc.setTextColor(...COLORS.black)
    doc.text(`Findings (${findings.length})`, MARGIN, y + 4)
    y += 8

    const tableBody = findings.map((f) => [
      f.rule_id,
      f.rule_name,
      f.severity,
      f.failure_message,
      f.legal_citation || '—',
    ])

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Rule ID', 'Rule Name', 'Severity', 'Failure Message', 'Legal Citation']],
      body: tableBody,
      styles: {
        fontSize: 7,
        cellPadding: 2.5,
        textColor: COLORS.darkGray,
        lineColor: COLORS.lightGray,
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: COLORS.darkGray,
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 7,
      },
      columnStyles: {
        0: { cellWidth: 16, fontStyle: 'bold', halign: 'left' },
        1: { cellWidth: 30 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 75 },
        4: { cellWidth: 35, fontStyle: 'italic', textColor: COLORS.gray },
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 2) {
          const sev = data.cell.raw
          const c = COLORS[sev]
          if (c) data.cell.styles.textColor = c
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })

    y = doc.lastAutoTable.finalY + 8
  }

  // ── Legal Record Block ─────────────────────────────────────────────────
  if (legal_record) {
    checkPage(50)
    doc.setFontSize(11)
    doc.setTextColor(...COLORS.black)
    doc.text('Legal Record', MARGIN, y + 4)
    y += 8

    doc.setFillColor(...COLORS.pageBg)
    const legalFields = [
      ['Decision Authority', legal_record.decision_authority],
      ['Tool Type', legal_record.tool_type],
      ['Audit Engine', legal_record.audit_engine],
      ['Semantic Model', legal_record.model_used_for_semantic],
    ]

    const legalH = 36
    doc.roundedRect(MARGIN, y, CONTENT_W, legalH, 2, 2, 'F')

    let lY = y + 6
    legalFields.forEach(([label, value]) => {
      doc.setFontSize(8)
      doc.setTextColor(...COLORS.gray)
      doc.text(label + ':', MARGIN + 5, lY)
      doc.setTextColor(...COLORS.darkGray)
      doc.text(value || '—', MARGIN + 40, lY)
      lY += 5.5
    })

    y += legalH + 4

    // Disclaimer
    checkPage(20)
    const discLines = doc.splitTextToSize(legal_record.disclaimer || '', CONTENT_W - 10)
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.gray)
    doc.text(discLines, MARGIN + 5, y + 4)
    y += discLines.length * 3.5 + 6
  }

  // ── Add footers to all pages ───────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addFooter(i, totalPages)
  }

  // ── Save ───────────────────────────────────────────────────────────────
  const safeTitle = (posting.title || 'Untitled').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_').substring(0, 50)
  doc.save(`${audit_id}-${safeTitle}.pdf`)
}
