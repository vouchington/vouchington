import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MembershipStatus } from '@/components/memberships/membership-status'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import type { MembershipSku, SubscriptionMembership } from '@/types/api-responses'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Memberships/Membership Status',
  component: MembershipStatus,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof MembershipStatus>

export default meta
type Story = StoryObj<typeof meta>

const plusSku: MembershipSku = {
  id: 'plus-monthly',
  plan: 'plus',
  price: { amount: 500, currency: 'usd' },
  interval: 'monthly',
  stripe_price_id: 'price_plus_monthly',
  retired_at: null,
}

const plusMembership: SubscriptionMembership = {
  __entity_type: 'membership',
  id: 'membership-plus',
  user_id: storyCurrentUser.id,
  plan: 'plus',
  status: 'active',
  started_at: '2026-01-15T00:00:00.000Z',
  expires_at: '2099-07-15T00:00:00.000Z',
  has_stripe_subscription: true,
  granted_by_id: null,
  cancelled_at: null,
  expired_at: null,
  past_due_at: null,
  paused_at: null,
  cancel_at_period_end: false,
  latest_change_id: null,
  created_at: '2026-01-15T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  sku: plusSku,
}

export const ActivePlus: Story = {
  args: { membership: plusMembership },
  render: args => (
    <StoryFrame width='max-w-md'>
      <MembershipStatus {...args} />
    </StoryFrame>
  ),
}

export const CancelsAtPeriodEnd: Story = {
  args: { membership: { ...plusMembership, cancel_at_period_end: true } },
  render: args => (
    <StoryFrame width='max-w-md'>
      <MembershipStatus {...args} />
    </StoryFrame>
  ),
}
