import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { beginTransaction, write } from '@data-stores/psql'
import { joinExistingStory } from '@services/stories/clustering/membership'
import sql from 'sql-template-strings'
import {
  createStoryClusteringItem,
  makeStoryClusteringVectors,
} from './data-stores/psql/classifier-runs/story-clustering-fixture.mts'
import { createTestRssFeed } from './rss-feed-create.mts'
import { decisionResponseBody, readAskedQuestions } from './structured-decision-dialect.mts'
import { setTestItemStoryId } from './entities/stories.mts'
import { runBeforePostgresStatementForTest } from './injected-failures.mts'

/** Commits a competing membership write on a separate connection while clustering is paused. */
export function commitCompetingStoryMembership(
  assignment: 'join' | 'pair',
  candidateId: string,
  storyId: string,
): () => void {
  const marker = assignment === 'join' ? 'assignStoryClusteringItem' : 'assignStoryClusteringPair'
  return runBeforePostgresStatementForTest(`/* ${marker}`, () =>
    setTestItemStoryId(candidateId, storyId),
  )
}

export async function attemptStoryClusteringJoin(itemId: string, storyId: string, digest: Buffer) {
  await using query = await beginTransaction()
  const result = await joinExistingStory(query, itemId, storyId, digest)
  await query.commit()
  return result
}

export async function storyExistsWithTitle(title: string): Promise<boolean> {
  const { rows } = await write<{ exists: boolean }>(sql`/* storyExistsWithTitle */
    SELECT EXISTS (SELECT 1 FROM stories WHERE title = ${title})`)
  return rows[0]!.exists
}

/** An embedded incoming item with a standalone neighbor close enough to be captured. */
export async function createIncomingWithStoryNeighbor(neighborTitle?: string) {
  const { unit, near, at } = makeStoryClusteringVectors()
  const feed = await createTestRssFeed({})
  const neighbor = await createStoryClusteringItem({
    feedId: feed.id,
    embedding: near,
    title: neighborTitle,
  })
  const incoming = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
  return { feed, neighbor, incoming, at }
}

export function storyClusteringDecisionResponse(
  init: Parameters<typeof readAskedQuestions>[0],
  choose: (criteria: string[]) => string,
) {
  const answers = Object.entries(readAskedQuestions(init)).map(([id, question]) => {
    const criteria = Object.keys(question.criteria)
    const choice = choose(criteria)
    const rest = 0.1 / (criteria.length - 1)
    const probabilities = Object.fromEntries(
      criteria.map(key => [key, key === choice ? 0.9 : rest]),
    )
    return { id, type: 'choice', choice, confidence: 0.9, probabilities }
  })
  return Response.json(
    decisionResponseBody(init, {
      id: `decision-${randomUUID()}`,
      usage: { input_tokens: 12, output_tokens: 0, cost: 0 },
      answers,
    }),
  )
}
