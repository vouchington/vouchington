import { mergeEndpointRegistries, type ManifestEndpoint } from './endpoint-registry'
import { moderationIntegrityEndpointRegistry } from './moderation-integrity-registry'
import { moderationParityEndpointRegistry } from './moderation-parity-registry'

const flatReportId = '019f6559-6b31-7171-b5b1-ccd9d702c45e'
const clusteredPage1EndCursor =
  'eyJjbHVzdGVyIjp0cnVlLCJjcmVhdGVkX2F0IjoiMjAyNi0wNi0wMVQxMjowNTowMC4wMDAwMDBaIiwiZW50aXR5X3R5cGUiOiJwb3N0IiwiaWQiOiIwMDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDAxMDMiLCJzb3J0IjoiY3JlYXRlZF9hdF9kZXNjIiwic3RhdHVzIjoicGVuZGluZyIsInNjb3BlIjoie1wiYXVkaWVuY2VcIjpcInN0YWZmXCIsXCJvd25lcklkXCI6bnVsbH0ifQ'
const appealFirstPageEndCursor =
  'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDEwMiIsInNjb3BlIjoiYXBwZWFsczpwZW5kaW5nOnN0YWZmLWFsbDppZC1kZXNjIn0'
const reviewQueueInReviewPostId = '019e8300-5e60-7000-8000-000000000000'
const reviewQueueRejectedPostId = '019e82f2-a2c0-7000-8000-000000000000'
const reviewQueuePageOneEndCursor = 'eyJpZCI6IjAxOWU4MmYyLWEyYzAtNzAwMC04MDAwLTAwMDAwMDAwMDAwMCJ9'

const moderationCoreEndpointRegistry: Record<string, ManifestEndpoint> = {
  'native.moderation.reports.default': {
    method: 'GET',
    path: '/api/v1/reports',
    query: { limit: '25', status: 'pending' },
  },
  'native.moderation.reports.member.default': {
    method: 'GET',
    path: '/api/v1/reports',
    query: { limit: '25', status: 'pending' },
  },
  'native.moderation.reports.clustered.default': {
    method: 'GET',
    path: '/api/v1/reports',
    query: { cluster: 'entity', limit: '4', status: 'pending' },
  },
  'native.moderation.reports.clustered.page-2': {
    method: 'GET',
    path: '/api/v1/reports',
    query: {
      after: clusteredPage1EndCursor,
      cluster: 'entity',
      limit: '3',
      status: 'pending',
    },
  },
  'native.moderation.report-resolution.reviewed': {
    method: 'PATCH',
    path: `/api/v1/reports/${flatReportId}`,
    requestBody: { status: 'reviewed' },
  },
  'native.moderation.admin-warning.report': {
    method: 'POST',
    path: '/api/v1/admin/warnings',
    requestBody: {
      publicMessage: 'Stop contacting this user.',
      reason: 'Repeated harassment',
      reportId: flatReportId,
      resolveReport: true,
      userId: 'user-2',
    },
  },
  'native.moderation.ban-evasion.confirm': {
    method: 'POST',
    path: '/api/v1/communities/community-1/ban-evasion/user-2',
  },
  'native.moderation.ban-evasion.dismiss': {
    method: 'DELETE',
    path: '/api/v1/communities/community-1/ban-evasion/user-2',
  },
  'native.moderation.report-judgement.default': {
    method: 'POST',
    path: `/api/v1/reports/${flatReportId}/judgements`,
  },
  'native.moderation.appeals.default': {
    method: 'GET',
    path: '/api/v1/appeals',
    query: { limit: '25', status: 'pending' },
  },
  'native.moderation.appeals.page-2': {
    method: 'GET',
    path: '/api/v1/appeals',
    query: { after: appealFirstPageEndCursor, limit: '25', status: 'pending' },
  },
  'native.moderation.appeals.update.default': {
    method: 'PATCH',
    path: '/api/v1/appeals/00000000-0000-7000-8000-000000000102',
    requestBody: {
      public_response: 'We reviewed your appeal and reduced the action.',
    },
  },
  'native.moderation.appeals.approval.default': {
    method: 'POST',
    path: '/api/v1/appeals/00000000-0000-7000-8000-000000000102/approval',
  },
  'native.moderation.appeals.delivery.default': {
    method: 'POST',
    path: '/api/v1/appeals/00000000-0000-7000-8000-000000000102/delivery',
  },
  'native.moderation.appeals.resolution.accept': {
    method: 'POST',
    path: '/api/v1/appeals/00000000-0000-7000-8000-000000000102/resolution',
    requestBody: { action: 'accept' },
  },
  'native.moderation.appeals.resolution.reduce': {
    method: 'POST',
    path: '/api/v1/appeals/00000000-0000-7000-8000-000000000102/resolution',
    requestBody: { action: 'reduce' },
  },
  'native.moderation.appeals.resolution.deny': {
    method: 'POST',
    path: '/api/v1/appeals/00000000-0000-7000-8000-000000000102/resolution',
    requestBody: { action: 'deny' },
  },
  'native.moderation.appeals.resolution-drafts.default': {
    method: 'POST',
    path: '/api/v1/appeals/00000000-0000-7000-8000-000000000102/resolution-drafts',
  },
  'native.moderation.disputes.default': {
    method: 'GET',
    path: '/api/v1/disputes',
    query: { limit: '25', status: 'pending' },
  },
  'native.moderation.review-queue.default': {
    method: 'GET',
    path: '/api/v1/posts/review-queue',
    query: { limit: '2' },
  },
  'native.moderation.review-queue.page-2': {
    method: 'GET',
    path: '/api/v1/posts/review-queue',
    query: { after: reviewQueuePageOneEndCursor, limit: '2' },
  },
  'native.moderation.clearance.approved': {
    method: 'POST',
    path: `/api/v1/posts/${reviewQueueInReviewPostId}/clearances`,
    requestBody: { status: 'approved', reason_code: 'staff_approved' },
  },
  'native.moderation.clearance.rejected': {
    method: 'POST',
    path: `/api/v1/posts/${reviewQueueInReviewPostId}/clearances`,
    requestBody: { status: 'rejected', reason_code: 'staff_rejected' },
  },
  'native.moderation.clearance.in-review': {
    method: 'POST',
    path: `/api/v1/posts/${reviewQueueRejectedPostId}/clearances`,
    requestBody: { status: 'in_review', reason_code: 'staff_reviewed' },
  },
  'native.moderation.modlog.default': {
    method: 'GET',
    path: '/api/v1/admin/modlog',
  },
  'native.moderation.analytics.default': {
    method: 'GET',
    path: '/api/v1/admin/moderation-analytics',
    query: { range: '30d' },
  },
}

export const moderationEndpointRegistry = mergeEndpointRegistries(
  moderationCoreEndpointRegistry,
  moderationParityEndpointRegistry,
  moderationIntegrityEndpointRegistry,
)
