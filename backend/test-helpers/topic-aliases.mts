import { read } from '@data-stores/psql'
import { getTopicAliasRecords } from '../services/topics/get-topic-aliases.mts'

export async function getTopicAliasesForTest(topicId: string) {
  const { results, hasNextPage } = await getTopicAliasRecords(topicId)
  return { results: results.map(record => record.alias), hasNextPage }
}

export async function getTopicAliasUnlinkOwnerForTest(aliasId: string) {
  const { rows } = await read<{ topic_id: string | null; unlink_topic_id: string | null }>(
    `/* getTopicAliasUnlinkOwnerForTest */ SELECT topic_id, unlink_topic_id FROM topic_aliases WHERE id = $1::uuid`,
    [aliasId],
  )
  return rows[0]
}
