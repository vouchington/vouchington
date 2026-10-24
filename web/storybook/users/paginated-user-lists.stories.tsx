import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PaginatedUserList } from '@/components/users/paginated-user-list'
import { PaginatedUserSearchResults } from '@/components/users/paginated-user-search-results'
import { page_info } from '@/storybook/entities/fixtures/shared'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Users/Paginated User Lists',
  parameters: { auth: { currentUser: storyCurrentUser } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const mutedUser = publicUsers[1]!

export const FollowingList: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <PaginatedUserList
        initialData={{
          results: publicUsers,
          page_info,
          muted: { [mutedUser.id]: true },
        }}
        endpoint='/api/v1/users/user-alex/following'
        emptyTitle='Not following anyone'
        emptyDescription='Members you follow will appear here.'
        currentUserId={storyCurrentUser.id}
      />
    </StoryFrame>
  ),
}

export const EmptyList: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <PaginatedUserList
        initialData={{ results: [], page_info }}
        endpoint='/api/v1/users/user-alex/followers'
        emptyTitle='No followers yet'
        emptyDescription='Followers will appear here.'
      />
    </StoryFrame>
  ),
}

export const SearchResults: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <PaginatedUserSearchResults
        initialData={{ results: publicUsers, page_info }}
        query='a'
        emptyTitle='No users found'
        emptyDescription='Try a different search.'
        currentUserId={storyCurrentUser.id}
      />
    </StoryFrame>
  ),
}

export const SearchNoMatches: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <PaginatedUserSearchResults
        initialData={{ results: [], page_info }}
        query='zzzz'
        emptyTitle='No users found'
        emptyDescription='Try a different search.'
      />
    </StoryFrame>
  ),
}
