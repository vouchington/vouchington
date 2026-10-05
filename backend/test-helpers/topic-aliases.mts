import { getTopicAliasRecords } from '../services/topics/get-topic-aliases.mts'

export async function getTopicAliasesForTest(topicId: string) {
  const { results, hasNextPage } = await getTopicAliasRecords(topicId)
  return { results: results.map(record => record.alias), hasNextPage }
}
