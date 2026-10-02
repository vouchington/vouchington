import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import { STORY_CLUSTERING_CLASSIFIER_SLUG } from '@voucha/types/entities/story-clustering-classifier'
import sql from 'sql-template-strings'
import {
  claimClassifierRun,
  requestClassifierRuns,
  reserveClassifierRun,
  type ClassifierRunLease,
} from '../../../../services/classifier-runs/index.mts'
import { createRssFeedItemEmbeddingContent } from '../../../../services/rss-feed-items/content.mts'
import type { RssFeedItemToUpsert } from '../../../../services/rss-feed-items/types.mts'
import {
  createStoryClusteringRunAdapter,
  type StoryClusteringRunConfiguration,
} from '../../../../services/stories/index.mts'
import { createTestUrlWithHostname, insertTestRssFeedItem } from '../../../index.mts'

export { STORY_CLUSTERING_CLASSIFIER_SLUG }

/**
 * Embeddings around `unit` (random): `near` (cosine distance 0.1, inside the 0.5 threshold), `far`
 * (perpendicular, distance 1.0) and `at(similarity)` for any cosine similarity in between. Random
 * vectors keep parallel tests on the shared database from becoming each other's neighbors.
 */
export function makeStoryClusteringVectors(): {
  unit: number[]
  near: number[]
  far: number[]
  at: (similarity: number) => number[]
} {
  const random = () => Array.from({ length: 1024 }, () => Math.random() - 0.5)
  const normalize = (vector: number[]) => {
    const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0))
    return vector.map(x => x / norm)
  }
  const unit = normalize(random())
  const other = random()
  const dot = unit.reduce((sum, x, i) => sum + x * other[i]!, 0)
  const far = normalize(other.map((x, i) => x - dot * unit[i]!))
  const at = (similarity: number) =>
    unit.map((x, i) => similarity * x + Math.sqrt(1 - similarity ** 2) * far[i]!)
  return { unit, near: at(0.9), far, at }
}

export type StoryClusteringItem = {
  feedId: string
  itemId: string
  inputSha256: Buffer
  subject: { postId: null; rssFeedItemId: string }
}

/** A feed item whose content digest is the receipt identity; embedded (and current) when asked. */
export async function createStoryClusteringItem(options: {
  feedId: string
  embedding?: number[]
  publishedAt?: Date
  title?: string
}): Promise<StoryClusteringItem> {
  const random = randomUUID()
  const guid = `story-clustering-${random}`
  const itemData: RssFeedItemToUpsert = {
    title: options.title ?? `Story clustering item ${random}`,
    link: `https://example.com/${guid}`,
    guid,
    ...(options.publishedAt ? { isoDate: options.publishedAt.toISOString() } : {}),
  }
  const inputSha256 = createRssFeedItemEmbeddingContent(itemData).content_sha256
  const itemId = await insertTestRssFeedItem({
    rssFeedId: options.feedId,
    urlId: await createTestUrlWithHostname(),
    guid,
    itemData,
    contentSha256: inputSha256,
    ...(options.embedding ? { embedding: options.embedding, tokens: 10 } : {}),
  })
  return {
    feedId: options.feedId,
    itemId,
    inputSha256,
    subject: { postId: null, rssFeedItemId: itemId },
  }
}

/** The durable request the feed upsert writes for story clustering, and nothing else. */
export function requestStoryClusteringRun(item: StoryClusteringItem) {
  return requestClassifierRuns(write, {
    subject: item.subject,
    inputSha256: item.inputSha256,
    classifierSlugs: [STORY_CLUSTERING_CLASSIFIER_SLUG],
  })
}

/** The request, then the reservation a dispatcher makes (which captures the candidates). */
export async function reserveStoryClusteringRun(item: StoryClusteringItem) {
  await requestStoryClusteringRun(item)
  const reserved = await reserveClassifierRun(createStoryClusteringRunAdapter(), item.subject)
  if (reserved.kind !== 'reserved') throw new Error(`Expected a reservation, got ${reserved.kind}`)
  return reserved.run
}

/** A live lease on the item's freshly reserved run. */
export async function claimStoryClusteringLease(
  item: StoryClusteringItem,
): Promise<ClassifierRunLease<StoryClusteringRunConfiguration>> {
  const run = await reserveStoryClusteringRun(item)
  const claim = await claimClassifierRun(createStoryClusteringRunAdapter(), {
    runId: run.runId,
    subject: run.subject,
    inputSha256: run.inputSha256,
    configurationSha256: run.configurationSha256,
    leaseSeconds: 60,
  })
  if (claim.kind !== 'claimed') throw new Error(`Expected a claim, got ${claim.kind}`)
  return claim.lease
}

export type StoryFacts = {
  id: string
  title: string | null
  published_at: Date | null
  cluster_reason: string | null
  official_rss_feed_item_id: string | null
  official_locked_at: Date | null
  deleted_at: Date | null
  member_ids: string[]
}

export async function readItemStoryId(itemId: string): Promise<string | null> {
  const { rows } = await write<{ story_id: string | null }>(
    sql`/* readItemStoryIdForTest */ SELECT story_id FROM rss_feed_items WHERE id = ${itemId}`,
  )
  return rows[0]?.story_id ?? null
}

export async function readStoryFacts(storyId: string): Promise<StoryFacts> {
  const { rows } = await read<StoryFacts>(sql`/* readStoryFactsForTest */
    SELECT story.id, story.title, story.published_at, story.cluster_reason,
      story.official_rss_feed_item_id, story.official_locked_at, story.deleted_at,
      COALESCE(
        (SELECT array_agg(item.id ORDER BY item.id) FROM rss_feed_items item WHERE item.story_id = story.id),
        '{}'
      ) AS member_ids
    FROM stories story WHERE story.id = ${storyId}
  `)
  return rows[0]!
}

/** What a run captured at reservation, in captured order: a story id or a standalone item id. */
export async function readStoryRunCandidates(
  runId: string,
): Promise<Array<{ storyId: string } | { rssFeedItemId: string }>> {
  const { rows } = await write<{ story_id: string | null; rss_feed_item_id: string | null }>(
    sql`/* readStoryRunCandidatesForTest */
    SELECT story_id, rss_feed_item_id FROM classifier_run_candidates
    WHERE run_id = ${runId} ORDER BY ordinal`,
  )
  return rows.map(row =>
    row.story_id ? { storyId: row.story_id } : { rssFeedItemId: row.rss_feed_item_id! },
  )
}
