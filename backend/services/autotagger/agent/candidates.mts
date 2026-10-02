import { assertWhitelistedSqlIdentifier, type QueryExecutor } from '@data-stores/psql'
import type { ClassifierRunSubject } from '@services/classifier-runs'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { entityRelationElectionTables } from '@services/elections-votes/entity-relation/target'
import sql from 'sql-template-strings'

/**
 * The most topics one reasoning autotagger run asks about. It bounds the provider call (one Noul
 * probability per candidate) however many topics paying users follow, and it is the only bound:
 * the candidates are ranked by how close they are to the subject, so the cut keeps the likeliest.
 */
export const AUTOTAGGER_AGENT_MAX_CANDIDATES = 10

/**
 * Roles whose follows are staff curation, not a paying reader's interest. There is no shared SQL
 * staff predicate, so this names the site-staff role types (an investor is not staff).
 */
const STAFF_ROLE_SLUGS = ['administrator', 'moderator', 'developer']

/**
 * Chooses the topics one reasoning autotagger run asks about: topics followed by at least one
 * paying user, minus every topic the subject already has a relation for. It runs once, when the
 * run's receipt is first reserved, after the first stage has completed, so the relations it
 * excludes include everything that stage applied; the result is stored with the receipt, so a
 * later follow, plan change or tag cannot alter what an existing receipt asks. Null means there is
 * nothing to ask, which settles the request without a provider call.
 *
 * - "Paying" is the membership entitlement source of truth: a row in
 *   `view_current_paid_memberships`, which holds only a user's current paid (plus or pro) plan,
 *   restricted to live, non-system, non-staff accounts: a follow by a deleted, system,
 *   administrator, moderator or developer account never adds a topic.
 * - A deleted or merged-away topic is never a candidate.
 * - A topic the subject has any relation row for is excluded, live or soft-deleted: a deleted tag
 *   was removed on purpose and is not offered again.
 * - It starts from the follows, never from the embedding-miss universe, and ranks by the distance
 *   between the topic and the subject (topics without an embedding last).
 */
export async function captureAutotaggerAgentCandidateTopicIds(
  query: QueryExecutor,
  subject: ClassifierRunSubject,
): Promise<readonly string[] | null> {
  const isPost = subject.postId !== null
  const subjectId = subject.postId !== null ? subject.postId : subject.rssFeedItemId
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: isPost ? 'post' : 'rss_feed_item',
    objectType: 'topic',
    predicate: 'category',
  })
  const statement = sql`/* captureAutotaggerAgentCandidateTopics */
    WITH paid_followed AS (
      SELECT DISTINCT follow.object_id AS topic_id
      FROM relation__user__follow__topic follow
      JOIN view_current_paid_memberships membership ON membership.user_id = follow.subject_id
      JOIN users follower
        ON follower.id = follow.subject_id AND follower.deleted_at IS NULL AND follower.is_system = FALSE
      WHERE follow.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_roles staff_role
          JOIN user_roles_types staff_type ON staff_type.id = staff_role.role_type_id
          WHERE staff_role.user_id = follower.id AND staff_type.slug = ANY(${STAFF_ROLE_SLUGS})
        )
    )
    SELECT topic.id
    FROM paid_followed
    JOIN topics topic
      ON topic.id = paid_followed.topic_id AND topic.deleted_at IS NULL
        AND topic.merged_into_topic_id IS NULL
    JOIN `
  statement.append(isPost ? 'posts' : 'rss_feed_items')
  statement.append(sql` subject ON subject.id = ${subjectId}::uuid
    WHERE NOT EXISTS (
      SELECT 1 FROM `)
  statement.append(
    assertWhitelistedSqlIdentifier(
      relation.table_name,
      entityRelationElectionTables,
      'entityRelationTable',
    ),
  )
  statement.append(sql` existing
      WHERE existing.subject_id = subject.id AND existing.object_id = topic.id
    )
    ORDER BY (topic.bedrock_nova_multimodal_v1_embedding <=> subject.bedrock_nova_multimodal_v1_embedding)
      NULLS LAST, topic.id
    LIMIT ${AUTOTAGGER_AGENT_MAX_CANDIDATES}
  `)
  const { rows } = await query<{ id: string }>(statement)
  return rows.length === 0 ? null : rows.map(row => row.id)
}
