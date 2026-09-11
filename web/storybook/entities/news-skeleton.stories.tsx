import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { NewsListSkeleton } from '@/components/news/news-list-skeleton'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/News Skeleton',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <EntityStoryFrame title='News List Skeleton'>
      <NewsListSkeleton />
    </EntityStoryFrame>
  ),
}
