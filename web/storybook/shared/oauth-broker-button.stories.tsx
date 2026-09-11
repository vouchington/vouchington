import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { OAuthBrokerButton } from '@/components/auth/oauth-broker-button'

const meta = {
  title: 'Shared/OAuthBrokerButton',
  component: OAuthBrokerButton,
  args: {
    purpose: 'authenticate',
    returnTo: '/',
  },
  decorators: [
    Story => (
      <main className='flex min-h-screen items-center justify-center bg-background p-6 text-foreground'>
        <div className='w-full max-w-sm'>
          <Story />
        </div>
      </main>
    ),
  ],
} satisfies Meta<typeof OAuthBrokerButton>

export default meta
type Story = StoryObj<typeof meta>

export const Facebook: Story = {
  args: { provider: 'facebook' },
}

export const X: Story = {
  args: { provider: 'x' },
}

export const GitHub: Story = {
  args: { provider: 'github' },
}

export const Disabled: Story = {
  args: { provider: 'github', disabled: true },
}
