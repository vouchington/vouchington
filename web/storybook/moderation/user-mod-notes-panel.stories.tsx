import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UserModNotesPanel } from '../../components/moderation/user-mod-notes-panel'
import { setModerationContextFixture } from '@/storybook/mocks/client-api-instance'
import { communities } from '@/storybook/entities/fixtures/communities'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Moderation/User Mod Notes Panel',
  component: UserModNotesPanel,
} satisfies Meta<typeof UserModNotesPanel>

export default meta
type Story = StoryObj<typeof meta>

export const CreditCardsMember: Story = {
  args: { targetUserId: publicUsers[0]!.id, communityId: communities[0]!.id },
  render: args => {
    setModerationContextFixture()
    return (
      <StoryFrame width='max-w-md'>
        <UserModNotesPanel {...args} />
      </StoryFrame>
    )
  },
}
