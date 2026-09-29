import {
  beginTransaction,
  clearCapturedQueries,
  disableQueryCapture,
  enableQueryCapture,
  explainAnalyze,
  extractQueryName,
  getCapturedQueries,
  read,
  type ExplainResult,
} from '@data-stores/psql'
import { getPostByAny } from '@services/posts/get'
import { getConversationMessagesByConversationId } from '@services/conversations-messages/messages'
import { updateEntityRelationElectionVoteStatsFromPrimaryBatch } from '@services/elections-votes/entity-relation/vote-stats-batch'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import { pruningFixture as fixture } from './fixture-ids.mts'
import { assertExecutingPrunedLeaves } from './plan-gate.mts'
import { getPartitionLeaves, rangeLeaf, VOTE_PARENT } from './partitions.mts'

interface Scenario {
  label: string
  queryName: string
  parent: string
  expectedLeaves: string[]
  invoke: () => Promise<void>
}

export interface PruningCapture {
  results: ExplainResult[]
  executedLeaves: Record<string, string[]>
}

function scenarios(): Scenario[] {
  const result: Scenario[] = []
  for (const [index, postId] of fixture.posts.entries()) {
    const year = 2024 + index
    result.push({
      label: `review:${year}`,
      queryName: 'getPostByAny',
      parent: 'post_review_topic_ratings',
      expectedLeaves: [
        index < 2
          ? rangeLeaf('post_review_topic_ratings', year)
          : 'post_review_topic_ratings__default',
      ],
      async invoke() {
        const post = await getPostByAny(postId)
        const ratings = post?.review_topic_ratings
        if (!ratings || ratings.length !== 1 || ratings[0]?.topic_id !== fixture.topicId) {
          throw new Error(`review:${year} must return its seeded rating`)
        }
      },
    })
  }
  for (const [index, conversationId] of fixture.conversations.entries()) {
    const year = 2024 + index
    result.push({
      label: `conversation:${year}`,
      queryName: 'getConversationMessagesByConversationId',
      parent: 'conversation_messages',
      expectedLeaves: [
        index < 2 ? rangeLeaf('conversation_messages', year) : 'conversation_messages__default',
      ],
      async invoke() {
        const messages = await getConversationMessagesByConversationId(conversationId)
        if (messages.length !== 1 || messages[0]?.conversation_id !== conversationId) {
          throw new Error(`conversation:${year} must return its seeded message`)
        }
      },
    })
  }
  for (const [label, indexes] of [
    ['votes:2024', [0]],
    ['votes:2025', [1]],
    ['votes:default', [2]],
    ['votes:two-ranges', [0, 1]],
  ] as const) {
    result.push({
      label,
      queryName: 'updateEntityRelationElectionVoteStatsFromPrimaryBatch',
      parent: VOTE_PARENT,
      expectedLeaves: indexes.map(index =>
        index < 2
          ? rangeLeaf('relation__post__category__topic__votes', 2024 + index)
          : 'relation__post__category__topic__votes__default',
      ),
      async invoke() {
        await using transaction = await beginTransaction()
        const targets = indexes.map(index =>
          createEntityRelationElectionTarget(
            index === 1 ? fixture.relations[index]!.toUpperCase() : fixture.relations[index]!,
            fixture.relationTable,
          ),
        )
        const changed = await updateEntityRelationElectionVoteStatsFromPrimaryBatch(targets, {
          query: transaction,
          invalidateCache: false,
          enqueueTopHashtagRefresh: false,
        })
        if (changed.length !== indexes.length) {
          throw new Error(`${label} must update every seeded relation from a real vote`)
        }
        const { rows } = await transaction<{
          id: string
          votes_count_up: number
          votes_score_net: number
        }>(
          `/* assertPruningVoteStats */ SELECT id, votes_count_up, votes_score_net
           FROM relation__post__category__topic WHERE id = ANY($1::uuid[])`,
          [targets.map(target => target.entityRelationId)],
        )
        if (
          rows.length !== indexes.length ||
          rows.some(row => row.votes_count_up !== 1 || row.votes_score_net !== 1)
        ) {
          throw new Error(`${label} must count exactly one positive vote for every target`)
        }
      },
    })
  }
  return result
}

export async function capturePruningProof(
  onResult: (result: ExplainResult) => void,
): Promise<PruningCapture> {
  const results: ExplainResult[] = []
  const executedLeaves: Record<string, string[]> = {}
  for (const scenario of scenarios()) {
    clearCapturedQueries()
    enableQueryCapture()
    try {
      await scenario.invoke()
    } finally {
      disableQueryCapture()
    }
    const captured = getCapturedQueries().filter(
      query => extractQueryName(query.text) === scenario.queryName,
    )
    if (captured.length !== 1) {
      throw new Error(
        `${scenario.label} captured ${captured.length} production ${scenario.queryName} queries`,
      )
    }
    const allLeaves = await getPartitionLeaves(read, scenario.parent)
    for (const mode of ['force_custom_plan', 'force_generic_plan'] as const) {
      const explained = await explainAnalyze(
        `${scenario.queryName}:${scenario.label}:${mode}`,
        captured[0]!.text,
        captured[0]!.values,
        { planCacheMode: mode, jit: 'off' },
      )
      explained.scenario_id = scenario.label
      results.push(explained)
      onResult(explained)
      executedLeaves[`${scenario.label}:${mode}`] = assertExecutingPrunedLeaves({
        label: `${scenario.label}:${mode}`,
        plan: explained.plan as { Plan?: { 'Node Type'?: string } },
        parent: scenario.parent,
        allLeaves,
        expectedLeaves: scenario.expectedLeaves,
      })
    }
  }
  return { results, executedLeaves }
}
