import { getCapturedQueries, extractQueryName } from '@data-stores/psql'
import { caches } from '@services/entity-cache/caches'
import type {
  StoryMemberPage,
  StoryMemberRequest,
} from '@services/feeds/rss-feed-items/story-member-pages'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { STORY_POST_RELATED_URL_PROJECTION_SEED } from '../seed-data/story-post-related-url-projection.mts'
import { heavyFollowUser, runAndCapture } from '../run-support.mts'
import * as services from '../run-services.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

const { getPrivateUserByAny, getRssFeedItemFeedIds, getStoryPreviews, getStoryMemberPagesBatch } =
  services
const { hydrateStoryMemberPage, storyRelatedItemsConfig } = services
const HYDRATION_QUERY_NAMES = [
  'getRssFeedItemsByIdBatch',
  'getElectionsByIdBatch',
  'getRssFeedItemEmbedsByItems',
] as const

export async function runStoryMemberPageScenarios(): Promise<void> {
  const { storyId, feedSearchToken } = STORY_POST_RELATED_URL_PROJECTION_SEED
  const viewer = await getPrivateUserByAny(heavyFollowUser.id)
  if (!viewer) throw new Error('Story EXPLAIN viewer was not seeded')
  const feedPage = await getRssFeedItemFeedIds(viewer, {
    limit: 25,
    text_search_query: feedSearchToken,
  })
  const primary = feedPage.results[0]
  if (
    feedPage.results.length !== 1 ||
    primary?.delivery_type !== 'direct' ||
    primary.story_id !== storyId
  )
    throw new Error('Story EXPLAIN fixture must have one real direct primary')
  const primaryId = primary.entity_id

  for (const limit of [1, 3] as const) {
    const kind = `preview-${limit}`
    const request = { story_id: storyId, exclude_item_id: primaryId }
    const restore = overrideDynamicConfigFieldsForTest(storyRelatedItemsConfig, {
      preview_limit: limit,
    })
    let first: StoryMemberPage
    try {
      first = await capturePage(`story-members-${kind}-first`, storyId, limit, () =>
        getStoryPreviews(viewer, [primary]),
      )
    } finally {
      restore()
    }
    if (first.item_ids.includes(primaryId))
      throw new Error(`${kind} included its primary in related previews`)
    await captureHydration(`story-hydration-${kind}-first`, viewer, storyId, first, request)
    const after = await capturePage(`story-members-${kind}-after`, storyId, limit, () =>
      getStoryMemberPagesBatch(viewer, [{ ...request, after: first.page_info.end_cursor! }], {
        limit,
      }),
    )
    assertDisjoint(first, after, kind)
    await captureHydration(`story-hydration-${kind}-after`, viewer, storyId, after, request)
  }

  const detailRequest = { story_id: storyId }
  const first = await capturePage('story-members-detail-25-first', storyId, 25, () =>
    getStoryMemberPagesBatch(viewer, [detailRequest], { limit: 25 }),
  )
  await captureHydration('story-hydration-detail-25-first', viewer, storyId, first, detailRequest)
  const after = await capturePage('story-members-detail-25-after', storyId, 25, () =>
    getStoryMemberPagesBatch(viewer, [{ ...detailRequest, after: first.page_info.end_cursor! }], {
      limit: 25,
    }),
  )
  assertDisjoint(first, after, 'detail-25')
  await captureHydration('story-hydration-detail-25-after', viewer, storyId, after, detailRequest)
}

async function capturePage(
  scenarioId: string,
  storyId: string,
  limit: number,
  getPages: () => Promise<Record<string, StoryMemberPage>>,
): Promise<StoryMemberPage> {
  let page: StoryMemberPage | undefined
  registerScenarioContract(scenarioId, {
    expectations: [{ kind: 'custom', name: 'storyMemberPages' }],
  })
  await runAndCapture(
    scenarioId,
    async () => {
      page = (await getPages())[storyId]
      if (
        !page ||
        page.item_ids.length !== limit ||
        !page.page_info.has_next_page ||
        !page.page_info.end_cursor ||
        page.item_ids.some((id, index) => index > 0 && id >= page!.item_ids[index - 1]!)
      )
        throw new Error(`${scenarioId} must return ${limit} ordered members with lookahead`)
    },
    undefined,
    'getStoryMemberPagesBatch',
  )
  return page!
}

async function captureHydration(
  scenarioId: string,
  viewer: NonNullable<Awaited<ReturnType<typeof getPrivateUserByAny>>>,
  storyId: string,
  page: StoryMemberPage,
  request: StoryMemberRequest,
): Promise<void> {
  const selected = page.item_ids
  const next = await getStoryMemberPagesBatch(
    viewer,
    [{ ...request, after: page.page_info.end_cursor! }],
    { limit: 1 },
  )
  const lookaheadId = next[storyId]?.item_ids[0]
  if (!lookaheadId || selected.includes(lookaheadId))
    throw new Error(`${scenarioId} must have a real excluded lookahead member`)
  await Promise.all([
    caches.rss_feed_items.invalidateCacheGetByAny(...selected),
    caches.rss_feed_item_elections.invalidateCacheGetByAny(...selected),
  ])
  registerScenarioContract(scenarioId, {
    expectations: [{ kind: 'custom', name: 'storyMemberPages' }],
    crossPartition: {
      crawls: 'Selected-item embed hydration finds source crawls across retained months.',
    },
  })
  await runAndCapture(
    scenarioId,
    async () => {
      const hydrated = await hydrateStoryMemberPage(viewer, storyId, selected)
      const captured = getCapturedQueries()
      for (const name of HYDRATION_QUERY_NAMES) {
        const matches = captured.filter(query => extractQueryName(query.text) === name)
        if (matches.length !== 1)
          throw new Error(`${scenarioId} must capture exactly one ${name} cache-miss query`)
        const boundIds = matches[0]!.values[0]
        if (!Array.isArray(boundIds) || !sameIds(boundIds, selected))
          throw new Error(`${scenarioId} ${name} did not receive exactly the selected IDs`)
      }
      if (captured.some(query => containsId(query.values, lookaheadId)))
        throw new Error(`${scenarioId} hydrated its actual lookahead member`)
      for (const field of ['rss_feed_items', 'rss_feed_item_elections'] as const) {
        if (!sameIds(Object.keys(hydrated[field]), selected))
          throw new Error(`${scenarioId} ${field} must contain only selected IDs`)
      }
      for (const field of [
        'rss_feed_item_embeds',
        'rss_feed_item_thumbnail_url',
        'rss_feed_item_content_html',
      ] as const) {
        if (Object.keys(hydrated[field]).some(id => !selected.includes(id)))
          throw new Error(`${scenarioId} ${field} included an unselected member`)
      }
      console.log(`  selected=${selected.length} lookahead=${lookaheadId} SQL=${captured.length}`)
    },
    undefined,
    HYDRATION_QUERY_NAMES,
  )
}

function assertDisjoint(first: StoryMemberPage, after: StoryMemberPage, kind: string): void {
  if (after.item_ids.some(id => first.item_ids.includes(id)))
    throw new Error(`${kind} continuation repeated a first-page member`)
}

function sameIds(actual: readonly unknown[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    new Set(actual).size === expected.length &&
    actual.every(id => typeof id === 'string' && expected.includes(id))
  )
}

function containsId(value: unknown, id: string): boolean {
  if (value === id) return true
  if (Array.isArray(value)) return value.some(entry => containsId(entry, id))
  return false
}
