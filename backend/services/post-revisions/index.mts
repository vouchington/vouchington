import type { QueryOptions } from '@data-stores/psql/types'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type RevisionType = 'create' | 'update' | 'delete'

type FieldChange = {
  before: unknown
  after: unknown
}

export type PostRevisionChanges = Record<string, FieldChange>

const POST_TRACKED_FIELDS = [
  'title',
  'markdown',
  'ai_summary_markdown',
  'broadcast',
  'privacy',
  'is_anonymous',
  'structured_data',
  'data_point_vertical',
  'declared_language',
  'deleted_at',
  'archived_at',
] as const

export type PostRevision = {
  id: string
  post_id: string
  revision_type: RevisionType
  revised_by_id: string | null
  changes: PostRevisionChanges
  created_at: Date
}

export async function createPostRevision(
  postId: string,
  revisionType: RevisionType,
  changes: PostRevisionChanges,
  revisedById: string | null,
  options?: QueryOptions,
): Promise<PostRevision> {
  const {
    rows: [row],
  } = await write(
    sql`/* createPostRevision */
    INSERT INTO post_revisions (post_id, revision_type, revised_by_id, changes)
    VALUES (${postId}, ${revisionType}, ${revisedById}, ${JSON.stringify(changes)})
    RETURNING id, post_id, revision_type, revised_by_id, changes, created_at`,
    options,
  )
  return row
}

export function computePostChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): PostRevisionChanges {
  const changes: PostRevisionChanges = {}
  for (const field of POST_TRACKED_FIELDS) {
    const beforeVal = before?.[field] ?? null
    const afterVal = after?.[field] ?? null
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changes[field] = { before: beforeVal, after: afterVal }
    }
  }
  return changes
}
