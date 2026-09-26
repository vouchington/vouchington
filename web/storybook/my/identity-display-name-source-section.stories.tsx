import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { IdentityDisplayNameSourceSection } from '@/components/my/identity-display-name-source-section'
import { StoryFrame } from '@/storybook/story-frame'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'

const meta = {
  title: 'My/Identity Display Name Source Section',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const UsernameAndFacebook: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <IdentityDisplayNameSourceSection
        initialUsername={storyCurrentUser.username ?? null}
        initialFacebookAccount={{ id: 'fb-cardholder' }}
        useDisplayNameFrom='username'
        displayNameLoading={false}
        onDisplayNameSourceChange={() => {}}
      />
    </StoryFrame>
  ),
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
