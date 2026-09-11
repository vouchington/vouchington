import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { StorybookProviders } from '@/storybook/entities/storybook-providers'
import { SuspensionBanner } from '@/components/moderation/notices/suspension-banner'
import type { User } from '@/types/user'

const suspendedUser: User = {
  id: 'user-1',
  roles: [],
  suspended_at: '2026-06-01T00:00:00Z',
}

const meta: Meta<typeof SuspensionBanner> = {
  component: SuspensionBanner,
  title: 'Moderation/SuspensionBanner',
  decorators: [
    Story => (
      <StorybookProviders currentUser={suspendedUser}>
        <Story />
      </StorybookProviders>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof SuspensionBanner>

export const Suspended: Story = { args: { notice: { reason: null } } }

export const SuspendedWithReason: Story = {
  render: () => (
    <StorybookProviders
      currentUser={{
        ...suspendedUser,
        suspended_reason: 'Repeated violations of community guidelines.',
      }}
    >
      <SuspensionBanner notice={{ reason: 'Repeated violations of community guidelines.' }} />
    </StorybookProviders>
  ),
}
