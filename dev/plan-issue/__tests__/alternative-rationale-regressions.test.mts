import { describe, expect, it } from 'vitest'

import { NO_CHANGE_ERRORS, withNoChangeDecision } from '../test-helpers/no-change-plan.mts'
import { VALID_PLAN_BODY } from '../test-helpers/valid-plan-body.mts'
import { validatePlanIssue } from '../validate.mts'

describe('Alternative rationale regressions', () => {
  it.each([
    ['is awaiting', 'Accepted, because the decision is TBD awaiting stakeholder review'],
    ['remains until', 'Accepted, because the decision remains TODO until the owner responds'],
  ])('rejects singular unresolved subject rationale %s', (_case, decision) => {
    expect(validatePlanIssue('Plan: unresolved subject', withNoChangeDecision(decision))).toEqual(
      NO_CHANGE_ERRORS,
    )
  })

  it.each([
    ['awaiting', 'Accepted, because TBD awaiting stakeholder review'],
    ['until', 'Accepted, because TODO until the owner responds'],
  ])('rejects bare unresolved marker continuation %s', (_case, decision) => {
    expect(
      validatePlanIssue('Plan: unresolved continuation', withNoChangeDecision(decision)),
    ).toEqual(NO_CHANGE_ERRORS)
  })

  it('rejects a conjunction-separated unresolved marker continuation', () => {
    const body = withNoChangeDecision(
      'Accepted, because the decision is TBD and awaiting stakeholder review',
    )
    expect(validatePlanIssue('Plan: conjunction unresolved continuation', body)).toEqual(
      NO_CHANGE_ERRORS,
    )
  })

  it.each([
    ['parenthesized pending', 'Accepted, because the decision is TBD (pending stakeholder review)'],
    ['bracketed Awaiting', 'Accepted, because the decision is TODO [Awaiting owner approval]'],
    ['braced Pending', 'Accepted, because the decision is TBD {Pending stakeholder review}'],
  ])('rejects an unresolved marker followed by %s', (_case, decision) => {
    expect(
      validatePlanIssue(
        'Plan: opening-wrapped unresolved continuation',
        withNoChangeDecision(decision),
      ),
    ).toEqual(NO_CHANGE_ERRORS)
  })

  it.each([
    ['pending', 'Accepted, because the decision is `TBD` pending stakeholder review'],
    ['and Awaiting', 'Accepted, because the decision is `TODO` and Awaiting stakeholder review'],
  ])('rejects a bare inline-code marker followed by outside %s', (_case, decision) => {
    expect(
      validatePlanIssue(
        'Plan: inline-code unresolved continuation',
        withNoChangeDecision(decision),
      ),
    ).toEqual(NO_CHANGE_ERRORS)
  })

  it.each([
    ['parentheses before pending', 'Accepted, because (TBD) pending stakeholder review'],
    ['quotes before awaiting', 'Accepted, because "TBD" awaiting approval'],
    ['brackets and comma before until', 'Accepted, because [TODO], until the owner responds'],
    [
      'curly quotes and conjunction before awaiting',
      'Accepted, because “TBD” and Awaiting approval',
    ],
  ])('rejects a wrapped unresolved marker %s', (_case, decision) => {
    expect(
      validatePlanIssue('Plan: wrapped unresolved continuation', withNoChangeDecision(decision)),
    ).toEqual(NO_CHANGE_ERRORS)
  })

  it.each([
    ['straight quotes', 'Accepted, because stakeholder approval is pending "TBD".'],
    ['curly quotes', 'Accepted, because stakeholder approval is pending “TBD”.'],
  ])('rejects unresolved markers in %s', (_case, decision) => {
    expect(
      validatePlanIssue('Plan: quoted unresolved marker', withNoChangeDecision(decision)),
    ).toEqual(NO_CHANGE_ERRORS)
  })

  it('accepts a singular contextual status comparison', () => {
    const body = VALID_PLAN_BODY.replace(
      'Rejected because the contract is missing',
      'Rejected, because the status is TODO or DONE depending on mode',
    )
    expect(validatePlanIssue('Plan: contextual status comparison', body)).toEqual([])
  })

  it('accepts an uppercase literal continuation status', () => {
    const body = VALID_PLAN_BODY.replace(
      'Rejected because the contract is missing',
      'Rejected, because the supported states are TODO and PENDING',
    )
    expect(validatePlanIssue('Plan: uppercase literal continuation status', body)).toEqual([])
  })

  it('accepts a wrapped marker in an uppercase literal comparison', () => {
    const body = VALID_PLAN_BODY.replace(
      'Rejected because the contract is missing',
      'Rejected, because the supported states are "TODO" and PENDING',
    )
    expect(validatePlanIssue('Plan: wrapped uppercase literal comparison', body)).toEqual([])
  })

  it.each([
    'Rejected, because the label is TBD “Pending stakeholder review”',
    'Rejected, because the supported state is TODO (PENDING is a named state)',
  ])('accepts contextual wrapped timing prose %s', decision => {
    const body = VALID_PLAN_BODY.replace('Rejected because the contract is missing', decision)
    expect(validatePlanIssue('Plan: contextual wrapped timing prose', body)).toEqual([])
  })

  it.each([
    ['strong', '**Rejected**, because the contract is missing'],
    ['emphasis', '*Rejected*, because the contract is missing'],
    ['split-word emphasis', 'Re**ject**ed, because the contract is missing'],
    ['link', '[Rejected](https://example.com/TODO-pending), because the contract is missing'],
  ])('accepts a comma-delimited decision with a %s outcome', (_case, decision) => {
    const body = VALID_PLAN_BODY.replace('Rejected because the contract is missing', decision)
    expect(validatePlanIssue('Plan: formatted decision outcome', body)).toEqual([])
  })

  it('rejects an inline-code Accepted outcome from authorizing No-change', () => {
    const body = withNoChangeDecision(
      '`Accepted`, because the current behavior already satisfies the requirement',
    )
    expect(validatePlanIssue('Plan: inline-code accepted outcome', body)).toEqual(NO_CHANGE_ERRORS)
  })

  it.each([
    ['fully inline', '`Rejected`, because the contract is missing'],
    ['partially inline', 'Re`ject`ed, because the contract is missing'],
  ])('rejects a %s Rejected outcome', (_case, decision) => {
    const body = VALID_PLAN_BODY.replace('Rejected because the contract is missing', decision)
    expect(validatePlanIssue('Plan: inline-code rejected outcome', body).join('\n')).toContain(
      'Every alternative Decision reason must be resolved',
    )
  })

  it.each([
    ['prefix marker', 'Accepted, because TBD pending stakeholder review tomorrow'],
    ['embedded marker', 'Accepted, because the decision remains TBD pending stakeholder review'],
    ['delimiter marker', 'Accepted, because TODO: implement after review'],
    ['bare delimiter marker', 'Accepted, because TODO:'],
    ['parenthesized marker', 'Accepted, because the stakeholder decision is pending (TBD).'],
    ['square-bracketed marker', 'Accepted, because stakeholder approval is pending [TBD].'],
    ['comma-pending marker', 'Accepted, because TBD, pending stakeholder review'],
  ])('rejects %s from authorizing no affected files', (_case, decision) => {
    expect(validatePlanIssue('Plan: unresolved no change', withNoChangeDecision(decision))).toEqual(
      NO_CHANGE_ERRORS,
    )
  })

  it.each([
    ['Pending', 'Accepted, because TBD Pending stakeholder review'],
    ['Awaiting', 'Accepted, because TBD Awaiting stakeholder review'],
    ['Until', 'Accepted, because TODO Until the owner responds'],
    ['Later', 'Accepted, because TODO Later after stakeholder review'],
  ])('rejects Title-Case %s after an unresolved marker', (_case, decision) => {
    expect(
      validatePlanIssue('Plan: Title-Case unresolved marker', withNoChangeDecision(decision)),
    ).toEqual(NO_CHANGE_ERRORS)
  })

  it('accepts resolved rationale that discusses a placeholder marker', () => {
    expect(
      validatePlanIssue(
        'Plan: resolved placeholder discussion',
        withNoChangeDecision('Accepted, because this removes the TODO marker from the template'),
      ),
    ).toEqual([])
  })

  it.each([
    ['colon delimiter', 'TODO:'],
    ['semicolon delimiter', 'TBD;'],
    ['em-dash delimiter', 'TODO—'],
    ['spaced-hyphen delimiter', 'TBD -'],
    ['combined timing words', 'TBD pending'],
  ])('accepts resolved rationale that cites inline-code %s syntax', (_case, syntax) => {
    const body = VALID_PLAN_BODY.replace(
      'Rejected because the contract is missing',
      `Rejected, because the validator rejects \`${syntax}\` placeholders`,
    )
    expect(validatePlanIssue('Plan: inline-code placeholder syntax', body)).toEqual([])
  })

  it.each([
    ['combined marker phrase', 'Rejected, because the invalid syntax is `TBD pending`'],
    ['bare marker', 'Rejected, because the unresolved state is `TBD`'],
    ['parenthesized bare marker', 'Rejected, because the unresolved state is (`TBD`)'],
  ])('accepts resolved rationale ending with inline-code %s', (_case, decision) => {
    const body = VALID_PLAN_BODY.replace('Rejected because the contract is missing', decision)
    expect(validatePlanIssue('Plan: terminal inline-code literal', body)).toEqual([])
  })

  it.each([
    ['colon delimiter', 'Rejected, because the decision is `TODO`: implement after review'],
    ['semicolon delimiter', 'Rejected, because the decision is `TBD`; pending owner review'],
    ['spaced hyphen', 'Rejected, because the decision is `TODO` - implement after review'],
  ])('rejects a bare inline-code marker with an outside %s', (_case, decision) => {
    const body = VALID_PLAN_BODY.replace('Rejected because the contract is missing', decision)
    expect(validatePlanIssue('Plan: active inline-code suffix', body).join('\n')).toContain(
      'Every alternative Decision reason must be resolved',
    )
  })

  it.each([
    ['parentheses and colon', 'Accepted, because the decision is (`TBD`): implement after review'],
    [
      'curly quotes and colon',
      'Accepted, because the decision is “`TODO`”: implement after review',
    ],
    ['brackets and semicolon', 'Accepted, because the decision is [`TBD`]; implement after review'],
  ])('rejects a bare inline-code marker with outside %s', (_case, decision) => {
    expect(
      validatePlanIssue('Plan: wrapped active inline-code suffix', withNoChangeDecision(decision)),
    ).toEqual(NO_CHANGE_ERRORS)
  })

  it('rejects the same delimiter marker when it is active unformatted prose', () => {
    const body = VALID_PLAN_BODY.replace(
      'Rejected because the contract is missing',
      'Rejected, because the validator rejects TODO: placeholders',
    )
    expect(validatePlanIssue('Plan: active unformatted placeholder', body).join('\n')).toContain(
      'Every alternative Decision reason must be resolved',
    )
  })

  it.each([
    ['status marker', 'status is TBD'],
    ['pending marker', 'TBD pending stakeholder review'],
    ['trailing marker', 'implementation is blocked TODO later'],
    ['bare marker', 'TBD'],
    ['bare colon delimiter', 'TODO:'],
    ['compact colon delimiter', 'TODO:implement'],
    ['compact semicolon delimiter', 'TBD;pending'],
    ['compact em-dash delimiter', 'TODO—implement'],
    ['bare spaced-hyphen delimiter', 'TBD -'],
    ['compact spaced-hyphen delimiter', 'TBD -pending'],
  ])('rejects alternative rationale with %s', (_case, rationale) => {
    const body = VALID_PLAN_BODY.replace(
      'Rejected because the contract is missing',
      `Rejected, because ${rationale}`,
    )
    expect(validatePlanIssue('Plan: unresolved rationale marker', body).join('\n')).toContain(
      'Every alternative Decision reason must be resolved',
    )
  })

  it.each([
    'the validator is TODO-aware',
    'status is TBD-compatible',
    'the allowed statuses are TODO and DONE',
  ])('accepts contextual alternative rationale %s', rationale => {
    const body = VALID_PLAN_BODY.replace(
      'Rejected because the contract is missing',
      `Rejected, because ${rationale}`,
    )
    expect(validatePlanIssue('Plan: contextual rationale marker', body)).toEqual([])
  })
})
