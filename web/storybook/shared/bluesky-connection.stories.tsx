import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BlueskyConnection } from '@/components/my/bluesky-connection'

const meta = {
  title: 'Shared/BlueskyConnection',
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
      <p className='text-sm text-muted-foreground'>Connected state (handle + disconnect):</p>
      <BlueskyConnection
        initialAccount={{ did: 'did:plc:abc123xyz', handle: 'alice.bsky.social' }}
      />
    </Frame>
  ),
}

export const ConnectedWithoutHandle: Story = {
  render: () => (
    <Frame>
      <p className='text-sm text-muted-foreground'>
        Connected but the handle has not resolved yet — falls back to the DID:
      </p>
      <BlueskyConnection initialAccount={{ did: 'did:plc:abc123xyz', handle: null }} />
    </Frame>
  ),
}

export const Disconnected: Story = {
  render: () => (
    <Frame>
      <p className='text-sm text-muted-foreground'>
        Disconnected state (handle input + connect button):
      </p>
      <BlueskyConnection initialAccount={null} />
    </Frame>
  ),
}
