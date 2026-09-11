import { encodeCursor } from '@modules/pagination'
import { pageInfo } from './data.mts'
import type { ApiFixtureCase } from './types.mts'

const path = '/api/v1/my/rewards-program-statuses'
const scope = 'my-rewards-program-statuses:00000000-0000-7000-8000-000000000740:id-asc'
const one = {
  id: '00000000-0000-7000-8000-000000000741',
  rewards_program_status_id: '00000000-0000-7000-8000-000000000751',
  since: '2025-01-01',
  until: null,
  rewards_program_status: {
    id: '00000000-0000-7000-8000-000000000751',
    name: 'Gold',
    slug: 'gold',
  },
}
const two = {
  id: '00000000-0000-7000-8000-000000000742',
  rewards_program_status_id: '00000000-0000-7000-8000-000000000752',
  since: null,
  until: '2026-12-31',
  rewards_program_status: {
    id: '00000000-0000-7000-8000-000000000752',
    name: 'Platinum',
    slug: 'platinum',
  },
}
const three = {
  id: '00000000-0000-7000-8000-000000000743',
  rewards_program_status_id: '00000000-0000-7000-8000-000000000753',
  since: null,
  until: null,
  rewards_program_status: {
    id: '00000000-0000-7000-8000-000000000753',
    name: 'Diamond',
    slug: 'diamond',
  },
}
const topicOnlyStatus = { ...one, since: null, until: null }
const fullyUpdatedStatus = { ...one, since: '2025-02-01', until: '2026-12-31' }
const rewardsProgramStatusTopic = {
  __entity_type: 'topic',
  aliases: [],
  allow_reviews: true,
  created_at: '2026-01-01T00:00:00Z',
  created_by: { __entity_type: 'user', id: 'user-1', roles: [], username: 'testuser' },
  hero_image_id: null,
  homepage_url_id: null,
  hostname: null,
  hostname_id: null,
  id: one.rewards_program_status.id,
  lingua_rs_detected_language: null,
  logo_image_id: null,
  markdown: '',
  name: one.rewards_program_status.name,
  noindex: false,
  referral_program_id: null,
  referral_program_slug: null,
  rewards_program_id: null,
  slug: one.rewards_program_status.slug,
  topic_type: 'rewards_program_status',
  updated_by: { __entity_type: 'user', id: 'user-1', roles: [], username: 'testuser' },
}
const consumers = ['web', 'swift-core', 'swift-ui', 'dotnet-core'] as const
const shared = {
  auth: 'fixture-user' as const,
  consumers: [...consumers],
  migratedFrom: [
    'docs/requirements/users/USER_SETTINGS.md',
    'web/components/my/rewards-program-statuses-manager.tsx',
  ],
}
const page = (results: unknown[], hasNext: boolean, start: string | null, end: string | null) => ({
  results,
  page_info: { has_next_page: hasNext, start_cursor: start, end_cursor: end },
})

export const nativeRewardsStatusApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.rewards-program-status-topics.search.default',
    method: 'GET',
    path: '/api/v1/topics',
    route: { routeTemplate: '/api/v1/topics' },
    query: { q: 'Gold', topic_types: 'rewards_program_status', limit: '10' },
    status: 200,
    body: {
      results: [
        {
          __entity_type: 'topic',
          id: rewardsProgramStatusTopic.id,
          name: rewardsProgramStatusTopic.name,
          slug: rewardsProgramStatusTopic.slug,
          topic_type: rewardsProgramStatusTopic.topic_type,
        },
      ],
      page_info: pageInfo,
      topics: { [rewardsProgramStatusTopic.id]: rewardsProgramStatusTopic },
      topic_elections: {},
      election_votes: {},
      topics_metrics: {},
    },
    ...shared,
  },
  {
    id: 'native.rewards-statuses.empty',
    method: 'GET',
    path,
    route: { routeTemplate: path },
    query: { limit: '25' },
    status: 200,
    body: { results: [], page_info: pageInfo },
    ...shared,
  },
  {
    id: 'native.rewards-statuses.page-1',
    method: 'GET',
    path,
    route: { routeTemplate: path },
    query: { limit: '2' },
    status: 200,
    body: page(
      [one, two],
      true,
      encodeCursor({ id: one.id, scope }),
      encodeCursor({ id: two.id, scope }),
    ),
    ...shared,
  },
  {
    id: 'native.rewards-statuses.page-2',
    method: 'GET',
    path,
    route: { routeTemplate: path },
    query: { limit: '2', after: encodeCursor({ id: two.id, scope }) },
    status: 200,
    body: page([three], false, encodeCursor({ id: three.id, scope }), null),
    ...shared,
  },
  {
    id: 'native.rewards-statuses.create.default',
    method: 'POST',
    path,
    route: { routeTemplate: path },
    requestBody: { rewards_program_status_id: one.rewards_program_status.id },
    status: 201,
    body: { rewards_program_status: topicOnlyStatus },
    ...shared,
  },
  {
    id: 'native.rewards-statuses.update.full',
    method: 'PATCH',
    path: `${path}/${one.id}`,
    route: { routeTemplate: `${path}/:id`, pathParams: { id: one.id } },
    requestBody: { since: fullyUpdatedStatus.since, until: fullyUpdatedStatus.until },
    status: 200,
    body: { rewards_program_status: fullyUpdatedStatus },
    ...shared,
  },
  {
    id: 'native.rewards-statuses.update.clear-dates',
    method: 'PATCH',
    path: `${path}/${one.id}`,
    route: { routeTemplate: `${path}/:id`, pathParams: { id: one.id } },
    requestBody: { since: null, until: null },
    status: 200,
    body: { rewards_program_status: { ...one, since: null } },
    ...shared,
  },
  {
    id: 'native.rewards-statuses.delete.default',
    method: 'DELETE',
    path: `${path}/${one.id}`,
    route: { routeTemplate: `${path}/:id`, pathParams: { id: one.id } },
    status: 204,
    body: null,
    ...shared,
  },
]
