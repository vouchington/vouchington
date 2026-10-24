import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BillingPortalButton } from '@/components/memberships/billing-portal-button'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Memberships/Billing Portal Button',
  component: BillingPortalButton,
} satisfies Meta<typeof BillingPortalButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <BillingPortalButton />
    </StoryFrame>
  ),
}
