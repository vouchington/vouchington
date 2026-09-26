import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import {
  AppleLoginButton,
  FacebookLoginButton,
  GithubLoginButton,
  GoogleLoginButton,
  LinkedInLoginButton,
  MicrosoftLoginButton,
  XLoginButton,
} from '@/components/auth/oauth-provider-buttons'
import { RuntimePublicConfigProvider } from '@/lib/runtime-public-config-provider'
import type { RuntimePublicConfig } from '@/lib/runtime-public-config'
import { StoryFrame } from '@/storybook/story-frame'

const onToken = async () => {}

const configuredProviders: RuntimePublicConfig = {
  appleClientId: 'storybook.apple',
  facebookAppId: 'storybook-facebook',
  githubClientId: 'storybook-github',
  googleClientId: 'storybook-google',
  linkedinClientId: 'storybook-linkedin',
  microsoftClientId: 'storybook-microsoft',
  xClientId: 'storybook-x',
}

const meta = {
  title: 'Auth/OAuth Provider Buttons',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ProviderButtons({ config }: { config: RuntimePublicConfig }) {
  return (
    <StoryFrame width='max-w-sm'>
      <RuntimePublicConfigProvider config={config}>
        <div className='space-y-3'>
          <AppleLoginButton onToken={onToken} />
          <FacebookLoginButton onToken={onToken} />
          <GithubLoginButton onToken={onToken} />
          <GoogleLoginButton onToken={onToken} />
          <LinkedInLoginButton onToken={onToken} />
          <MicrosoftLoginButton onToken={onToken} />
          <XLoginButton onToken={onToken} />
        </div>
      </RuntimePublicConfigProvider>
    </StoryFrame>
  )
}

export const Available: Story = {
  render: () => <ProviderButtons config={configuredProviders} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('button', { name: 'Continue with Facebook' }),
    ).toBeEnabled()
  },
}

export const FacebookUnavailable: Story = {
  render: () => <ProviderButtons config={{ ...configuredProviders, facebookAppId: undefined }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const facebook = await canvas.findByRole('button', {
      name: 'Continue with Facebook (unavailable)',
    })
    await expect(facebook).toHaveAttribute('aria-disabled', 'true')
  },
}
