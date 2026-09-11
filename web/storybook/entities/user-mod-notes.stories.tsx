import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UserModNotesControl } from '@/components/moderation/user-mod-notes-cell'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Moderation/UserModNotes',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Control: Story = {
  render: () => (
    <EntityStoryFrame
      title='User Mod Notes'
      description='Moderator notes trigger for user-targeted reports.'
    >
      <UserModNotesControl targetUserId='user-story-1' />
    </EntityStoryFrame>
  ),
}
