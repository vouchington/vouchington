import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProviderButton } from '@/components/auth/oauth-provider-button'
import { providerButtonClassNames } from '@/components/auth/oauth-provider-configs'
import type { OAuthLoginToken } from '@/lib/auth/oauth-login-token'
import type { OAuthProvider } from '@/types/user'

const meta = {
  title: 'Shared/ProviderButton',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: ReactNode }) => (
  <main className='flex min-h-screen items-center justify-center bg-background p-6 text-foreground'>
    <div className='w-full max-w-sm'>{children}</div>
  </main>
)

const auth = { isAvailable: true, isLoaded: true }

export const Google: Story = {
  render: () => (
    <ProviderButtonStory
      provider='google'
      label='Google'
      token={makeGoogleToken}
    />
  ),
}

export const Facebook: Story = {
  render: () => (
    <ProviderButtonStory
      provider='facebook'
      label='Facebook'
      token={makeFacebookToken}
    />
  ),
}

export const Apple: Story = {
  render: () => (
    <ProviderButtonStory
      provider='apple'
      label='Apple'
      token={makeAppleToken}
    />
  ),
}

export const Microsoft: Story = {
  render: () => (
    <ProviderButtonStory
      provider='microsoft'
      label='Microsoft'
      token={makeMicrosoftToken}
    />
  ),
}

export const LinkedIn: Story = {
  render: () => (
    <ProviderButtonStory
      provider='linkedin'
      label='LinkedIn'
      token={makeLinkedInToken}
    />
  ),
}

export const X: Story = {
  render: () => (
    <ProviderButtonStory
      provider='x'
      label='X'
      token={makeXToken}
    />
  ),
}

export const GitHub: Story = {
  render: () => (
    <ProviderButtonStory
      provider='github'
      label='GitHub'
      token={makeGithubToken}
    />
  ),
}

function ProviderButtonStory({
  provider,
  label,
  token,
}: {
  provider: OAuthProvider
  label: string
  token: () => OAuthLoginToken
}) {
  return (
    <Frame>
      <ProviderButton
        label={label}
        auth={auth}
        provider={provider}
        buttonClassName={providerButtonClassNames[provider]}
        getToken={async () => token()}
        onToken={async () => {}}
      />
    </Frame>
  )
}

function makeGoogleToken(): OAuthLoginToken {
  return { provider: 'google', credential: 'story-token' }
}

function makeFacebookToken(): OAuthLoginToken {
  return { provider: 'facebook', token: 'story-token' }
}

function makeAppleToken(): OAuthLoginToken {
  return { provider: 'apple', token: 'story-token', nonce: 'story-nonce' }
}

function makeMicrosoftToken(): OAuthLoginToken {
  return {
    provider: 'microsoft',
    code: 'story-code',
    codeVerifier: 'story-code-verifier',
    redirectUri: 'https://example.com/oauth/microsoft',
  }
}

function makeLinkedInToken(): OAuthLoginToken {
  return {
    provider: 'linkedin',
    code: 'story-code',
    codeVerifier: 'story-code-verifier',
    redirectUri: 'https://example.com/oauth/linkedin',
  }
}

function makeXToken(): OAuthLoginToken {
  return {
    provider: 'x',
    code: 'story-code',
    codeVerifier: 'story-code-verifier',
    redirectUri: 'https://example.com/oauth/x',
  }
}

function makeGithubToken(): OAuthLoginToken {
  return {
    provider: 'github',
    code: 'story-code',
    redirectUri: 'https://example.com/oauth/github',
  }
}
