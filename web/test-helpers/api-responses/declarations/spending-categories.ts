import nativeSpendingCategoriesCreateDefault from '../../../../api-fixtures/v1/responses/native.spending-categories.create.default.json'
import nativeSpendingCategoriesDeleteDefault from '../../../../api-fixtures/v1/responses/native.spending-categories.delete.default.json'
import nativeSpendingCategoriesEmpty from '../../../../api-fixtures/v1/responses/native.spending-categories.empty.json'
import nativeSpendingCategoriesOwnedHousehold from '../../../../api-fixtures/v1/responses/native.spending-categories.owned-household.json'
import nativeSpendingCategoriesPage1 from '../../../../api-fixtures/v1/responses/native.spending-categories.page-1.json'
import nativeSpendingCategoriesPage2 from '../../../../api-fixtures/v1/responses/native.spending-categories.page-2.json'
import nativeSpendingCategoriesUpdateClearNote from '../../../../api-fixtures/v1/responses/native.spending-categories.update.clear-note.json'
import nativeSpendingCategoryTopicsSearchDefault from '../../../../api-fixtures/v1/responses/native.spending-category-topics.search.default.json'
import type { TopicsSearchResponseBody } from '@/lib/api/client/topics'
import type { ListResponse, SpendingCategoryResponseBody } from '@/types/api-responses'
import type { SpendingCategory } from '@/types/my'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

const spendingCategoryId = '00000000-0000-7000-8000-000000000742'

export const SPENDING_CATEGORIES_DECLARATIONS = [
  defineWebApiFixture<TopicsSearchResponseBody>()(
    'native.spending-category-topics.search.default',
    nativeSpendingCategoryTopicsSearchDefault,
    context =>
      context.client.topics.fetchTopics({ q: 'Groceries', spending_category: true, limit: 10 }),
    [
      context =>
        context.server.topics.getTopics({
          searchParams: { q: 'Groceries', spending_category: true, limit: 10 },
        }),
    ],
  ),
  defineWebApiFixture<ListResponse<SpendingCategory>>()(
    'native.spending-categories.empty',
    nativeSpendingCategoriesEmpty,
    context => context.server.my.getMySpendingCategories({ limit: 25 }),
    [context => context.client.my.getMySpendingCategoriesClient({ limit: 25 })],
  ),
  defineWebApiFixture<ListResponse<SpendingCategory>>()(
    'native.spending-categories.page-1',
    nativeSpendingCategoriesPage1,
    context => context.server.my.getMySpendingCategories({ limit: 1 }),
    [context => context.client.my.getMySpendingCategoriesClient({ limit: 1 })],
  ),
  defineWebApiFixture<ListResponse<SpendingCategory>>()(
    'native.spending-categories.owned-household',
    nativeSpendingCategoriesOwnedHousehold,
    context =>
      context.server.my.getMySpendingCategories({
        limit: 1,
        after:
          'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDc0MiIsInNjb3BlIjoibXktc3BlbmRpbmctY2F0ZWdvcmllczowMDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDA3NDA6aWQtYXNjIn0',
      }),
    [
      context =>
        context.client.my.getMySpendingCategoriesClient({
          limit: 1,
          after:
            'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDc0MiIsInNjb3BlIjoibXktc3BlbmRpbmctY2F0ZWdvcmllczowMDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDA3NDA6aWQtYXNjIn0',
        }),
    ],
  ),
  defineWebApiFixture<ListResponse<SpendingCategory>>()(
    'native.spending-categories.page-2',
    nativeSpendingCategoriesPage2,
    context =>
      context.server.my.getMySpendingCategories({
        limit: 1,
        after:
          'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDc0MyIsInNjb3BlIjoibXktc3BlbmRpbmctY2F0ZWdvcmllczowMDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDA3NDA6aWQtYXNjIn0',
      }),
    [
      context =>
        context.client.my.getMySpendingCategoriesClient({
          limit: 1,
          after:
            'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDc0MyIsInNjb3BlIjoibXktc3BlbmRpbmctY2F0ZWdvcmllczowMDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDA3NDA6aWQtYXNjIn0',
        }),
    ],
  ),
  defineWebApiFixture<SpendingCategoryResponseBody>()(
    'native.spending-categories.create.default',
    nativeSpendingCategoriesCreateDefault,
    context =>
      context.client.my.createMySpendingCategory({
        amount: { amount: 42_550, currency: 'usd' },
        note: 'Family groceries',
        spending_category_id: '00000000-0000-7000-8000-000000000741',
        spending_frequency: 'monthly',
      }),
  ),
  defineWebApiFixture<SpendingCategoryResponseBody>()(
    'native.spending-categories.update.clear-note',
    nativeSpendingCategoriesUpdateClearNote,
    context =>
      context.client.my.updateMySpendingCategory(spendingCategoryId, {
        amount: { amount: 42_550, currency: 'usd' },
        note: null,
      }),
  ),
  defineWebApiFixture<null>()(
    'native.spending-categories.delete.default',
    nativeSpendingCategoriesDeleteDefault,
    context => context.client.my.deleteMySpendingCategory(spendingCategoryId),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
