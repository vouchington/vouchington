import type { ModerationJudgementAction } from './reports-client-types'

export function judgementVariant(
  action: ModerationJudgementAction,
): 'destructive' | 'review' | 'secondary' {
  if (action === 'remove' || action === 'escalate') return 'destructive'
  if (action === 'warn') return 'review'
  return 'secondary'
}

export function judgementLabel(action: ModerationJudgementAction): string {
  if (action === 'no_action') return 'no action'
  return action
}
