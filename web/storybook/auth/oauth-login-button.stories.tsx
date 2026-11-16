import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { OAuthLoginButton } from '@/components/auth/oauth-login-button'
import { RuntimePublicConfigProvider } from '@/lib/runtime-public-config-provider'
import { StoryFrame } from '@/storybook/story-frame'

const onToken = async () => {}

const meta = {
  title: 'Auth/OAuth Login Button',
  decorators: [
    Story => (
      <StoryFrame width='max-w-sm'>
        <RuntimePublicConfigProvider config={{ googleClientId: 'storybook-google' }}>
          <Story />
        </RuntimePublicConfigProvider>
      </StoryFrame>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Brokered: Story = {
  render: () => (
    <OAuthLoginButton
      provider='github'
      onToken={onToken}
      broker={{ purpose: 'authenticate', returnTo: '/' }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('button', { name: 'Continue with GitHub' })).toBeEnabled()
  },
}

export const Direct: Story = {
  render: () => (
    <OAuthLoginButton
      provider='google'
      onToken={onToken}
    />
  ),
}
