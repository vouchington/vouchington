import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { aliasChange, insertAliasEntries } from './alias-facts.mts'
import { boolPair, enumPair, textPair, timePair, uuidPair } from './topic-revision-pairs.mts'

type RevisionType = 'create' | 'update' | 'delete'
type FieldChange = { before: unknown; after: unknown }
export type TopicRevisionChanges = Record<string, FieldChange>

const TOPIC_TYPES = new Set([
  'topic',
  'rewards_program',
  'referral_program',
  'card',
  'rewards_program_status',
  'bank_account',
  'rss_feed',
  'fediverse_instance',
])

export async function insertTopicRevisionFacts(
  topicId: string,
  revisionType: RevisionType,
  changes: TopicRevisionChanges,
  revisedById: string | null,
  revisedByRolesSql: ReturnType<typeof sql>,
  options?: QueryOptions,
): Promise<{
  id: string
  topic_id: string
  revision_type: RevisionType
  revised_by_id: string | null
  revised_by_roles: string[]
  created_at: Date
}> {
  if (options?.query || options?.client) {
    return writeFacts(topicId, revisionType, changes, revisedById, revisedByRolesSql, options)
  }
  await using query = await beginTransaction()
  const row = await writeFacts(topicId, revisionType, changes, revisedById, revisedByRolesSql, {
    query,
  })
  await query.commit()
  return row
}

async function writeFacts(
  topicId: string,
  revisionType: RevisionType,
  changes: TopicRevisionChanges,
  revisedById: string | null,
  revisedByRolesSql: ReturnType<typeof sql>,
  options: QueryOptions,
) {
  const alias = aliasChange(changes)
  const name = textPair(changes, 'name')
  const slug = textPair(changes, 'slug')
  const markdown = textPair(changes, 'markdown')
  const topicType = enumPair(changes, 'topic_type', TOPIC_TYPES)
  const noindex = boolPair(changes, 'noindex')
  const allowReviews = boolPair(changes, 'allow_reviews')
  const logo = uuidPair(changes, 'logo_image_id')
  const hero = uuidPair(changes, 'hero_image_id')
  const homepage = uuidPair(changes, 'homepage_url_id')
  const hostname = uuidPair(changes, 'hostname_id')
  const rewards = uuidPair(changes, 'rewards_program_id')
  const referral = uuidPair(changes, 'referral_program_id')
  const deletedAt = timePair(changes, 'deleted_at')
  const insert = sql`/* createTopicRevision */
    INSERT INTO topic_revisions (
      topic_id, revision_type, revised_by_id, revised_by_roles,
      name_changed, name_before, name_after,
      slug_changed, slug_before, slug_after,
      topic_type_changed, topic_type_before, topic_type_after,
      markdown_changed, markdown_before, markdown_after,
      noindex_changed, noindex_before, noindex_after,
      allow_reviews_changed, allow_reviews_before, allow_reviews_after,
      logo_image_id_changed, logo_image_id_before, logo_image_id_after,
      hero_image_id_changed, hero_image_id_before, hero_image_id_after,
      homepage_url_id_changed, homepage_url_id_before, homepage_url_id_after,
      hostname_id_changed, hostname_id_before, hostname_id_after,
      rewards_program_id_changed, rewards_program_id_before, rewards_program_id_after,
      referral_program_id_changed, referral_program_id_before, referral_program_id_after,
      deleted_at_changed, deleted_at_before, deleted_at_after,
      deleted_at_before_sentinel, deleted_at_after_sentinel,
      alias_change_kind, alias_before_is_list, alias_after_is_list
    ) VALUES (
      ${topicId}, ${revisionType}, ${revisedById}, `
  insert.append(revisedByRolesSql)
  insert.append(sql`,
      ${name.changed}, ${name.before}, ${name.after},
      ${slug.changed}, ${slug.before}, ${slug.after},
      ${topicType.changed}, ${topicType.before}, ${topicType.after},
      ${markdown.changed}, ${markdown.before}, ${markdown.after},
      ${noindex.changed}, ${noindex.before}, ${noindex.after},
      ${allowReviews.changed}, ${allowReviews.before}, ${allowReviews.after},
      ${logo.changed}, ${logo.before}, ${logo.after},
      ${hero.changed}, ${hero.before}, ${hero.after},
      ${homepage.changed}, ${homepage.before}, ${homepage.after},
      ${hostname.changed}, ${hostname.before}, ${hostname.after},
      ${rewards.changed}, ${rewards.before}, ${rewards.after},
      ${referral.changed}, ${referral.before}, ${referral.after},
      ${deletedAt.changed}, ${deletedAt.before}, ${deletedAt.after},
      ${deletedAt.beforeSentinel}, ${deletedAt.afterSentinel},
      ${alias.kind}, ${alias.beforeIsList}, ${alias.afterIsList}
    )
    RETURNING id, topic_id, revision_type, revised_by_id, revised_by_roles, created_at`)
  const {
    rows: [row],
  } = await write<{
    id: string
    topic_id: string
    revision_type: RevisionType
    revised_by_id: string | null
    revised_by_roles: string[]
    created_at: Date
  }>(insert, options)
  if (!row) throw new Error('Topic revision insert did not return a row')
  if (alias.kind) await insertAliasEntries(row.id, alias, options)
  return row
}
