import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'

const meta = {
  title: 'My/BookmarkPageHeader',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-3xl space-y-8'>{children}</div>
  </main>
)

export const SavedNewsItems: Story = {
  render: () => (
    <Frame>
      <BookmarkPageHeader routeKey='news-items/saved' />
    </Frame>
  ),
}

export const WithDropdown: Story = {
  render: () => (
    <Frame>
      <BookmarkPageHeader routeKey='news-sources/muted' />
    </Frame>
  ),
}

export const Singleton: Story = {
  render: () => (
    <Frame>
      <BookmarkPageHeader routeKey='users/followers' />
    </Frame>
  ),
}
