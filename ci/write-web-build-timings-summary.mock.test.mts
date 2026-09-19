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
  it('renders the started timestamp, cache status, and timings JSON', () => {
    const rendered = renderTimingsSummary({
      startedAt: '2026-09-05T00:00:00.000Z',
      nextBuildCache: 'hit',
      timings: { 'next-build': 12_345, total: 20_000 },
    })

    expect(rendered).toContain('## Web build timings (`build-web-targets`)')
    expect(rendered).toContain('- Next.js build cache: hit')
    expect(rendered).toContain('"next-build": 12345')
  })

  it('renders an empty timings block when no steps have completed yet', () => {
    const rendered = renderTimingsSummary({
      startedAt: '2026-09-05T00:00:00.000Z',
      nextBuildCache: 'miss',
      timings: {},
    })

    expect(rendered).toContain('```json')
    expect(rendered).toContain('{}')
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
