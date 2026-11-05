import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityCard } from '@/components/communities/community-card'
import { CommunityListItemCard } from '@/components/communities/community-list-item-card'
import { CommunityFilters } from '@/components/communities/community-filters'
import { CommunityFeed } from '@/components/communities/community-feed'
import { CommunityHeader } from '@/components/communities/community-header'
import { CommunityList } from '@/components/communities/community-list'
import { CreateCommunityForm } from '@/components/communities/create-community-form'
import { PostFilters } from '@/components/posts/post-filters'
import { EntityStoryFrame, StoryCard } from './entity-story-frame'
import { storyCurrentUser } from './entity-fixtures'
import { CommunityAsides } from './communities-story-asides'
import {
  communitiesResponse,
  communityEntities,
  communityMetrics,
  storyCommunityPostsData,
  storyMembership,
  storyTopicListData,
  storyTopicListItem,
} from './communities-story-fixtures'

const meta = {
  title: 'Entities/Communities',
  parameters: { auth: { currentUser: storyCurrentUser } },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

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
