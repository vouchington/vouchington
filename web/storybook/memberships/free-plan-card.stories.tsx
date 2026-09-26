import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FreePlanCard } from '@/components/memberships/free-plan-card'
import type { MembershipBenefitCatalog } from '@/types/api-responses'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Memberships/Free Plan Card',
  component: FreePlanCard,
} satisfies Meta<typeof FreePlanCard>

export default meta
type Story = StoryObj<typeof meta>

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

export const Current: Story = {
  args: { benefitCatalog, freeCurrent: true, membership: null },
  render: args => (
    <StoryFrame width='max-w-sm'>
      <FreePlanCard {...args} />
    </StoryFrame>
  ),
}

export const SignedOut: Story = {
  args: { benefitCatalog, freeCurrent: false },
  parameters: { auth: { currentUser: null } },
  render: args => (
    <StoryFrame width='max-w-sm'>
      <FreePlanCard {...args} />
    </StoryFrame>
  ),
}
