import { describe, expect, it } from 'vitest'

import { VALID_PLAN_BODY } from '../../test-helpers/plan-issue/valid-plan-body.mts'
import { validatePlanIssue } from '../validate.mts'

describe('Plan issue review regressions', () => {
  it.each([
    'VITEST_STORYBOOK_BROWSER=1 pnpm exec vitest run --project web-storybook-browser',
    'cd backend && pnpm run typecheck',
    '(cd backend && pnpm run typecheck)',
  ])('accepts a repository-native verification command: %s', command => {
    const body = VALID_PLAN_BODY.replace(
      '`pnpm exec vitest run --project dev-tools`',
      `\`${command}\``,
    )
    expect(validatePlanIssue('Plan: native verification', body)).toEqual([])
  })

  it('does not treat a bare executable name as a verification command', () => {
    const body = VALID_PLAN_BODY.replace('`pnpm exec vitest run --project dev-tools`', '`node`')
    expect(validatePlanIssue('Plan: native verification', body).join('\n')).toContain(
      'code-formatted command',
    )
  })

  it('compares the repository identity of qualified issue references', () => {
    const body = VALID_PLAN_BODY.replace('#7390', 'owner/one#7390').replace(
      'jonathanong/filaments/issues/7390',
      'owner/two/issues/7390',
    )
    expect(validatePlanIssue('Plan: qualified source', body).join('\n')).toContain('same issues')
  })

  it('accepts a qualified issue reference with the same repository source', () => {
    const body = VALID_PLAN_BODY.replace('#7390', 'owner/one#7390').replace(
      'jonathanong/filaments/issues/7390',
      'owner/one/issues/7390',
    )
    expect(validatePlanIssue('Plan: qualified source', body)).toEqual([])
  })

  it('binds an unqualified issue reference to the explicit target repository', () => {
    const body = VALID_PLAN_BODY.replace(
      'jonathanong/filaments/issues/7390',
      'owner/two/issues/7390',
    )
    expect(validatePlanIssue('Plan: target source', body, 'owner/one').join('\n')).toContain(
      'same issues',
    )
  })

  it('rejects a source issue URL with a path suffix', () => {
    const body = VALID_PLAN_BODY.replace('/issues/7390', '/issues/7390/not-an-issue')
    expect(validatePlanIssue('Plan: source identity', body).join('\n')).toContain(
      'full GitHub source URL',
    )
  })

  it('accepts a source issue URL with a query string', () => {
    const body = VALID_PLAN_BODY.replace('/issues/7390', '/issues/7390?source=planning')
    expect(validatePlanIssue('Plan: source identity', body)).toEqual([])
  })

  it.each([
    [
      'available placeholder surface',
      '- Status: `available`\n- Surface: TBD\n- Evidence: opened the route.',
    ],
    [
      'available placeholder evidence',
      '- Status: `available`\n- Surface: browser route\n- Evidence: none',
    ],
    ['exception placeholder reason', '- Status: `exception`\n- Reason: TODO'],
  ])('rejects %s', (_case, fields) => {
    const body = VALID_PLAN_BODY.replace('- Status: `not-required`', fields)
    expect(validatePlanIssue('Plan: browser evidence', body)).not.toEqual([])
  })

  it.each([
    ['not-required with reason', '- Status: `not-required`\n- Reason: no browser is available.'],
    [
      'available with exception reason',
      '- Status: `available`\n- Surface: route\n- Evidence: opened.\n- Reason: fallback.',
    ],
    [
      'exception with available evidence',
      '- Status: `exception`\n- Reason: browser unavailable.\n- Surface: route',
    ],
  ])('rejects contradictory live-browser fields for %s', (_case, fields) => {
    const body = VALID_PLAN_BODY.replace('- Status: `not-required`', fields)
    expect(validatePlanIssue('Plan: browser evidence', body)).not.toEqual([])
  })

  it('rejects filler in a duplicate required field', () => {
    const body = VALID_PLAN_BODY.replace(
      '- Goal: complete plans.',
      '- Goal: complete plans.\n- Goal: TODO',
    )
    expect(validatePlanIssue('Plan: duplicate field', body).join('\n')).toContain(
      'Why must include',
    )
  })

  it('rejects a standalone filler paragraph beside completed evidence', () => {
    const body = VALID_PLAN_BODY.replace(
      '\n\n## Alternatives analysis',
      '\n\nTODO\n\n## Alternatives analysis',
    )
    expect(validatePlanIssue('Plan: standalone filler', body).join('\n')).toContain(
      '"## KPIs" section requires visible, structured evidence',
    )
  })

  it.each([
    ['Accepted because it centralizes planning', 'Chosen or rejected because …'],
    ['No change', 'No change: …'],
  ])('rejects embedded alternative placeholder %s', (existing, placeholder) => {
    const body = VALID_PLAN_BODY.replace(existing, placeholder)
    expect(validatePlanIssue('Plan: alternative evidence', body).join('\n')).toContain(
      'Alternatives analysis',
    )
  })

  it('rejects ASCII ellipsis placeholders in required table cells', () => {
    const body = VALID_PLAN_BODY.replace('| Compliance | 100% | validator |', '| ... | ... | ... |')
    expect(validatePlanIssue('Plan: table evidence', body).join('\n')).toContain('KPIs')
  })

  it('rejects a placeholder table beside a completed table', () => {
    const body = VALID_PLAN_BODY.replace(
      '\n\n## Alternatives analysis',
      '\n\n| KPI | Target | Measurement |\n| --- | --- | --- |\n| … | … | … |\n\n## Alternatives analysis',
    )
    expect(validatePlanIssue('Plan: table evidence', body).join('\n')).toContain('KPIs')
  })

  it.each([
    ['unrelated columns', '| Concern | Before | After |', '| Component | Current | Planned |'],
    ['empty comparison cells', '| Schema | partial | complete |', '| Schema | | |'],
  ])('rejects a before-and-after table with %s', (_case, current, replacement) => {
    const body = VALID_PLAN_BODY.replace(current, replacement)
    expect(validatePlanIssue('Plan: comparison evidence', body).join('\n')).toContain(
      'Before and after requires',
    )
  })

  it('rejects an empty Mermaid fence in before-and-after evidence', () => {
    const body = VALID_PLAN_BODY.replace('flowchart LR\n  Before --> After', '')
    expect(validatePlanIssue('Plan: comparison evidence', body).join('\n')).toContain(
      'Before and after requires',
    )
  })

  it('defers nonempty Mermaid syntax to the asynchronous parser', () => {
    const body = VALID_PLAN_BODY.replace('flowchart LR\n  Before --> After', 'not a diagram')
    expect(validatePlanIssue('Plan: comparison evidence', body)).toEqual([])
  })

  it('accepts a spaced uppercase Mermaid info string', () => {
    const body = VALID_PLAN_BODY.replace('```mermaid', '``` MERMAID')
    expect(validatePlanIssue('Plan: Mermaid syntax', body)).toEqual([])
  })

  it('accepts a nonempty Mermaid fence beginning with a comment', () => {
    const body = VALID_PLAN_BODY.replace('flowchart LR', '%% explain the flow\nflowchart LR')
    expect(validatePlanIssue('Plan: Mermaid comments', body)).toEqual([])
  })

  it('rejects a non-applicability reason mixed with comparison artifacts', () => {
    const body = VALID_PLAN_BODY.replace(
      '\n\n## Implementation plan',
      '\n\nNot applicable: this change has no useful visual flow.\n\n## Implementation plan',
    )
    expect(validatePlanIssue('Plan: comparison evidence', body).join('\n')).toContain(
      'Before and after requires',
    )
  })

  it.each([
    'Not applicable: <specific reason no existing test can be affected>.',
    'Not applicable: TODO later',
  ])('rejects placeholder non-applicability evidence: %s', evidence => {
    const body = VALID_PLAN_BODY.replace(
      /## Affected tests[\s\S]*?\n\n## New tests and scenarios/,
      `## Affected tests\n\n${evidence}\n\n## New tests and scenarios`,
    )
    expect(validatePlanIssue('Plan: non-applicability', body).join('\n')).toContain(
      'Affected tests',
    )
  })

  it('rejects a non-applicability reason mixed with an optional evidence table', () => {
    const body = VALID_PLAN_BODY.replace(
      '\n\n## New tests and scenarios',
      '\n\nNot applicable: no existing test can be affected.\n\n## New tests and scenarios',
    )
    expect(validatePlanIssue('Plan: non-applicability', body).join('\n')).toContain(
      'must remove its table',
    )
  })

  it('rejects a placeholder non-applicability branch beside a valid table', () => {
    const body = VALID_PLAN_BODY.replace(
      '\n\n## New tests and scenarios',
      '\n\nNot applicable: <specific reason no existing test can be affected>.\n\n## New tests and scenarios',
    )
    expect(validatePlanIssue('Plan: non-applicability', body).join('\n')).toContain(
      'invalid "Not applicable:" reason',
    )
  })

  it('stops H2 evidence at an intervening H1', () => {
    const body = VALID_PLAN_BODY.replace(
      '## Live browser preflight\n- Status: `not-required`',
      '## Live browser preflight\n\n# Appendix\n\n- Status: `not-required`',
    )
    expect(validatePlanIssue('Plan: section boundary', body).join('\n')).toContain(
      'Live browser preflight Status',
    )
  })

  it('accepts a justified absence in a required table cell', () => {
    const body = VALID_PLAN_BODY.replace(
      '| dev/plan-issue | Existing | Validate | parser | CLI |',
      '| dev/plan-issue | Existing | Validate | None because it is standalone | CLI |',
    )
    expect(validatePlanIssue('Plan: justified absence', body)).toEqual([])
  })

  it('requires no-change, reuse, and materially different alternatives', () => {
    const body = VALID_PLAN_BODY.replace(
      '| Reuse existing workflow | Familiar entry point | Keeps scattered ownership | Rejected because one skill should own planning |\n',
      '',
    )
    expect(validatePlanIssue('Plan: alternatives', body).join('\n')).toContain(
      'No change, Reuse, and Materially different',
    )
  })

  it.each(['pending', 'undecided', 'accepted', 'accepted because TODO', 'rejected: TBD'])(
    'rejects an unresolved planning disposition: %s',
    disposition => {
      const body = VALID_PLAN_BODY.replace(
        'accepted because it prevents filler evidence.',
        disposition,
      )
      expect(validatePlanIssue('Plan: review disposition', body).join('\n')).toContain(
        'accepted or rejected with a reason',
      )
    },
  )

  it('requires one disposition for every planning-review finding', () => {
    const body = VALID_PLAN_BODY.replace(
      '- Disposition: accepted because it prevents filler evidence.',
      '- Disposition: accepted because it prevents filler evidence.\n- Finding: another unresolved concern.',
    )
    expect(validatePlanIssue('Plan: review pairing', body).join('\n')).toContain(
      'one Disposition for every Finding',
    )
  })

  it('rejects placeholder implementation steps even with nearby prose', () => {
    const body = VALID_PLAN_BODY.replace('1. Validate schema.', 'Context is recorded.\n\n1. TODO')
    expect(validatePlanIssue('Plan: implementation', body).join('\n')).toContain(
      'without placeholders',
    )
  })

  it.each(['pnpm exec vitest run --project <project> <test-file>', 'pnpm TODO'])(
    'rejects a placeholder verification command: %s',
    command => {
      const body = VALID_PLAN_BODY.replace(
        '`pnpm exec vitest run --project dev-tools`',
        `\`${command}\``,
      )
      expect(validatePlanIssue('Plan: verification', body).join('\n')).toContain(
        'code-formatted command',
      )
    },
  )

  it.each(['# pnpm test', 'Run pnpm test'])(
    'rejects code-formatted prose that merely mentions a command: %s',
    command => {
      const body = VALID_PLAN_BODY.replace(
        '`pnpm exec vitest run --project dev-tools`',
        `\`${command}\``,
      )
      expect(validatePlanIssue('Plan: verification', body).join('\n')).toContain(
        'code-formatted command',
      )
    },
  )
})
