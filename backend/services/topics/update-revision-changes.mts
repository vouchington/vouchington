import type { CreateTopicUpdates, Topic } from './types.mts'
import type { TopicRevisionChanges } from '@services/topic-revisions'

/**
 * Build the before/after diff for a topic update, used to record a topic revision.
 * `resolvedHostnameId` is the hostname id resolved by the update service (the `changes`
 * object carries a hostname string, not an id), or `undefined` when hostname was untouched.
 */
export function buildTopicRevisionChanges(
  topic: Topic,
  changes: Partial<CreateTopicUpdates>,
  resolvedHostnameId: string | null | undefined,
): TopicRevisionChanges {
  const revisionChanges: TopicRevisionChanges = {}
  if (changes.name !== undefined && changes.name !== topic.name)
    revisionChanges.name = { before: topic.name, after: changes.name }
  if (changes.slug !== undefined && changes.slug !== topic.slug)
    revisionChanges.slug = { before: topic.slug, after: changes.slug }
  if (changes.topic_type !== undefined && changes.topic_type !== topic.topic_type)
    revisionChanges.topic_type = { before: topic.topic_type, after: changes.topic_type }
  if (changes.markdown !== undefined && changes.markdown !== topic.markdown)
    revisionChanges.markdown = { before: topic.markdown, after: changes.markdown }
  if (changes.noindex !== undefined && changes.noindex !== topic.noindex)
    revisionChanges.noindex = { before: topic.noindex, after: changes.noindex }
  if (changes.allow_reviews !== undefined && changes.allow_reviews !== topic.allow_reviews)
    revisionChanges.allow_reviews = { before: topic.allow_reviews, after: changes.allow_reviews }
  if (changes.logo_image_id !== undefined && changes.logo_image_id !== topic.logo_image_id)
    revisionChanges.logo_image_id = { before: topic.logo_image_id, after: changes.logo_image_id }
  if (changes.hero_image_id !== undefined && changes.hero_image_id !== topic.hero_image_id)
    revisionChanges.hero_image_id = { before: topic.hero_image_id, after: changes.hero_image_id }
  if (changes.homepage_url_id !== undefined && changes.homepage_url_id !== topic.homepage_url_id)
    revisionChanges.homepage_url_id = {
      before: topic.homepage_url_id,
      after: changes.homepage_url_id,
    }
  if (resolvedHostnameId !== undefined && resolvedHostnameId !== topic.hostname_id)
    revisionChanges.hostname_id = { before: topic.hostname_id, after: resolvedHostnameId }
  if (
    changes.rewards_program_id !== undefined &&
    changes.rewards_program_id !== topic.rewards_program_id
  )
    revisionChanges.rewards_program_id = {
      before: topic.rewards_program_id,
      after: changes.rewards_program_id,
    }
  if (
    changes.referral_program_id !== undefined &&
    changes.referral_program_id !== topic.referral_program_id
  )
    revisionChanges.referral_program_id = {
      before: topic.referral_program_id,
      after: changes.referral_program_id,
    }
  return revisionChanges
}
