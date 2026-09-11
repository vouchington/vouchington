import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UserPostRelationList } from '@/components/users/user-post-relation-list'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'
import { EntityStoryFrame, EntityStorySection } from '@/storybook/entities/entity-story-frame'
import { posts, storyCurrentUser } from '@/storybook/entities/entity-fixtures'

const meta = {
  title: 'Entities/Users/UserPostRelationList',
  parameters: { auth: { currentUser: storyCurrentUser } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const relationPosts = posts.slice(0, 2)

export const WithPosts: Story = {
  render: () => (
    <EntityStoryFrame title='Saved posts'>
      <UserPostRelationList
        posts={relationPosts}
        emptyTitle='No saved posts'
        emptyDescription='Posts you save will appear here.'
      />
    </EntityStoryFrame>
  ),
}

export const ManagedPosts: Story = {
  render: () => (
    <EntityStoryFrame title='Saved posts management'>
      <EntityStorySection title='Remove saved posts'>
        <UserPostRelationList
          posts={relationPosts}
          emptyTitle='No saved posts'
          emptyDescription='Posts you save will appear here.'
          relationAction={USER_RELATION_ACTIONS.post.saved}
          onRemoved={() => undefined}
        />
      </EntityStorySection>
    </EntityStoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <EntityStoryFrame title='Saved posts'>
      <UserPostRelationList
        posts={[]}
        emptyTitle='No saved posts'
        emptyDescription='Posts you save will appear here.'
      />
    </EntityStoryFrame>
  ),
}
