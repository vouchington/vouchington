import { assertWhitelistedSqlIdentifier, write } from '@data-stores/psql'
import type { ClassifierRunSubject } from '@services/classifier-runs'
import { entityRelationElectionTables } from '@services/elections-votes/entity-relation/target'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import sql from 'sql-template-strings'

/** More topics than this on one subject adds nothing the reasoning pass needs to see. */
const MAX_APPLIED_TOPIC_NAMES = 50

/**
 * The display names of the topics currently applied to the subject (a live relation with a
 * positive net vote, on a topic that still exists), which is everything the first stage added plus
 * what people tagged. The reasoning pass reads them as context so it never argues for a topic the
 * subject already has; the candidate set it asks about already excludes them.
 */
export async function readAutotaggerAppliedTopicNames(
  subject: ClassifierRunSubject,
): Promise<string[]> {
  const isPost = subject.postId !== null
  const subjectId = subject.postId !== null ? subject.postId : subject.rssFeedItemId
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: isPost ? 'post' : 'rss_feed_item',
    objectType: 'topic',
    predicate: 'category',
  })
  const statement = sql`/* readAutotaggerAppliedTopicNames */
    SELECT topic.name
    FROM `
  statement.append(
    assertWhitelistedSqlIdentifier(
      relation.table_name,
      entityRelationElectionTables,
      'entityRelationTable',
    ),
  )
  statement.append(sql` relation
    JOIN topics topic ON topic.id = relation.object_id
    WHERE relation.subject_id = ${subjectId}::uuid
      AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
      AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
    ORDER BY topic.name, topic.id
    LIMIT ${MAX_APPLIED_TOPIC_NAMES}
  `)
  const { rows } = await write<{ name: string }>(statement)
  return rows.map(row => row.name)
}
