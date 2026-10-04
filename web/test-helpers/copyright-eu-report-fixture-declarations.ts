import webCopyrightEuTransparencyReport from '../../api-fixtures/v1/responses/web.copyright.eu.transparency-report.json'
import webCopyrightEuTransparencyReportCsv from '../../api-fixtures/v1/responses/web.copyright.eu.transparency-report-csv.json'
import {
  defineWebApiFixture,
  type WebApiFixtureDeclaration,
} from './api-responses/declarations/declaration'

type ComplaintBucket = {
  received: number
  upheld: number
  partially_reversed: number
  reversed: number
  median_hours?: number
}

type EuTransparencyReportResponse = {
  copyright_eu_report: {
    period_start: string
    period_end: string
    generated_at: string
    receipt_count: number
    statement_of_reasons_count: number
    redress_request_count: number
    redress_decision_count: number
    supervised_complaint_count: number
    escalation_count: number
    notices_received_count: number
    notices_received_trusted_flagger_count: number
    notified_items_count: number
    notified_items_trusted_flagger_count: number
    actions_on_law_count: number
    actions_on_law_trusted_flagger_count: number
    actions_on_terms_count: number
    actions_on_terms_trusted_flagger_count: number
    notices_processed_by_automated_means_count: number
    restrictions_imposed_by_automated_means_count: number
    median_hours_to_action?: number
    median_hours_to_action_trusted_flagger?: number
    complaints_by_submitter: { notifier: number; poster: number; reviewer: number }
    complaints_by_decision_type: {
      restrict: ComplaintBucket
      no_action: ComplaintBucket
      no_action_trusted_flagger: ComplaintBucket
    }
  }
}

const periodStart = '2026-01-01T00:00:00.000Z'
const periodEnd = '2026-02-01T00:00:00.000Z'
const endpoint = '/api/v1/copyright-eu-reports'

export const COPYRIGHT_EU_REPORT_DECLARATIONS = [
  defineWebApiFixture<EuTransparencyReportResponse>()(
    'web.copyright.eu.transparency-report',
    webCopyrightEuTransparencyReport,
    context =>
      context.rawServer.get<EuTransparencyReportResponse>(endpoint, {
        searchParams: { period_start: periodStart, period_end: periodEnd },
      }),
  ),
  defineWebApiFixture<string>()(
    'web.copyright.eu.transparency-report-csv',
    webCopyrightEuTransparencyReportCsv,
    context =>
      context.rawServer.get<string>(endpoint, {
        searchParams: {
          format: 'csv_notices',
          period_start: periodStart,
          period_end: periodEnd,
        },
      }),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
