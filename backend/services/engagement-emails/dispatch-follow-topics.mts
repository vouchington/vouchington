import { getMarketingPostalAddress, getSiteUrl } from '@modules/utils'
import { getRecommendedTopics } from '@services/recommended-topics/get-recommendations'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import { claimEngagementEmailSend } from '@services/users/engagement-emails'
import type { PrivateUser } from '@services/users/types'
import {
  enqueueSendFollowTopicsEmail,
  enqueuePageFollowTopicsEmail,
} from '@queues/email-digests/enqueues'
import type { FollowTopicsEmailProps } from '@email-templates/core'
import { buildFollowTopicsItems } from './recommendation-items.mts'
import {
  releaseEngagementClaim,
  reportEngagementDispatchError,
  sendJobId,
} from './dispatch-recipient-utils.mts'
import type { EngagementRecipient } from './recipient-page.mts'

export async function dispatchFollowTopicsEmail(
  recipient: EngagementRecipient,
  ownerJobId?: string,
): Promise<void> {
  let claimed = false
  let admissionStarted = false
  try {
    if (!(await claimEngagementEmailSend(recipient.id, 'follow_topics', ownerJobId))) return
    claimed = true

    const currentUser = { id: recipient.id } as PrivateUser
    const recommendations = await getRecommendedTopics(currentUser, { limit: 5 })
    if (recommendations.results.length === 0) return

    const topics = await getTopicsByAnyBatch(recommendations.results.map(result => result.id))
    const items = buildFollowTopicsItems(recommendations.results, topics)

    if (items.length === 0) return

    const props: FollowTopicsEmailProps = {
      userName: recipient.username ?? undefined,
      topics: items,
      settingsUrl: getSiteUrl('/my/topics/following'),
      unsubscribeUrl: getSiteUrl('/my/notification-settings'),
      physicalAddress: getMarketingPostalAddress(),
    }
    admissionStarted = true
    const input = {
      userId: recipient.id,
      uiLocale: recipient.ui_locale ?? null,
      ...(ownerJobId && { claimOwnerJobId: ownerJobId }),
    }
    if (ownerJobId)
      await enqueuePageFollowTopicsEmail(
        input,
        props,
        sendJobId(ownerJobId, 'follow_topics', recipient.id)!,
      )
    else await enqueueSendFollowTopicsEmail(input, props)
  } catch (err) {
    /* c8 ignore start -- Defensive cleanup/observability for per-recipient recommendation or enqueue failures. */
    if (claimed && !admissionStarted)
      await releaseEngagementClaim(recipient.id, 'follow_topics', ownerJobId)
    reportEngagementDispatchError(err, 'follow_topics', recipient.id)
    if (admissionStarted) throw err
    /* c8 ignore stop */
  }
}
