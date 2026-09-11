import { encodeCursor } from '@modules/pagination'
import { pageInfo, topic } from './data.mts'
import type { ApiFixtureCase } from './types.mts'

const consumers = ['web', 'swift-core', 'swift-ui', 'dotnet-core'] as const
const individualId = '00000000-0000-7000-8000-000000000740'
const categoryId = '00000000-0000-7000-8000-000000000741'
const firstEntryId = '00000000-0000-7000-8000-000000000742'
const secondEntryId = '00000000-0000-7000-8000-000000000743'
const thirdEntryId = '00000000-0000-7000-8000-000000000744'
const scope = `my-spending-categories:${individualId}:id-asc`
const spendingCategory = { ...topic, id: categoryId, name: 'Groceries', slug: 'groceries' }
const personalEntry = {
  id: firstEntryId,
  spending_category_id: categoryId,
  amount: { amount: 42_550, currency: 'usd' },
  spending_frequency: 'monthly',
  note: 'Family groceries',
  owner_type: 'individual',
  can_manage: true,
  spending_category: { id: categoryId, name: 'Groceries', slug: 'groceries' },
}
const ownedHouseholdEntry = {
  ...personalEntry,
  id: secondEntryId,
  amount: { amount: 120_000, currency: 'usd' },
  spending_frequency: 'annually',
  note: null,
  owner_type: 'household',
  can_manage: true,
}
const memberReadOnlyEntry = {
  ...ownedHouseholdEntry,
  id: thirdEntryId,
  can_manage: false,
}
const migratedFrom = [
  'docs/requirements/users/USER_SETTINGS.md',
  'web/components/my/spending-categories-manager.tsx',
]

export const nativeSpendingCategoryApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.spending-category-topics.search.default',
    method: 'GET',
    path: '/api/v1/topics',
    route: { routeTemplate: '/api/v1/topics' },
    query: { q: 'Groceries', spending_category: 'true', limit: '10' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        {
          __entity_type: 'topic',
          id: categoryId,
          name: 'Groceries',
          slug: 'groceries',
          topic_type: spendingCategory.topic_type,
        },
      ],
      page_info: pageInfo,
      topics: { [categoryId]: spendingCategory },
      topic_elections: {},
      election_votes: {},
      topics_metrics: {},
    },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.spending-categories.empty',
    method: 'GET',
    path: '/api/v1/my/spending-categories',
    route: { routeTemplate: '/api/v1/my/spending-categories' },
    query: { limit: '25' },
    auth: 'fixture-user',
    status: 200,
    body: { results: [], page_info: pageInfo },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.spending-categories.page-1',
    method: 'GET',
    path: '/api/v1/my/spending-categories',
    route: { routeTemplate: '/api/v1/my/spending-categories' },
    query: { limit: '1' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [personalEntry],
      page_info: {
        has_next_page: true,
        start_cursor: encodeCursor({ id: firstEntryId, scope }),
        end_cursor: encodeCursor({ id: firstEntryId, scope }),
      },
    },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.spending-categories.owned-household',
    method: 'GET',
    path: '/api/v1/my/spending-categories',
    route: { routeTemplate: '/api/v1/my/spending-categories' },
    query: { limit: '1', after: encodeCursor({ id: firstEntryId, scope }) },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [ownedHouseholdEntry],
      page_info: {
        has_next_page: true,
        start_cursor: encodeCursor({ id: secondEntryId, scope }),
        end_cursor: encodeCursor({ id: secondEntryId, scope }),
      },
    },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.spending-categories.page-2',
    method: 'GET',
    path: '/api/v1/my/spending-categories',
    route: { routeTemplate: '/api/v1/my/spending-categories' },
    query: { limit: '1', after: encodeCursor({ id: secondEntryId, scope }) },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [memberReadOnlyEntry],
      page_info: {
        has_next_page: false,
        start_cursor: encodeCursor({ id: thirdEntryId, scope }),
        end_cursor: null,
      },
    },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.spending-categories.create.default',
    method: 'POST',
    path: '/api/v1/my/spending-categories',
    route: { routeTemplate: '/api/v1/my/spending-categories' },
    requestBody: {
      spending_category_id: categoryId,
      amount: personalEntry.amount,
      spending_frequency: 'monthly',
      note: personalEntry.note,
    },
    auth: 'fixture-user',
    status: 201,
    body: { spending_category: personalEntry },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.spending-categories.update.clear-note',
    method: 'PATCH',
    path: `/api/v1/my/spending-categories/${firstEntryId}`,
    route: {
      routeTemplate: '/api/v1/my/spending-categories/:id',
      pathParams: { id: firstEntryId },
    },
    requestBody: { amount: personalEntry.amount, note: null },
    auth: 'fixture-user',
    status: 200,
    body: { spending_category: { ...personalEntry, note: null } },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.spending-categories.delete.default',
    method: 'DELETE',
    path: `/api/v1/my/spending-categories/${firstEntryId}`,
    route: {
      routeTemplate: '/api/v1/my/spending-categories/:id',
      pathParams: { id: firstEntryId },
    },
    auth: 'fixture-user',
    status: 204,
    body: null,
    consumers: [...consumers],
    migratedFrom,
  },
]
