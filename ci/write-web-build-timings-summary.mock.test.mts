import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderTimingsSummary } from './write-web-build-timings-summary.mts'

vi.mock<typeof import('node:fs')>(
  import('node:fs'),
  () =>
    ({
      appendFileSync: vi.fn<typeof import('node:fs').appendFileSync>(),
      existsSync: vi.fn<typeof import('node:fs').existsSync>(() => true),
      readFileSync: vi.fn<typeof import('node:fs').readFileSync>(),
    }) as unknown as typeof import('node:fs'),
)

describe('renderTimingsSummary', () => {
  it('prints the raw host pressure text unescaped inside a collapsible details block', () => {
    const rendered = renderTimingsSummary({
      startedAt: '2026-09-05T00:00:00.000Z',
      nextBuildCache: 'hit',
      hostPressureAtBuildStart: {
        capturedAt: '2026-09-05T00:00:01.000Z',
        ok: true,
        output: 'load average: 4.2\nfree memory: 512MB',
      },
      timings: { 'next-build': 12_345, total: 20_000 },
    })

    expect(rendered).toContain('## Web build timings (`build-web-targets`)')
    expect(rendered).toContain('- Next.js build cache: hit')
    expect(rendered).toContain('"next-build": 12345')
    // The raw, multi-line diagnostic text appears un-escaped (real newlines, not literal `\n`),
    // wrapped in its own collapsible <details> block -- not JSON-escaped onto one line inside the
    // timings fence (issue #10937).
    expect(rendered).toContain('<details>')
    expect(rendered).toContain('load average: 4.2\nfree memory: 512MB')
    expect(rendered).not.toContain('load average: 4.2\\nfree memory: 512MB')
  })

  it('omits the pressure section entirely when no snapshot was captured yet', () => {
    const rendered = renderTimingsSummary({
      startedAt: '2026-09-05T00:00:00.000Z',
      nextBuildCache: 'miss',
      timings: {},
    })

    expect(rendered).not.toContain('<details>')
    expect(rendered).not.toContain('Host pressure snapshot captured')
  })

  it('marks a failed capture without claiming a snapshot was taken', () => {
    const rendered = renderTimingsSummary({
      startedAt: '2026-09-05T00:00:00.000Z',
      nextBuildCache: 'miss',
      hostPressureAtBuildStart: {
        capturedAt: '2026-09-05T00:00:01.000Z',
        ok: false,
        output: 'host-pressure-snapshot: helper missing',
      },
      timings: {},
    })

    expect(rendered).toContain('Host pressure snapshot captured: no')
    expect(rendered).toContain('host-pressure-snapshot: helper missing')
  })

  it('flags a fail-closed lock-acquisition timeout so the next-build duration is not misread as compiler wall time (issue #10937)', () => {
    const rendered = renderTimingsSummary({
      startedAt: '2026-09-05T00:00:00.000Z',
      nextBuildCache: 'miss',
      nextBuildLockAcquisitionFailed: true,
      timings: { 'next-build': 300_000 },
    })

    expect(rendered).toContain('Lock acquisition timed out')
    expect(rendered).toContain('not compiler wall time')
  })

  it('does not mention lock acquisition when it succeeded', () => {
    const rendered = renderTimingsSummary({
      startedAt: '2026-09-05T00:00:00.000Z',
      nextBuildCache: 'hit',
      nextBuildLockAcquisitionFailed: false,
      timings: { 'next-build': 42_000 },
    })

    expect(rendered).not.toContain('Lock acquisition timed out')
  })
})

describe('write-web-build-timings-summary main()', () => {
  const originalArgv = process.argv
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.argv = [...originalArgv.slice(0, 2)]
    process.env = { ...originalEnv }
    delete process.env.GITHUB_STEP_SUMMARY
  })

  afterEach(() => {
    process.argv = originalArgv
    process.env = originalEnv
  })

  it('does nothing when GITHUB_STEP_SUMMARY is unset', async () => {
    const fs = await import('node:fs')
    process.argv = [...process.argv, '/tmp/web-build-timings.json']

    await import('./write-web-build-timings-summary.mts')

    expect(fs.appendFileSync).not.toHaveBeenCalled()
  })

  it('does nothing when the timings file does not exist', async () => {
    const fs = await import('node:fs')
    vi.mocked(fs.existsSync).mockReturnValueOnce(false)
    process.env.GITHUB_STEP_SUMMARY = '/tmp/step-summary.md'
    process.argv = [...process.argv, '/tmp/missing-web-build-timings.json']

    await import('./write-web-build-timings-summary.mts')

    expect(fs.appendFileSync).not.toHaveBeenCalled()
  })

  it('appends the rendered summary to GITHUB_STEP_SUMMARY when the file exists', async () => {
    const fs = await import('node:fs')
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      JSON.stringify({
        startedAt: '2026-09-05T00:00:00.000Z',
        nextBuildCache: 'hit',
        timings: { total: 1000 },
      }),
    )
    process.env.GITHUB_STEP_SUMMARY = '/tmp/step-summary.md'
    process.argv = [...process.argv, '/tmp/web-build-timings.json']

    await import('./write-web-build-timings-summary.mts')

    expect(fs.appendFileSync).toHaveBeenCalledWith(
      '/tmp/step-summary.md',
      expect.stringContaining('## Web build timings (`build-web-targets`)'),
    )
  })
})
