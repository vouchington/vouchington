import { describe, expect, it, vi } from 'vitest'
import {
  createDiagnosticsCollector,
  formatDiagnosticsLines,
  writeDiagnostics,
} from './diagnostics.mts'

describe('i18n-extract diagnostics', () => {
  it('records phase durations and counts computed closures', () => {
    const { collector, summary } = createDiagnosticsCollector()
    collector.phase('analyze-project', 12.5)
    collector.closureComputed()
    collector.closureComputed()

    expect(summary()).toEqual({
      phases: { 'analyze-project': 12.5 },
      closureCount: 2,
    })
  })

  it('formats phase and summary lines with the i18n-extract prefix', () => {
    const { collector, summary } = createDiagnosticsCollector()
    collector.phase('discover-routes', 1)
    collector.closureComputed()
    const lines = formatDiagnosticsLines(summary())

    expect(lines[0]).toBe('i18n-extract: phase discover-routes took 1.0ms')
    expect(lines[1]).toBe('i18n-extract: computed closures for 1 route/chrome entries')
    expect(lines[2]).toMatch(/^i18n-extract-summary: /)
    expect(JSON.parse(lines[2].slice('i18n-extract-summary: '.length))).toEqual(summary())
  })

  it('writes each formatted line, newline-terminated, to the given stream only', () => {
    const { collector, summary } = createDiagnosticsCollector()
    collector.phase('total', 2)
    const write = vi.fn<(chunk: string) => void>()

    writeDiagnostics(summary(), { write })

    expect(write).toHaveBeenCalledTimes(formatDiagnosticsLines(summary()).length)
    for (const [chunk] of write.mock.calls) expect(chunk).toMatch(/\n$/)
  })
})
