import { beginTransaction, write } from '@data-stores/psql'

export async function setTopicDeletedForEmbeddingTest(topicId: string): Promise<void> {
  await write(
    `/* setTopicDeletedForEmbeddingTest */ UPDATE topics SET deleted_at = NOW() WHERE id = $1`,
    [topicId],
  )
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
