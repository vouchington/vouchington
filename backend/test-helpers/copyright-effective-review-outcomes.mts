import { expect } from 'vitest'
import type { readEffectiveReviewState } from './copyright-effective-review-state.mts'

type State = Awaited<ReturnType<typeof readEffectiveReviewState>>
export const effectiveReviewConflict = {
  status: 'rejected',
  statusCode: 409,
  code: 'CONFLICT',
  message: 'Conflicting copyright case change',
  causeCode: '40001',
}

/** A complete expected one-TX review, including account threshold reopening and retained provenance. */
export function expectedEffectiveReview(
  before: State,
  input: {
    noticeId: string
    restrictionId: string
    targetId: string
    revision: number
    action: 'confirm' | 'reverse'
    moderatorId: string
    posterId: string
    kind: 'human' | 'appeal'
    submissionId?: string
    reviewId?: string
    incidentUpdates: Record<string, boolean | null>
    ownerTargets: Record<string, string[]>
    staydown: boolean
  },
) {
  const restriction = before.state.restrictions.find(row => row.id === input.restrictionId)!
  const firstReview = restriction.review === null
  const posterLive = before.accounts.find(row => row.id === input.posterId)!.live
  const accounts = before.accounts.map(account => {
    const change = input.incidentUpdates[account.id]
    if (change === undefined || change === null) return account
    const existing = account.incidents.some(row => row.notice === input.noticeId)
    const incidents = existing
      ? account.incidents.map(row =>
          row.notice === input.noticeId ? { ...row, operative: change } : row,
        )
      : [
          ...account.incidents,
          { notice: input.noticeId, operative: change, disposition: null },
        ].toSorted((a, b) => a.notice.localeCompare(b.notice))
    const opens =
      account.live &&
      incidents.filter(row => row.operative).length >= 2 &&
      account.open.length === 0
    return {
      ...account,
      incidents,
      open: opens ? [expect.any(String)] : account.open,
      reviews: opens ? [...account.reviews, null] : account.reviews,
    }
  })
  const provenance = [...before.provenance]
  for (const account of accounts) {
    if (!account.live || !account.incidents.some(row => row.notice === input.noticeId)) continue
    for (const target of input.ownerTargets[account.id] ?? []) {
      if (!provenance.some(row => row.account === account.id && row.target === target))
        provenance.push({ account: account.id, target })
    }
  }
  const orderedProvenance = provenance.toSorted(
    (a, b) => a.account.localeCompare(b.account) || a.target.localeCompare(b.target),
  )
  const reverse = input.action === 'reverse'
  const hasRestore = before.state.actions.some(
    row => row.action === 'restore' && row.restriction === input.restrictionId,
  )
  const events = [
    ...before.state.events,
    input.kind === 'appeal' ? 'appeal_reviewed' : 'mandatory_human_review_completed',
  ]
  if (reverse) events.push('reversal_restoration_intent_created')
  const notices = input.kind === 'human' || firstReview
  const deliveries = [...before.state.deliveries]
  if (input.kind === 'appeal') deliveries.push(`status_update:in_app:${input.posterId}`)
  if (notices && posterLive)
    deliveries.push(
      `poster_review_notice:email:${input.posterId}`,
      `poster_review_notice:in_app:${input.posterId}`,
    )
  const alreadyReversed = before.misuse.some(row => row.restriction === input.restrictionId)
  return {
    ...before,
    accounts,
    provenance: orderedProvenance,
    appeals:
      input.kind === 'appeal'
        ? [
            ...before.appeals,
            {
              id: input.reviewId,
              submission: input.submissionId,
              restriction: input.restrictionId,
              action: input.action,
              reviewer: input.moderatorId,
            },
          ]
        : before.appeals,
    misuse:
      reverse && !alreadyReversed
        ? [
            ...before.misuse,
            { restriction: input.restrictionId, outcome: 'restriction_reversed_by_appeal' },
          ].toSorted((a, b) => a.restriction.localeCompare(b.restriction))
        : before.misuse,
    state: {
      ...before.state,
      restrictions: before.state.restrictions.map(row =>
        row.id === input.restrictionId && firstReview
          ? { ...row, review: input.action, reviewer: input.moderatorId }
          : row,
      ),
      actions:
        reverse && !hasRestore
          ? [
              ...before.state.actions,
              {
                id: expect.any(String),
                restriction: input.restrictionId,
                deadline: null,
                revision: input.revision,
                action: 'restore',
                state: 'pending',
              },
            ]
          : before.state.actions,
      events: events.toSorted(),
      deliveries: deliveries.toSorted(),
      correspondence: [
        ...before.state.correspondence,
        ...Array<string>(notices ? (posterLive ? 2 : 1) : 0).fill('decision_notice'),
      ].toSorted(),
      incidents: accounts.reduce(
        (sum, account) =>
          sum + account.incidents.filter(row => row.notice === input.noticeId).length,
        0,
      ),
      staydown: input.staydown
        ? before.state.staydown + (reverse ? -1 : firstReview && !alreadyReversed ? 1 : 0)
        : before.state.staydown,
    },
  }
}
