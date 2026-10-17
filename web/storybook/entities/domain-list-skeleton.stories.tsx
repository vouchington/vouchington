import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DomainListSkeleton } from '@/components/domains/domain-list-skeleton'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Domain List Skeleton',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <EntityStoryFrame title='Domain List Skeleton'>
      <DomainListSkeleton />
    </EntityStoryFrame>
  ),
}
