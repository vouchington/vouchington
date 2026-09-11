import { createRef } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LoginEmailStep } from '@/components/auth/login-email-step'
import type { OAuthProvidersResponse } from '@/lib/api/client'

const meta = {
  title: 'Shared/LoginEmailStep',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const sharedProps = {
  active: true,
  email: '',
  hasOAuthProviders: false,
  hpPhoneRef: createRef<HTMLInputElement | null>(),
  hpWebsiteRef: createRef<HTMLInputElement | null>(),
  loading: false,
  oauthProviders: [],
  onEmailChange: () => {},
  onOAuthToken: async () => {},
  onPasskeySignIn: async () => {},
  onSubmit: async () => {},
  turnstileRef: () => {},
  turnstileToken: 'mock-token',
}
const brokerCapabilities = {
  facebook: {
    version: 1,
    modes: { web: true, native: true },
    purposes: ['authenticate', 'connect'],
  },
  x: {
    version: 1,
    modes: { web: true, native: true },
    purposes: ['authenticate', 'connect'],
  },
  github: {
    version: 1,
    modes: { web: true, native: true },
    purposes: ['authenticate', 'connect'],
  },
} satisfies OAuthProvidersResponse['broker_capabilities']

export const Default: Story = {
  render: () => (
    <main className='flex min-h-screen items-center justify-center bg-background p-6 text-foreground'>
      <div className='w-full max-w-sm space-y-4'>
        <h1 className='text-2xl font-bold'>Sign in</h1>
        <LoginEmailStep {...sharedProps} />
      </div>
    </main>
  ),
}

export const WithPasskeyButtonDisabled: Story = {
  render: () => (
    <main className='flex min-h-screen items-center justify-center bg-background p-6 text-foreground'>
      <div className='w-full max-w-sm space-y-4'>
        <h1 className='text-2xl font-bold'>Sign in — loading state</h1>
        <LoginEmailStep
          {...sharedProps}
          loading
          turnstileToken={null}
        />
      </div>
    </main>
  ),
}

export const WithEmailPrefilled: Story = {
  render: () => (
    <main className='flex min-h-screen items-center justify-center bg-background p-6 text-foreground'>
      <div className='w-full max-w-sm space-y-4'>
        <h1 className='text-2xl font-bold'>Sign in</h1>
        <LoginEmailStep
          {...sharedProps}
          email='user@example.com'
        />
      </div>
    </main>
  ),
}

export const WithBrokerProviders: Story = {
  render: () => (
    <main className='flex min-h-screen items-center justify-center bg-background p-6 text-foreground'>
      <div className='w-full max-w-sm space-y-4'>
        <h1 className='text-2xl font-bold'>Sign in</h1>
        <LoginEmailStep
          {...sharedProps}
          hasOAuthProviders
          oauthProviders={['facebook', 'x', 'github']}
          oauthBrokerCapabilities={brokerCapabilities}
          oauthReturnTo='/friends'
        />
      </div>
    </main>
  ),
}
