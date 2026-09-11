import type { QueryOptions } from '@data-stores/psql/types'
import { claimTopicAlias, updateTopicAliasesField } from './aliases.mts'
import type { TopicAlias } from './alias-types.mts'

export async function claimTopicAliasAndSync(
  topicId: string,
  alias: string,
  options: QueryOptions,
): Promise<TopicAlias> {
  const claimedAlias = await claimTopicAlias(topicId, alias, options)
  await updateTopicAliasesField(topicId, { ...options, skipSideEffects: true })
  return claimedAlias
}

export function isTopicAliasOwnershipConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 409 &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.startsWith('Alias already belongs to another topic: ')
  )
}
