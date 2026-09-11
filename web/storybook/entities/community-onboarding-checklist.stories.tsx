import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityOnboardingChecklist } from '@/components/communities/community-onboarding-checklist'

const meta = {
  title: 'Entities/Communities/OnboardingChecklist',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AllIncomplete: Story = {
  render: () => (
    <CommunityOnboardingChecklist
      communitySlug='test-community'
      hasRules={false}
      automodConfigured={false}
    />
  ),
}

export const PartiallyComplete: Story = {
  render: () => (
    <CommunityOnboardingChecklist
      communitySlug='test-community'
      hasRules
      automodConfigured={false}
    />
  ),
}

export const RulesAndAutomodDone: Story = {
  render: () => (
    <CommunityOnboardingChecklist
      communitySlug='test-community'
      hasRules
      automodConfigured
    />
  ),
}
