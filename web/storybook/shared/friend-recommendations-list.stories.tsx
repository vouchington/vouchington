import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FriendRecommendationsList } from '@/components/my/friend-recommendations-list'
import type { FriendRecommendationsResponseBody } from '@/types/api-responses'

const meta = {
  title: 'Shared/FriendRecommendationsList',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const pageInfo = {
  has_next_page: false,
  end_cursor: null,
  start_cursor: null,
} as const

const emptyData = {
  results: [],
  page_info: pageInfo,
  users: {},
} as unknown as FriendRecommendationsResponseBody

const withResultsData = {
  results: [
    { id: 'u1', provider: 'facebook', provider_friend_name: 'Alice Smith' },
    { id: 'u2', provider: 'x', provider_friend_name: 'Bob Jones' },
    { id: 'u3', provider: 'github', provider_friend_name: 'carol_dev' },
  ],
  page_info: pageInfo,
  users: {
    u1: { id: 'u1', username: 'alice', roles: [] },
    u2: { id: 'u2', username: 'bob', roles: [] },
  },
} as unknown as FriendRecommendationsResponseBody

const Frame = ({ children }: { children: ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-2xl'>{children}</div>
  </main>
)

export const EmptyState: Story = {
  render: () => (
    <Frame>
      <FriendRecommendationsList initialData={emptyData} />
    </Frame>
  ),
}

export const WithRecommendations: Story = {
  render: () => (
    <Frame>
      <FriendRecommendationsList initialData={withResultsData} />
    </Frame>
  ),
}
