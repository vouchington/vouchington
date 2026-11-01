import { describe, expect, it } from 'vitest'

import {
  DEPRECATED_INVOCATIONS,
  prShepherdGuidanceViolations,
  REVISIT_FOLLOWUPS_SKILL,
  TRUSTED_HOST_SHEPHERD_PROMPT,
  WORKSPACE_JOURNAL_EXTRACT_COMMAND,
} from '../../ci/pr-shepherd-guidance-policy.mts'

// #7180: a global pr-shepherd shadowed the workspace install on PATH. Command behavior,
// exit codes, and routing belong to pr-shepherd's own tests. The live tree is checked
// by ci/check-pr-shepherd-guidance.mts in static CI.

const currentGuidance = [
  {
    path: REVISIT_FOLLOWUPS_SKILL,
    text: `Run ${WORKSPACE_JOURNAL_EXTRACT_COMMAND} when the journal is the source.`,
  },
  { path: 'docs/example.md', text: 'Use pnpm exec pr-shepherd stack 42 --until-terminal.' },
]

describe('pr-shepherd guidance', () => {
  it('accepts current v1 commands and rejects retired ones', () => {
    expect(
      DEPRECATED_INVOCATIONS.test('pnpm exec pr-shepherd journal extract --body-file body.md'),
    ).toBe(false)
    expect(DEPRECATED_INVOCATIONS.test('pnpm exec pr-shepherd journal extraction body.md')).toBe(
      true,
    )
    expect(DEPRECATED_INVOCATIONS.test('pnpm exec pr-shepherd journal extract-old body.md')).toBe(
      true,
    )
    expect(DEPRECATED_INVOCATIONS.test("pnpm exec pr-shepherd journal 42 '- note'")).toBe(true)
    expect(DEPRECATED_INVOCATIONS.test('pnpm exec pr-shepherd --stack 42 --until-terminal')).toBe(
      true,
    )
    expect(DEPRECATED_INVOCATIONS.test('pnpm exec pr-shepherd stack 42 --until-terminal')).toBe(
      false,
    )
    expect(DEPRECATED_INVOCATIONS.test('pnpm exec pr-shepherd build-suggestion-patches')).toBe(true)
    expect(DEPRECATED_INVOCATIONS.test('On `FIX_CODE`, finish')).toBe(true)
    expect(DEPRECATED_INVOCATIONS.test('./dev/rebase-onto-main --stack')).toBe(false)
  })

  it('reports guidance violations from the supplied files', () => {
    expect(prShepherdGuidanceViolations(currentGuidance)).toEqual([])
    expect(prShepherdGuidanceViolations([])).toEqual([
      `${REVISIT_FOLLOWUPS_SKILL}: missing workspace journal extract command`,
    ])
    expect(
      prShepherdGuidanceViolations([
        { path: REVISIT_FOLLOWUPS_SKILL, text: 'pnpm exec pr-shepherd journal 42' },
      ]),
    ).toEqual([
      `${REVISIT_FOLLOWUPS_SKILL}: missing workspace journal extract command`,
      `${REVISIT_FOLLOWUPS_SKILL}: deprecated pr-shepherd invocation`,
    ])
    expect(
      prShepherdGuidanceViolations([
        ...currentGuidance,
        { path: 'docs/example.md', text: 'Run `pr-shepherd iterate 42` from a checkout.' },
      ]),
    ).toEqual(['docs/example.md: bare local pr-shepherd command'])
    expect(
      prShepherdGuidanceViolations([
        ...currentGuidance,
        {
          path: TRUSTED_HOST_SHEPHERD_PROMPT,
          text: 'The host may document `pr-shepherd iterate 42`.',
        },
      ]),
    ).toEqual([])
  })
})
