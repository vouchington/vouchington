import { write } from '@data-stores/psql'
import type { TopicAliasUnlinkPage } from '@queues/rss-feed-maintenance/types'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'

export type PostSourceRow = { id: string; post_id: string }
export type RelationRow = { subject_id: string; id: string }
export type ItemCategoryRow = { rss_feed_item_id: string; category_identity_id: string }

export type StagedTopicAliasUnlinkPage =
  | { phase: 'post_sources'; rows: PostSourceRow[] }
  | { phase: 'post_relations' | 'rss_item_relations'; rows: RelationRow[] }
  | { phase: 'rss_item_categories'; rows: ItemCategoryRow[] }
  | { phase: 'finalize'; rows: [] }
export type StagedTopicAliasUnlinkChildPage = Exclude<
  StagedTopicAliasUnlinkPage,
  { phase: 'finalize' }
>

/** Reads one bounded child page from the primary before its mutation transaction starts. */
export async function stageTopicAliasUnlinkPage(
  page: TopicAliasUnlinkPage,
): Promise<StagedTopicAliasUnlinkPage> {
  const limit = getPostPublicationWorkLimit('topic_alias_unlink_page_size')
  switch (page.phase) {
    case 'post_sources': {
      const { rows } = await write<PostSourceRow>(
        `/* stageTopicAliasUnlinkPostSources */
         SELECT id, post_id FROM post_topic_alias_sources
         WHERE topic_alias_id = $1::uuid
         ORDER BY post_id DESC, id DESC LIMIT $2`,
        [page.topicAliasId, limit],
      )
      return { phase: page.phase, rows }
    }
    case 'post_relations': {
      const { rows } = await write<RelationRow>(
        `/* stageTopicAliasUnlinkPostRelations */
         SELECT subject_id, id FROM relation__post__category__topic_alias
         WHERE object_id = $1::uuid
         ORDER BY subject_id LIMIT $2`,
        [page.topicAliasId, limit],
      )
      return { phase: page.phase, rows }
    }
    case 'rss_item_relations': {
      const { rows } = await write<RelationRow>(
        `/* stageTopicAliasUnlinkRssItemRelations */
         SELECT subject_id, id FROM relation__rss_feed_item__category__topic_alias
         WHERE object_id = $1::uuid
         ORDER BY subject_id LIMIT $2`,
        [page.topicAliasId, limit],
      )
      return { phase: page.phase, rows }
    }
    case 'rss_item_categories': {
      // A singleton array keeps the alias key in the pathkeys, so the index supplies this order.
      const { rows } = await write<ItemCategoryRow>(
        `/* stageTopicAliasUnlinkItemCategories */
         SELECT rss_feed_item_id, category_identity_id FROM rss_feed_item_categories
         WHERE topic_alias_id = ANY(ARRAY[$1::uuid])
         ORDER BY topic_alias_id, rss_feed_item_id DESC, category_identity_id DESC LIMIT $2`,
        [page.topicAliasId, limit],
      )
      return { phase: page.phase, rows }
    }
    case 'finalize':
      return { phase: page.phase, rows: [] }
  }
}
