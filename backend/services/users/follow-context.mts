import type { QueryOptions } from '@data-stores/psql/types'
import type { BasicUser } from './types.mts'
import {
  getFollowedUsersByElectionVoteIds,
  getFollowedUsersByElectionVoteIdsBatch,
  hydrateFollowContextGroups,
  type FollowContextIds,
  type FollowContextUsers,
  type VoteTableName,
} from './follow-context-queries.mts'
import { getFollowedUsersFollowingTopicIds } from './follow-context-topic-query.mts'

const DEFAULT_LIMIT = 5

type FollowContextBatchOptions = {
  limit?: number
  queryOptions?: QueryOptions
}

type VoteFollowContextBatch = {
  positiveByFollowing: FollowContextUsers
  negativeByFollowing: FollowContextUsers
}

type TopicFollowContextBatch = VoteFollowContextBatch & {
  followingTopicFollowers: FollowContextUsers
}

/** Fetch positive and negative vote context with one public-user hydration query. */
export async function getVoteFollowContextBatch(
  currentUser: BasicUser,
  entityId: string,
  voteTable: VoteTableName,
  { limit = DEFAULT_LIMIT, queryOptions = {} }: FollowContextBatchOptions = {},
): Promise<VoteFollowContextBatch> {
  const [positive, negative] = await getFollowContextVoteIds(
    currentUser,
    entityId,
    voteTable,
    limit,
    queryOptions,
  )
  const [positiveUsers, negativeUsers] = await hydrateFollowContextGroups(
    [positive, negative],
    queryOptions,
  )
  return {
    positiveByFollowing: positiveUsers!,
    negativeByFollowing: negativeUsers!,
  }
}

/** Fetch both vote groups and topic followers with one shared public-user hydration query. */
export async function getTopicFollowContextBatch(
  currentUser: BasicUser,
  topicId: string,
  { limit = DEFAULT_LIMIT, queryOptions = {} }: FollowContextBatchOptions = {},
): Promise<TopicFollowContextBatch> {
  const [[positive, negative], topicFollowers] = await Promise.all([
    getFollowContextVoteIds(currentUser, topicId, 'topic_votes', limit, queryOptions),
    getFollowedUsersFollowingTopicIds(currentUser, topicId, limit, queryOptions),
  ])
  const [positiveUsers, negativeUsers, topicFollowerUsers] = await hydrateFollowContextGroups(
    [positive, negative, topicFollowers],
    queryOptions,
  )
  return {
    positiveByFollowing: positiveUsers!,
    negativeByFollowing: negativeUsers!,
    followingTopicFollowers: topicFollowerUsers!,
  }
}

async function getFollowContextVoteIds(
  currentUser: BasicUser,
  entityId: string,
  voteTable: VoteTableName,
  limit: number,
  queryOptions: QueryOptions,
): Promise<[FollowContextIds, FollowContextIds]> {
  const [positive, negative] = await getFollowedUsersByElectionVoteIdsBatch(
    currentUser,
    entityId,
    voteTable,
    [1, -1],
    { limit, queryOptions },
  )
  return [positive!, negative!]
}

/** Retained for the EXPLAIN service scenario that measures a single vote-sign lookup. */
export async function getFollowedUsersByElectionVote(
  currentUser: BasicUser,
  entityId: string | null | undefined,
  voteTable: VoteTableName,
  sign: -1 | 1,
  {
    limit = DEFAULT_LIMIT,
    queryOptions = {},
  }: { limit?: number; queryOptions?: QueryOptions } = {},
): Promise<FollowContextUsers> {
  const result = await getFollowedUsersByElectionVoteIds(currentUser, entityId, voteTable, sign, {
    limit,
    queryOptions,
  })
  return (await hydrateFollowContextGroups([result], queryOptions))[0]!
}
