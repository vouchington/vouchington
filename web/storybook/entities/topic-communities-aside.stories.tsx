import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator, loadMessages } from '@ts-shared/ui-messages'
import { TopicCommunitiesAsideContent } from '@/components/topics/topic-communities-aside-content'
import { EntityStoryFrame, AsideStack } from './entity-story-frame'
import { communities, topics } from './entity-fixtures'
import type { Topic } from '@/types/topics'
import type { Community, CommunityMetrics } from '@/types/api-responses'

const t = createTranslator('en', await loadMessages('en'))

const meta = {
  title: 'Entities/TopicCommunitiesAside',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const topic = topics[0] as Topic

const communityEntities = communities.map(community => ({
  __entity_type: 'community' as const,
  created_by_id: 'owner-id',
  markdown: (community as { description_markdown?: string }).description_markdown ?? null,
  banner_image_id: null,
  profile_image_id: null,
  list_type: null,
  member_invites_allowed_at: null,
  post_approval_required_at: null,
  allow_review_posts: false,
  allow_data_point_posts: false,
  trusted_at: null,
  member_roster_visibility: 'public',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  rules_markdown: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...community,
})) as Community[]

const communityMetrics: Record<string, CommunityMetrics> = Object.fromEntries(
  communityEntities.map((community, index) => [
    community.id,
    {
      __entity_type: 'community_metrics' as const,
      id: community.id,
      member_count: 1200 - index * 400,
      post_count: 84 - index * 20,
      list_item_count: 3,
      proxy_follow_count: 0,
      proxy_mute_count: 0,
      virtual_subscription_count: 1200 - index * 400,
    },
  ]),
)

export const Populated: Story = {
  render: () => (
    <EntityStoryFrame title='Topic communities aside – populated'>
      <AsideStack>
        <TopicCommunitiesAsideContent
          topic={topic}
          communities={communityEntities}
          communityMetrics={communityMetrics}
          t={t}
        />
      </AsideStack>
    </EntityStoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <EntityStoryFrame title='Topic communities aside – empty'>
      <p className='text-sm text-muted-foreground'>(Nothing renders when communities is empty)</p>
      <TopicCommunitiesAsideContent
        topic={topic}
        communities={[]}
        communityMetrics={{}}
        t={t}
      />
    </EntityStoryFrame>
  ),
}
