import { describe, expect, it } from 'vitest'

import { validatePlanIssue } from '../validate.mts'

const VALID_BODY = `## Solves
- #7390
- Source: https://github.com/vouchington/vouchington/issues/7390

## Why
- Goal: keep plans complete.
- Root cause: scattered rules.
- Chosen fix: validate one schema.

## KPIs
| KPI | Target | Measurement |
| --- | --- | --- |
| Compliance | 100% | validator |

## Alternatives analysis
| Alternative | Benefits | Costs or risks | Decision reason |
| --- | --- | --- | --- |
| No change | No work | Plans remain incomplete | Rejected because the contract is missing |
| Reuse existing workflow | Familiar entry point | Keeps scattered ownership | Rejected because one skill should own planning |
| Materially different skill | Focused contract | Adds one discovery entry point | Accepted because it centralizes planning |

## Affected files and modules
| Path or module | Existing or new | Role and change | Dependencies | Dependents |
| --- | --- | --- | --- | --- |
| dev/plan-issue/validate.mts | Existing | Validate schema | remark | CLI |

## Before and after
\`\`\`mermaid
flowchart LR
  Before --> After
\`\`\`

| Concern | Before | After |
| --- | --- | --- |
| Plans | Ad hoc | Validated |

## Implementation plan
1. Add the schema.

## Affected tests
| Test | Existing or new | Why affected | Behavior to check before implementation |
| --- | --- | --- | --- |
| validate.test.mts | Existing | Parser changes | Current schema behavior |

## New tests and scenarios
| Scenario | Setup | Expected outcome |
| --- | --- | --- |
| Hidden evidence | HTML comment | Rejected |

## Documentation
| Document | Update |
| --- | --- |
| Planning skill | Document the schema |

## Verification steps
- \`pnpm exec vitest run --project dev-tools dev/plan-issue/__tests__/validate.test.mts\`

## Live browser preflight
- Status: \`not-required\`

## Planning review
- Independent exploration: checked current files.
- Independent advisor/reviewer: challenged the no-change option.
- Finding: section presence alone permits weak plans.
- Disposition: accepted with table and field coverage.`

