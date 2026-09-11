import { community, timestamp, user } from './data.mts'

export const communityOwner = {
  id: user.id,
  username: user.username,
}

export const communityMember = {
  __entity_type: 'community_member',
  id: 'community-member-1',
  community_id: community.id,
  user_id: user.id,
  role: 'owner',
  approved_by_id: null,
  created_at: timestamp,
  updated_at: timestamp,
  removed_at: null,
  removed_by_id: null,
}
