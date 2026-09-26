import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FollowerSendDialog } from '@/components/shared/follower-send-dialog'
import { StoryFrame } from '@/storybook/story-frame'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'

const alex = publicUsers[0]!

const meta = {
  title: 'Shared/Follower Send Dialog',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AllFollowers: Story = {
  render: () => (
    <StoryFrame>
      <FollowerSendDialog
        open
        audience='all_followers'
        currentUserId={storyCurrentUser.id}
        isSendPending={false}
        selectedFollowers={[]}
        onAudienceChange={() => undefined}
        onOpenChange={() => undefined}
        onSend={() => undefined}
        onToggleFollowerSelection={() => undefined}
      />
    </StoryFrame>
  ),
}

export const SelectedFollowers: Story = {
  render: () => (
    <StoryFrame>
      <FollowerSendDialog
        open
        audience='selected_followers'
        currentUserId={storyCurrentUser.id}
        isSendPending={false}
        selectedFollowers={[alex]}
        onAudienceChange={() => undefined}
        onOpenChange={() => undefined}
        onSend={() => undefined}
        onToggleFollowerSelection={() => undefined}
      />
    </StoryFrame>
  ),
}
