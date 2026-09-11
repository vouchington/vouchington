import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunitiesListSkeleton } from '@/components/communities/communities-list-skeleton'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Communities List Skeleton',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <EntityStoryFrame title='Communities List Skeleton'>
      <CommunitiesListSkeleton />
    </EntityStoryFrame>
  ),
}
