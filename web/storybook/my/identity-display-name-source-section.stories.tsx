import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { IdentityDisplayNameSourceSection } from '@/components/my/identity-display-name-source-section'
import { StoryFrame } from '@/storybook/story-frame'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import type { UseDisplayNameFrom } from '@/types/my'

const meta = {
  title: 'My/Identity Display Name Source Section',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function UsernameAndFacebookSource() {
  const [source, setSource] = useState<UseDisplayNameFrom>('username')
  return (
    <StoryFrame width='max-w-xl'>
      <IdentityDisplayNameSourceSection
        initialUsername={storyCurrentUser.username ?? null}
        initialFacebookAccount={{ id: 'fb-cardholder' }}
        useDisplayNameFrom={source}
        displayNameLoading={false}
        onDisplayNameSourceChange={value => setSource(value as UseDisplayNameFrom)}
      />
    </StoryFrame>
  )
}

export const UsernameAndFacebook: Story = {
  render: () => <UsernameAndFacebookSource />,
}

export const Unavailable: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <IdentityDisplayNameSourceSection
        initialUsername={null}
        initialFacebookAccount={null}
        useDisplayNameFrom='username'
        displayNameLoading={false}
        onDisplayNameSourceChange={() => {}}
      />
    </StoryFrame>
  ),
}
