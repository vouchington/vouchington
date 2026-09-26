import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FollowerShareActionButtons } from '@/components/shared/follower-share-action-buttons'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Shared/Follower Share Action Buttons',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const share = async () => undefined

export const Expanded: Story = {
  render: () => (
    <StoryFrame>
      <FollowerShareActionButtons
        compact={false}
        isSharePending={false}
        onSendOpen={() => undefined}
        onShare={share}
      />
    </StoryFrame>
  ),
}

export const CompactMenu: Story = {
  render: () => (
    <StoryFrame>
      <FollowerShareActionButtons
        compact
        isSharePending={false}
        onSendOpen={() => undefined}
        onShare={share}
      />
    </StoryFrame>
  ),
}
