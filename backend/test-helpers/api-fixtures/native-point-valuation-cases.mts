import { encodeCursor } from '@modules/pagination'
import { pageInfo } from './data.mts'
import type { ApiFixtureCase } from './types.mts'
import {
  firstPointValuation,
  firstRewardsProgramId,
  firstValuationId,
  pointValuationCursorScope,
  pointValuationMigratedFrom,
  rewardsProgramTopic,
  secondPointValuation,
  secondValuationId,
  thirdPointValuation,
} from './native-point-valuation-data.mts'

const consumers = ['web', 'swift-core', 'swift-ui', 'dotnet-core'] as const

export const nativePointValuationApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.rewards-program-topics.search.default',
    method: 'GET',
    path: '/api/v1/topics',
    route: { routeTemplate: '/api/v1/topics' },
    query: { q: 'Travel', topic_types: 'rewards_program', limit: '10' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        {
          __entity_type: 'topic',
          id: rewardsProgramTopic.id,
          name: rewardsProgramTopic.name,
          slug: rewardsProgramTopic.slug,
          topic_type: rewardsProgramTopic.topic_type,
        },
      ],
      page_info: pageInfo,
      topics: { [rewardsProgramTopic.id]: rewardsProgramTopic },
      topic_elections: {},
      election_votes: {},
      topics_metrics: {},
    },
    consumers: [...consumers],
    migratedFrom: pointValuationMigratedFrom,
  },
  {
    id: 'native.point-valuations.empty',
    method: 'GET',
    path: '/api/v1/my/rewards-program-point-valuations',
    route: { routeTemplate: '/api/v1/my/rewards-program-point-valuations' },
    query: { limit: '25' },
    auth: 'fixture-user',
    status: 200,
    body: { results: [], page_info: pageInfo },
    consumers: [...consumers],
    migratedFrom: pointValuationMigratedFrom,
  },
  {
    id: 'native.point-valuations.page-1',
    method: 'GET',
    path: '/api/v1/my/rewards-program-point-valuations',
    route: { routeTemplate: '/api/v1/my/rewards-program-point-valuations' },
    query: { limit: '2' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [firstPointValuation, secondPointValuation],
      page_info: {
        has_next_page: true,
        start_cursor: encodeCursor({
          id: firstPointValuation.id,
          scope: pointValuationCursorScope,
        }),
        end_cursor: encodeCursor({ id: secondPointValuation.id, scope: pointValuationCursorScope }),
      },
    },
    consumers: [...consumers],
    migratedFrom: pointValuationMigratedFrom,
  },
  {
    id: 'native.point-valuations.page-2',
    method: 'GET',
    path: '/api/v1/my/rewards-program-point-valuations',
    route: { routeTemplate: '/api/v1/my/rewards-program-point-valuations' },
    query: {
      limit: '2',
      after: encodeCursor({ id: secondPointValuation.id, scope: pointValuationCursorScope }),
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [thirdPointValuation],
      page_info: {
        has_next_page: false,
        start_cursor: encodeCursor({
          id: thirdPointValuation.id,
          scope: pointValuationCursorScope,
        }),
        end_cursor: null,
      },
    },
    consumers: [...consumers],
    migratedFrom: pointValuationMigratedFrom,
  },
  {
    id: 'native.point-valuations.create.default',
    method: 'POST',
    path: '/api/v1/my/rewards-program-point-valuations',
    route: { routeTemplate: '/api/v1/my/rewards-program-point-valuations' },
    requestBody: {
      rewards_program_id: firstRewardsProgramId,
      value_per_point: firstPointValuation.value_per_point,
      note: firstPointValuation.note,
    },
    auth: 'fixture-user',
    status: 201,
    body: { point_valuation: firstPointValuation },
    consumers: [...consumers],
    migratedFrom: pointValuationMigratedFrom,
  },
  {
    id: 'native.point-valuations.update.full',
    method: 'PATCH',
    path: `/api/v1/my/rewards-program-point-valuations/${firstValuationId}`,
    route: {
      routeTemplate: '/api/v1/my/rewards-program-point-valuations/:id',
      pathParams: { id: firstValuationId },
    },
    requestBody: {
      value_per_point: firstPointValuation.value_per_point,
      note: firstPointValuation.note,
    },
    auth: 'fixture-user',
    status: 200,
    body: { point_valuation: firstPointValuation },
    consumers: [...consumers],
    migratedFrom: pointValuationMigratedFrom,
  },
  {
    id: 'native.point-valuations.update.clear-note',
    method: 'PATCH',
    path: `/api/v1/my/rewards-program-point-valuations/${secondValuationId}`,
    route: {
      routeTemplate: '/api/v1/my/rewards-program-point-valuations/:id',
      pathParams: { id: secondValuationId },
    },
    requestBody: { value_per_point: secondPointValuation.value_per_point, note: null },
    auth: 'fixture-user',
    status: 200,
    body: { point_valuation: secondPointValuation },
    consumers: [...consumers],
    migratedFrom: pointValuationMigratedFrom,
  },
  {
    id: 'native.point-valuations.delete.default',
    method: 'DELETE',
    path: `/api/v1/my/rewards-program-point-valuations/${firstValuationId}`,
    route: {
      routeTemplate: '/api/v1/my/rewards-program-point-valuations/:id',
      pathParams: { id: firstValuationId },
    },
    auth: 'fixture-user',
    status: 204,
    body: null,
    consumers: [...consumers],
    migratedFrom: pointValuationMigratedFrom,
  },
]
