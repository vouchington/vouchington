import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { insertStructuredData } from './structured-facts.mts'
import {
  boolPair,
  enumPair,
  insertCategories,
  insertStringIds,
  textPair,
  timePair,
} from './revision-values.mts'

type RevisionType = 'create' | 'update' | 'delete'
type FieldChange = { before: unknown; after: unknown }
export type PostRevisionChanges = Record<string, FieldChange>

const TEXT_FIELDS = [
  'title',
  'markdown',
  'ai_summary_markdown',
  'slug',
  'declared_language',
] as const
const BROADCASTS = new Set(['everyone', 'users', 'followers', 'mutual_followers'])
const PRIVACIES = new Set(['public', 'private'])
const VERTICALS = new Set(['credit_card', 'bank_account'])

export async function insertPostRevisionFacts(
  postId: string,
  revisionType: RevisionType,
  changes: PostRevisionChanges,
  revisedById: string | null,
  options?: QueryOptions,
): Promise<{
  id: string
  post_id: string
  revision_type: RevisionType
  revised_by_id: string | null
  created_at: Date
}> {
  if (options?.query || options?.client)
    return writeFacts(postId, revisionType, changes, revisedById, options)
  await using query = await beginTransaction()
  const row = await writeFacts(postId, revisionType, changes, revisedById, { query })
  await query.commit()
  return row
}

async function writeFacts(
  postId: string,
  revisionType: RevisionType,
  changes: PostRevisionChanges,
  revisedById: string | null,
  options: QueryOptions,
) {
  assertKnownChanges(changes)
  const title = textPair(changes, 'title')
  const markdown = textPair(changes, 'markdown')
  const summary = textPair(changes, 'ai_summary_markdown')
  const slug = textPair(changes, 'slug')
  const language = textPair(changes, 'declared_language')
  const vertical = enumPair(changes, 'data_point_vertical', VERTICALS)
  const broadcast = enumPair(changes, 'broadcast', BROADCASTS)
  const privacy = enumPair(changes, 'privacy', PRIVACIES)
  const anonymous = boolPair(changes, 'is_anonymous')
  const deletedAt = timePair(changes, 'deleted_at')
  const archivedAt = timePair(changes, 'archived_at')
  const {
    rows: [row],
  } = await write<{
    id: string
    post_id: string
    revision_type: RevisionType
    revised_by_id: string | null
    created_at: Date
  }>(
    sql`/* createPostRevision */
      INSERT INTO post_revisions (
        post_id, revision_type, revised_by_id,
        title_changed, title_before, title_after,
        markdown_changed, markdown_before, markdown_after,
        ai_summary_markdown_changed, ai_summary_markdown_before, ai_summary_markdown_after,
        broadcast_changed, broadcast_before, broadcast_after,
        privacy_changed, privacy_before, privacy_after,
        is_anonymous_changed, is_anonymous_before, is_anonymous_after,
        data_point_vertical_changed, data_point_vertical_before, data_point_vertical_after,
        declared_language_changed, declared_language_before, declared_language_after,
        slug_changed, slug_before, slug_after,
        deleted_at_changed, deleted_at_before, deleted_at_after, deleted_at_before_sentinel, deleted_at_after_sentinel,
        archived_at_changed, archived_at_before, archived_at_after, archived_at_before_sentinel, archived_at_after_sentinel,
        categories_changed, post_images_changed, review_topic_ratings_changed, structured_data_changed
      ) VALUES (
        ${postId}, ${revisionType}, ${revisedById},
        ${title.changed}, ${title.before}, ${title.after},
        ${markdown.changed}, ${markdown.before}, ${markdown.after},
        ${summary.changed}, ${summary.before}, ${summary.after},
        ${broadcast.changed}, ${broadcast.before}, ${broadcast.after},
        ${privacy.changed}, ${privacy.before}, ${privacy.after},
        ${anonymous.changed}, ${anonymous.before}, ${anonymous.after},
        ${vertical.changed}, ${vertical.before}, ${vertical.after},
        ${language.changed}, ${language.before}, ${language.after},
        ${slug.changed}, ${slug.before}, ${slug.after},
        ${deletedAt.changed}, ${deletedAt.before}, ${deletedAt.after}, ${deletedAt.beforeSentinel}, ${deletedAt.afterSentinel},
        ${archivedAt.changed}, ${archivedAt.before}, ${archivedAt.after}, ${archivedAt.beforeSentinel}, ${archivedAt.afterSentinel},
        ${'categories' in changes}, ${'post_images' in changes}, ${'review_topic_ratings' in changes},
        ${'structured_data' in changes}
      )
      RETURNING id, post_id, revision_type, revised_by_id, created_at`,
    options,
  )
  if (!row) throw new Error('Post revision insert did not return a row')
  await insertStringIds(row.id, 'post_revision_images', 'image_id', changes.post_images, options)
  await insertStringIds(
    row.id,
    'post_revision_rating_topics',
    'topic_id',
    changes.review_topic_ratings,
    options,
  )
  await insertCategories(row.id, changes.categories, options)
  await insertStructuredData(row.id, changes.structured_data, options)
  return row
}

function assertKnownChanges(changes: PostRevisionChanges): void {
  const known = new Set<string>([
    ...TEXT_FIELDS,
    'broadcast',
    'privacy',
    'is_anonymous',
    'data_point_vertical',
    'deleted_at',
    'archived_at',
    'categories',
    'post_images',
    'review_topic_ratings',
    'structured_data',
  ])
  for (const field of Object.keys(changes)) {
    if (!known.has(field)) throw new Error(`Unknown post revision field: ${field}`)
  }
}
