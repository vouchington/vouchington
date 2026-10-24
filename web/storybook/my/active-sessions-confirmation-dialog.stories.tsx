import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ActiveSessionsConfirmationDialog } from '@/components/my/active-sessions-confirmation-dialog'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Active Sessions Confirmation Dialog',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const SignOutAllDevices: Story = {
  render: () => (
    <StoryFrame>
      <ActiveSessionsConfirmationDialog
        confirmation={{ type: 'all' }}
        disabled={false}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    </StoryFrame>
  ),
}

export const RevokeMcpAccess: Story = {
  render: () => (
    <StoryFrame>
      <ActiveSessionsConfirmationDialog
        confirmation={{ type: 'mcp', grantId: 'grant-1' }}
        disabled={false}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    </StoryFrame>
  ),
}
