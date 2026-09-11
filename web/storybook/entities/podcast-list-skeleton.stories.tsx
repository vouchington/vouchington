import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PodcastListSkeleton } from '@/components/podcasts/podcast-list-skeleton'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Podcast List Skeleton',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <EntityStoryFrame title='Podcast List Skeleton'>
      <PodcastListSkeleton />
    </EntityStoryFrame>
  ),
}
