import { describe, expect, it } from 'vitest'

import {
  DEPRECATED_INVOCATIONS,
  prShepherdGuidanceViolations,
} from '../../ci/pr-shepherd-guidance-policy.mts'

// pr-shepherd is a per-machine CLI, not a repo dependency. Command behavior,
// exit codes, and routing belong to pr-shepherd's own tests. The live tree is checked
// by ci/check-pr-shepherd-guidance.mts in static CI.

const currentGuidance = [
  { path: 'docs/example.md', text: 'Use pr-shepherd stack 42 --until-terminal.' },
]

describe('pr-shepherd guidance', () => {
  it('accepts current v1 commands and rejects retired ones', () => {
    expect(DEPRECATED_INVOCATIONS.test('pr-shepherd journal extract --body-file body.md')).toBe(
      false,
    )
    expect(DEPRECATED_INVOCATIONS.test('pr-shepherd journal extraction body.md')).toBe(true)
    expect(DEPRECATED_INVOCATIONS.test('pr-shepherd journal extract-old body.md')).toBe(true)
    expect(DEPRECATED_INVOCATIONS.test("pr-shepherd journal 42 '- note'")).toBe(true)
    expect(DEPRECATED_INVOCATIONS.test('pr-shepherd --stack 42 --until-terminal')).toBe(true)
    expect(DEPRECATED_INVOCATIONS.test('pr-shepherd stack 42 --until-terminal')).toBe(false)
    expect(DEPRECATED_INVOCATIONS.test('pr-shepherd build-suggestion-patches')).toBe(true)
    expect(DEPRECATED_INVOCATIONS.test('On `FIX_CODE`, finish')).toBe(true)
    expect(DEPRECATED_INVOCATIONS.test('./dev/rebase-onto-main --stack')).toBe(false)
  })

  it('reports guidance violations from the supplied files', () => {
    expect(prShepherdGuidanceViolations(currentGuidance)).toEqual([])
    expect(prShepherdGuidanceViolations([])).toEqual([])
    expect(
      prShepherdGuidanceViolations([{ path: 'docs/old.md', text: 'pr-shepherd journal 42' }]),
    ).toEqual(['docs/old.md: deprecated pr-shepherd invocation'])
    expect(
      prShepherdGuidanceViolations([
        ...currentGuidance,
        { path: 'docs/example.md', text: 'Run `pnpm exec pr-shepherd iterate 42`.' },
        { path: 'docs/other.md', text: 'Run npx --yes pr-shepherd stack 42.' },
      ]),
    ).toEqual([
      'docs/example.md: package-runner pr-shepherd command',
      'docs/other.md: package-runner pr-shepherd command',
    ])
  })
})
