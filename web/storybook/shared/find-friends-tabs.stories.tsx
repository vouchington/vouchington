import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FindFriendsTabs } from '@/components/my/find-friends-tabs'

const meta = {
  title: 'Shared/FindFriendsTabs',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: ReactNode }) => (
  <main className='bg-background p-4 text-foreground'>
    <div className='mx-auto max-w-4xl'>{children}</div>
  </main>
)

export const SuggestionsActive: Story = {
  parameters: {
    nextjs: { navigation: { pathname: '/my/friend-recommendations' } },
  },
  render: () => (
    <Frame>
      <FindFriendsTabs />
    </Frame>
  ),
}

export const DismissedActive: Story = {
  parameters: {
    nextjs: { navigation: { pathname: '/my/friend-recommendations/dismissed' } },
  },
  render: () => (
    <Frame>
      <FindFriendsTabs />
    </Frame>
  ),
}
