import { describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import { createTestUserDirect, createReferralProgramFixture } from '@voucha/test-helpers'
import { createUserReferralLink } from '@services/user-referral-program-links/create'
import { createChildReferralLink } from '@services/user-referral-program-links/create-child'
import { getUserReferralLink } from '@services/user-referral-program-links/get'
import { markReferralLinkUnfurlRequested } from '@services/user-referral-program-links/unfurl-state'
import { unfurlReferralLinksQueue } from '@queues/unfurl-referral-links/queues'
import { processUnfurlReferralLinksJob } from './processors.mts'

describe('unfurl referral links processor', () => {
  it('dispatcher job enqueues an unfurl job for a stuck requested link', async () => {
    const owner = await createTestUserDirect()
    const fixture = await createReferralProgramFixture({ createdById: owner!.id })
    const parent = await createUserReferralLink(owner, {
      user_id: owner!.id,
      referral_program_id: fixture.referralProgramId,
      url: `https://${fixture.hostname}/ref/${randomSlug('dispatch')}`,
      label: 'stuck parent',
    })
    await markReferralLinkUnfurlRequested(parent.id)

    await processUnfurlReferralLinksJob(
      makeJob('unfurl_referral_links_dispatcher', {}, 'dispatcher'),
    )

    const waiting = await unfurlReferralLinksQueue.getJobs('waiting')
    expect(
      waiting.some(
        job =>
          job.name === 'unfurl_referral_link' &&
          (job.data as { parentLinkId?: string }).parentLinkId === parent.id,
      ),
    ).toBe(true)
  })

  it('rejects an unknown job name inside the dispatcher ordering key', async () => {
    await expect(
      processUnfurlReferralLinksJob(makeJob('unexpected', {}, 'dispatcher')),
    ).rejects.toThrow('Unfurl referral links dispatcher job unexpected not found')
  })

  it('unfurl_referral_link job delegates to runReferralLinkUnfurl using job.data.parentLinkId', async () => {
    const owner = await createTestUserDirect()
    const fixture = await createReferralProgramFixture({ createdById: owner!.id })
    const parent = await createUserReferralLink(owner, {
      user_id: owner!.id,
      referral_program_id: fixture.referralProgramId,
      url: `https://${fixture.hostname}/ref/${randomSlug('processor-unfurl')}`,
      label: 'no membership',
    })

    await expect(
      processUnfurlReferralLinksJob(makeJob('unfurl_referral_link', { parentLinkId: parent.id })),
    ).resolves.toBeUndefined()

    const updated = await getUserReferralLink(parent.id)
    expect(updated?.unfurl_failed_at).toBeTruthy()
    expect(updated?.unfurl_last_error).toBe('Owner no longer has an active Plus/Pro membership')
  })

  it('rejects an unfurl_referral_link job missing parentLinkId', async () => {
    await expect(
      processUnfurlReferralLinksJob(makeJob('unfurl_referral_link', {})),
    ).rejects.toThrow('Unfurl referral link job .parentLinkId is required')
  })

  it('remove_unfurled_children_for_user job delegates to softDeleteChildrenForUser using job.data.userId', async () => {
    const owner = await createTestUserDirect()
    const fixture = await createReferralProgramFixture({ createdById: owner!.id })
    const parent = await createUserReferralLink(owner, {
      user_id: owner!.id,
      referral_program_id: fixture.referralProgramId,
      url: `https://${fixture.hostname}/ref/${randomSlug('remove-parent')}`,
      label: 'parent for removal test',
    })
    const child = await createChildReferralLink(owner!.id, {
      userId: owner!.id,
      referralProgramId: fixture.referralProgramId,
      url: `https://${fixture.hostname}/ref/${randomSlug('remove-child')}`,
      parentLinkId: parent.id,
      label: 'child to remove',
    })

    await processUnfurlReferralLinksJob(
      makeJob('remove_unfurled_children_for_user', { userId: owner!.id }),
    )

    const removed = await getUserReferralLink(child.id)
    expect(removed).toBeNull()
  })

  it('rejects a remove_unfurled_children_for_user job missing userId', async () => {
    await expect(
      processUnfurlReferralLinksJob(makeJob('remove_unfurled_children_for_user', {})),
    ).rejects.toThrow('Remove unfurled children for user job .userId is required')
  })

  it('rejects an unknown job name outside the dispatcher ordering key', async () => {
    await expect(processUnfurlReferralLinksJob(makeJob('unexpected', {}))).rejects.toThrow(
      'Unfurl referral links job unexpected not found',
    )
  })
})

function randomSlug(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function makeJob(
  name: string,
  data: Record<string, string>,
  orderingKey?: 'dispatcher',
): Job<Record<string, string>> {
  return {
    name,
    data,
    opts: orderingKey ? { ordering: { key: orderingKey } } : {},
  } as Job<Record<string, string>>
}
