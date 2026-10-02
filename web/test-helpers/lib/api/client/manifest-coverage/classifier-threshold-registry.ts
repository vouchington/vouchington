import type { ManifestEndpoint } from './endpoint-registry'

const classifierId = '00000000-0000-7000-8000-000000000901'
const candidateId = '00000000-0000-7000-8000-000000000903'
const communityId = '00000000-0000-7000-8000-000000000905'
const previousRevisionId = '00000000-0000-7000-8000-000000000907'
const candidatePath = `/api/v1/admin/classifiers/${classifierId}/candidates/${candidateId}`

// Staff classifier threshold tooling has no web page yet; these static entries keep the shared
// contract fixtures covered until the web admin page lands.
/* c8 ignore next -- manifest-coverage.test asserts these static fixture entries through the aggregate registry. */
export const classifierThresholdEndpointRegistry: Record<string, ManifestEndpoint> = {
  'engineering.admin.classifiers.list': {
    method: 'GET',
    path: '/api/v1/admin/classifiers',
    query: { limit: '25' },
  },
  'engineering.admin.classifiers.candidates': {
    method: 'GET',
    path: `/api/v1/admin/classifiers/${classifierId}/candidates`,
    query: { community_id: communityId, limit: '25' },
  },
  'engineering.admin.classifiers.thresholds': {
    method: 'GET',
    path: `${candidatePath}/thresholds`,
    query: { limit: '25' },
  },
  'engineering.admin.classifiers.threshold.set': {
    method: 'PUT',
    path: `${candidatePath}/threshold`,
    requestBody: { lower_threshold_override: 0.2, upper_threshold_override: null },
  },
  'engineering.admin.classifiers.threshold.rollback': {
    method: 'POST',
    path: `${candidatePath}/threshold/rollback`,
    requestBody: { revision_id: previousRevisionId },
  },
  'engineering.admin.classifiers.human-vote-comparison': {
    method: 'GET',
    path: `/api/v1/admin/classifiers/${classifierId}/human-vote-comparison`,
    query: { from: '2026-09-01T00:00:00Z', to: '2026-09-15T00:00:00Z', community_id: communityId },
  },
}
