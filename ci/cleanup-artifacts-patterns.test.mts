import { describe, expect, it } from 'vitest'
import { createArtifactPatternMatcher } from './cleanup-artifacts-pattern-matcher.mjs'
import { classifyArtifact, isExplicitlyClassified } from './cleanup-artifacts-patterns.mts'

const KEEP_NAMES = [
  'next-static-abc123',
  'browser-port-diagnostics-web',
  // Same category as browser-port-diagnostics-*: best-effort diagnostic evidence for an
  // intermittent CI failure (issue #10937). retention-days: 1 already bounds storage cost, so
  // there is no need to also delete it on the very run whose evidence it is meant to preserve --
  // cleanup-run fires from the terminal *success* fan-in (main-web.yml, main-checks.yml), which
  // would otherwise destroy the healthy-but-slow case Phase 1 exists to capture.
  'web-build-timings-build-web-targets-123-1',
  // Same reasoning as web-build-timings-* above, for issue #51: a flaky test that fails then
  // passes on retry is exactly the case these diagnostics exist to capture, and that retry
  // makes the job -- and therefore the terminal fan-in -- green, so cleanup-run would otherwise
  // delete them on precisely the runs worth diagnosing.
  'playwright-test-results-shard-2',
  'playwright-junit-shard-2',
  'playwright-credentialed-junit',
  'wrangler-logs-2',
]

const DELETE_NAMES = [
  'code-review-payload-abc123',
  'vitest-blob-web',
  'coverage-web',
  'playwright-otel-output-shard-2',
  'playwright-test-plan',
  'storybook-browser-debug-log',
  'web-integration-artifacts',
  'web-integration-shard-2-artifacts',
  'web-test-report-shard-1',
  'explain-analyze-results',
  'gitleaks-report',
  'trivy-backend-abc123',
  'codex-debug',
  'codex-transcript',
  'release-1.2.3',
]

describe('classifyArtifact', () => {
  it.each(KEEP_NAMES)('keeps %s', name => {
    expect(classifyArtifact(name)).toBe('keep')
  })

  it.each(DELETE_NAMES)('deletes %s', name => {
    expect(classifyArtifact(name)).toBe('delete')
  })

  it('retains an unrecognized name', () => {
    expect(classifyArtifact('some-brand-new-artifact')).toBe('keep')
  })
})

describe('isExplicitlyClassified', () => {
  it('explicitly classifies sharded web failure reports', () => {
    expect(isExplicitlyClassified('web-test-report-shard-12')).toBe(true)
    expect(isExplicitlyClassified('web-test-report')).toBe(false)
  })

  it.each([...KEEP_NAMES, ...DELETE_NAMES])('classifies %s explicitly', name => {
    expect(isExplicitlyClassified(name)).toBe(true)
  })

  it('flags an unrecognized name as not explicitly classified', () => {
    expect(isExplicitlyClassified('some-brand-new-artifact')).toBe(false)
  })
})

describe('artifact pattern grammar', () => {
  it('supports exact names and one trailing wildcard only', () => {
    const matches = createArtifactPatternMatcher(['exact-name', 'prefix-*'])

    expect(matches('exact-name')).toBe(true)
    expect(matches('prefix-shard-1')).toBe(true)
    expect(matches('prefix')).toBe(false)
  })

  it.each(['*', '*-suffix', 'prefix-?', 'prefix-[12]', 'prefix-{one,two}', 'prefix-**'])(
    '%s is rejected',
    pattern => {
      expect(() => createArtifactPatternMatcher([pattern])).toThrow('unsupported artifact pattern')
    },
  )
})
