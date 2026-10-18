import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import { dispatchUnfurlReferralLinks, runReferralLinkUnfurl } from '@services/referral-link-unfurl'
import { softDeleteChildrenForUser } from '@services/user-referral-program-links'
import type { Job } from 'glide-mq'

export async function processUnfurlReferralLinksJob(
  job: Pick<Job, 'name' | 'data' | 'updateData' | 'moveToDelayed'>,
): Promise<unknown> {
  switch (job.name) {
    case 'crawl.unfurl_referral_links_dispatcher':
      return processRetainedSweep(job, save =>
        dispatchUnfurlReferralLinks(job.data?.cursor, cursor => save({ cursor })),
      )
    case 'crawl.unfurl_referral_link': {
      const { parentLinkId } = job.data ?? {}
      if (!parentLinkId) throw new Error('Unfurl referral link job .parentLinkId is required')
      return runReferralLinkUnfurl(parentLinkId)
    }
    case 'crawl.remove_unfurled_children_for_user': {
      const { userId } = job.data ?? {}
      if (!userId) throw new Error('Remove unfurled children for user job .userId is required')
      return softDeleteChildrenForUser(userId)
    }
    default:
      throw new Error(`Unfurl referral links job ${job.name} not found`)
  }
}
