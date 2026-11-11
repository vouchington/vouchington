import { describe, expect, it } from 'vitest'
import {
  completeCopyrightRestrictionHumanReview,
  createCopyrightNoticeSchemaFixture,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import { positionCopyrightOperationalCursor } from '@voucha/test-helpers/copyright-operational-retention'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { holdCopyrightCaseBeforeThreadEligibility } from '@voucha/test-helpers/copyright-thread-sweep-admission-race'
import {
  prepareCopyrightLastActionAttempt,
  prepareCopyrightBlockedWorkProof,
  reopenCopyrightWorkProof,
} from '@voucha/test-helpers/copyright-work-retention-proof'
import { readTestCopyrightThreadBlockerPage } from '@voucha/test-helpers/copyright-thread-blocker-retention'
import { failCopyrightActionIntent } from './action-delivery-completion.mts'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import { isTestCopyrightCaseEvidenceErased } from '@voucha/test-helpers/copyright-email-manual-association'

describe('copyright work blockers introduced after a paged negative proof', () => {
  useCopyrightOperationalCursorReservation()

  it('retains thread evidence when a terminal action failure commits before final eligibility', async () => {
    const initial = await createRetentionParsedEmail('work-proof-initial')
    const scene = await createCopyrightNoticeSchemaFixture({
      initialEmailSesMessageId: initial.amazon_ses_message_id,
    })
    await completeCopyrightRestrictionHumanReview(scene)
    const reply = await createRetentionParsedEmail('work-proof-reply', { reply: true })
    await linkTestCopyrightEmailIntake(initial.id, scene.noticeId)
    await linkTestCopyrightEmailIntake(reply.id, scene.noticeId, 'thread', scene.actorUserId)
    const claimed = await prepareCopyrightLastActionAttempt(
      scene.actionIntentId,
      scene.restrictionId,
    )
    expect(claimed).not.toBeNull()
    const before = await readCopyrightThreadReferenceState(reply.id)
    expect(before.referenceCount).toBeGreaterThan(0)
    let proof = await readTestCopyrightThreadBlockerPage(scene.noticeId, new Date(), {
      phase: null,
      childId: null,
      assessmentId: null,
      generation: null,
    })
    for (let page = 0; page < 60 && !proof.done && !proof.blocked; page++) {
      proof = await readTestCopyrightThreadBlockerPage(scene.noticeId, new Date(), proof)
    }
    expect(proof).toMatchObject({ done: true, blocked: false })
    await positionCopyrightOperationalCursor('email_thread_references', scene.noticeId)
    const result = await holdCopyrightCaseBeforeThreadEligibility(
      scene.noticeId,
      async () => {
        await expect(
          failCopyrightActionIntent({
            intentId: scene.actionIntentId,
            leaseToken: claimed!.lease_token,
            failedAt: new Date(),
            failureMessage: 'Terminal provider failure after the blocker proof.',
          }),
        ).resolves.toBe('failed')
      },
      () =>
        sweepCopyrightCaseThreads({
          now: new Date(Date.now() + 181 * 24 * 60 * 60 * 1000),
          replyDays: 180,
          batchSize: 10,
          maxBatches: 100,
        }),
    )
    expect(result.deleted).toBe(0)
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(before)
  })

  it('restarts a completed negative case proof when blocked work is reopened between pages', async () => {
    const scene = await createCopyrightNoticeSchemaFixture()
    await prepareCopyrightBlockedWorkProof(scene.actionIntentId, scene.restrictionId)
    const now = new Date('2100-01-01T12:00:00.000Z')
    let data: CopyrightCasePurgeJobData = {
      noticeId: scene.noticeId,
      phase: 'parties',
      phaseIndex: 0,
      afterId: null,
      legalClockAt: null,
      proofVersion: null,
    }
    for (let page = 0; page < 150 && data.phase !== 'coverage'; page++) {
      const result = await runCopyrightCasePurgePage(data, now)
      expect(result.hasMore).toBe(true)
      data = result.data
    }
    expect(data.phase).toBe('coverage')
    await reopenCopyrightWorkProof(scene.actionIntentId)
    const result = await runCopyrightCasePurgePage(data, now)
    expect(result).toMatchObject({ hasMore: true, data: { phase: 'parties' } })
    expect(await isTestCopyrightCaseEvidenceErased(scene.noticeId)).toBe(false)
  })
})
