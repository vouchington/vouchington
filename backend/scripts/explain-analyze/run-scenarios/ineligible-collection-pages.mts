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
  INELIGIBLE_COLLECTION_NOISE_COMMUNITY_COUNT,
  ineligibleCollectionPageIds,
} from '../seed-data/ineligible-collection-pages.mts'
import { captureSavedPostsAtCap } from './saved-posts-capacity.mts'

const { userId, listId, communityId, subjectPostId } = ineligibleCollectionPageIds
const viewerUser = {
  __entity_type: 'user' as const,
  id: userId,
  username: 'seeduser7',
  roles: [] as readonly string[],
} as PrivateUser
const relationViewer = {
  kind: 'user' as const,
  userId,
  staffRole: null,
}

const pageLimit = { limit: INELIGIBLE_COLLECTION_PAGE_LIMIT }
const listOptions = { ...pageLimit, currentUserId: viewerUser.id }

function bounded(relation: string, indexes: readonly string[]) {
  return {
    expectations: [
      { kind: 'maxProcessedRows' as const, relation, max: 64 },
      { kind: 'maxProcessedRows' as const, relation: 'posts', max: 128 },
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
    seededRows: {
      [relation]:
        relation === 'community_list_posts'
          ? INELIGIBLE_COLLECTION_PAGE_COUNT * (1 + INELIGIBLE_COLLECTION_NOISE_COMMUNITY_COUNT)
          : INELIGIBLE_COLLECTION_PAGE_COUNT,
    },
  }
}

function assertFilledPage(length: number, hasNextPage: boolean, label: string): void {
  if (length !== INELIGIBLE_COLLECTION_PAGE_LIMIT || !hasNextPage) {
    throw new Error(`${label} did not fill while eligible rows remain`)
  }
}

async function captureFilled(
  id: string,
  relation: string,
  indexes: readonly string[],
  load: () => Promise<{ length: number; hasNextPage: boolean }>,
): Promise<void> {
  registerScenarioContract(id, bounded(relation, indexes))
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
      const page = await getUserPostsCollection(viewerUser, viewerUser.id, 'saved', pageLimit)
      return { length: page.results.length, hasNextPage: page.page_info.has_next_page }
    },
  )

  await captureSavedPostsAtCap(viewerUser)
  await captureFilled(
    'collection-list-posts-ineligible-page',
    'user_list_posts',
    [
      'idx_user_list_posts__user_list_id__id',
      'idx_user_list_posts__user_list_id__id__all_rows',
      'user_list_posts_pkey',
    ],
    async () => {
      const page = await searchListItems(listId, listOptions)
      return { length: page.results.length, hasNextPage: page.page_info.has_next_page }
    },
  )

  registerScenarioContract('collection-list-union-ineligible-page', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'user_list_posts', max: 64 },
      { kind: 'maxProcessedRows', relation: 'user_list_rss_feed_items', max: 64 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 128 },
    ],
    seededRows: { user_list_posts: INELIGIBLE_COLLECTION_PAGE_COUNT },
  })
  await runAndCapture('collection-list-union-ineligible-page', () =>
    searchListItems(listId, listOptions),
  )

  await captureFilled(
    'collection-community-list-posts-ineligible-page',
    'community_list_posts',
    ['idx_community_list_posts__community_id__order_index__id'],
    async () => {
      const page = await searchCommunityListItems(communityId, 'post', pageLimit)
      return { length: page.results.length, hasNextPage: page.page_info.has_next_page }
    },
  )

  await captureFilled(
    'collection-community-list-hostnames-ineligible-page',
    'community_list_url_hostnames',
    ['idx_community_list_url_hostnames__community_id__order_index__id'],
    async () => {
      const page = await searchCommunityListItems(communityId, 'url_hostname', pageLimit)
      return { length: page.results.length, hasNextPage: page.page_info.has_next_page }
    },
  )

  await captureFilled(
    'collection-community-list-topics-page',
    'community_list_topics',
    ['idx_community_list_topics__community_id__order_index__id'],
    async () => {
      const page = await searchCommunityListItems(communityId, 'topic', pageLimit)
      return { length: page.results.length, hasNextPage: page.page_info.has_next_page }
    },
  )

  registerScenarioContract(
    'collection-community-list-import-ineligible-page',
    bounded('community_list_posts', [
      'idx_community_list_posts__community_id__id',
      'idx_community_list_posts__community_id__id__all_rows',
      'community_list_posts_pkey',
    ]),
  )
  await runAndCapture('collection-community-list-import-ineligible-page', async () => {
    const { rows } = await read(
      importCommunityListPostsSourceSql(
        listId,
        communityId,
        relationViewer,
        INELIGIBLE_COLLECTION_PAGE_LIMIT,
      ),
    )
    if (rows.length !== INELIGIBLE_COLLECTION_PAGE_LIMIT)
      throw new Error('Import source did not fill from eligible memberships')
  })

  await captureFilled(
    'collection-relation-newest-ineligible-page',
    'relation__post__related__post',
    [
      'idx_relation__post__related__post__subject__newest',
      'relation__post__related__post_subject_id_created_at_object__idx',
    ],
    async () => {
      const page = await getEntityRelationsPage('post', subjectPostId, 'related', 'post', {
        viewer: relationViewer,
        sort: 'newest',
        ...pageLimit,
      })
      return { length: page.results.length, hasNextPage: page.hasNextPage }
    },
  )
  await captureFilled(
    'collection-relation-best-ineligible-page',
    'relation__post__related__post',
    [
      'idx_relation__post__related__post__subject__best',
      'relation__post__related__post_subject_id_votes_score_sort_c_idx',
    ],
    async () => {
      const page = await getEntityRelationsPage('post', subjectPostId, 'related', 'post', {
        viewer: relationViewer,
        sort: 'best',
        ...pageLimit,
      })
      return { length: page.results.length, hasNextPage: page.hasNextPage }
    },
  )
}
