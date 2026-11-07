import { read } from '@data-stores/psql'
import { searchCommunityListItems } from '@services/communities/list-items/get'
import { getEntityRelationsPage } from '@services/entity-relations/query'
import { getUserPostsCollection } from '@services/entity-fetch/profile-collections'
import { importCommunityListPostsSourceSql } from '@services/lists/import'
import { searchListItems } from '@services/lists/items'
import type { PrivateUser } from '@services/users/types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  INELIGIBLE_COLLECTION_PAGE_COUNT,
  INELIGIBLE_COLLECTION_PAGE_LIMIT,
  ineligibleCollectionPageIds,
} from '../seed-data/ineligible-collection-pages.mts'

const LIMIT = INELIGIBLE_COLLECTION_PAGE_LIMIT
const FILL = INELIGIBLE_COLLECTION_PAGE_COUNT
const POSTS_MAX = 2_000
/** Default-planner seq scan of the seeded hostname memberships. */
const HOSTNAME_MEMBERSHIP_SCAN = 401
/** Default-planner seq scan of the seeded related-post memberships. */
const RELATION_MEMBERSHIP_SCAN = 417
const ids = ineligibleCollectionPageIds
const viewerUser = {
  __entity_type: 'user' as const,
  id: ids.userId,
  username: 'seeduser7',
  roles: [] as readonly string[],
} as PrivateUser
const relationViewer = { kind: 'user' as const, userId: ids.userId, staffRole: null }

function bounded(relation: string, indexes: readonly string[], membershipMax = 64, postsMax = 128) {
  return {
    expectations: [
      { kind: 'maxProcessedRows' as const, relation, max: membershipMax },
      { kind: 'maxProcessedRows' as const, relation: 'posts', max: postsMax },
      ...(indexes.length === 0
        ? []
        : [
            {
              kind: 'usesIndexes' as const,
              indexes: [...indexes],
              anyOf: indexes.length > 1,
              queryContains: `FROM ${relation}`,
            },
          ]),
    ],
    seededRows: { [relation]: FILL },
  }
}

function assertFilledPage(length: number, hasNextPage: boolean, label: string): void {
  if (length !== LIMIT || !hasNextPage) {
    throw new Error(`${label} did not fill while eligible rows remain`)
  }
}

async function captureFilled(
  id: string,
  relation: string,
  indexes: readonly string[],
  load: () => Promise<{ length: number; hasNextPage: boolean }>,
  membershipMax = FILL,
  postsMax = POSTS_MAX,
): Promise<void> {
  registerScenarioContract(id, bounded(relation, indexes, membershipMax, postsMax))
  await runAndCapture(id, async () => {
    const page = await load()
    assertFilledPage(page.length, page.hasNextPage, id)
  })
}

export async function runIneligibleCollectionPageScenarios(): Promise<void> {
  await captureFilled(
    'collection-saved-posts-ineligible-page',
    'relation__user__save__post',
    ['idx_relation__user__save__post__subject__newest'],
    async () => {
      const page = await getUserPostsCollection(viewerUser, viewerUser.id, 'saved', {
        limit: LIMIT,
      })
      return { length: page.results.length, hasNextPage: page.page_info.has_next_page }
    },
  )

  await captureFilled(
    'collection-list-posts-ineligible-page',
    'user_list_posts',
    [
      'idx_user_list_posts__user_list_id__id',
      'idx_user_list_posts__user_list_id__id__all_rows',
      'user_list_posts_pkey',
    ],
    async () => {
      const page = await searchListItems(ids.listId, { limit: LIMIT, currentUserId: viewerUser.id })
      return { length: page.results.length, hasNextPage: page.page_info.has_next_page }
    },
  )

  registerScenarioContract('collection-list-union-ineligible-page', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'user_list_posts', max: FILL },
      { kind: 'maxProcessedRows', relation: 'user_list_rss_feed_items', max: FILL },
      { kind: 'maxProcessedRows', relation: 'posts', max: POSTS_MAX },
    ],
    seededRows: { user_list_posts: FILL },
  })
  await runAndCapture('collection-list-union-ineligible-page', () =>
    searchListItems(ids.listId, { limit: LIMIT, currentUserId: viewerUser.id }),
  )

  await captureFilled(
    'collection-community-list-posts-ineligible-page',
    'community_list_posts',
    ['idx_community_list_posts__community_id__order_index__id'],
    async () => {
      const page = await searchCommunityListItems(ids.communityId, 'post', { limit: LIMIT })
      return { length: page.results.length, hasNextPage: page.page_info.has_next_page }
    },
  )

  await captureFilled(
    'collection-community-list-hostnames-ineligible-page',
    'community_list_url_hostnames',
    [],
    async () => {
      const page = await searchCommunityListItems(ids.communityId, 'url_hostname', { limit: LIMIT })
      return { length: page.results.length, hasNextPage: page.page_info.has_next_page }
    },
    HOSTNAME_MEMBERSHIP_SCAN,
  )

  await captureFilled(
    'collection-community-list-topics-page',
    'community_list_topics',
    ['idx_community_list_topics__community_id__order_index__id'],
    async () => {
      const page = await searchCommunityListItems(ids.communityId, 'topic', { limit: LIMIT })
      return { length: page.results.length, hasNextPage: page.page_info.has_next_page }
    },
    64,
    128,
  )

  registerScenarioContract(
    'collection-community-list-import-ineligible-page',
    bounded(
      'community_list_posts',
      [
        'idx_community_list_posts__community_id__id',
        'idx_community_list_posts__community_id__id__all_rows',
        'community_list_posts_pkey',
      ],
      FILL,
      POSTS_MAX,
    ),
  )
  await runAndCapture('collection-community-list-import-ineligible-page', async () => {
    const { rows } = await read(
      importCommunityListPostsSourceSql(ids.listId, ids.communityId, relationViewer, LIMIT),
    )
    if (rows.length !== LIMIT)
      throw new Error('Import source did not fill from eligible memberships')
  })

  for (const sort of ['newest', 'best'] as const) {
    await captureFilled(
      `collection-relation-${sort}-ineligible-page`,
      'relation__post__related__post',
      [],
      async () => {
        const page = await getEntityRelationsPage('post', ids.subjectPostId, 'related', 'post', {
          viewer: relationViewer,
          sort,
          limit: LIMIT,
        })
        return { length: page.results.length, hasNextPage: page.hasNextPage }
      },
      RELATION_MEMBERSHIP_SCAN,
    )
  }
}
