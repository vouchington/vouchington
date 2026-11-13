import { expect } from 'vitest'
import { decryptSecret } from '@modules/token-secrets'
import { appendCopyrightGuestFiling } from '../services/copyright-notices/guest-filings.mts'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { readWithdrawalState } from './copyright-withdrawal-state.mts'
import { expectedGuestWithdrawalFiling } from './copyright-withdrawal-expected.mts'
import type { WithdrawalCapabilityScene } from './copyright-withdrawal-capability-fixture.mts'

/** Each real filing runs once; its complete transaction may abort, and foreign capability authority stays unchanged. */
export async function assertGuestWithdrawalFiling(
  scene: WithdrawalCapabilityScene,
  kind: 'withdrawal' | 'supplement',
) {
  const noticeId = kind === 'withdrawal' ? scene.noticeId : scene.otherNoticeId
  const capability = kind === 'withdrawal' ? scene.filer : scene.otherCase
  const ids = [scene.noticeId, scene.otherNoticeId]
  const before = await readWithdrawalState(ids)
  const now = new Date()
  const statement = `${kind}-${crypto.randomUUID()}`
  const [result] = await Promise.allSettled([
    appendCopyrightGuestFiling({ noticeId, token: capability.token, now, kind, statement }),
  ])
  const after = await readWithdrawalState(ids)
  const index = kind === 'withdrawal' ? 0 : 1
  const submission = after[index]!.aggregate.submissions.find(row => row.kind === kind)
  const complete = before.map((row, position) =>
    position === index
      ? expectedGuestWithdrawalFiling(row, after[position]!, {
          noticeId,
          kind,
          now,
          capabilityId: capability.id,
        })
      : row,
  )
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
      outcome: { status: 'fulfilled', value: { id: submission?.id, kind, received_at: now } },
      state: complete,
    },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
  if (submission)
    expect(
      decryptSecret(submission.body_ciphertext, copyrightSubmissionPurpose(submission.id)),
    ).toBe(statement)
  for (const [position, row] of after.entries())
    expect(row.clock.at.getTime()).toBeGreaterThanOrEqual(before[position]!.clock.at.getTime())
}
