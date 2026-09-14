import { describe, expect, it } from 'vitest'

import { VALID_PLAN_BODY } from '../../test-helpers/plan-issue/valid-plan-body.mts'
import { validatePlanIssue } from '../validate.mts'

function replaceAffectedFiles(body: string, evidence: string): string {
  return body.replace(
    /## Affected files and modules[\s\S]*?\n## Before and after/,
    `## Affected files and modules\n\n${evidence}\n\n## Before and after`,
  )
}

describe('Plan table evidence regressions', () => {
  it.each(['Pending until the prototype is complete', 'Rejected'])(
    'rejects unresolved alternative decision %s',
    decision => {
      const body = VALID_PLAN_BODY.replace('Accepted because it centralizes planning', decision)
      expect(validatePlanIssue('Plan: resolved alternatives', body).join('\n')).toContain(
        'Every alternative Decision reason must be resolved',
      )
    },
  )

  it('rejects more than one chosen alternative', () => {
    const body = VALID_PLAN_BODY.replace(
      'Rejected because the contract is missing',
      'Chosen because no change is cheaper',
    )
    expect(validatePlanIssue('Plan: one decision', body).join('\n')).toContain(
      'exactly one Chosen or Accepted',
    )
  })

  it.each([
    [
      'affected files',
      '| dev/plan-issue | Existing |',
      '| dev/plan-issue | Existing/New undecided |',
    ],
    ['affected tests', '| validate | Existing |', '| validate | Proposed? |'],
  ])('rejects an invalid Existing/New classification for %s', (_case, current, invalid) => {
    const body = VALID_PLAN_BODY.replace(current, invalid)
    expect(validatePlanIssue('Plan: impact classification', body).join('\n')).toContain(
      'classify every row as Existing or New',
    )
  })

  it('accepts specific Existing/New qualifiers', () => {
    const body = VALID_PLAN_BODY.replace(
      '| dev/plan-issue | Existing |',
      '| dev/plan-issue | Existing (generated) |',
    ).replace('| validate | Existing |', '| validate | New: added |')
    expect(validatePlanIssue('Plan: impact classification', body)).toEqual([])
  })

  it('rejects a justified absence in an affected path identity', () => {
    const body = VALID_PLAN_BODY.replace(
      '| dev/plan-issue | Existing |',
      '| None because paths are not known yet | Existing |',
    )
    expect(validatePlanIssue('Plan: affected path', body).join('\n')).toContain(
      'Affected files and modules must include a table',
    )
  })

  it('rejects a comma-justified absence in an affected path identity', () => {
    const body = VALID_PLAN_BODY.replace(
      '| dev/plan-issue | Existing |',
      '| None, because paths are not known yet | Existing |',
    )
    expect(validatePlanIssue('Plan: affected path', body).join('\n')).toContain(
      'Affected files and modules must include a table',
    )
  })

  it('accepts a role and change cell whose evidence begins with none', () => {
    const body = VALID_PLAN_BODY.replace(
      '| dev/plan-issue | Existing | Validate | parser | CLI |',
      '| dev/plan-issue | Existing | None of the current callers pass a bare placeholder | parser | CLI |',
    )
    expect(validatePlanIssue('Plan: role and change prose', body)).toEqual([])
  })

  it('accepts an alternative decision reason whose resolved tail begins with none', () => {
    const body = VALID_PLAN_BODY.replace(
      'Rejected because the contract is missing',
      'Rejected because none of the alternatives scale',
    )
    expect(validatePlanIssue('Plan: decision prose', body)).toEqual([])
  })

  it('accepts a comma-delimited alternative decision', () => {
    const body = VALID_PLAN_BODY.replace(
      'Rejected because the contract is missing',
      'Rejected, because none of the alternatives scale',
    )
    expect(validatePlanIssue('Plan: comma-delimited decision', body)).toEqual([])
  })

  it('rejects a comma-delimited alternative decision with meaningless rationale', () => {
    const body = VALID_PLAN_BODY.replace(
      'Rejected because the contract is missing',
      'Rejected, because None',
    )
    expect(validatePlanIssue('Plan: meaningless decision', body).join('\n')).toContain(
      'Every alternative Decision reason must be resolved',
    )
  })

  function withKpiNotes(notes: string): string {
    return VALID_PLAN_BODY.replace(
      '| KPI | Target | Measurement |\n| --- | --- | --- |\n| Compliance | 100% | validator |',
      `| KPI | Target | Measurement | Notes |\n| --- | --- | --- | --- |\n| Compliance | 100% | validator | ${notes} |`,
    )
  }

  it('rejects filler in an additional table column', () => {
    expect(
      validatePlanIssue('Plan: additional evidence', withKpiNotes('TODO')).join('\n'),
    ).toContain('KPIs')
  })

  it('accepts meaningful evidence in an additional table column', () => {
    expect(validatePlanIssue('Plan: additional evidence', withKpiNotes('Measured weekly'))).toEqual(
      [],
    )
  })

  it('rejects no affected files unless No change is chosen', () => {
    const body = replaceAffectedFiles(
      VALID_PLAN_BODY,
      'Not applicable: no repository files change because the selected approach is documentation-free.',
    )
    expect(validatePlanIssue('Plan: no file changes', body).join('\n')).toContain(
      'only when No change is the chosen alternative',
    )
  })

  it('accepts no affected files when No change is chosen', () => {
    const body = replaceAffectedFiles(
      VALID_PLAN_BODY.replace(
        'Rejected because the contract is missing',
        'Accepted, because current behavior is sufficient',
      ).replace(
        'Accepted because it centralizes planning',
        'Rejected because no implementation is necessary',
      ),
      'Not applicable: no repository files change because the current behavior already satisfies the goal.',
    )
    expect(validatePlanIssue('Plan: no change', body)).toEqual([])
  })
})
