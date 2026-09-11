import { describe, expect, it } from 'vitest'

import {
  advisoryGateSummaryLines,
  resolveAdvisoryExitCode,
} from './coverage-local-affected-output.mts'

describe('advisoryGateSummaryLines', () => {
  it('notes the advisory default and the --strict escape hatch when everything was verified', () => {
    const lines = advisoryGateSummaryLines({ notVerified: [] })

    expect(lines.some(line => line.includes('Advisory mode (default)'))).toBe(true)
    expect(lines.some(line => line.includes('--strict'))).toBe(true)
    expect(lines.some(line => line.includes('not verified locally'))).toBe(false)
  })

  it('calls out how many changed files were not verified locally', () => {
    const lines = advisoryGateSummaryLines({ notVerified: ['web/app/page.tsx', 'web/lib/foo.ts'] })

    expect(
      lines.some(line => line.includes('2 changed file(s)') && line.includes('advisory only')),
    ).toBe(true)
  })
})

describe('resolveAdvisoryExitCode', () => {
  it('does not let notVerified mask a real gate failure outside --strict', () => {
    expect(
      resolveAdvisoryExitCode({ strict: false, blockingStatus: 2, notVerified: ['web/foo.tsx'] }),
    ).toBe(2)
  })

  it('never blocks a plain coverage shortfall outside --strict, even when files were not verified', () => {
    expect(
      resolveAdvisoryExitCode({ strict: false, blockingStatus: 0, notVerified: ['web/foo.tsx'] }),
    ).toBe(0)
  })

  it('passes a real gate failure through unchanged outside --strict', () => {
    expect(resolveAdvisoryExitCode({ strict: false, blockingStatus: 2, notVerified: [] })).toBe(2)
  })

  it('blocks in --strict mode when a rule shortfall is present', () => {
    expect(resolveAdvisoryExitCode({ strict: true, blockingStatus: 2, notVerified: [] })).toBe(2)
  })

  it('blocks in --strict mode when files were not verified even with a clean gate', () => {
    expect(
      resolveAdvisoryExitCode({ strict: true, blockingStatus: 0, notVerified: ['web/foo.tsx'] }),
    ).toBe(1)
  })

  it('stays clean in --strict mode when the gate passed and everything was verified', () => {
    expect(resolveAdvisoryExitCode({ strict: true, blockingStatus: 0, notVerified: [] })).toBe(0)
  })
})
