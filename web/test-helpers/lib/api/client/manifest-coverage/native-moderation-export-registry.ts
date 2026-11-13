import { endpoint, type ManifestEndpoint } from './endpoint-registry'

const community = '/api/v1/communities/test-community'
const banId = '00000000-0000-7000-8000-000000000901'
const banUserId = '00000000-0000-7000-8000-000000000904'
const banUserPath = `${community}/bans/users/${banUserId}`
const claimPath = '/api/v1/admin/topic-claims/00000000-0000-7000-8000-000000000401'
const modNotesPath = '/api/v1/users/00000000-0000-7000-8000-000000000911'

export const nativeModerationExportEndpointRegistry: Record<string, ManifestEndpoint> = {
  'native.communities.bans.active.default': endpoint(banUserPath, { limit: '20' }),
  'native.communities.bans.detail.default': endpoint(`${community}/bans/${banId}`),
  'native.communities.bans.lift-one.default': {
    method: 'DELETE',
    path: `${community}/bans/${banId}`,
  },
  'native.communities.bans.lift-all.default': { method: 'DELETE', path: banUserPath },
  'native.communities.bans.lift-all.forbidden': { method: 'DELETE', path: banUserPath },
  'native.communities.bans.lift-all.overflow': { method: 'DELETE', path: banUserPath },
  'native.communities.membership-cap.join.conflict': {
    method: 'POST',
    path: `${community}/members`,
  },
  'native.communities.moderator-cap.promotion.conflict': {
    method: 'PATCH',
    path: `${community}/members/${banUserId}`,
    requestBody: { role: 'moderator' },
  },
  'native.communities.moderator-stats.placement': endpoint(`${community}/moderator-stats`, {
    window: '30',
  }),
  'native.moderation.mod-notes.default': endpoint(`${modNotesPath}/mod-notes`, { limit: '20' }),
  'native.moderation.mod-notes.create.default': {
    method: 'POST',
    path: `${modNotesPath}/mod-notes`,
    requestBody: {
      body: 'Observed repeated spam.',
      community_id: '00000000-0000-7000-8000-000000000914',
    },
  },
  'native.moderation.context.staff': endpoint(`${modNotesPath}/moderation-context`),
  'native.moderation.context.member': endpoint(`${modNotesPath}/moderation-context`),
  'native.moderation.topic-claims.pending': endpoint('/api/v1/admin/topic-claims'),
  'native.moderation.topic-claims.verification': {
    method: 'POST',
    path: `${claimPath}/verification`,
  },
  'native.moderation.topic-claims.rejection': {
    method: 'POST',
    path: `${claimPath}/rejection`,
    requestBody: { rejection_reason: 'Insufficient evidence' },
  },
  'native.moderation.topic-claims.revocation': {
    method: 'POST',
    path: `${claimPath}/revocation`,
    requestBody: { revocation_reason: 'Evidence withdrawn' },
  },
  'native.posts.images.placement-limit.conflict': {
    method: 'PUT',
    path: '/api/v1/posts/00000000-0000-7000-8000-000000000801/images',
    requestBody: {
      images: [{ image_id: '00000000-0000-7000-8000-000000000802', order_index: 0, caption: '' }],
    },
  },
}
