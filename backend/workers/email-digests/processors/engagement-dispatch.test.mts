import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { withPagedDispatchPage } from '@data-stores/valkey-glide-mq/paged-dispatch-context'
import { createPagedDispatchFences } from '@data-stores/valkey-glide-mq/paged-dispatch-fences'
import { background } from '@queues/background/queues'
import {
  EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB,
  EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB,
} from '@queues/background/enqueues/email-digests-jobs'
import { enqueueEngagementDispatchContinuation } from '@queues/email-digests/enqueues'
import {
  createTestUser,
  insertTestReferralProgram,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { insertTestUserReferralProgramLink } from '@voucha/test-helpers/entities/referral-links'
import { claimEngagementEmailSend } from '@services/users/engagement-emails'
import { dispatchEngagementRecipientPage } from '@services/engagement-emails/dispatch-engagement-emails'
import { getEngagementEmailsWorkLimit } from '@services/engagement-emails/work-limits'
import { processEngagementDispatchJob } from './engagement-dispatch.mts'

describe('engagement page admission replay', () => {
  it('moves an exhausted empty topic page to the next phase with a fresh budget', async () => {
    const dispatchStartedAt = '2026-10-22T12:00:00.000Z'
    const admitted = await enqueueEngagementDispatchContinuation(
      {
        phase: 'follow_topics',
        dispatchStartedAt,
        preparedPage: { recipientIds: [], scannedCount: 0 },
      },
      { jobId: `engagement_phase_${randomUUID()}` },
    )
    if (!admitted || typeof admitted !== 'object' || !('id' in admitted))
      throw new Error('Expected phase dispatcher job')
    const root = (await background.getJob(String(admitted.id))) as
      | Parameters<typeof processEngagementDispatchJob>[0]
      | null
    if (!root) throw new Error('Expected persisted phase dispatcher job')
    const nextData = {
      phase: 'post_referral_link',
      dispatchStartedAt,
      remainingBudget: getEngagementEmailsWorkLimit('dispatch_batch_size'),
    }
    const pageId = createHash('sha256')
      .update(`${root.id}:${JSON.stringify(nextData)}`)
      .digest('hex')
    const nextJobId = `${EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB.name}__page__${pageId}`
    try {
      const result = await processEngagementDispatchJob(root)
      expect(result).toMatchObject({ count: 0, scannedCount: 0 })
      const persisted = (await background.getJob(root.id)) as typeof root | null
      expect(persisted?.data.remainingBudget).toBe(nextData.remainingBudget)
      expect((await background.getJob(nextJobId))?.data).toMatchObject(nextData)
    } finally {
      await (await background.getJob(nextJobId))?.remove()
      await root.remove()
    }
  })

  it('continues a zero-eligible raw page without consuming the phase budget', async () => {
    const afterUserId = randomUUID()
    const dispatchStartedAt = new Date().toISOString()
    const admitted = await enqueueEngagementDispatchContinuation(
      {
        phase: 'post_referral_link',
        dispatchStartedAt,
        remainingBudget: 5,
        preparedPage: {
          recipientIds: [],
          scannedCount: 500,
          nextCursor: { lane: 'unclaimed', afterUserId },
        },
      },
      { jobId: `engagement_zero_page_${randomUUID()}` },
    )
    if (!admitted || typeof admitted !== 'object' || !('id' in admitted))
      throw new Error('Expected zero-page dispatcher job')
    const root = (await background.getJob(String(admitted.id))) as
      | Parameters<typeof processEngagementDispatchJob>[0]
      | null
    if (!root) throw new Error('Expected persisted zero-page dispatcher job')
    try {
      const result = await processEngagementDispatchJob(root)
      expect(result).toMatchObject({ count: 0, scannedCount: 500 })
      const nextData = {
        phase: 'post_referral_link',
        cursor: { lane: 'unclaimed', afterUserId },
        dispatchStartedAt,
        remainingBudget: 5,
      }
      const pageId = createHash('sha256')
        .update(`${root.id}:${JSON.stringify(nextData)}`)
        .digest('hex')
      const next = await background.getJob(
        `${EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB.name}__page__${pageId}`,
      )
      expect(next?.data).toMatchObject({
        phase: 'post_referral_link',
        cursor: { lane: 'unclaimed', afterUserId },
        remainingBudget: 5,
      })
      await next?.remove()
    } finally {
      await root.remove()
    }
  })

  it.each(['accepted with lost acknowledgement', 'definitely not admitted'] as const)(
    'replays %s through real PostgreSQL and GlideMQ',
    async fault => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser()
      const linkedUser = await createTestUser()
      const programId = await insertTestReferralProgram({ createdById: admin.id })
      const url = await insertTestUrlDirect(
        linkedUser.id,
        `https://engagement-replay-${randomUUID()}.example.com`,
      )
      await insertTestUserReferralProgramLink({
        userId: linkedUser.id,
        referralProgramId: programId,
        urlId: url!.id,
      })

      const pageId = `email-digests-replay-${randomUUID()}`
      const sendJobId = `email_digests_engagement__${createHash('sha256').update(`${pageId}:post_referral_link:${user.id}`).digest('hex')}`
      const fences = createPagedDispatchFences(background.name, pageId)
      const input = {
        type: 'post_referral_link' as const,
        dispatchStartedAt: new Date(),
        preparedPage: { recipientIds: [user.id], scannedCount: 1 },
        ownerJobId: pageId,
      }
      const originalAddBulk = background.addBulk
      let faulted = false
      const queueCall = vi.spyOn(background, 'addBulk').mockImplementation(async jobs => {
        if (!faulted) {
          faulted = true
          if (fault === 'definitely not admitted') throw new Error('queue rejected before add')
          await originalAddBulk.call(background, jobs)
          throw new Error('queue accepted but acknowledgement was lost')
        }
        return originalAddBulk.call(background, jobs)
      })
      try {
        await expect(
          withPagedDispatchPage(
            pageId,
            background.name,
            () => dispatchEngagementRecipientPage(input),
            fences.checkpoint,
          ),
        ).rejects.toMatchObject({
          errors: [
            expect.objectContaining({
              message: expect.stringMatching(
                /queue (rejected before add|accepted but acknowledgement was lost)/,
              ),
            }),
          ],
        })
        const beforeReplay = await background.getJob(sendJobId)
        expect(beforeReplay?.id ?? null).toBe(
          fault === 'definitely not admitted' ? null : sendJobId,
        )
        expect(await claimEngagementEmailSend(user.id, 'post_referral_link', pageId)).toBe(true)
        expect(
          await claimEngagementEmailSend(user.id, 'post_referral_link', `${pageId}-other`),
        ).toBe(false)

        const completed = await withPagedDispatchPage(
          pageId,
          background.name,
          () => dispatchEngagementRecipientPage(input),
          fences.checkpoint,
        )
        expect(completed.value.count).toBe(1)
        const jobs = await background.searchJobs({
          name: EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB.name,
        })
        const owned = jobs.filter(job => job.id === sendJobId)
        expect(owned).toHaveLength(1)
        expect(owned[0]?.opts?.jobId).toEqual(expect.any(String))
      } finally {
        queueCall.mockRestore()
        await (await background.getJob(sendJobId))?.remove()
        await fences.clearPage(500)
      }
    },
  )
})
