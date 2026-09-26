import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PlanCards } from '@/components/memberships/plan-cards'
import { FeatureFlagsProvider } from '@/lib/feature-flags/context'
import type {
  MembershipBenefitCatalog,
  MembershipPlanSku,
  SubscriptionMembership,
} from '@/types/api-responses'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Memberships/Plan Cards',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const plusMonthly: MembershipPlanSku = {
  id: 'plus-monthly',
  plan: 'plus',
  price: { amount: 500, currency: 'usd' },
  interval: 'monthly',
  stripe_price_id: 'price_plus_monthly',
}

const proMonthly: MembershipPlanSku = {
  id: 'pro-monthly',
  plan: 'pro',
  price: { amount: 1200, currency: 'usd' },
  interval: 'monthly',
  stripe_price_id: 'price_pro_monthly',
}

const plans = { plus: [plusMonthly], pro: [proMonthly] }

const benefitCatalog: MembershipBenefitCatalog = {
  version: 1,
  groups: [
    {
      id: 'contribute',
      benefits: [
        {
          id: 'public_contribution_access',
          placements: ['card', 'comparison'],
          values: {
            free: { kind: 'access', access: 'after_wait' },
            plus: { kind: 'access', access: 'immediate' },
            pro: { kind: 'access', access: 'immediate' },
          },
        },
      ],
    },
  ],
}

const plusMembership: SubscriptionMembership = {
  __entity_type: 'membership',
  id: 'membership-plus',
  user_id: storyCurrentUser.id,
  plan: 'plus',
  status: 'active',
  started_at: '2026-01-15T00:00:00.000Z',
  expires_at: '2026-07-15T00:00:00.000Z',
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
  sku: { ...plusMonthly, retired_at: null },
}

function Cards(props: { membership?: SubscriptionMembership | null }) {
  return (
    <FeatureFlagsProvider globalFlags={{ memberships: true, membershipStripeBilling: true }}>
      <PlanCards
        benefitCatalog={benefitCatalog}
        plans={plans}
        membership={props.membership}
      />
    </FeatureFlagsProvider>
  )
}

export const CurrentPlus: Story = {
  render: () => (
    <StoryFrame width='max-w-5xl'>
      <Cards membership={plusMembership} />
    </StoryFrame>
  ),
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => (
    <StoryFrame width='max-w-5xl'>
      <Cards />
    </StoryFrame>
  ),
}
