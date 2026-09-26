import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ValidationsListTable } from '@/components/admin/referral-link-validations/validations-list-table'
import { StoryFrame } from '@/storybook/story-frame'
import type { ReferralLinkValidation } from '@/lib/api/client/referral-link-validations'

const validations: ReferralLinkValidation[] = [
  {
    id: 'validation-sapphire-reserve',
    slug: 'sapphire-reserve',
    user_help_text:
      'Paste the personal referral URL from your Sapphire Reserve account, including the invite code.',
    updated_at: '2026-09-20T12:00:00.000Z',
  },
  {
    id: 'validation-amex-gold',
    slug: 'amex-gold',
    user_help_text: 'Copy the referral link shown after you sign in to American Express.',
    updated_at: '2026-09-18T12:00:00.000Z',
  },
]

const basePath = '/referral-program/amex-referrals/validations'

const meta = {
  title: 'Admin/Validations List Table',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const WithSets: Story = {
  render: () => (
    <StoryFrame>
      <ValidationsListTable
        validations={validations}
        basePath={basePath}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <ValidationsListTable
        validations={[]}
        basePath={basePath}
      />
    </StoryFrame>
  ),
}
