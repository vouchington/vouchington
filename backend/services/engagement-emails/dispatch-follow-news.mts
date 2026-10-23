import { getMarketingPostalAddress, getSiteUrl } from '@modules/utils'
import { getRecommendedRssFeeds } from '@services/recommended-rss-feeds/get-recommendations'
import { getRssFeedsByIdBatch } from '@services/rss-feeds/get-batch'
import { claimEngagementEmailSend } from '@services/users/engagement-emails'
import {
  enqueueSendFollowNewsSourcesEmail,
  enqueuePageFollowNewsSourcesEmail,
} from '@queues/email-digests/enqueues'
import type { FollowNewsSourcesEmailProps } from '@email-templates/core'
import { buildFollowNewsSourceItems } from './recommendation-items.mts'
import {
  releaseEngagementClaim,
  reportEngagementDispatchError,
  sendJobId,
} from './dispatch-recipient-utils.mts'
import type { EngagementRecipient } from './recipient-page.mts'

export async function dispatchFollowNewsSourcesEmail(
  recipient: EngagementRecipient,
  ownerJobId?: string,
): Promise<void> {
  let claimed = false
  let admissionStarted = false
  try {
    if (!(await claimEngagementEmailSend(recipient.id, 'follow_news_sources', ownerJobId))) return
    claimed = true

    const recommendations = await getRecommendedRssFeeds(recipient.id, {
      limit: 5,
      source: 'all',
    })
    if (recommendations.results.length === 0) return

    const feeds = await getRssFeedsByIdBatch(recommendations.results.map(result => result.id))
    const sources = buildFollowNewsSourceItems(feeds)

    if (sources.length === 0) return

    const props: FollowNewsSourcesEmailProps = {
      userName: recipient.username ?? undefined,
      sources,
      settingsUrl: getSiteUrl('/my/news-sources'),
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
      await enqueuePageFollowNewsSourcesEmail(
        input,
        props,
        sendJobId(ownerJobId, 'follow_news_sources', recipient.id)!,
      )
    else await enqueueSendFollowNewsSourcesEmail(input, props)
  } catch (err) {
    /* c8 ignore start -- Defensive cleanup/observability for per-recipient enqueue failures. */
    if (claimed && !admissionStarted)
      await releaseEngagementClaim(recipient.id, 'follow_news_sources', ownerJobId)
    reportEngagementDispatchError(err, 'follow_news_sources', recipient.id)
    if (admissionStarted) throw err
    /* c8 ignore stop */
  }
}
