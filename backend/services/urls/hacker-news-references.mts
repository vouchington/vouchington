import type { QueryOptions } from '@data-stores/psql/types'
import {
  getHackerNewsItemsByUrlIds,
  getHackerNewsTotalsByUrlIds,
  type HackerNewsUrlItems,
} from './hacker-news-references-read.mts'
import {
  HACKER_NEWS_COMMENT_CAP_PER_URL,
  HACKER_NEWS_STORY_CAP_PER_URL,
  type HackerNewsCommentReference,
  type HackerNewsReferenceCounts,
  type HackerNewsReferenceDetail,
  type HackerNewsStoryReference,
} from './hacker-news-references-types.mts'

/** URL ids that belong to each entity (post, RSS feed item), keyed by entity id. */
export type UrlIdsByEntityId = Readonly<Record<string, readonly string[]>>

type EntityReferences = HackerNewsReferenceCounts & Partial<HackerNewsUrlItems>

function newestFirst(a: { posted_at: string }, b: { posted_at: string }) {
  return b.posted_at.localeCompare(a.posted_at)
}

/**
 * Merge the rows of an entity's URLs, deduping by Hacker News item id because one thread
 * can link several URLs of the same post. Stored rows are capped per URL, so the merged
 * counts subtract only the duplicates that are visible.
 */
function mergeEntityUrls(
  referencedUrlIds: readonly string[],
  totals: ReadonlyMap<string, HackerNewsReferenceCounts>,
  items: ReadonlyMap<string, HackerNewsUrlItems>,
): HackerNewsReferenceDetail {
  const stories = new Map<number, HackerNewsStoryReference>()
  const comments = new Map<number, HackerNewsCommentReference>()
  let storyCount = 0
  let commentCount = 0
  let storyRows = 0
  let commentRows = 0
  for (const urlId of referencedUrlIds) {
    const urlTotals = totals.get(urlId)!
    storyCount += urlTotals.story_count
    commentCount += urlTotals.comment_count
    for (const story of items.get(urlId)?.stories ?? []) {
      storyRows += 1
      stories.set(story.hacker_news_item_id, story)
    }
    for (const comment of items.get(urlId)?.comments ?? []) {
      commentRows += 1
      comments.set(comment.hacker_news_item_id, comment)
    }
  }
  return {
    story_count: storyCount - (storyRows - stories.size),
    comment_count: commentCount - (commentRows - comments.size),
    stories: [...stories.values()]
      .toSorted((a, b) => b.points - a.points || b.hacker_news_item_id - a.hacker_news_item_id)
      .slice(0, HACKER_NEWS_STORY_CAP_PER_URL),
    comments: [...comments.values()]
      .toSorted((a, b) => newestFirst(a, b) || b.hacker_news_item_id - a.hacker_news_item_id)
      .slice(0, HACKER_NEWS_COMMENT_CAP_PER_URL),
  }
}

async function loadEntityReferences(
  urlIdsByEntityId: UrlIdsByEntityId,
  includeItems: boolean,
  options: QueryOptions,
): Promise<Record<string, EntityReferences>> {
  const allUrlIds = [...new Set(Object.values(urlIdsByEntityId).flat())]
  const totals = await getHackerNewsTotalsByUrlIds(allUrlIds, options)
  if (totals.size === 0) return {}

  const referencedByEntityId = new Map<string, string[]>()
  for (const [entityId, urlIds] of Object.entries(urlIdsByEntityId)) {
    const referenced = [...new Set(urlIds)].filter(urlId => totals.has(urlId))
    if (referenced.length > 0) referencedByEntityId.set(entityId, referenced)
  }

  // Counts for one URL are its totals. Several URLs need the stored rows to drop duplicates.
  const urlIdsNeedingItems = [...referencedByEntityId.values()].flatMap(urlIds =>
    includeItems || urlIds.length > 1 ? urlIds : [],
  )
  const items = await getHackerNewsItemsByUrlIds(urlIdsNeedingItems, options)

  const result: Record<string, EntityReferences> = {}
  for (const [entityId, urlIds] of referencedByEntityId) {
    if (!includeItems && urlIds.length === 1) {
      result[entityId] = { ...totals.get(urlIds[0]!)! }
      continue
    }
    result[entityId] = mergeEntityUrls(urlIds, totals, items)
  }
  return result
}

/** Counts only, for list cards. Entities with no references are omitted. */
export async function getHackerNewsSummariesByEntity(
  urlIdsByEntityId: UrlIdsByEntityId,
  options: QueryOptions = {},
): Promise<Record<string, HackerNewsReferenceCounts>> {
  const references = await loadEntityReferences(urlIdsByEntityId, false, options)
  return Object.fromEntries(
    Object.entries(references).map(([entityId, { story_count, comment_count }]) => [
      entityId,
      { story_count, comment_count },
    ]),
  )
}

/** Counts and capped item rows, for detail pages. Entities with no references are omitted. */
export async function getHackerNewsDetailsByEntity(
  urlIdsByEntityId: UrlIdsByEntityId,
  options: QueryOptions = {},
): Promise<Record<string, HackerNewsReferenceDetail>> {
  return (await loadEntityReferences(urlIdsByEntityId, true, options)) as Record<
    string,
    HackerNewsReferenceDetail
  >
}

/** Detail for one entity: a thin wrapper over the batch read. */
export async function getHackerNewsDetailForUrlIds(
  urlIds: readonly string[],
  options: QueryOptions = {},
): Promise<HackerNewsReferenceDetail | null> {
  const details = await getHackerNewsDetailsByEntity({ entity: urlIds }, options)
  return details.entity ?? null
}
