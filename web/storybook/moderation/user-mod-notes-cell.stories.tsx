import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UserModNotesCell } from '@/components/moderation/user-mod-notes-cell'
import { communities } from '@/storybook/entities/fixtures/communities'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Moderation/User Mod Notes Cell',
  component: UserModNotesCell,
} satisfies Meta<typeof UserModNotesCell>

export default meta
type Story = StoryObj<typeof meta>

function NotesTable({ targetUserId }: { targetUserId: string | null }) {
  return (
    <table>
      <thead>
        <tr>
          <th scope='col'>Member</th>
          <th scope='col'>Notes</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{publicUsers[0]!.display_account?.name ?? publicUsers[0]!.username}</td>
          <UserModNotesCell
            targetUserId={targetUserId}
            communityId={communities[0]!.id}
          />
        </tr>
      </tbody>
    </table>
  )
}

export const WithMember: Story = {
  render: () => (
    <StoryFrame>
      <NotesTable targetUserId={publicUsers[0]!.id} />
    </StoryFrame>
  ),
}

export const NoMember: Story = {
  render: () => (
    <StoryFrame>
      <NotesTable targetUserId={null} />
    </StoryFrame>
  ),
}
