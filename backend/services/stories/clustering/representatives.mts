import { read, type QueryExecutor } from '@data-stores/psql'
import type { ClassifierRunSubject, StoryRunCandidate } from '@services/classifier-runs'
import sql from 'sql-template-strings'

/** One captured candidate and the RSS item whose content stands in for it in the prompt. */
export type StoryClusteringRepresentative = {
  candidate: StoryRunCandidate
  /** Null only for a story with no live member left, which the prompt describes structurally. */
  rssFeedItemId: string | null
  /** The story's own `published_at`; null for a standalone item or a story without one. */
  storyPublishedAt: Date | null
}

type StoryRepresentativeRow = {
  story_id: string
  rss_feed_item_id: string | null
  story_published_at: Date | null
}

/**
 * The nearest live member of each story to the classified item's embedding. A story is captured by
 * id alone and its membership changes, so which member represents it is derived at call time rather
 * than pinned: a member that left or was deleted since capture is replaced by the next nearest, and a
 * story that lost every member (or was deleted) is still described so the decision covers exactly
 * the candidates it reserved.
 */
async function readStoryRepresentatives(
  storyIds: readonly string[],
  subjectItemId: string,
  query: QueryExecutor,
): Promise<ReadonlyMap<string, StoryRepresentativeRow>> {
  if (storyIds.length === 0) return new Map()
  const { rows } = await query<StoryRepresentativeRow>(
    sql`/* readStoryClusteringRepresentatives */
    SELECT wanted.story_id, member.id AS rss_feed_item_id, story.published_at AS story_published_at
    FROM unnest(${[...storyIds]}::uuid[]) AS wanted(story_id)
    LEFT JOIN stories story ON story.id = wanted.story_id AND story.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT candidate.id
      FROM rss_feed_items candidate
      CROSS JOIN rss_feed_items subject
      WHERE subject.id = ${subjectItemId}
        AND candidate.story_id = wanted.story_id
        AND candidate.deleted_at IS NULL
      ORDER BY
        (candidate.bedrock_nova_multimodal_v1_embedding <=> subject.bedrock_nova_multimodal_v1_embedding)
          ASC NULLS LAST,
        candidate.id ASC
      LIMIT 1
    ) member ON TRUE`,
  )
  return new Map(rows.map(row => [row.story_id, row]))
}

/**
 * Pairs every captured candidate, in capture order, with the item that represents it. Never drops a
 * candidate: the persisted decision must cover exactly the candidates the receipt reserved.
 */
export async function readStoryClusteringRepresentatives(
  subject: ClassifierRunSubject,
  candidates: readonly StoryRunCandidate[],
  query: QueryExecutor = read,
): Promise<readonly StoryClusteringRepresentative[]> {
  if (subject.rssFeedItemId === null) {
    throw new Error('Story clustering representatives require an RSS feed item subject')
  }
  const storyIds = candidates.flatMap(candidate =>
    candidate.kind === 'story' ? [candidate.storyId] : [],
  )
  const stories = await readStoryRepresentatives(storyIds, subject.rssFeedItemId, query)
  return candidates.map(candidate => {
    if (candidate.kind === 'rss_feed_item') {
      return { candidate, rssFeedItemId: candidate.rssFeedItemId, storyPublishedAt: null }
    }
    const row = stories.get(candidate.storyId)
    return {
      candidate,
      rssFeedItemId: row?.rss_feed_item_id ?? null,
      storyPublishedAt: row?.story_published_at ?? null,
    }
  })
}
