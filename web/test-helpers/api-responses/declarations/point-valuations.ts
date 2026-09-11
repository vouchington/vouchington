import nativePointValuationsCreateDefault from '../../../../api-fixtures/v1/responses/native.point-valuations.create.default.json'
import nativePointValuationsDeleteDefault from '../../../../api-fixtures/v1/responses/native.point-valuations.delete.default.json'
import nativePointValuationsEmpty from '../../../../api-fixtures/v1/responses/native.point-valuations.empty.json'
import nativePointValuationsPage1 from '../../../../api-fixtures/v1/responses/native.point-valuations.page-1.json'
import nativePointValuationsPage2 from '../../../../api-fixtures/v1/responses/native.point-valuations.page-2.json'
import nativePointValuationsUpdateClearNote from '../../../../api-fixtures/v1/responses/native.point-valuations.update.clear-note.json'
import nativePointValuationsUpdateFull from '../../../../api-fixtures/v1/responses/native.point-valuations.update.full.json'
import nativeRewardsProgramTopicsSearchDefault from '../../../../api-fixtures/v1/responses/native.rewards-program-topics.search.default.json'
import type { TopicsSearchResponseBody } from '@/lib/api/client/topics'
import type { ListResponse, PointValuationResponseBody } from '@/types/api-responses'
import type { PointValuation } from '@/types/my'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const POINT_VALUATIONS_DECLARATIONS = [
  defineWebApiFixture<TopicsSearchResponseBody>()(
    'native.rewards-program-topics.search.default',
    nativeRewardsProgramTopicsSearchDefault,
    context =>
      context.client.topics.fetchTopics({
        q: 'Travel',
        topic_types: ['rewards_program'],
        limit: 10,
      }),
    [
      context =>
        context.server.topics.getTopics({
          searchParams: { q: 'Travel', topic_types: 'rewards_program', limit: 10 },
        }),
    ],
  ),
  defineWebApiFixture<ListResponse<PointValuation>>()(
    'native.point-valuations.empty',
    nativePointValuationsEmpty,
    context => context.server.my.getMyRewardsProgramPointValuations({ limit: 25 }),
  ),
  defineWebApiFixture<ListResponse<PointValuation>>()(
    'native.point-valuations.page-1',
    nativePointValuationsPage1,
    context => context.server.my.getMyRewardsProgramPointValuations({ limit: 2 }),
  ),
  defineWebApiFixture<ListResponse<PointValuation>>()(
    'native.point-valuations.page-2',
    nativePointValuationsPage2,
    context =>
      context.server.my.getMyRewardsProgramPointValuations({
        limit: 2,
        after:
          'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDcyMiIsInNjb3BlIjoibXktcG9pbnQtdmFsdWF0aW9uczowMDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDA3MjA6aWQtYXNjIn0',
      }),
  ),
  defineWebApiFixture<PointValuationResponseBody>()(
    'native.point-valuations.create.default',
    nativePointValuationsCreateDefault,
    context =>
      context.client.my.createMyRewardsProgramPointValuation({
        rewards_program_id: '00000000-0000-7000-8000-000000000731',
        value_per_point: { amount: 35_000, currency: 'usd', scale: 6 },
        note: 'Use for flexible travel redemptions',
      }),
  ),
  defineWebApiFixture<PointValuationResponseBody>()(
    'native.point-valuations.update.full',
    nativePointValuationsUpdateFull,
    context =>
      context.client.my.updateMyRewardsProgramPointValuation(
        '00000000-0000-7000-8000-000000000721',
        {
          value_per_point: { amount: 35_000, currency: 'usd', scale: 6 },
          note: 'Use for flexible travel redemptions',
        },
      ),
  ),
  defineWebApiFixture<PointValuationResponseBody>()(
    'native.point-valuations.update.clear-note',
    nativePointValuationsUpdateClearNote,
    context =>
      context.client.my.updateMyRewardsProgramPointValuation(
        '00000000-0000-7000-8000-000000000722',
        {
          value_per_point: { amount: 0, currency: 'usd', scale: 6 },
          note: null,
        },
      ),
  ),
  defineWebApiFixture<null>()(
    'native.point-valuations.delete.default',
    nativePointValuationsDeleteDefault,
    context =>
      context.client.my.deleteMyRewardsProgramPointValuation(
        '00000000-0000-7000-8000-000000000721',
      ),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
