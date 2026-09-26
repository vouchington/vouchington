import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { OfficialReferralLinkForm } from '@/components/admin/official-referral-links/official-referral-link-form'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import type { OfficialReferralLink } from '@/lib/api/server/referral-links'

const amexLinks: OfficialReferralLink[] = [
  {
    id: 'official-link-amex',
    url: 'https://www.americanexpress.com/refer/cardholder',
    label: 'Amex Membership Rewards referral',
    activated_at: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'official-link-amex-draft',
    url: 'https://www.americanexpress.com/refer/cardholder-gold',
    label: null,
    activated_at: null,
  },
]

const meta = {
  title: 'Admin/Official Referral Link Form',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const WithLinks: Story = {
  render: () => (
    <StoryFrame width='max-w-3xl'>
      <OfficialReferralLinkForm
        referralProgramId='topic-amex-referrals'
        links={amexLinks}
        validationInfo={{
          user_help_text: 'Use the personal referral URL from the Amex account page.',
          example_urls: ['https://www.americanexpress.com/refer/your-code'],
        }}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-3xl'>
      <OfficialReferralLinkForm
        referralProgramId='topic-amex-referrals'
        links={[]}
        validationInfo={null}
      />
    </StoryFrame>
  ),
}
