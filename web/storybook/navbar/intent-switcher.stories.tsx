import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { IntentSwitcher } from '@/components/navbar/intent-switcher'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Navbar/Intent Switcher',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const SignedIn: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <IntentSwitcher variant='navbar' />
    </StoryFrame>
  ),
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => (
    <StoryFrame width='max-w-sm'>
      <IntentSwitcher variant='navbar' />
    </StoryFrame>
  ),
}
