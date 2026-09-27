import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertTopicAliasForTest(topicId: string, alias: string): Promise<void> {
  await write(sql`/* insertTopicAliasForTest */
    INSERT INTO topic_aliases (topic_id, alias)
    VALUES (${topicId}, ${alias})
  `)
}

export async function insertUnlinkedTopicAliasForTest(alias: string): Promise<void> {
  await write(sql`/* insertUnlinkedTopicAliasForTest */
    INSERT INTO topic_aliases (alias) VALUES (${alias})
  `)
}

export async function getTopicAliasIdForTest(alias: string): Promise<string | null> {
  const { rows } = await read<{ id: string }>(sql`/* getTopicAliasIdForTest */
    SELECT id FROM topic_aliases WHERE alias = ${alias}
  `)
  return rows[0]?.id ?? null
}

export async function updateTopicSlugForTest(topicId: string, slug: string): Promise<void> {
  await write(sql`/* updateTopicSlugForTest */
    UPDATE topics
    SET slug = ${slug}
    WHERE id = ${topicId}
  `)
}

export async function markTopicRecommendationReviewedForTest(params: {
  postId: string
  reviewedById: string
  rejectionReason: string
}): Promise<void> {
  await write(sql`/* markTopicRecommendationReviewedForTest */
    UPDATE post_topic_recommendations
    SET reviewed_at = NOW(),
      reviewed_by_id = ${params.reviewedById},
      rejection_reason = ${params.rejectionReason},
      created_topic_id = NULL
    WHERE post_id = ${params.postId}
  `)
}
