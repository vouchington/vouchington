import { expect } from 'vitest'
import { orderWithdrawalAudits, type readWithdrawalState } from './copyright-withdrawal-state.mts'

type State = Awaited<ReturnType<typeof readWithdrawalState>>[number]
/** Complete guest withdrawal or unrelated supplement; existing revoked/expired tokens remain exact. */
export function expectedGuestWithdrawalFiling(
  before: State,
  after: State,
  input: { noticeId: string; kind: 'withdrawal' | 'supplement'; now: Date; capabilityId: string },
) {
  const submission = after.aggregate.submissions.find(row => row.kind === input.kind)
  const id = submission?.id
  const withdrawal = input.kind === 'withdrawal'
  const revoked = withdrawal
    ? before.capabilities.filter(row => row.revoked_at === null && row.expires_at > input.now)
    : []
  const event = {
    kind: `${input.kind}_received`,
    actor: null,
    capability: null,
    submission: id,
    correspondence: null,
    action: null,
  }
  return {
    ...before,
    clock: { ...before.clock, at: expect.any(Date) },
    activity: {
      ...before.activity,
      lifecycle: expect.any(Date),
      ...(withdrawal ? { guest: expect.any(Date) } : {}),
    },
    capabilities: before.capabilities.map(row =>
      revoked.some(capability => capability.id === row.id)
        ? { ...row, revoked_at: input.now, updated_at: expect.any(Date) }
        : row,
    ),
    aggregate: {
      ...before.aggregate,
      submissions: [
        ...before.aggregate.submissions,
        expect.objectContaining({
          id,
          copyright_notice_id: input.noticeId,
          kind: input.kind,
          received_at: input.now,
          source_kind: 'guest_form',
          submitted_by_id: null,
          body_ciphertext: expect.any(String),
          copyright_notice_guest_capability_id: input.capabilityId,
          current_assessment_identity_id: null,
          current_assessment_is_substantially_compliant: null,
          current_assessed_at: null,
          current_assessed_by_id: null,
          current_assessment_form_screening_id: null,
        }),
      ],
    },
    audits: orderWithdrawalAudits([
      ...before.audits,
      event,
      ...revoked.map(row => ({
        kind: 'guest_capability_revoked_by_withdrawal',
        actor: null,
        capability: row.id,
        submission: null,
        correspondence: null,
        action: null,
      })),
    ]),
    misuse: withdrawal
      ? [
          ...before.misuse,
          expect.objectContaining({
            copyright_notice_id: input.noticeId,
            outcome: 'notice_withdrawn',
            copyright_notice_submission_id: id,
            copyright_notice_submission_assessment_identity_id: null,
            copyright_restriction_id: null,
            occurred_at: input.now,
          }),
        ]
      : before.misuse,
  }
}
