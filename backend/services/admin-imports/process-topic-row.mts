import { createTopic } from '@services/topics/create'
import { updateTopic } from '@services/topics/update'
import { getTopicBySlug } from '@services/topics/get'
import { createTopicAliases } from '@services/topics/aliases'
import { buildSourceTopicName } from '@services/rss-feeds/validate'
import type { PrivateUser } from '@services/users/types'
import type { CreateTopicUpdates } from '@services/topics/types'
import type { ImportRow, TopicImportRow } from './types.mts'
import { processReferralProgramAttributes } from './process-topic-row-referral.mts'
import {
  processTopicExtensions,
  processTopicParentRelations,
} from './process-topic-row-relations.mts'
import { processTopicRssFeed } from './process-topic-row-rss-feed.mts'

export async function processTopicRow(admin: PrivateUser, row: ImportRow): Promise<string> {
  const input = row.input_data as TopicImportRow

  const slug = input.slug
  const topicType = (input.topic_type?.trim() || undefined) as
    | CreateTopicUpdates['topic_type']
    | undefined
  const rssFeedUrl = input.rss_feed_url?.trim() || undefined
  const rssFeedTitle = input.rss_feed_title?.trim() || undefined

  // 1. Look up existing topic by slug (strict slug-only — avoids UUID ambiguity in getTopicByAny)
  const existingTopic = await getTopicBySlug(slug)

  // Compute display name: for rss_feed topics, append the feed URL automatically.
  // Use effectiveTopicType so that re-imports omitting topic_type still apply the URL suffix
  // for topics that are already rss_feed in the DB. When rss_feed_url is absent, baseName is used as-is.
  const effectiveTopicType =
    topicType ?? (existingTopic?.topic_type as CreateTopicUpdates['topic_type'] | undefined)
  const baseName = input.name?.trim()
  const displayName =
    effectiveTopicType === 'rss_feed' && baseName && rssFeedUrl
      ? buildSourceTopicName(baseName, rssFeedUrl)
      : baseName

  let topicId: string

  if (existingTopic) {
    // 2a. Topic exists → UPDATE only the provided non-empty fields
    const changes: Partial<CreateTopicUpdates> = {}
    if (displayName) changes.name = displayName
    if (topicType) changes.topic_type = topicType
    if (input.markdown?.trim()) changes.markdown = input.markdown.trim()

    if (Object.keys(changes).length > 0) {
      await updateTopic(admin, existingTopic, changes, { allowTypeChange: true })
    }

    topicId = existingTopic.id
  } else {
    // 2b. Topic does not exist → INSERT via createTopic
    const updates: CreateTopicUpdates = {
      slug,
      name: displayName || slug,
    }
    if (topicType) updates.topic_type = topicType
    if (input.markdown?.trim()) updates.markdown = input.markdown.trim()

    const topic = await createTopic(admin, updates)
    topicId = topic.id
  }

  await processTopicRssFeed({
    admin,
    effectiveTopicType,
    existingTopic,
    rssFeedTitle,
    rssFeedUrl,
    topicId,
    topicType,
  })

  // 4. Handle aliases if provided
  if (input.aliases?.trim()) {
    const aliasList = input.aliases.split('|').flatMap(a => (a.trim() ? [a.trim()] : []))
    if (aliasList.length > 0) {
      await createTopicAliases(topicId, aliasList)
    }
  }

  // 5. Handle extensions if provided
  if (input.extensions?.trim()) {
    const exts = input.extensions.split('|').flatMap(e => (e.trim() ? [e.trim()] : []))
    const topic = existingTopic ?? (await getTopicBySlug(slug))!
    await processTopicExtensions(admin, topic, exts)
  }

  // 6. Handle parent relations if provided
  if (input.parent_slugs?.trim()) {
    const parentSlugs = input.parent_slugs.split('|').flatMap(s => (s.trim() ? [s.trim()] : []))
    await processTopicParentRelations(admin, topicId, parentSlugs)
  }

  // 7. Handle referral program attributes if topic_type=referral_program
  if (
    topicType === 'referral_program' &&
    input.referral_validation_slug?.trim() &&
    input.referral_hostname?.trim() &&
    input.referral_pathname?.trim()
  ) {
    await processReferralProgramAttributes(admin, topicId, input)
  }

  return topicId
}
