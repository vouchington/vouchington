import { runCrawlerBatchScenario } from './crawler-batch.mts'
import { runHostnameOwnershipScenarios } from './hostname-ownership.mts'
import { getVoteFollowContextBatch } from '@services/users/follow-context'
import { getFollowedUsersFollowingTopicIds } from '@services/users/follow-context-topic-query'
import { getTopicDataPointInsightsBatch } from '@services/data-points/insights'
import { getEntityRelationsBatch } from '@services/entity-relations/query'
import { entityRelationViewerFor } from '@services/users'
import { registerScenarioContract } from '../plan-expectations.mts'
import {
  runAndCapture,
  seedPostId,
  seedTopicId,
  seedUser,
  seedHostnameIds,
} from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { getCachedElectionGroups } from '@services/elections-votes/shared/cached-groups'
import { caches } from '@services/entity-cache/caches'
import { getPostAndModerationVotes } from '@services/elections-votes/shared/post-moderation-votes'
import { assertUrlsHaveNoBlockedHostnames } from '@services/urls/assert-hostname-not-blocked'
import { runRelatablePostAccessScenario } from './relatable-post-access.mts'
import { runRelationRoundTripScenarios } from './relation-round-trips.mts'

// Budgets are the larger of both plan modes and capture passes, plus 20% rounded up.
export async function runRelationReadBatchScenarios(): Promise<void> {
  await runRelationRoundTripScenarios()
  await runHostnameOwnershipScenarios()
  await runCrawlerBatchScenario()
  await runRelatablePostAccessScenario()
  registerScenarioContract('url-blocked-policy-with-values', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'urls', max: 3 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 3 },
    ],
  })
  await runAndCapture(
    'url-blocked-policy-with-values',
    () => assertUrlsHaveNoBlockedHostnames([seedUuid(0, '03'), seedUuid(1, '03')]),
    undefined,
    'assertUrlsHaveNoBlockedHostnames',
  )
  await Promise.all([
    caches.topic_elections.delete(seedTopicId),
    caches.hostname_elections.delete(seedHostnameIds[0]!),
  ])
  registerScenarioContract('cached-topic-hostname-elections', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'topics', max: 2 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 2 },
    ],
  })
  await runAndCapture('cached-topic-hostname-elections', () =>
    getCachedElectionGroups({ topic: [seedTopicId], hostname: [seedHostnameIds[0]!] }),
  )
  await caches.post_elections.delete(seedPostId)
  const absentModerationId = seedUuid(0, '7f')
  await caches.agent_moderation_elections.delete(absentModerationId)
  registerScenarioContract('cached-post-moderation-elections', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: 2 },
      { kind: 'maxProcessedRows', relation: 'agent_moderations', max: 0 },
    ],
  })
  // The post exists; the moderation probes a missing key, preserving negative caching.
  await runAndCapture('cached-post-moderation-elections', () =>
    getCachedElectionGroups({ post: [seedPostId], agent_moderation: [absentModerationId] }),
  )
  registerScenarioContract('post-moderation-viewer-votes', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'post_votes', max: 2 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 2 },
      { kind: 'maxProcessedRows', relation: 'agent_moderation_votes', max: 0 },
    ],
  })
  await runAndCapture('post-moderation-viewer-votes', () =>
    getPostAndModerationVotes(seedUser.id, [seedPostId], [absentModerationId]),
  )
  registerScenarioContract('follow-context-votes-batch', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'post_votes', max: 4 },
      { kind: 'maxProcessedRows', relation: 'relation__user__follow__user', max: 2 },
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
    ],
  })
  await runAndCapture(
    'follow-context-votes-batch',
    () => getVoteFollowContextBatch(seedUser, seedPostId, 'post_votes'),
    undefined,
    'getFollowedUsersByElectionVote',
  )
  registerScenarioContract('follow-context-topic-followers', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'relation__user__follow__topic', max: 2 },
      { kind: 'maxProcessedRows', relation: 'relation__user__follow__user', max: 2 },
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
    ],
  })
  await runAndCapture('follow-context-topic-followers', () =>
    getFollowedUsersFollowingTopicIds(seedUser, seedUuid(1, '04'), 5),
  )
  registerScenarioContract('topic-comparison-insights', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'post_data_point_topics', max: 3 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 5 },
    ],
  })
  await runAndCapture('topic-comparison-insights', () =>
    getTopicDataPointInsightsBatch([seedTopicId, seedUuid(1, '04')]),
  )
  registerScenarioContract('topic-comparison-categories', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'relation__topic__category__topic', max: 17 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 2 },
    ],
  })
  await runAndCapture('topic-comparison-categories', () =>
    getEntityRelationsBatch('topic', [seedTopicId, seedUuid(1, '04')], 'category', 'topic', {
      viewer: entityRelationViewerFor(null),
      positiveNetVoteScore: true,
      limit: 20,
    }),
  )
}
