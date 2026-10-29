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
  'is_noindexed',
  'should_allow_reviews',
  'logo_image_id',
  'hero_image_id',
  'homepage_url_id',
  'hostname_id',
  'rewards_program_id',
  'referral_program_id',
  'deleted_at',
] as const

type TopicRevision = {
  id: string
  topic_id: string
  revision_type: RevisionType
  revised_by_id: string | null
  changes: { revised_by_roles: string[]; changes: TopicRevisionChanges }
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
    WITH topic_write_lock AS MATERIALIZED (
      SELECT id
      -- no-mistakes-disable-next-line postgres-required-predicates: history records may describe a deleted topic; this lock does not authorize a topic mutation.
      FROM topics
      WHERE id = ${topicId} AND merged_into_topic_id IS NULL
      FOR UPDATE
    ), inserted_revision AS (
      INSERT INTO topic_revisions (
        topic_id,
        revision_type,
        revised_by_id,
        changes
      )
      SELECT
        topic_write_lock.id,
        ${revisionType}::revision_types,
        ${revisedById},
        jsonb_build_object('revised_by_roles', COALESCE(
          (
            SELECT ARRAY_AGG(user_role_types.slug)
            FROM user_roles
            LEFT JOIN user_role_types ON user_role_types.id = user_roles.role_type_id
            WHERE user_roles.user_id = ${revisedById}
          ),
          ARRAY[]::TEXT[]
        ), 'changes', ${JSON.stringify(changes)}::jsonb)
      FROM topic_write_lock
      RETURNING id, topic_id, revision_type, revised_by_id, changes, created_at
    ), content_attribution AS (
      UPDATE topics
      SET content_updated_at = inserted_revision.created_at,
          content_updated_by_id = inserted_revision.revised_by_id
      FROM inserted_revision
      WHERE topics.id = inserted_revision.topic_id
        AND inserted_revision.revision_type IN ('create', 'update')
        AND (inserted_revision.changes->'changes') ?| ARRAY['name', 'markdown']
        AND (inserted_revision.changes->'revised_by_roles') @> '["administrator"]'::jsonb
        AND (topics.content_updated_at IS NULL OR topics.content_updated_at <= inserted_revision.created_at)
      RETURNING topics.id
    )
    SELECT id, topic_id, revision_type, revised_by_id, changes, created_at
    FROM inserted_revision`,
    options,
  )
  if (!row) throw new Error('Topic revision requires an existing topic')
  return row
}

export async function getLatestTopicContentUpdate(
  topicId: string,
  options?: QueryOptions,
): Promise<TopicContentUpdate | null> {
  const { rows } = await read(
    sql`/* getLatestTopicContentUpdate */
    SELECT
      topics.content_updated_at AS updated_at,
      TO_JSONB(eu.*) AS updated_by
    FROM topics
    JOIN view_embedded_users eu ON eu.id = topics.content_updated_by_id
    WHERE topics.id = ${topicId}
      AND topics.deleted_at IS NULL
      AND topics.merged_into_topic_id IS NULL`,
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
