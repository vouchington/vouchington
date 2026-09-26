import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { IdentityForm } from '@/components/my/identity-form'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { clearMyAccountFixture, setMyAccountFixture } from '@/storybook/mocks/my-account-fixture'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Identity Form',
  beforeEach() {
    setMyAccountFixture()
    return () => clearMyAccountFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const facebook = {
  id: 'fb-cardholder',
  name: 'Card Holder',
  email_address: null,
}

export const WithUsername: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <IdentityForm
        initialUsername={storyCurrentUser.username ?? null}
        initialProfileImageId={null}
        initialUseDisplayNameFrom='username'
        initialFacebookAccount={facebook}
        hasOAuthAccount={false}
      />
    </StoryFrame>
  ),
}

export const NeedsUsername: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <IdentityForm
        initialUsername={null}
        initialProfileImageId={null}
        initialUseDisplayNameFrom='facebook'
        initialFacebookAccount={facebook}
        hasOAuthAccount
      />
    </StoryFrame>
  ),
}
