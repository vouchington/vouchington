import { writeTestImageOwnerRetirement } from '../image-owner-retirement.mts'
import { beginTransaction } from '@data-stores/psql'

export async function setTopicDeletedForEmbeddingTest(topicId: string): Promise<void> {
  await using query = await beginTransaction()
  await writeTestImageOwnerRetirement(query, { topicId }, async scopeQuery => {
    await scopeQuery(
      `/* setTopicDeletedForEmbeddingTest */ UPDATE topics SET deleted_at = NOW() WHERE id = $1`,
      [topicId],
    )
  })
  await query.commit()
}

export async function lockTopicEmbeddingRowForTest(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  topicId: string,
): Promise<void> {
  await transaction(
    `/* lockTopicEmbeddingRowForTest */ SELECT id FROM topics WHERE id = $1 FOR UPDATE`,
    [topicId],
  )
}
