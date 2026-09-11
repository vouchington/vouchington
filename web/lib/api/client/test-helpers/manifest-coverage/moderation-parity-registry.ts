import type { ManifestEndpoint } from './endpoint-registry'

const disputePath = '/api/v1/disputes/00000000-0000-7000-8000-000000000201'
const removedPostsPageTwoCursor =
  'eyJ0aW1lc3RhbXAiOiIyMDI2LTA3LTAxVDA5OjAwOjAwLjAwMDAwMFoiLCJ0aWVyIjowLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDIwMSIsInNjb3BlIjoidXNlci1yZW1vdmVkLXBvc3RzOjAwMDAwMDAwLTAwMDAtNzAwMC04NzAwLTAwMDAwMDAwMDEwMTpyZW1vdmVkLWRlc2Mta2luZC1kZXNjLXBvc3QtZGVzYzp2MiJ9'

export const moderationParityEndpointRegistry: Record<string, ManifestEndpoint> = {
  'native.moderation.disputes.detail.default': {
    method: 'GET',
    path: disputePath,
  },
  'native.moderation.disputes.update.default': {
    method: 'PATCH',
    path: disputePath,
    requestBody: {
      internal_notes: 'Reviewed against the content policy.',
      public_response: 'We reviewed your dispute.',
    },
  },
  'native.moderation.disputes.approval.default': {
    method: 'POST',
    path: `${disputePath}/approval`,
  },
  'native.moderation.disputes.delivery.default': {
    method: 'POST',
    path: `${disputePath}/delivery`,
  },
  'native.moderation.disputes.resolution.remove': {
    method: 'POST',
    path: `${disputePath}/resolution`,
    requestBody: { action: 'remove' },
  },
  'native.moderation.disputes.resolution.annotate': {
    method: 'POST',
    path: `${disputePath}/resolution`,
    requestBody: {
      action: 'annotate',
      body_text: 'This review reflects a disputed experience.',
    },
  },
  'native.moderation.disputes.resolution.dismiss': {
    method: 'POST',
    path: `${disputePath}/resolution`,
    requestBody: { action: 'dismiss' },
  },
  'native.moderation.disputes.resolution-drafts.default': {
    method: 'POST',
    path: `${disputePath}/resolution-drafts`,
  },
  'native.moderation.exposure.default': {
    method: 'GET',
    path: '/api/v1/moderation/exposure',
  },
  'native.moderation.reveals.default': {
    method: 'POST',
    path: '/api/v1/moderation/reveals',
    requestBody: {
      postId: '00000000-0000-7000-8000-000000000301',
      surface: 'review_queue',
    },
  },
  'native.moderation.removed-posts.default': {
    method: 'GET',
    path: '/api/v1/my/removed-posts',
    query: { include_platform: 'true', limit: '25' },
  },
  'native.moderation.removed-posts.page-2': {
    method: 'GET',
    path: '/api/v1/my/removed-posts',
    query: {
      after: removedPostsPageTwoCursor,
      include_platform: 'true',
      limit: '25',
    },
  },
}
