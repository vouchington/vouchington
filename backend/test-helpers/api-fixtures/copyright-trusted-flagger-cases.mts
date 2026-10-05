import type { ApiFixtureCase } from './types.mts'

const id = '00000000-0000-7000-8000-000000001220'
const userId = '00000000-0000-7000-8000-000000001221'
const changeId = '00000000-0000-7000-8000-000000001222'
const entry = {
  id,
  name: 'Example copyright flagger',
  user_id: userId,
  awarding_coordinator_name: 'Example Digital Services Coordinator',
  awarding_member_state: 'DE',
  awarded_on: '2026-09-01',
  award_reference: 'https://example.test/designations/1220',
  area_of_expertise: 'intellectual_property',
  area_description: 'Copyright notices',
  status: 'active',
}

export const copyrightTrustedFlaggerApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'copyright.trusted-flaggers.list',
    method: 'GET',
    path: '/api/v1/copyright-trusted-flaggers',
    route: { routeTemplate: '/api/v1/copyright-trusted-flaggers' },
    auth: 'fixture-admin',
    status: 200,
    body: {
      copyright_trusted_flaggers: [entry],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    },
    consumers: [],
    migratedFrom: ['backend/api/v1/copyright-notices/trusted-flagger-routes.mts'],
  },
  {
    id: 'copyright.trusted-flaggers.get',
    method: 'GET',
    path: `/api/v1/copyright-trusted-flaggers/${id}`,
    route: { routeTemplate: '/api/v1/copyright-trusted-flaggers/:id', pathParams: { id } },
    auth: 'fixture-admin',
    status: 200,
    body: { copyright_trusted_flagger: entry },
    consumers: [],
    migratedFrom: ['backend/api/v1/copyright-notices/trusted-flagger-routes.mts'],
  },
  {
    id: 'copyright.trusted-flaggers.create',
    method: 'POST',
    path: '/api/v1/copyright-trusted-flaggers',
    route: { routeTemplate: '/api/v1/copyright-trusted-flaggers' },
    requestBody: {
      name: entry.name,
      user_id: userId,
      awarding_coordinator_name: entry.awarding_coordinator_name,
      awarding_member_state: entry.awarding_member_state,
      awarded_on: entry.awarded_on,
      award_reference: entry.award_reference,
      area_of_expertise: entry.area_of_expertise,
      area_description: entry.area_description,
    },
    auth: 'fixture-admin',
    status: 201,
    body: { copyright_trusted_flagger: entry },
    consumers: [],
    migratedFrom: ['backend/api/v1/copyright-notices/trusted-flagger-routes.mts'],
  },
  {
    id: 'copyright.trusted-flaggers.status-change',
    method: 'POST',
    path: `/api/v1/copyright-trusted-flaggers/${id}/status-changes`,
    route: {
      routeTemplate: '/api/v1/copyright-trusted-flaggers/:id/status-changes',
      pathParams: { id },
    },
    requestBody: { change_type: 'suspended', reason: 'Commission list update' },
    auth: 'fixture-admin',
    status: 201,
    body: {
      copyright_trusted_flagger_change: {
        id: changeId,
        copyright_trusted_flagger_id: id,
        change_type: 'suspended',
        reason: 'Commission list update',
        created_at: '2026-10-04T00:00:00.000Z',
      },
    },
    consumers: [],
    migratedFrom: ['backend/api/v1/copyright-notices/trusted-flagger-routes.mts'],
  },
]
