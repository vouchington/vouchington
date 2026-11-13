import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readCopyrightThreadRetirementBound } from '@voucha/test-helpers/copyright-thread-retention'
import { describe, expect, it } from 'vitest'
import {
  completeCopyrightRestrictionHumanReview,
  createCopyrightNoticeSchemaFixture,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import { createCopyrightOperationalScope } from '@voucha/test-helpers/copyright-operational-retention'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { holdCopyrightCaseBeforeThreadEligibility } from '@voucha/test-helpers/copyright-thread-sweep-admission-race'
import {
  prepareCopyrightLastActionAttempt,
  prepareCopyrightFailedWorkProof,
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
    const scope1 = createCopyrightOperationalScope([scene.noticeId])
    const beforeWork = (await getCopyrightNoticePrivateAggregate(
      scene.noticeId,
    ))!.actionIntents.find(row => row.id === scene.actionIntentId)!
    let failureOutcome: unknown = { status: 'not_started' }
    let failureAt: Date | undefined
    const result = await holdCopyrightCaseBeforeThreadEligibility(
      scene.noticeId,
      async afterProof => {
        if (!afterProof) return
        failureAt = new Date()
        failureOutcome = await failCopyrightActionIntent({
          intentId: scene.actionIntentId,
          leaseToken: claimed!.lease_token,
          failedAt: failureAt,
          failureMessage: 'Terminal provider failure after the blocker proof.',
        })
          .then(value => ({ status: 'fulfilled', value }))
          .catch((err: unknown) => ({ status: 'rejected', reason: err }))
      },
      () =>
        sweepCopyrightCaseThreads({
          scope: scope1,
          now: new Date(Date.now() + 181 * 24 * 60 * 60 * 1000),
          replyDays: 180,
          batchSize: 10,
          maxBatches: 100,
        }),
    )
    const afterWork = (await getCopyrightNoticePrivateAggregate(
      scene.noticeId,
    ))!.actionIntents.find(row => row.id === scene.actionIntentId)!
    const native = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({ code: '40001' }),
    })
    const referenceState = await readCopyrightThreadReferenceState(reply.id)
    expect([
      {
        failure: { status: 'fulfilled', value: 'failed' },
        deleted: false,
        references: before,
        work: {
          ...beforeWork,
          state: 'failed',
          completed_at: failureAt,
          completed_at_reason: 'failed',
          failure_message: 'Terminal provider failure after the blocker proof.',
          available_at: expect.any(Date),
          leased_at: null,
          lease_token: null,
          lease_expires_at: null,
          updated_at: expect.any(Date),
        },
        retired: false,
      },
      { failure: native, deleted: false, references: before, work: beforeWork, retired: false },
      {
        failure: { status: 'not_started' },
        deleted: false,
        references: before,
        work: beforeWork,
        retired: false,
      },
      {
        failure: native,
        deleted: true,
        references: { tokenId: null, referenceCount: 0 },
        work: beforeWork,
        retired: true,
      },
    ]).toContainEqual({
      failure: failureOutcome,
      deleted: result.deleted > 0,
      references: referenceState,
      work: afterWork,
      retired: (await readCopyrightThreadRetirementBound(scene.noticeId)) !== null,
    })
  })

  it('keeps references and work unchanged when the terminal failure was already committed', async () => {
    const initial = await createRetentionParsedEmail('committed-work-proof-initial')
    const scene = await createCopyrightNoticeSchemaFixture({
      initialEmailSesMessageId: initial.amazon_ses_message_id,
    })
    await completeCopyrightRestrictionHumanReview(scene)
    const reply = await createRetentionParsedEmail('committed-work-proof-reply', { reply: true })
    await linkTestCopyrightEmailIntake(initial.id, scene.noticeId)
    await linkTestCopyrightEmailIntake(reply.id, scene.noticeId, 'thread', scene.actorUserId)
    await prepareCopyrightFailedWorkProof(scene.actionIntentId, scene.restrictionId)
    const beforeWork = (await getCopyrightNoticePrivateAggregate(
      scene.noticeId,
    ))!.actionIntents.find(row => row.id === scene.actionIntentId)!
    expect(beforeWork).toMatchObject({
      state: 'failed',
      attempt_count: 5,
      completed_at_reason: 'failed',
    })
    const before = await readCopyrightThreadReferenceState(reply.id)
    expect(before.referenceCount).toBeGreaterThan(0)
    const result = await sweepCopyrightCaseThreads({
      scope: createCopyrightOperationalScope([scene.noticeId]),
      now: new Date(Date.now() + 181 * 24 * 60 * 60 * 1000),
      replyDays: 180,
      batchSize: 10,
      maxBatches: 100,
    })
    expect(result.deleted).toBe(0)
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(before)
    expect(await readCopyrightThreadRetirementBound(scene.noticeId)).toBeNull()
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.noticeId))!.actionIntents.find(
        row => row.id === scene.actionIntentId,
      ),
    ).toEqual(beforeWork)
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