describe('validatePlanIssue', () => {
  it('accepts the complete exact Plan issue schema', () => {
    expect(validatePlanIssue('Plan: harden lifecycle', VALID_BODY)).toEqual([])
  })

  it.each([
    [
      'missing section',
      VALID_BODY.replace(
        '## KPIs\n| KPI | Target | Measurement |\n| --- | --- | --- |\n| Compliance | 100% | validator |\n\n',
        '',
      ),
      'KPIs',
    ],
    [
      'duplicate section',
      VALID_BODY.replace('## Why', '## Why\n- Specific evidence.\n\n## Why'),
      'exactly one',
    ],
    [
      'additional section',
      VALID_BODY.replace('## Why', '## Extra\n- Specific evidence.\n\n## Why'),
      'required order',
    ],
    [
      'reordered section',
      VALID_BODY.replace('## Why', '## Temporary')
        .replace('## KPIs', '## Why')
        .replace('## Temporary', '## KPIs'),
      'required order',
    ],
    [
      'hidden evidence',
      VALID_BODY.replace(
        '| Planning skill | Document the schema |',
        '<!-- | Planning skill | Document the schema | -->',
      ),
      'Documentation',
    ],
    [
      'filler evidence',
      VALID_BODY.replace(
        '| Document | Update |\n| --- | --- |\n| Planning skill | Document the schema |',
        'N/A',
      ),
      'Documentation',
    ],
    ['mismatched source', VALID_BODY.replace('/7390', '/8563'), 'same issue'],
    ['missing command', VALID_BODY.replace(/`pnpm[^`]+`/, 'plain prose'), 'code-formatted command'],
    [
      'missing comparison',
      VALID_BODY.replace(/```mermaid[\s\S]*?\| Plans \| Ad hoc \| Validated \|\n/, ''),
      'Before and after requires',
    ],
  ])('rejects %s', (_name, body, expected) => {
    expect(validatePlanIssue('Plan: harden lifecycle', body).join('\n')).toContain(expected)
  })

  it('allows exactly direct user request as the source', () => {
    const body = VALID_BODY.replace(
      '- #7390\n- Source: https://github.com/vouchington/vouchington/issues/7390',
      '- Direct user request; no prior GitHub issue.',
    )
    expect(validatePlanIssue('Plan: harden lifecycle', body)).toEqual([])
  })

  it.each([
    ['KPIs', '| KPI | Target | Measurement |', '| KPI | Target | Notes |'],
    [
      'Alternatives analysis',
      '| Alternative | Benefits | Costs or risks | Decision reason |',
      '| Alternative | Decision | Why | Notes |',
    ],
    [
      'Affected files and modules',
      '| Path or module | Existing or new | Role and change | Dependencies | Dependents |',
      '| Path | Change | Notes | Owner | Risk |',
    ],
    [
      'Affected tests',
      '| Test | Existing or new | Why affected | Behavior to check before implementation |',
      '| Test | Coverage | Notes | Owner |',
    ],
    [
      'New tests and scenarios',
      '| Scenario | Setup | Expected outcome |',
      '| Scenario | Notes | Result |',
    ],
    ['Documentation', '| Document | Update |', '| File | Notes |'],
  ])('rejects a malformed %s evidence table', (section, current, replacement) => {
    const errors = validatePlanIssue(
      'Plan: harden lifecycle',
      VALID_BODY.replace(current, replacement),
    ).join('\n')
    expect(errors).toContain(section)
  })

  it('rejects required table rows with empty cells', () => {
    const body = VALID_BODY.replace('| Compliance | 100% | validator |', '| Compliance | | |')
    expect(validatePlanIssue('Plan: harden lifecycle', body).join('\n')).toContain('KPIs')
  })

  it.each(['Affected tests', 'New tests and scenarios', 'Documentation', 'Before and after'])(
    'accepts a specific non-applicability reason for %s',
    section => {
      const nextHeading =
        section === 'Before and after'
          ? 'Implementation plan'
          : section === 'Affected tests'
            ? 'New tests and scenarios'
            : section === 'New tests and scenarios'
              ? 'Documentation'
              : 'Verification steps'
      const body = VALID_BODY.replace(
        new RegExp(`## ${section}[\\s\\S]*?\\n\\n## ${nextHeading}`),
        `## ${section}\nNot applicable: this planning-only scenario has no relevant ${section.toLowerCase()} surface.\n\n## ${nextHeading}`,
      )
      expect(validatePlanIssue('Plan: harden lifecycle', body)).toEqual([])
    },
  )

  it('does not mix a nested list item into the live-browser Status value', () => {
    const body = VALID_BODY.replace(
      '- Status: `not-required`',
      '- Status: `not-required`\n  - Detail: no interactive surface exists.',
    )
    expect(validatePlanIssue('Plan: harden lifecycle', body)).toEqual([])
  })

  it.each([
    [
      'available',
      '- Status: `available`\n- Surface: interactive browser\n- Evidence: opened the planned route.',
    ],
    ['exception', '- Status: `exception`\n- Reason: no interactive browser is available.'],
  ])('accepts the %s live-browser status with its evidence', (_status, fields) => {
    expect(
      validatePlanIssue(
        'Plan: harden lifecycle',
        VALID_BODY.replace('- Status: `not-required`', fields),
      ),
    ).toEqual([])
  })

  it.each([
    ['missing', '- Surface: browser'],
    ['duplicate', '- Status: `not-required`\n- Status: `available`'],
    ['unknown', '- Status: `pending`'],
    ['mis-cased', '- Status: `AVAILABLE`\n- Surface: browser\n- Evidence: opened.'],
    ['available without evidence', '- Status: `available`\n- Surface: browser'],
    ['exception without reason', '- Status: `exception`'],
  ])('rejects a %s live-browser status contract', (_case, fields) => {
    expect(
      validatePlanIssue(
        'Plan: harden lifecycle',
        VALID_BODY.replace('- Status: `not-required`', fields),
      ),
    ).not.toEqual([])
  })

  it('ignores live-browser fields inside fences and comments', () => {
    const body = VALID_BODY.replace(
      '- Status: `not-required`',
      '```md\n- Status: `available`\n- Surface: browser\n- Evidence: opened.\n```\n<!-- - Status: `exception` -->',
    )
    expect(validatePlanIssue('Plan: harden lifecycle', body).join('\n')).toContain(
      'Live browser preflight Status',
    )
  })

  it('accepts a fenced verification command', () => {
    const body = VALID_BODY.replace(
      '- `pnpm exec vitest run --project dev-tools dev/plan-issue/__tests__/validate.test.mts`',
      '```sh\npnpm exec vitest run --project dev-tools dev/plan-issue/__tests__/validate.test.mts\n```',
    )
    expect(validatePlanIssue('Plan: harden lifecycle', body)).toEqual([])
  })

  it('requires ordered implementation steps', () => {
    const body = VALID_BODY.replace('1. Add the schema.', '- Add the schema.')
    expect(validatePlanIssue('Plan: harden lifecycle', body).join('\n')).toContain('ordered list')
  })

  it('rejects incomplete planning review evidence', () => {
    const body = VALID_BODY.replace('- Finding: section presence alone permits weak plans.\n', '')
    expect(validatePlanIssue('Plan: harden lifecycle', body).join('\n')).toContain(
      'independent exploration',
    )
  })

  it.each([
    ['Why', '- Root cause: scattered rules.', '- Root cause: N/A'],
    [
      'Planning review',
      '- Disposition: accepted with table and field coverage.',
      '- Disposition: none',
    ],
  ])('rejects filler in a required %s field', (_section, current, replacement) => {
    expect(
      validatePlanIssue('Plan: harden lifecycle', VALID_BODY.replace(current, replacement)).join(
        '\n',
      ),
    ).not.toEqual('')
  })

  it('does not accept block code as labeled field evidence', () => {
    const body = VALID_BODY.replace(
      '- Goal: keep plans complete.',
      '- Goal:\n\n      ```text\n      hidden goal\n      ```',
    )
    expect(validatePlanIssue('Plan: harden lifecycle', body).join('\n')).toContain(
      'Why must include',
    )
  })

  it('requires every Solves reference to have a matching source URL', () => {
    const body = VALID_BODY.replace('- #7390', '- #7390\n- #8563')
    expect(validatePlanIssue('Plan: harden lifecycle', body).join('\n')).toContain('same issues')
  })
})
