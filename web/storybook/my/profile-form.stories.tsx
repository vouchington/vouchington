import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProfileForm } from '@/components/my/profile-form'
import { StoryFrame } from '@/storybook/story-frame'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'

const meta = {
  title: 'My/Profile Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const WithBio: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ProfileForm
        initialMarkdown={
          storyCurrentUser.markdown ?? 'I compare cards, referral programs, and travel tools.'
        }
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ProfileForm initialMarkdown='' />
    </StoryFrame>
  ),
}
