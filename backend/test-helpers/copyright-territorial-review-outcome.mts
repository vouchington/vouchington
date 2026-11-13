import { expect } from 'vitest'
import { recordTerritorialCopyrightRedressDecision } from '../services/copyright-notices/territorial-redress.mts'
import { readTerritorialReviewState } from './copyright-territorial-review-state.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** Complaint decision and every reversal/account/delivery consequence share one transaction. */
export async function assertTerritorialReviewOutcome(input: {
  jurisdiction: 'eu_dsa' | 'uk'
  noticeId: string
  redressId: string
  staff: PrivateUser
  claimantId: string
  posterId: string
  disposition: 'maintain' | 'revoke'
  rationale: string
}) {
  const before = await readTerritorialReviewState(input.jurisdiction, input.noticeId, [
    input.posterId,
  ])
  const [result] = await Promise.allSettled([
    recordTerritorialCopyrightRedressDecision(
      input.staff,
      input.noticeId,
      input.redressId,
      input,
      input.jurisdiction,
    ),
  ])
  const after = await readTerritorialReviewState(input.jurisdiction, input.noticeId, [
    input.posterId,
  ])
  const created = after.history.find(row => row.request === input.redressId)
  const revoke = input.disposition === 'revoke'
  const notices = [
    ...(revoke
      ? [
          ...(input.jurisdiction === 'eu_dsa'
            ? [`claimant_decision_notice:email:${input.claimantId}`]
            : []),
          `claimant_decision_notice:in_app:${input.claimantId}`,
        ]
      : []),
    ...(input.jurisdiction === 'eu_dsa'
      ? [
          `redress_decision_notice:email:${input.claimantId}`,
          `redress_decision_notice:in_app:${input.claimantId}`,
        ]
      : []),
  ]
  const state = {
    ...before,
    clock: { ...before.clock, at: expect.any(Date) },
    identities: [...before.identities, { id: created?.id, request: input.redressId }],
    history: [
      ...before.history,
      {
        id: created?.id,
        request: input.redressId,
        actor: input.staff.id,
        disposition: input.disposition,
        at: expect.any(Date),
        rationale: input.rationale,
      },
    ],
    requests: before.requests.map(row =>
      row.id === input.redressId
        ? {
            ...row,
            current_staff_decision_identity_id: created?.id,
            staff_disposition: input.disposition,
            decided_at: expect.any(Date),
            decided_by_id: input.staff.id,
            rationale_ciphertext: expect.any(String),
            decodedRationale: input.rationale,
          }
        : row,
    ),
    effective: {
      ...before.effective,
      accounts: revoke
        ? before.effective.accounts.map(account => ({
            ...account,
            incidents: account.incidents.map(row =>
              row.notice === input.noticeId ? { ...row, operative: false } : row,
            ),
          }))
        : before.effective.accounts,
      state: {
        ...before.effective.state,
        staydown: revoke ? 0 : before.effective.state.staydown,
        actions: revoke
          ? [
              ...before.effective.state.actions,
              ...before.effective.state.restrictions.map(restriction => ({
                id: expect.any(String),
                restriction: restriction.id,
                deadline: null,
                revision: before.placements.find(
                  placement =>
                    placement.id ===
                    before.effective.state.targets.find(target => target.id === restriction.target)!
                      .placement_id,
                )!.revision,
                action: 'restore',
                state: 'pending',
              })),
            ]
          : before.effective.state.actions,
        events: [
          ...before.effective.state.events,
          ...(revoke
            ? before.effective.state.restrictions.map(() => 'reversal_restoration_intent_created')
            : []),
        ].toSorted(),
        deliveries: [...before.effective.state.deliveries, ...notices].toSorted(),
        correspondence: [
          ...before.effective.state.correspondence,
          ...Array.from(
            { length: (revoke ? 1 : 0) + (input.jurisdiction === 'eu_dsa' ? 1 : 0) },
            () => 'decision_notice',
          ),
        ].toSorted(),
      },
    },
  }
  expect([
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Conflicting copyright case change',
        causeCode: '40001',
      },
      state: before,
    },
    {
      outcome: {
        status: 'fulfilled',
        value: {
          id: created?.id,
          decided_at: expect.any(Date),
          staff_disposition: input.disposition,
        },
      },
      state,
    },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}
