import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SourceListSkeleton } from '@/components/sources/source-list-skeleton'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Source List Skeleton',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <EntityStoryFrame title='Source List Skeleton'>
      <SourceListSkeleton />
    </EntityStoryFrame>
  ),
}
