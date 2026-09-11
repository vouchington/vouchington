import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PaidPlanCard } from '@/components/memberships/paid-plan-card'
import { TooltipProvider } from '@/components/ui/tooltip'
import type {
  MembershipPlanSku,
  MembershipSku,
  SubscriptionMembership,
} from '@/types/api-responses'

const plusMonthlySku: MembershipPlanSku = {
  id: 'plus-monthly',
  plan: 'plus',
  price: { amount: 500, currency: 'usd' },
  interval: 'monthly',
  stripe_price_id: 'price_plus_monthly',
}

const membershipSku: MembershipSku = {
  ...plusMonthlySku,
  retired_at: null,
}

const plusMembership: SubscriptionMembership = {
  __entity_type: 'membership',
  id: 'membership-1',
  user_id: 'user-1',
  plan: 'plus',
  status: 'active',
  started_at: '2026-01-01T00:00:00.000Z',
  expires_at: null,
  has_stripe_subscription: true,
  granted_by_id: null,
  cancelled_at: null,
  expired_at: null,
  past_due_at: null,
  paused_at: null,
  cancel_at_period_end: false,
  latest_change_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  sku: membershipSku,
}

const meta = {
  title: 'Memberships/Paid Plan Card',
  component: PaidPlanCard,
} satisfies Meta<typeof PaidPlanCard>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-sm'>{children}</div>
    </main>
  </TooltipProvider>
)

export const SignedOutPlus: Story = {
  args: {
    billingInterval: 'monthly',
    isCurrent: false,
    planSlug: 'plus',
    savingsPct: null,
    sku: plusMonthlySku,
  },
  render: args => (
    <Frame>
      <PaidPlanCard {...args} />
    </Frame>
  ),
}

export const MostPopularPlus: Story = {
  args: {
    billingInterval: 'monthly',
    isCurrent: false,
    membership: null,
    planSlug: 'plus',
    savingsPct: null,
    sku: plusMonthlySku,
  },
  render: args => (
    <Frame>
      <PaidPlanCard {...args} />
    </Frame>
  ),
}

export const CurrentPlus: Story = {
  args: {
    billingInterval: 'monthly',
    isCurrent: true,
    membership: plusMembership,
    planSlug: 'plus',
    savingsPct: null,
    sku: plusMonthlySku,
  },
  render: args => (
    <Frame>
      <PaidPlanCard {...args} />
    </Frame>
  ),
}
