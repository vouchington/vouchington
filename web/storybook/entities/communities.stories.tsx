/* eslint-disable max-lines -- Storybook variants intentionally live together for component coverage. */
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityCard } from '@/components/communities/community-card'
import { CommunityListItemCard } from '@/components/communities/community-list-item-card'
import { CommunityFilters } from '@/components/communities/community-filters'
import { CommunityFeed } from '@/components/communities/community-feed'
import { CommunityHeader } from '@/components/communities/community-header'
import { CommunityList } from '@/components/communities/community-list'
import { CommunityModeratorsAside } from '@/components/communities/community-moderators-aside'
import { CommunityProxyBookmarkButton } from '@/components/communities/community-proxy-bookmark-button'
import { CreateCommunityForm } from '@/components/communities/create-community-form'
import { PostFilters } from '@/components/posts/post-filters'
import { EntityStoryFrame, AsideStack, StoryCard } from './entity-story-frame'
import { communities, posts, postsResponse, storyCurrentUser, topics } from './entity-fixtures'
import type {
  CommunitiesSearchResponseBody,
  Community,
  CommunityListItem,
  CommunityListPageData,
  CommunityMember,
  CommunityMembersResponseBody,
  CommunityMetrics,
  CommunityPostsResponseBody,
} from '@/types/api-responses'
const meta = {
  title: 'Entities/Communities',
  parameters: { auth: { currentUser: storyCurrentUser } },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>
const communityEntities = communities.map((community, index) => ({
  __entity_type: 'community',
  created_by_id: storyCurrentUser.id,
  updated_by_id: storyCurrentUser.id,
  markdown: community.description_markdown,
  banner_image_id: null,
  profile_image_id: null,
  list_type: index === 1 ? 'mute' : 'follow',
  member_invites_allowed_at: true,
  ...community,
})) as unknown as Community[]
const communityMetrics: Record<string, CommunityMetrics> = Object.fromEntries(
  communityEntities.map((community, index) => [
    community.id,
    {
      member_count: 1200 - index * 400,
      post_count: 84 - index * 20,
      list_item_count: index === 0 ? 12 : 0,
    },
  ]),
) as Record<string, CommunityMetrics>
const communitiesResponse: CommunitiesSearchResponseBody = {
  results: communityEntities.map(community => ({ __entity_type: 'community', id: community.id })),
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  communities: Object.fromEntries(communityEntities.map(community => [community.id, community])),
  users: {
    [storyCurrentUser.id]: { id: storyCurrentUser.id, username: storyCurrentUser.username ?? null },
  },
  community_metrics: communityMetrics,
  community_memberships: {},
  pending_application_community_ids: [],
}
const storyTopicListItem = {
  __entity_type: 'community_list_item',
  id: 'community-list-item-topic',
  community_id: communityEntities[0]!.id,
  item_type: 'topic',
  entity_id: topics[0]!.id,
  order_index: 0,
  added_by_id: storyCurrentUser.id,
  created_at: '2026-05-10T12:00:00.000Z',
} satisfies CommunityListItem
const storyTopicListData = {
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  results: [{ __entity_type: 'community_list_item', id: storyTopicListItem.id }],
  community_list_items: { [storyTopicListItem.id]: storyTopicListItem },
  topics: { [topics[0]!.id]: topics[0]! },
} satisfies CommunityListPageData
const storyCommunityPostsData = {
  results: posts.slice(1, 3).map(post => ({ __entity_type: 'post' as const, id: post.id })),
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: postsResponse.posts,
  posts_metrics: postsResponse.posts_metrics,
  communities: {
    [communityEntities[0]!.id]: {
      id: communityEntities[0]!.id,
      name: communityEntities[0]!.name,
      slug: communityEntities[0]!.slug,
    },
  },
  pinned_post_ids: [posts[0]!.id],
} satisfies CommunityPostsResponseBody
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
export const ListPage: Story = {
  render: () => (
    <EntityStoryFrame
      title='Communities'
      aside={CommunityAsides}
    >
      <CommunityList data={communitiesResponse} />
    </EntityStoryFrame>
  ),
}
export const ListForm: Story = {
  render: () => (
    <EntityStoryFrame title='Community filters'>
      <CommunityFilters />
    </EntityStoryFrame>
  ),
}
export const MainPageContent: Story = {
  render: () => (
    <EntityStoryFrame
      title='Community detail'
      aside={CommunityAsides}
    >
      <CommunityHeader
        community={communityEntities[0]!}
        metrics={communityMetrics[communityEntities[0]!.id]}
        membership={null}
      />
    </EntityStoryFrame>
  ),
}
export const PostsPage: Story = {
  render: () => (
    <EntityStoryFrame
      title='Community posts'
      aside={CommunityAsides}
    >
      <div className='space-y-4'>
        <PostFilters
          defaultSort='new'
          enableRelevanceSort={false}
        />
        <CommunityFeed
          data={storyCommunityPostsData}
          communitySlug={communityEntities[0]!.slug}
          nextPageParams={{ limit: 25, sort: 'new' }}
        />
      </div>
    </EntityStoryFrame>
  ),
}
const storyMembership: CommunityMember = {
  __entity_type: 'community_member',
  id: 'story-member-1',
  community_id: communityEntities[0]!.id,
  user_id: storyCurrentUser.id,
  role: 'member',
  approved_by_id: null,
  removed_at: null,
  removed_by_id: null,
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
}

export const VisibilityVariations: Story = {
  render: () => (
    <EntityStoryFrame title='Community card variants'>
      <div className='space-y-3'>
        <StoryCard title='Public community (open)'>
          <CommunityCard
            community={communityEntities[0]!}
            metrics={communityMetrics[communityEntities[0]!.id]}
          />
        </StoryCard>
        <StoryCard title='Private community (non-member)'>
          <CommunityCard
            community={{ ...communityEntities[1]!, visibility: 'private' }}
            metrics={communityMetrics[communityEntities[1]!.id]}
          />
        </StoryCard>
        <StoryCard title='Private community (member / joined)'>
          <CommunityCard
            community={{ ...communityEntities[0]!, visibility: 'private' }}
            metrics={communityMetrics[communityEntities[0]!.id]}
            membership={storyMembership}
          />
        </StoryCard>
        <StoryCard title='Private community (application pending)'>
          <CommunityCard
            community={{ ...communityEntities[1]!, visibility: 'private' }}
            metrics={communityMetrics[communityEntities[1]!.id]}
            hasPendingApplication
          />
        </StoryCard>
      </div>
    </EntityStoryFrame>
  ),
}
export const ListItemCard: Story = {
  render: () => (
    <EntityStoryFrame title='Community list item card'>
      <CommunityListItemCard
        item={storyTopicListItem}
        itemType='topic'
        data={storyTopicListData}
        communitySlug={communityEntities[0]!.slug}
        canManage
      />
    </EntityStoryFrame>
  ),
}
export const Form: Story = {
  render: () => (
    <EntityStoryFrame title='Create community'>
      <fieldset disabled>
        <CreateCommunityForm />
      </fieldset>
    </EntityStoryFrame>
  ),
}

export const Asides: Story = {
  render: () => (
    <EntityStoryFrame title='Community asides'>
      <CommunityAsides />
    </EntityStoryFrame>
  ),
}

function CommunityAsides() {
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
