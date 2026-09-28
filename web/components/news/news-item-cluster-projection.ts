import type {
  RssFeedItemsFeedResponseBody,
  StoryMemberPage,
  StoryPageResponse,
} from '@/types/rss-feed-items'

type FeedResult = RssFeedItemsFeedResponseBody['results'][number]
export type StorySelection = { primaryId: string; preview: StoryMemberPage }
export type FirstStorySelection = StorySelection & {
  primaryResult: FeedResult
  sourcePage: RssFeedItemsFeedResponseBody
}
export type FirstStorySelectionState = {
  key: symbol
  viewerId: string | null
  byStory: Map<string, FirstStorySelection>
}
export type StoryContinuation = {
  primaryId: string
  pages: StoryPageResponse[]
  loading: boolean
  error: boolean
}

export type StoryState = {
  key: symbol
  viewerId: string | null
  byStory: Record<string, StoryContinuation>
}

export function selectFirstStoryPages(
  pages: RssFeedItemsFeedResponseBody[],
  allItems: RssFeedItemsFeedResponseBody['rss_feed_items'],
): Map<string, FirstStorySelection> {
  const selected = new Map<string, FirstStorySelection>()
  for (const page of pages) {
    for (const result of page.results) {
      if (result.delivery_type === 'share' || !result.story_id || selected.has(result.story_id))
        continue
      const primaryId = result.entity_id ?? result.id
      if (!allItems[primaryId]) continue
      selected.set(result.story_id, {
        primaryId,
        primaryResult: result,
        sourcePage: page,
        preview: page.story_member_pages?.[result.story_id] ?? {
          item_ids: [],
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        },
      })
    }
  }
  return selected
}

export function buildClusters(
  results: FeedResult[],
  items: RssFeedItemsFeedResponseBody['rss_feed_items'],
  selections: Map<string, FirstStorySelection>,
  continuations: Record<string, StoryContinuation>,
) {
  const seenStoryIds = new Set<string>()
  const seenItemIds = new Set<string>()
  const clusters: Array<{
    primaryResult: FeedResult
    primary: RssFeedItemsFeedResponseBody['rss_feed_items'][string]
    storyItems: Array<RssFeedItemsFeedResponseBody['rss_feed_items'][string]>
    storyId: string | null
    hasMoreStoryItems: boolean
    loadingStoryItems: boolean
    storyLoadError: boolean
  }> = []
  for (const result of results) {
    const selection =
      result.delivery_type === 'share' || !result.story_id
        ? undefined
        : selections.get(result.story_id)
    const primaryId = selection?.primaryId ?? result.entity_id ?? result.id
    const primary = items[primaryId]
    if (!primary) continue
    if (result.delivery_type === 'share') {
      clusters.push({
        primaryResult: result,
        primary,
        storyItems: [],
        storyId: null,
        hasMoreStoryItems: false,
        loadingStoryItems: false,
        storyLoadError: false,
      })
      continue
    }
    if (seenItemIds.has(primaryId)) continue
    seenItemIds.add(primaryId)
    const storyId = result.story_id
    if (!storyId || seenStoryIds.has(storyId)) {
      if (!storyId)
        clusters.push({
          primaryResult: result,
          primary,
          storyItems: [],
          storyId: null,
          hasMoreStoryItems: false,
          loadingStoryItems: false,
          storyLoadError: false,
        })
      continue
    }
    seenStoryIds.add(storyId)
    const continuation =
      continuations[storyId]?.primaryId === primaryId ? continuations[storyId] : undefined
    const memberIds = [
      ...(selection?.preview.item_ids ?? []),
      ...(continuation?.pages.flatMap(page => page.item_ids) ?? []),
    ]
    const storyItems = memberIds.flatMap(id => {
      if (id === primaryId || seenItemIds.has(id)) return []
      const item = items[id]
      if (!item) return []
      seenItemIds.add(id)
      return [item]
    })
    const info = continuation?.pages.at(-1)?.page_info ?? selection?.preview.page_info
    clusters.push({
      primaryResult: selection?.primaryResult ?? result,
      primary,
      storyItems,
      storyId,
      hasMoreStoryItems: info?.has_next_page ?? false,
      loadingStoryItems: continuation?.loading ?? false,
      storyLoadError: continuation?.error ?? false,
    })
  }
  return clusters
}

export function orderedVisibleItemIds(
  visibleClusters: ReturnType<typeof buildClusters>,
  expandedStoryIds: Set<string>,
) {
  return [
    ...new Set(
      visibleClusters.flatMap(cluster =>
        !cluster.storyId || !expandedStoryIds.has(cluster.storyId)
          ? [cluster.primary.id]
          : [cluster.primary.id, ...cluster.storyItems.map(item => item.id)],
      ),
    ),
  ]
}

export function updateStory(
  previous: StoryState,
  scope: { key: symbol; viewerId: string | null },
  storyId: string,
  primaryId: string,
  patch: Partial<StoryContinuation>,
): StoryState {
  if (previous.key !== scope.key || previous.viewerId !== scope.viewerId) return previous
  const prior = previous.byStory[storyId]
  if (prior && prior.primaryId !== primaryId) return previous
  return {
    ...previous,
    byStory: {
      ...previous.byStory,
      [storyId]: {
        primaryId,
        pages: prior?.pages ?? [],
        loading: false,
        error: false,
        ...patch,
      },
    },
  }
}

export function mergeSidecars<T>(
  pages: RssFeedItemsFeedResponseBody[],
  continuation: StoryPageResponse[],
  pick: (page: RssFeedItemsFeedResponseBody | StoryPageResponse) => Record<string, T> | undefined,
): Record<string, T> {
  return Object.assign({}, ...[...pages, ...continuation].map(page => pick(page) ?? {}))
}
