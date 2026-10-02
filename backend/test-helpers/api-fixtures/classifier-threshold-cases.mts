import type { ApiFixtureCase } from './types.mts'

const timestamp = '2026-09-20T12:00:00.000Z'
const classifierId = '00000000-0000-7000-8000-000000000901'
const promptVersionId = '00000000-0000-7000-8000-000000000902'
const candidateId = '00000000-0000-7000-8000-000000000903'
const topicId = '00000000-0000-7000-8000-000000000904'
const communityId = '00000000-0000-7000-8000-000000000905'
const revisionId = '00000000-0000-7000-8000-000000000906'
const previousRevisionId = '00000000-0000-7000-8000-000000000907'
const actorId = '00000000-0000-7000-8000-000000000002'

const activeRevision = {
  id: revisionId,
  candidate_id: candidateId,
  prompt_version_id: promptVersionId,
  lower_threshold_override: 0.2,
  upper_threshold_override: null,
  effective_lower_threshold: 0.2,
  effective_upper_threshold: 0.8,
  is_active: true,
  activated_at: timestamp,
  deactivated_at: null,
  created_by_id: actorId,
  deactivated_by_id: null,
}
// Staff-only endpoints with no client consumer yet; the shared fields every case here carries.
const staffCase = {
  auth: 'fixture-admin',
  status: 200,
  consumers: [],
  migratedFrom: ['classifiers', 'thresholds', 'human-vote-comparison'].map(
    name => `backend/api/v1/admin/classifiers/${name}.mts`,
  ),
} satisfies Pick<ApiFixtureCase, 'auth' | 'status' | 'consumers' | 'migratedFrom'>
const candidatesTemplate = '/api/v1/admin/classifiers/:classifierId/candidates'
const candidatePathParams = { classifierId, candidateId }
const pageInfo = {
  has_next_page: false,
  start_cursor: 'fixture-admin-classifier-start-cursor',
  end_cursor: 'fixture-admin-classifier-end-cursor',
}

export const classifierThresholdApiFixtureCases: ApiFixtureCase[] = [
  {
    ...staffCase,
    id: 'engineering.admin.classifiers.list',
    method: 'GET',
    path: '/api/v1/admin/classifiers',
    query: { limit: '25' },
    route: { routeTemplate: '/api/v1/admin/classifiers' },
    body: {
      results: [
        {
          id: classifierId,
          slug: 'post-topic',
          primitive: 'choice',
          candidate_kind: 'topic',
          activated_at: timestamp,
          deactivated_at: null,
          active_prompt_version: {
            id: promptVersionId,
            model_name: 'fixture-model',
            model_provider: 'openrouter',
            default_lower_threshold: 0.3,
            default_upper_threshold: 0.8,
            activated_at: timestamp,
          },
        },
      ],
      page_info: pageInfo,
    },
  },
  {
    ...staffCase,
    id: 'engineering.admin.classifiers.candidates',
    method: 'GET',
    path: `/api/v1/admin/classifiers/${classifierId}/candidates`,
    query: { community_id: communityId, limit: '25' },
    route: { routeTemplate: candidatesTemplate, pathParams: { classifierId } },
    body: {
      results: [
        {
          id: candidateId,
          candidate_kind: 'topic',
          topic_id: topicId,
          story_id: null,
          community_id: communityId,
          active_threshold: activeRevision,
        },
      ],
      page_info: pageInfo,
    },
  },
  {
    ...staffCase,
    id: 'engineering.admin.classifiers.thresholds',
    method: 'GET',
    path: `/api/v1/admin/classifiers/${classifierId}/candidates/${candidateId}/thresholds`,
    query: { limit: '25' },
    route: {
      routeTemplate: `${candidatesTemplate}/:candidateId/thresholds`,
      pathParams: candidatePathParams,
    },
    body: {
      results: [
        activeRevision,
        {
          ...activeRevision,
          id: previousRevisionId,
          lower_threshold_override: null,
          effective_lower_threshold: 0.3,
          is_active: false,
          deactivated_at: timestamp,
          deactivated_by_id: actorId,
        },
      ],
      page_info: pageInfo,
    },
  },
  {
    ...staffCase,
    id: 'engineering.admin.classifiers.threshold.set',
    method: 'PUT',
    path: `/api/v1/admin/classifiers/${classifierId}/candidates/${candidateId}/threshold`,
    route: {
      routeTemplate: `${candidatesTemplate}/:candidateId/threshold`,
      pathParams: candidatePathParams,
    },
    requestBody: { lower_threshold_override: 0.2, upper_threshold_override: null },
    body: { threshold: activeRevision, changed: true },
  },
  {
    ...staffCase,
    id: 'engineering.admin.classifiers.threshold.rollback',
    method: 'POST',
    path: `/api/v1/admin/classifiers/${classifierId}/candidates/${candidateId}/threshold/rollback`,
    route: {
      routeTemplate: `${candidatesTemplate}/:candidateId/threshold/rollback`,
      pathParams: candidatePathParams,
    },
    requestBody: { revision_id: previousRevisionId },
    body: { threshold: activeRevision, changed: true },
  },
  {
    ...staffCase,
    id: 'engineering.admin.classifiers.human-vote-comparison',
    method: 'GET',
    path: `/api/v1/admin/classifiers/${classifierId}/human-vote-comparison`,
    query: { from: '2026-09-01T00:00:00Z', to: '2026-09-15T00:00:00Z', community_id: communityId },
    route: {
      routeTemplate: '/api/v1/admin/classifiers/:classifierId/human-vote-comparison',
      pathParams: { classifierId },
    },
    body: {
      classifier_id: classifierId,
      window: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-15T00:00:00.000Z' },
      community_id: communityId,
      post_id: null,
      rss_feed_item_id: null,
      batches_examined: 42,
      truncated: false,
      min_human_cohort: 20,
      cells: [
        {
          probability_lower: 0.8,
          probability_upper: 0.9,
          classifier_vote: 1,
          decisions: 30,
          mean_probability: 0.85,
          effective_lower_threshold: { min: 0.3, max: 0.3 },
          effective_upper_threshold: { min: 0.8, max: 0.8 },
          human_decisions: 24,
          human_voters: 22,
          human: { up: 20, down: 1, neutral: 3 },
        },
        {
          probability_lower: 0.4,
          probability_upper: 0.5,
          classifier_vote: 0,
          decisions: 5,
          mean_probability: 0.45,
          effective_lower_threshold: { min: 0.3, max: 0.3 },
          effective_upper_threshold: { min: 0.8, max: 0.8 },
          human_decisions: 2,
          human_voters: 2,
          human: null,
        },
      ],
    },
  },
]
