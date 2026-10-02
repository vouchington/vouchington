import { linkHostnameToSourceTopic } from '@services/topics/hostname-link'
import { createRssFeed } from '@services/rss-feeds/create'
import { getRssFeedByTopicId } from '@services/rss-feeds/get'
import { updateRssFeedById } from '@services/rss-feeds/update'
import { softDeleteRssFeedById } from '@services/rss-feeds/delete'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import type { PrivateUser } from '@services/users/types'
import type { CreateTopicUpdates, Topic } from '@services/topics/types'
import { SYSTEM_PROVENANCE } from '@voucha/types/entities/content-provenance'

type ProcessTopicRssFeedOptions = {
  admin: PrivateUser
  effectiveTopicType?: CreateTopicUpdates['topic_type']
  existingTopic: Topic | null
  rssFeedTitle?: string
  rssFeedUrl?: string
  topicId: string
  topicType?: CreateTopicUpdates['topic_type']
}

export async function processTopicRssFeed({
  admin,
  effectiveTopicType,
  existingTopic,
  rssFeedTitle,
  rssFeedUrl,
  topicId,
  topicType,
}: ProcessTopicRssFeedOptions) {
  if (topicType && topicType !== 'rss_feed') {
    const existingFeed = await getRssFeedByTopicId(topicId)
    if (existingFeed) await softDeleteRssFeedById(existingFeed.id)
    return
  }

  if (effectiveTopicType !== 'rss_feed' || !rssFeedUrl || !rssFeedTitle) return

  const hostnameMap = await upsertUrlHostnames(admin.id, [rssFeedUrl])
  const hostnameId = hostnameMap.get(new URL(rssFeedUrl).hostname)
  if (!hostnameId) return

  const currentHostnameId = existingTopic?.hostname_id ?? null
  if (currentHostnameId !== hostnameId) {
    await linkHostnameToSourceTopic(topicId, hostnameId)
  }

  const existingFeed = await getRssFeedByTopicId(topicId)
  if (existingFeed) {
    await updateRssFeedById(existingFeed.id, { rss_feed_url: rssFeedUrl, title: rssFeedTitle })
  } else {
    await createRssFeed({
      provenance: SYSTEM_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: rssFeedUrl,
      topic_id: topicId,
      title: rssFeedTitle,
    })
  }
}
