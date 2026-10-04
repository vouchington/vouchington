import assert from 'http-assert'
import type { DsaCopyrightTransparencyFigures } from './eu-reporting.mts'

type ReportCsvFormat = 'csv_notices' | 'csv_complaints'

const COMPLAINT_INDICATORS = [
  {
    key: 'restrict',
    label:
      'Complaint regarding a decision to remove or disable access to or restrict visibility of information',
  },
  {
    key: 'no_action',
    label:
      'Complaint regarding a decision not to take action on a notice submitted in accordance with Article 16',
  },
  {
    key: 'no_action_trusted_flagger',
    label:
      'Complaint regarding a decision not to take action on a notice submitted by a Trusted Flagger in accordance with Article 16',
  },
] as const

const COMPLAINT_SCOPES = [
  'Total number',
  'Decisions upheld',
  'Decisions partially reversed',
  'Decisions reversed',
  'Median time',
] as const

const PART4_HEADER =
  'Applicability,Service,Reporting period,Category of illegal content,"Description of the sub-category ""Other""",Number of notices received ,Number of notices received from Trusted flaggers,Number of specific items of information included in the total number of notices,Number of specific items of information included in the total number of notices by Trusted Flaggers (Trusted Flagger notices),Median time to take action,Median time to take action (Trusted Flagger notices),Number of actions taken on the basis of the law,Number of actions taken on the basis of the law (Trusted Flagger notices),Number of actions taken on the basis of the terms and conditions of the service,Number of actions taken on the basis of the terms and conditions of the service (Trusted Flagger notices),Contextual information on Number of notices received ,Contextual information on Number of notices received from Trusted flaggers,Contextual information on Number of specific items of information included in the total number of notices,Contextual information on Number of specific items of information included in the total number of notices by Trusted Flaggers (Trusted Flagger notices),Contextual information on Median time to take action,Contextual information on Median time to take action (Trusted Flagger notices),Contextual information on Number of actions taken on the basis of the law,Contextual information on Number of actions taken on the basis of the law (Trusted Flagger notices),Contextual information on Number of actions taken on the basis of the terms and conditions of the service,Contextual information on Number of actions taken on the basis of the terms and conditions of the service (Trusted Flagger notices)'
const PART7_HEADER =
  'Applicability,Service,Reporting period,Section,Indicator,Scope,Value,Contextual Information'
const PART4_APPLICABILITY = 'Only for providers of hosting services, including online platforms'
const PART7_APPLICABILITY = 'Only for providers of online platforms'
const COMPLAINT_SECTION = 'Internal complaints mechanism'

/** Render the two copyright-only sections in the Commission's CSV layout. */
export function renderEuCopyrightReportCsv(
  report: DsaCopyrightTransparencyFigures,
  format: ReportCsvFormat,
): string {
  const period = formatInclusivePeriod(report.period_start, report.period_end)
  if (format === 'csv_notices') return renderNoticeRows(report, period)
  return renderComplaintRows(report, period)
}

function renderNoticeRows(report: DsaCopyrightTransparencyFigures, period: string): string {
  const categories = [
    {
      label: 'STATEMENT_CATEGORY_INTELLECTUAL_PROPERTY_INFRINGEMENTS',
      values: [
        report.notices_received_count,
        report.notices_received_trusted_flagger_count,
        report.notified_items_count,
        report.notified_items_trusted_flagger_count,
        report.median_hours_to_action,
        report.median_hours_to_action_trusted_flagger,
        report.actions_on_law_count,
        report.actions_on_law_trusted_flagger_count,
        report.actions_on_terms_count,
        report.actions_on_terms_trusted_flagger_count,
      ],
    },
    {
      label: 'KEYWORD_COPYRIGHT_INFRINGEMENT',
      values: [
        report.notices_received_count,
        report.notices_received_trusted_flagger_count,
        report.notified_items_count,
        report.notified_items_trusted_flagger_count,
        report.median_hours_to_action,
        report.median_hours_to_action_trusted_flagger,
        report.actions_on_law_count,
        report.actions_on_law_trusted_flagger_count,
        report.actions_on_terms_count,
        report.actions_on_terms_trusted_flagger_count,
      ],
    },
  ] as const
  const rows = categories.map(({ label, values }) => {
    return serializeCsvRecord([
      PART4_APPLICABILITY,
      '',
      period,
      label,
      '',
      ...values.map(formatCell),
      ...Array.from({ length: 10 }, () => ''),
    ])
  })
  return `${PART4_HEADER}\r\n${rows.join('\r\n')}\r\n`
}

function renderComplaintRows(report: DsaCopyrightTransparencyFigures, period: string): string {
  const rows: string[] = []
  for (const { key, label } of COMPLAINT_INDICATORS) {
    const figures = report.complaints_by_decision_type[key]
    for (const scope of COMPLAINT_SCOPES) {
      const value = formatCell(
        scope === 'Total number'
          ? figures.received
          : scope === 'Decisions upheld'
            ? figures.upheld
            : scope === 'Decisions partially reversed'
              ? figures.partially_reversed
              : scope === 'Decisions reversed'
                ? figures.reversed
                : figures.median_hours,
      )
      rows.push(
        serializeCsvRecord([
          PART7_APPLICABILITY,
          '',
          period,
          COMPLAINT_SECTION,
          label,
          scope,
          value,
          '',
        ]),
      )
    }
  }
  return `${PART7_HEADER}\r\n${rows.join('\r\n')}\r\n`
}

function formatInclusivePeriod(periodStart: string, periodEnd: string): string {
  const start = new Date(periodStart)
  const end = new Date(periodEnd)
  const valid =
    Number.isFinite(start.valueOf()) &&
    Number.isFinite(end.valueOf()) &&
    start.getUTCHours() === 0 &&
    start.getUTCMinutes() === 0 &&
    start.getUTCSeconds() === 0 &&
    start.getUTCMilliseconds() === 0 &&
    end.getUTCHours() === 0 &&
    end.getUTCMinutes() === 0 &&
    end.getUTCSeconds() === 0 &&
    end.getUTCMilliseconds() === 0 &&
    end.valueOf() > start.valueOf()
  assert(valid, 422, 'CSV reporting periods must have increasing UTC-midnight boundaries')
  const inclusiveEnd = new Date(end.valueOf() - 24 * 60 * 60 * 1000)
  return `${start.toISOString().slice(0, 10)}/${inclusiveEnd.toISOString().slice(0, 10)}`
}

function formatCell(value: number | undefined): string {
  if (value === undefined) return ''
  if (!Number.isFinite(value)) throw new Error('CSV values must be finite numbers')
  return String(value)
}

function serializeCsvRecord(cells: string[]): string {
  return cells
    .map(cell => (/[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell))
    .join(',')
}
