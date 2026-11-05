import { CommunityModeratorsAside } from '@/components/communities/community-moderators-aside'
import { CommunityProxyBookmarkButton } from '@/components/communities/community-proxy-bookmark-button'
import { AsideStack, StoryCard } from './entity-story-frame'
import { storyCurrentUser } from './entity-fixtures'
import { communityEntities } from './communities-story-fixtures'
import type { CommunityMembersResponseBody } from '@/types/api-responses'

const ownerMembers = {
  results: [{ __entity_type: 'community_member', id: 'community-member-owner' }],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  community_members: {
    'community-member-owner': {
      __entity_type: 'community_member',
      id: 'community-member-owner',
      community_id: communityEntities[0]!.id,
      user_id: storyCurrentUser.id,
      role: 'owner',
      approved_by_id: null,
      removed_at: null,
      removed_by_id: null,
      created_at: '2026-05-10T12:00:00.000Z',
      updated_at: '2026-05-10T12:00:00.000Z',
    },
  },
  users: {
    [storyCurrentUser.id]: {
      account_type: null,
      id: storyCurrentUser.id,
      username: storyCurrentUser.username,
      profile_image_id: null,
    },
  },
} satisfies CommunityMembersResponseBody

const moderatorMembers = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  community_members: {},
  users: {},
} satisfies CommunityMembersResponseBody

export function CommunityAsides() {
  return (
    <AsideStack>
      <StoryCard title='Community state'>
        <p className='text-sm text-muted-foreground'>
          Public and private communities use the same detail shell with different visibility badges,
          membership controls, and proxy follow or mute controls.
        </p>
      </StoryCard>
      <StoryCard title='Proxy controls'>
        <div className='flex flex-wrap gap-2'>
          <CommunityProxyBookmarkButton
            communityId={communityEntities[0]!.id}
            kind='follow'
            initialActive={false}
            data-pw='storybook-proxy-follow'
          />
          <CommunityProxyBookmarkButton
            communityId={communityEntities[0]!.id}
            kind='mute'
            initialActive={false}
            data-pw='storybook-proxy-mute'
          />
        </div>
      </StoryCard>
      <CommunityModeratorsAside
        owners={ownerMembers}
        moderators={moderatorMembers}
      />
    </AsideStack>
  )
}
