import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PlanComparisonTable } from '@/components/memberships/plan-comparison-table'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { MembershipBenefitCatalog, MembershipPlanSku } from '@/types/api-responses'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Memberships/Plan Comparison Table',
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
        {
          id: 'community_agent_rules',
          placements: ['comparison'],
          values: {
            free: { kind: 'availability', included: false },
            plus: { kind: 'quantity', quantity: 1 },
            pro: { kind: 'quantity', quantity: 5 },
          },
        },
      ],
    },
  ],
}

function Comparison() {
  const t = useTranslations()
  return (
    <PlanComparisonTable
      benefitCatalog={benefitCatalog}
      locale='en'
      plans={{ plus: [plusMonthly], pro: [proMonthly] }}
      t={t}
    />
  )
}

export const MonthlyPrices: Story = {
  render: () => (
    <StoryFrame width='max-w-5xl'>
      <Comparison />
    </StoryFrame>
  ),
}
