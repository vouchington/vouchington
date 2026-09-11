import type { ListResponse } from '@/types/api-responses'

type TopicAliasRecord = { id: string; alias: string }

export type TopicAliasesWireResponse = ListResponse<string> & {
  alias_records: TopicAliasRecord[]
}

export function toTopicAliasRecords(
  response: TopicAliasesWireResponse,
): ListResponse<TopicAliasRecord> {
  return { ...response, results: response.alias_records }
}
