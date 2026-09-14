import { VALID_PLAN_BODY } from './valid-plan-body.mts'

export const NO_CHANGE_ERRORS = [
  'Every alternative Decision reason must be resolved with a rationale, with exactly one Chosen or Accepted.',
  'Affected files may be Not applicable only when No change is the chosen alternative.',
]

export function withNoChangeDecision(decision: string): string {
  return VALID_PLAN_BODY.replace(
    /## Affected files and modules[\s\S]*?\n## Before and after/,
    '## Affected files and modules\n\nNot applicable: no repository files change because the current behavior already satisfies the goal.\n\n## Before and after',
  )
    .replace('Rejected because the contract is missing', decision)
    .replace(
      'Accepted because it centralizes planning',
      'Rejected because no implementation is necessary',
    )
}
