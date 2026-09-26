import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { RssBookmarkTypeFilter } from '@/components/my/rss-bookmark-type-filter'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Rss Bookmark Type Filter',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const SavedNews: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/my/news-items/saved' } },
  },
  render: () => (
    <StoryFrame width='max-w-md'>
      <RssBookmarkTypeFilter listType='saved' />
    </StoryFrame>
  ),
}

export const HiddenVideos: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/my/videos/hidden' } },
  },
  render: () => (
    <StoryFrame width='max-w-md'>
      <RssBookmarkTypeFilter listType='hidden' />
    </StoryFrame>
  ),
}
