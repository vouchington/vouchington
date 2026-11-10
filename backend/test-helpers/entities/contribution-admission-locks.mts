import { randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Inserts a real authored child row inside an admission transaction to acquire its actor FK lock. */
export async function insertContributionAdmissionFkLockedTopicForTest(
  query: TransactionQuery,
  actorId: string,
): Promise<string> {
  const result = await query<{
    id: string
  }>(sql`/* insertContributionAdmissionFkLockedTopicForTest */
    INSERT INTO topics (
      name, slug, created_by_id, bedrock_nova_multimodal_v1_content_sha256,
      created_via
    ) VALUES (
      ${randomUUID()}, ${randomUUID()}, ${actorId}, ${`\\x${'0'.repeat(64)}`},
      'system'
    )
    RETURNING id`)
  const topicId = result.rows[0]?.id
  if (!topicId) throw new Error('Test contribution admission topic was not created')
  return topicId
}
