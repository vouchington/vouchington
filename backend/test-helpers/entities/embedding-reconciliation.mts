import {
  retireTestTopicImageOwners,
  writeTestImageOwnerRetirement,
} from '../image-owner-retirement.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTopicDeletedForEmbeddingTest(topicId: string): Promise<void> {
  await using query = await beginTransaction()
  await writeTestImageOwnerRetirement(query, { topicId }, (references, scopeQuery) =>
    retireTestTopicImageOwners(
      references,
      scopeQuery,
      sql`deleted_at = NOW()`,
      'setTopicDeletedForEmbeddingTest',
    ),
  )
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
