import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { formatDiagnosticReportSummaries } from './vitest-diagnostic-report-summary.mts'

describe('formatDiagnosticReportSummaries', () => {
  it('keeps the worker-exit diagnostic reference aligned with the Vouchington marker', () => {
    const reference = readFileSync(
      'docs/development/reference-vitest-worker-exit-diagnostics.md',
      'utf8',
    )

    expect(reference).toContain('[vitest-diagnostic-report-summary]')
    expect(reference).not.toContain('[vitest-diagnostics]')
  })

  it('carries no forbidden classifier vocabulary (#8940 vocabulary constraint)', () => {
    const output = formatDiagnosticReportSummaries([
      {
        event: 'fatal error',
        file: 'report.json',
        heapLimitMB: '0.0',
        heapTotalMB: '0.0',
        heapUsedMB: '0.0',
        maxRssMB: '0.0',
        threadId: null,
        topNativeFrameModule: null,
        trigger: 'FatalError',
      },
    ])

    expect(output).toContain('[vitest-diagnostic-report-summary]')
    expect(output).not.toMatch(/ FAIL |AssertionError|Test timed out|Error: Test timed out/)
  })

  it('reports zero found with no report lines', () => {
    const output = formatDiagnosticReportSummaries([])

    expect(output).toContain('reports found: 0')
    expect(output).toContain('(none recorded)')
  })
})
