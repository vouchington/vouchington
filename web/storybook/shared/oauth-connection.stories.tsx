import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { OAuthConnection } from '@/components/my/oauth-connection'

const meta = {
  title: 'Shared/OAuthConnection',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-2xl space-y-4'>{children}</div>
  </main>
)

export const Connected: Story = {
  render: () => (
    <Frame>
      <p className='text-sm text-muted-foreground'>Connected state (account info + disconnect):</p>
      <OAuthConnection
        provider='google'
        initialAccount={{ id: 'g-1', name: 'Test User', email_address: 'test@example.com' }}
      />
    </Frame>
  ),
}

export const ConnectedXAccount: Story = {
  render: () => (
    <Frame>
      <OAuthConnection
        provider='x'
        initialAccount={{ id: 'x-1', name: '@testuser', email_address: null }}
      />
    </Frame>
  ),
}

export const Disconnected: Story = {
  render: () => (
    <Frame>
      <p className='text-sm text-muted-foreground'>
        Disconnected state (login button shown when SDK is available; hidden when unavailable):
      </p>
      <OAuthConnection
        provider='google'
        initialAccount={null}
      />
    </Frame>
  ),
}
