import { removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  claimCurrentModerationSummaryForTest,
} from '@voucha/test-helpers'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { createModerationSummaryCollection } from '@voucha/test-helpers/moderation-summary-collection'
import { holdQueueAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import { EMAIL_DIGESTS_MODERATION_SUMMARY_STAGE_JOBS } from '@queues/background/enqueues/email-digests-jobs'
import { updateUserFields } from '@services/users/update-fields'
import { processModerationSummaryStage } from './moderation-summary-stage.mts'

describe('moderator summary continuation admission', () => {
  it('admits the next stage job before finishing the memberships job', async () => {
    const user = await createTestUser()
    await updateUserFields(user.id, { is_moderation_emails_enabled: true })
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    const postId = await insertTestPost({
      createdById: user.id,
      communityId: community.id,
      title: 'Pending digest continuation',
      markdown: 'Pending',
      slug: `digest-continuation-${crypto.randomUUID()}`,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user.id,
    })
    const { trackingKey, windowEnd, dispatchTimeZone } = await claimCurrentModerationSummaryForTest(
      user.id,
    )
    const jobName = EMAIL_DIGESTS_MODERATION_SUMMARY_STAGE_JOBS.reviews.name
    const admission = holdQueueAdmission(
      backgroundQueue,
      jobName,
      data =>
        typeof data === 'object' &&
        data !== null &&
        'input' in data &&
        typeof data.input === 'object' &&
        data.input !== null &&
        'userId' in data.input &&
        data.input.userId === user.id,
    )
    let entered = false
    void admission.entered.then(() => {
      entered = true
    })
    let settled = false
    const operation = processModerationSummaryStage(
      'memberships',
      { userId: user.id, trackingKey, windowEnd },
      {
        generatedForDate: windowEnd.slice(0, 10),
        dispatchTimeZone,
        settingsUrl: 'https://example.test/settings',
        unsubscribeUrl: 'https://example.test/unsubscribe',
        physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
        remainingCommunityCount: 0,
        collection: createModerationSummaryCollection(),
        communities: [],
      },
    ).finally(() => {
      settled = true
    })
    try {
      await Promise.race([
        admission.entered,
        operation.then(() => {
          throw new Error('Collection finished before continuation admission')
        }),
      ])
      expect(settled).toBe(false)
      admission.release()
      const [result, job] = await Promise.all([operation, admission.admitted])
      expect(result).toEqual({ continued: true })
      expect(job?.data).toMatchObject({
        input: { userId: user.id, trackingKey },
        variables: {
          collection: {
            eligibleCount: 0,
            scan: { communityId: community.id },
          },
        },
      })
    } finally {
      admission.release()
      await operation.catch(() => undefined)
      if (entered)
        await removeEnqueuedJobs([admission.admitted.then(job => (job ? [job] : []))], jobName)
      admission.restore()
    }
  })
})
