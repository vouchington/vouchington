import type { ManifestEndpoint } from './endpoint-registry'

const reportPenaltiesPageOneEndCursor =
  'eyJpZCI6IjAxOWY3MDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDEwMiIsInNjb3BlIjoie1wicmVzb3VyY2VcIjpcInJlcG9ydC1hYnVzZS1wZW5hbHRpZXNcIixcInN0YXR1c1wiOlwiYWN0aXZlXCIsXCJ1c2VyX2lkXCI6bnVsbCxcInNvdXJjZV9mbGFnX2lkXCI6bnVsbCxcIm9yZGVyXCI6XCJpZC1kZXNjXCJ9In0'
const votePenaltiesPageOneEndCursor =
  'eyJpZCI6IjAxOWY3MDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDIwMyIsInNjb3BlIjoie1wicmVzb3VyY2VcIjpcInZvdGUtd2VpZ2h0LXBlbmFsdGllc1wiLFwic3RhdHVzXCI6XCJhY3RpdmVcIixcInNvdXJjZVwiOlwiZmxhZ1wiLFwidXNlcl9pZFwiOm51bGwsXCJzb3VyY2VfZmxhZ19pZFwiOm51bGwsXCJvcmRlclwiOlwiaWQtZGVzY1wifSJ9'

export const moderationIntegrityEndpointRegistry: Record<string, ManifestEndpoint> = {
  'native.moderation.vote-integrity.default': {
    method: 'GET',
    path: '/api/v1/vote-integrity/flags',
  },
  'native.moderation.vote-integrity.pending': {
    method: 'GET',
    path: '/api/v1/vote-integrity/flags',
    query: { status: 'pending' },
  },
  'native.moderation.vote-integrity.resolved': {
    method: 'GET',
    path: '/api/v1/vote-integrity/flags',
    query: { status: 'resolved' },
  },
  'native.moderation.vote-integrity.resolution.dismissed': {
    method: 'PATCH',
    path: '/api/v1/vote-integrity/flags/vote-flag-1',
    requestBody: { resolution: 'dismissed' },
  },
  'native.moderation.vote-integrity.resolution.penalized': {
    method: 'PATCH',
    path: '/api/v1/vote-integrity/flags/vote-flag-1',
    requestBody: { resolution: 'penalized' },
  },
  'native.moderation.vote-integrity.resolution.suspended': {
    method: 'PATCH',
    path: '/api/v1/vote-integrity/flags/vote-flag-1',
    requestBody: { resolution: 'suspended' },
  },
  'native.moderation.vote-integrity.penalty': {
    method: 'POST',
    path: '/api/v1/vote-integrity/flags/vote-flag-1/penalties',
  },
  'native.moderation.report-integrity.default': {
    method: 'GET',
    path: '/api/v1/report-integrity/flags',
  },
  'native.moderation.report-integrity.pending': {
    method: 'GET',
    path: '/api/v1/report-integrity/flags',
    query: { status: 'pending' },
  },
  'native.moderation.report-integrity.resolved': {
    method: 'GET',
    path: '/api/v1/report-integrity/flags',
    query: { status: 'resolved' },
  },
  'native.moderation.report-integrity.resolution.dismissed': {
    method: 'PATCH',
    path: '/api/v1/report-integrity/flags/report-flag-1',
    requestBody: { resolution: 'dismissed' },
  },
  'native.moderation.report-integrity.penalty': {
    method: 'POST',
    path: '/api/v1/report-integrity/flags/report-flag-1/penalties',
  },
  'native.moderation.report-integrity.penalties.default': {
    method: 'GET',
    path: '/api/v1/report-integrity/penalties',
  },
  'native.moderation.report-integrity.penalties.active': {
    method: 'GET',
    path: '/api/v1/report-integrity/penalties',
    query: { status: 'active' },
  },
  'native.moderation.report-integrity.penalties.revoked': {
    method: 'GET',
    path: '/api/v1/report-integrity/penalties',
    query: { status: 'revoked' },
  },
  'native.moderation.report-integrity.penalties.all': {
    method: 'GET',
    path: '/api/v1/report-integrity/penalties',
  },
  'native.moderation.report-integrity.penalties.page-2': {
    method: 'GET',
    path: '/api/v1/report-integrity/penalties',
    query: { after: reportPenaltiesPageOneEndCursor, status: 'active' },
  },
  'native.moderation.report-integrity.penalties.get': {
    method: 'GET',
    path: '/api/v1/report-integrity/penalties/019f7000-0000-7000-8000-000000000101',
  },
  'native.moderation.report-integrity.penalties.revoke': {
    method: 'DELETE',
    path: '/api/v1/report-integrity/penalties/019f7000-0000-7000-8000-000000000101',
  },
  'native.moderation.vote-integrity.penalties.default': {
    method: 'GET',
    path: '/api/v1/vote-integrity/penalties',
    query: { source: 'flag' },
  },
  'native.moderation.vote-integrity.penalties.active': {
    method: 'GET',
    path: '/api/v1/vote-integrity/penalties',
    query: { source: 'flag', status: 'active' },
  },
  'native.moderation.vote-integrity.penalties.revoked': {
    method: 'GET',
    path: '/api/v1/vote-integrity/penalties',
    query: { source: 'flag', status: 'revoked' },
  },
  'native.moderation.vote-integrity.penalties.all': {
    method: 'GET',
    path: '/api/v1/vote-integrity/penalties',
    query: { source: 'flag' },
  },
  'native.moderation.vote-integrity.penalties.page-2': {
    method: 'GET',
    path: '/api/v1/vote-integrity/penalties',
    query: { after: votePenaltiesPageOneEndCursor, source: 'flag', status: 'active' },
  },
  'native.moderation.vote-integrity.penalties.get': {
    method: 'GET',
    path: '/api/v1/vote-integrity/penalties/019f7000-0000-7000-8000-000000000201',
  },
  'native.moderation.vote-integrity.penalties.revoke': {
    method: 'DELETE',
    path: '/api/v1/vote-integrity/penalties/019f7000-0000-7000-8000-000000000201',
  },
}
