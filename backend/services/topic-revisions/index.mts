import type { QueryOptions } from '@data-stores/psql/types'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PublicUser } from '@services/users/types'

type RevisionType = 'create' | 'update' | 'delete'

type FieldChange = {
  before: unknown
  after: unknown
}

export type TopicRevisionChanges = Record<string, FieldChange>

const TOPIC_TRACKED_FIELDS = [
  'name',
  'slug',
  'topic_type',
  'markdown',
  'noindex',
  'allow_reviews',
  'logo_image_id',
  'hero_image_id',
  'homepage_url_id',
  'hostname_id',
  'rewards_program_id',
  'referral_program_id',
  'deleted_at',
] as const

export type TopicRevision = {
  id: string
  topic_id: string
  revision_type: RevisionType
  revised_by_id: string | null
  revision_document: { revised_by_roles: string[]; changes: TopicRevisionChanges }
  created_at: Date
}

export type TopicContentUpdate = {
  updated_at: Date
  updated_by: PublicUser
}

export async function createTopicRevision(
  topicId: string,
  revisionType: RevisionType,
  changes: TopicRevisionChanges,
  revisedById: string | null,
  options?: QueryOptions,
): Promise<TopicRevision> {
  const {
    rows: [row],
  } = await write<TopicRevision>(
    sql`/* createTopicRevision */
    INSERT INTO topic_revisions (
      topic_id,
      revision_type,
      revised_by_id,
      revision_document
    )
    VALUES (
      ${topicId},
      ${revisionType},
      ${revisedById},
      jsonb_build_object('revised_by_roles', COALESCE(
        (
          SELECT ARRAY_AGG(user_roles_types.slug)
          FROM user_roles
          LEFT JOIN user_roles_types ON user_roles_types.id = user_roles.role_type_id
          WHERE user_roles.user_id = ${revisedById}
        ),
        ARRAY[]::TEXT[]
      ), 'changes', ${JSON.stringify(changes)}::jsonb)
    )
    RETURNING id, topic_id, revision_type, revised_by_id, revision_document, created_at`,
    options,
  )
  return row
}

export async function getLatestTopicContentUpdate(
  topicId: string,
  options?: QueryOptions,
): Promise<TopicContentUpdate | null> {
  const { rows } = await read(
    sql`/* getLatestTopicContentUpdate */
    SELECT
      tr.created_at AS updated_at,
      TO_JSONB(eu.*) AS updated_by
    FROM topic_revisions tr
    JOIN view_embedded_users eu ON eu.id = tr.revised_by_id
    WHERE tr.topic_id = ${topicId}
      AND tr.revision_type IN ('create', 'update')
      AND (tr.revision_document->'changes') ?| ARRAY['name', 'markdown']
      AND (tr.revision_document->'revised_by_roles') @> '["administrator"]'::jsonb
    ORDER BY tr.id DESC
    LIMIT 1`,
    options,
  )
  return (rows[0] as TopicContentUpdate | undefined) ?? null
}

export function computeTopicChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): TopicRevisionChanges {
  const changes: TopicRevisionChanges = {}
  for (const field of TOPIC_TRACKED_FIELDS) {
    const beforeVal = before?.[field] ?? null
    const afterVal = after?.[field] ?? null
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changes[field] = { before: beforeVal, after: afterVal }
    }
  }
  return changes
}
