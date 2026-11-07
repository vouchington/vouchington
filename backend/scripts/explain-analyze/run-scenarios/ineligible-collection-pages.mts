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
const viewerUser = {
  __entity_type: 'user' as const,
  id: ineligibleCollectionPageIds.userId,
  username: 'seeduser7',
  roles: [] as readonly string[],
} as PrivateUser
const relationViewer = {
  kind: 'user' as const,
  userId: ineligibleCollectionPageIds.userId,
  staffRole: null,
}

function bounded(relation: string, indexes: readonly string[]) {
  return {
    expectations: [
      { kind: 'maxProcessedRows' as const, relation, max: 64 },
      { kind: 'maxProcessedRows' as const, relation: 'posts', max: 128 },
      {
        kind: 'usesIndexes' as const,
        indexes: [...indexes],
        anyOf: indexes.length > 1,
        queryContains: `FROM ${relation}`,
      },
    ],
    seededRows: { [relation]: INELIGIBLE_COLLECTION_PAGE_COUNT },
  }
}

export async function runIneligibleCollectionPageScenarios(): Promise<void> {
  registerScenarioContract(
    'collection-saved-posts-ineligible-page',
    bounded('relation__user__save__post', ['idx_relation__user__save__post__subject__newest']),
  )
  await runAndCapture('collection-saved-posts-ineligible-page', async () => {
    const page = await getUserPostsCollection(viewerUser, viewerUser.id, 'saved', { limit: LIMIT })
    if (!page.page_info.has_next_page || page.results.length >= LIMIT) {
      throw new Error('Saved-post page was filled past ineligible membership rows')
    }
  })

  registerScenarioContract(
    'collection-list-posts-ineligible-page',
    bounded('user_list_posts', [
      'idx_user_list_posts__user_list_id__id',
      'idx_user_list_posts__user_list_id__id__all_rows',
      'user_list_posts_pkey',
    ]),
  )
  await runAndCapture('collection-list-posts-ineligible-page', async () => {
    const page = await searchListItems(ineligibleCollectionPageIds.listId, {
      limit: LIMIT,
      currentUserId: viewerUser.id,
    })
    if (!page.page_info.has_next_page || page.results.length >= LIMIT) {
      throw new Error('Personal list page was filled past ineligible membership rows')
    }
  })

  registerScenarioContract('collection-list-union-ineligible-page', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'user_list_posts', max: 64 },
      { kind: 'maxProcessedRows', relation: 'user_list_rss_feed_items', max: 64 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 128 },
    ],
    seededRows: { user_list_posts: INELIGIBLE_COLLECTION_PAGE_COUNT },
  })
  await runAndCapture('collection-list-union-ineligible-page', () =>
    searchListItems(ineligibleCollectionPageIds.listId, {
      limit: LIMIT,
      currentUserId: viewerUser.id,
    }),
  )

  registerScenarioContract(
    'collection-community-list-posts-ineligible-page',
    bounded('community_list_posts', ['idx_community_list_posts__community_id__order_index__id']),
  )
  await runAndCapture('collection-community-list-posts-ineligible-page', async () => {
    const page = await searchCommunityListItems(ineligibleCollectionPageIds.communityId, 'post', {
      limit: LIMIT,
    })
    if (!page.page_info.has_next_page || page.results.length >= LIMIT) {
      throw new Error('Community post list page was filled past ineligible membership rows')
    }
  })

  registerScenarioContract(
    'collection-community-list-hostnames-ineligible-page',
    bounded('community_list_url_hostnames', [
      'idx_community_list_url_hostnames__community_id__order_index__id',
    ]),
  )
  await runAndCapture('collection-community-list-hostnames-ineligible-page', async () => {
    const page = await searchCommunityListItems(
      ineligibleCollectionPageIds.communityId,
      'url_hostname',
      { limit: LIMIT },
    )
    if (!page.page_info.has_next_page || page.results.length >= LIMIT) {
      throw new Error('Community hostname page was filled past ineligible membership rows')
    }
  })

  registerScenarioContract(
    'collection-community-list-topics-page',
    bounded('community_list_topics', ['idx_community_list_topics__community_id__order_index__id']),
  )
  await runAndCapture('collection-community-list-topics-page', async () => {
    const page = await searchCommunityListItems(ineligibleCollectionPageIds.communityId, 'topic', {
      limit: LIMIT,
    })
    if (page.results.length !== LIMIT || !page.page_info.has_next_page) {
      throw new Error('Topic page did not read one full live membership page')
    }
  })

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
        ineligibleCollectionPageIds.listId,
        ineligibleCollectionPageIds.communityId,
        relationViewer,
        LIMIT,
      ),
    )
    if (rows.length >= LIMIT) throw new Error('Import source replaced a short newest page')
  })

  registerScenarioContract(
    'collection-relation-newest-ineligible-page',
    bounded('relation__post__related__post', [
      'idx_relation__post__related__post__subject__newest',
      'relation__post__related__post_subject_id_created_at_object__idx',
    ]),
  )
  await runAndCapture('collection-relation-newest-ineligible-page', async () => {
    const page = await getEntityRelationsPage(
      'post',
      ineligibleCollectionPageIds.subjectPostId,
      'related',
      'post',
      { viewer: relationViewer, sort: 'newest', limit: LIMIT },
    )
    if (!page.hasNextPage || page.continuation === null || page.results.length >= LIMIT) {
      throw new Error('Newest relation page was filled past ineligible membership rows')
    }
  })

  registerScenarioContract(
    'collection-relation-best-ineligible-page',
    bounded('relation__post__related__post', [
      'idx_relation__post__related__post__subject__best',
      'relation__post__related__post_subject_id_votes_score_sort_c_idx',
    ]),
  )
  await runAndCapture('collection-relation-best-ineligible-page', async () => {
    const page = await getEntityRelationsPage(
      'post',
      ineligibleCollectionPageIds.subjectPostId,
      'related',
      'post',
      { viewer: relationViewer, sort: 'best', limit: LIMIT },
    )
    if (!page.hasNextPage || page.continuation === null || page.results.length >= LIMIT) {
      throw new Error('Best relation page was filled past ineligible membership rows')
    }
  })
}
