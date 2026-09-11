import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SettingsPageSkeleton } from '@/components/my/settings-page-skeleton'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Settings Page Skeleton',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <EntityStoryFrame title='Settings Page Skeleton'>
      <SettingsPageSkeleton />
    </EntityStoryFrame>
  ),
}
