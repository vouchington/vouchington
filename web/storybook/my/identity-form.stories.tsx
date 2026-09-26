import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { IdentityForm } from '@/components/my/identity-form'
import { StoryFrame } from '@/storybook/story-frame'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'

const meta = {
  title: 'My/Identity Form',
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
