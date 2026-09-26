import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CheckoutButton } from '@/components/memberships/checkout-button'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Memberships/Checkout Button',
  component: CheckoutButton,
} satisfies Meta<typeof CheckoutButton>

export default meta
type Story = StoryObj<typeof meta>

export const Plus: Story = {
  args: { planSlug: 'plus', productId: 'plus-monthly', planName: 'Plus' },
  render: args => (
    <StoryFrame width='max-w-sm'>
      <CheckoutButton {...args} />
    </StoryFrame>
  ),
}
