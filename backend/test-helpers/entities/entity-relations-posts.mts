import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getEntityRelation } from './entity-relations.mts'

export type ScoredPostTopicCategoryRelation = {
  id: string
  subject_id: string
  object_id: string
  votes_score_net: number
}

export async function insertScoredPostTopicCategoryRelation(
  postId: string,
  topicId: string,
  createdById?: string,
): Promise<ScoredPostTopicCategoryRelation> {
  const query = sql`/* insertScoredPostTopicCategoryRelation */
      INSERT INTO relation__post__category__topic (
        subject_id, object_id, created_by_id, votes_score_up, votes_count_up
      )
      VALUES (${postId}, ${topicId}, ${createdById ?? null}, 1, 1)
      ON CONFLICT (subject_id, object_id) DO UPDATE SET
        created_by_id = EXCLUDED.created_by_id,
        votes_score_up = EXCLUDED.votes_score_up,
        votes_count_up = EXCLUDED.votes_count_up,
        deleted_at = NULL
      RETURNING id, subject_id, object_id, votes_score_net
    `
  const { rows } = await write<ScoredPostTopicCategoryRelation>(query)
  return rows[0]!
}

export async function softDeleteScoredPostTopicCategoryRelation(
  postId: string,
  topicId: string,
  deletedById?: string,
): Promise<void> {
  const query = sql`/* softDeleteScoredPostTopicCategoryRelation */ UPDATE relation__post__category__topic SET deleted_at = CURRENT_TIMESTAMP`
  if (deletedById) query.append(sql`, deleted_by_id = ${deletedById}`)
  query.append(sql` WHERE subject_id = ${postId} AND object_id = ${topicId}`)
  await write(query)
}

export async function setScoredPostTopicCategoryRelationScore(
  postId: string,
  topicId: string,
  score: number,
): Promise<void> {
  const query = sql`/* setScoredPostTopicCategoryRelationScore */ UPDATE relation__post__category__topic SET
      votes_score_up = ${Math.max(score, 0)},
      votes_score_down = ${Math.max(-score, 0)},
      votes_count_up = ${score > 0 ? 1 : 0},
      votes_count_down = ${score < 0 ? 1 : 0}
      WHERE subject_id = ${postId} AND object_id = ${topicId}`
  await write(query)
}

export async function countPostRelatedTopics(postId: string): Promise<number> {
  const { rows } = await read(
    sql`/* countPostRelatedTopics */ SELECT COUNT(*)::int AS count FROM relation__post__category__topic WHERE subject_id = ${postId}`,
  )
  return rows[0]?.count ?? 0
}

export async function getTestPostCategoryRelationIds(postId: string): Promise<string[]> {
  const { rows } = await read<{ id: string }>(
    sql`/* getTestPostCategoryRelationIds */ SELECT id FROM relation__post__category__topic WHERE subject_id = ${postId} AND deleted_at IS NULL`,
  )
  return rows.map(row => row.id)
}

export async function hasPostRelatedTopic(postId: string, topicId: string): Promise<boolean> {
  const rows = await getEntityRelation('relation__post__category__topic', postId, topicId)
  return rows.length > 0
}

export async function getTestRelationDeletedAt(
  postId: string,
  urlId: string,
): Promise<Date | null> {
  const { rows } = await read(
    sql`/* getTestRelationDeletedAt */
      SELECT deleted_at
      FROM relation__post__related__url
      WHERE subject_id = ${postId} AND object_id = ${urlId}
      LIMIT 1
    `,
  )
  return (rows[0] as { deleted_at: Date | null } | undefined)?.deleted_at ?? null
}
