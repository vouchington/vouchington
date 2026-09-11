import { pathToFileURL } from 'node:url'

import {
  formatDiagnosticReportSummaries as formatPublishedDiagnosticReportSummaries,
  readDiagnosticReportSummaries as readPublishedDiagnosticReportSummaries,
  summarizeDiagnosticReport,
  type DiagnosticReportLimitOptions,
  type DiagnosticReportSummary,
} from 'vouchington-tooling/vitest-diagnostics'

export {
  summarizeDiagnosticReport,
  type DiagnosticReportLimitOptions,
  type DiagnosticReportSummary,
}

export function formatDiagnosticReportSummaries(summaries: DiagnosticReportSummary[]): string {
  return formatPublishedDiagnosticReportSummaries(summaries)
    .replace('[vitest-diagnostics]', '[vitest-diagnostic-report-summary]')
    .replace('reports provided:', 'reports found:')
}

export const diagnosticReportDirectory =
  process.env.VITEST_FORK_DIAGNOSTIC_DIR ?? '.vitest-reports/fork-diagnostics'

export function readDiagnosticReportSummaries(
  directory: string = diagnosticReportDirectory,
  options: DiagnosticReportLimitOptions = {},
): DiagnosticReportSummary[] {
  return readPublishedDiagnosticReportSummaries(directory, options)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(formatDiagnosticReportSummaries(readDiagnosticReportSummaries()))
}
