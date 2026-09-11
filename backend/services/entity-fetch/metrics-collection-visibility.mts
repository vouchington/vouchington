import type { PrivateUser } from '@services/users/types'
import { currentUserCanViewUserContent } from '@services/users/authorization'
import { getUserPrivacySettings } from '@services/users/privacy'

export async function getMetricsCollectionVisibility(
  currentUser: PrivateUser | undefined,
  targetUserId: string,
) {
  const settings = await getUserPrivacySettings(targetUserId)
  const viewer = currentUser ?? null
  const [follows, followers, topicFollows, rssFeedFollows] = await Promise.all([
    currentUserCanViewUserContent(viewer, targetUserId, settings.follows_visibility),
    currentUserCanViewUserContent(viewer, targetUserId, settings.followers_visibility),
    currentUserCanViewUserContent(viewer, targetUserId, settings.topic_follows_visibility),
    currentUserCanViewUserContent(viewer, targetUserId, settings.rss_feed_follows_visibility),
  ])
  return { follows, followers, topicFollows, rssFeedFollows }
}
