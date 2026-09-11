import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicListSkeleton } from '@/components/topics/topic-list-skeleton'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Topic Skeletons',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <EntityStoryFrame title='Topic Skeletons'>
      <TopicListSkeleton />
    </EntityStoryFrame>
  ),
}
