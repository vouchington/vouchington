import type { QueryOptions } from '@data-stores/psql/types'

export type TopicAlias = { id: string; topic_id: string | null; alias: string }

export type TopicAliasOptions = QueryOptions & {
  revisedById?: string | null
  skipSideEffects?: boolean
  expectedTopicId?: string
}
