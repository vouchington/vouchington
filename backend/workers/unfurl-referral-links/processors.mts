import type { UnfurlReferralLinksJobs } from '@queues/unfurl-referral-links/types'
import { dispatchUnfurlReferralLinks, runReferralLinkUnfurl } from '@services/referral-link-unfurl'
import { softDeleteChildrenForUser } from '@services/user-referral-program-links'
import { type Job } from 'glide-mq'

export async function processUnfurlReferralLinksJob(job: Job): Promise<unknown> {
  const orderingKey = job.opts.ordering?.key

  switch (orderingKey) {
    case 'dispatcher': {
      switch (job.name as UnfurlReferralLinksJobs) {
        case 'unfurl_referral_links_dispatcher':
          return dispatchUnfurlReferralLinks()
        default:
          throw new Error(`Unfurl referral links dispatcher job ${job.name} not found`)
      }
    }
    default: {
      switch (job.name as UnfurlReferralLinksJobs) {
        case 'unfurl_referral_link': {
          const { parentLinkId } = job.data ?? {}
          if (!parentLinkId) throw new Error('Unfurl referral link job .parentLinkId is required')
          return runReferralLinkUnfurl(parentLinkId)
        }
        case 'remove_unfurled_children_for_user': {
          const { userId } = job.data ?? {}
          if (!userId) throw new Error('Remove unfurled children for user job .userId is required')
          return softDeleteChildrenForUser(userId)
        }
        default:
          throw new Error(`Unfurl referral links job ${job.name} not found`)
      }
    }
  }
}
