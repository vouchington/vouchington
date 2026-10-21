import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'

export type TopicAlias = { id: string; topic_id: string | null; alias: string }

export type TopicAliasOptions = QueryOptions & {
  revisedById?: string | null
  skipSideEffects?: boolean
  expectedTopicId?: string
}

type PreparedTopicAliasPublicationScopes = {
  query: TransactionQuery
  aliasIds: ReadonlyMap<string, string>
}
export type CreateTopicAliasOptions = TopicAliasOptions & {
  preparedPublicationScopes?: PreparedTopicAliasPublicationScopes
}
