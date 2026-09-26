import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ValidationForm } from '@/components/admin/referral-link-validations/validation-form'
import { StoryFrame } from '@/storybook/story-frame'
import type { ReferralLinkValidation } from '@/lib/api/client/referral-link-validations'

const sapphireValidation: ReferralLinkValidation = {
  id: 'validation-sapphire-reserve',
  slug: 'sapphire-reserve',
  user_help_text:
    'Paste the personal referral URL from your Sapphire Reserve account, including the invite code.',
  updated_at: '2026-09-20T12:00:00.000Z',
}

const basePath = '/referral-program/amex-referrals/validations'

const meta = {
  title: 'Admin/Validation Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Create: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ValidationForm
        basePath={basePath}
        referralProgramId='topic-amex-referrals'
      />
    </StoryFrame>
  ),
}

export const Update: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ValidationForm
        existing={sapphireValidation}
        basePath={basePath}
      />
    </StoryFrame>
  ),
}
