import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { IdentityUsernameSection } from '@/components/my/identity-username-section'
import type { useAvailabilityCheck } from '@/hooks/use-availability-check'

const meta = {
  title: 'My/IdentityUsernameSection',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-md'>{children}</div>
  </main>
)

const idleAvailability: ReturnType<typeof useAvailabilityCheck> = {
  state: { status: 'idle', conflict: null },
  onBlur: () => {},
  reset: () => {},
}

const takenAvailability: ReturnType<typeof useAvailabilityCheck> = {
  state: { status: 'taken', conflict: null },
  onBlur: () => {},
  reset: () => {},
}

function IdentityUsernameSectionStandalone() {
  const [username, setUsername] = useState('storyteller')
  return (
    <IdentityUsernameSection
      username={username}
      initialUsername='storyteller'
      hasOAuthAccount={false}
      usernameLoading={false}
      usernameAvailability={idleAvailability}
      onUsernameChange={setUsername}
      onSubmit={e => e.preventDefault()}
    />
  )
}

export const Default: Story = {
  render: () => (
    <Frame>
      <IdentityUsernameSectionStandalone />
    </Frame>
  ),
}

export const Unavailable: Story = {
  render: () => (
    <Frame>
      <IdentityUsernameSection
        username='taken-username'
        initialUsername='storyteller'
        hasOAuthAccount={false}
        usernameLoading={false}
        usernameAvailability={takenAvailability}
        onUsernameChange={() => {}}
        onSubmit={e => e.preventDefault()}
      />
    </Frame>
  ),
}

export const Saving: Story = {
  render: () => (
    <Frame>
      <IdentityUsernameSection
        username='storyteller-2'
        initialUsername='storyteller'
        hasOAuthAccount={false}
        usernameLoading
        usernameAvailability={idleAvailability}
        onUsernameChange={() => {}}
        onSubmit={e => e.preventDefault()}
      />
    </Frame>
  ),
}
