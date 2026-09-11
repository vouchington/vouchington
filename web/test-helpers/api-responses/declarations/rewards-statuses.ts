import nativeRewardsProgramStatusTopicsSearchDefault from '../../../../api-fixtures/v1/responses/native.rewards-program-status-topics.search.default.json'
import nativeRewardsStatusesCreateDefault from '../../../../api-fixtures/v1/responses/native.rewards-statuses.create.default.json'
import nativeRewardsStatusesDeleteDefault from '../../../../api-fixtures/v1/responses/native.rewards-statuses.delete.default.json'
import nativeRewardsStatusesEmpty from '../../../../api-fixtures/v1/responses/native.rewards-statuses.empty.json'
import nativeRewardsStatusesPage1 from '../../../../api-fixtures/v1/responses/native.rewards-statuses.page-1.json'
import nativeRewardsStatusesPage2 from '../../../../api-fixtures/v1/responses/native.rewards-statuses.page-2.json'
import nativeRewardsStatusesUpdateClearDates from '../../../../api-fixtures/v1/responses/native.rewards-statuses.update.clear-dates.json'
import nativeRewardsStatusesUpdateFull from '../../../../api-fixtures/v1/responses/native.rewards-statuses.update.full.json'
import type { TopicsSearchResponseBody } from '@/lib/api/client/topics'
import type { ListResponse, RewardsProgramStatusResponseBody } from '@/types/api-responses'
import type { RewardsProgramStatus } from '@/types/my'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const REWARDS_STATUSES_DECLARATIONS = [
  defineWebApiFixture<TopicsSearchResponseBody>()(
    'native.rewards-program-status-topics.search.default',
    nativeRewardsProgramStatusTopicsSearchDefault,
    context =>
      context.client.topics.fetchTopics({
        q: 'Gold',
        topic_types: ['rewards_program_status'],
        limit: 10,
      }),
    [
      context =>
        context.server.topics.getTopics({
          searchParams: { q: 'Gold', topic_types: 'rewards_program_status', limit: 10 },
        }),
    ],
  ),
  defineWebApiFixture<ListResponse<RewardsProgramStatus>>()(
    'native.rewards-statuses.empty',
    nativeRewardsStatusesEmpty,
    context => context.server.my.getMyRewardsProgramStatuses({ limit: 25 }),
  ),
  defineWebApiFixture<ListResponse<RewardsProgramStatus>>()(
    'native.rewards-statuses.page-1',
    nativeRewardsStatusesPage1,
    context => context.server.my.getMyRewardsProgramStatuses({ limit: 2 }),
  ),
  defineWebApiFixture<ListResponse<RewardsProgramStatus>>()(
    'native.rewards-statuses.page-2',
    nativeRewardsStatusesPage2,
    context =>
      context.server.my.getMyRewardsProgramStatuses({
        limit: 2,
        after:
          'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDc0MiIsInNjb3BlIjoibXktcmV3YXJkcy1wcm9ncmFtLXN0YXR1c2VzOjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDc0MDppZC1hc2MifQ',
      }),
  ),
  defineWebApiFixture<RewardsProgramStatusResponseBody>()(
    'native.rewards-statuses.create.default',
    nativeRewardsStatusesCreateDefault,
    context =>
      context.client.my.createMyRewardsProgramStatus({
        rewards_program_status_id: '00000000-0000-7000-8000-000000000751',
      }),
  ),
  defineWebApiFixture<RewardsProgramStatusResponseBody>()(
    'native.rewards-statuses.update.full',
    nativeRewardsStatusesUpdateFull,
    context =>
      context.client.my.updateMyRewardsProgramStatus('00000000-0000-7000-8000-000000000741', {
        since: '2025-02-01',
        until: '2026-12-31',
      }),
  ),
  defineWebApiFixture<RewardsProgramStatusResponseBody>()(
    'native.rewards-statuses.update.clear-dates',
    nativeRewardsStatusesUpdateClearDates,
    context =>
      context.client.my.updateMyRewardsProgramStatus('00000000-0000-7000-8000-000000000741', {
        since: null,
        until: null,
      }),
  ),
  defineWebApiFixture<null>()(
    'native.rewards-statuses.delete.default',
    nativeRewardsStatusesDeleteDefault,
    context =>
      context.client.my.deleteMyRewardsProgramStatus('00000000-0000-7000-8000-000000000741'),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
