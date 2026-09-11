import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ContributionGatedCta } from '@/components/posts/contribution-gated-cta'
import type { ContributionStatusResponseBody } from '@/types/api-responses/urls-onboarding-and-trends'
import { EntityStoryFrame, StoryCard } from './entity-story-frame'

const meta = {
  title: 'Entities/ContributionGatedCta',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const accountTooNewStatus: ContributionStatusResponseBody['contribution_status'] = {
  allowed: false,
  reason: 'account_too_new',
}

const emailVerificationStatus: ContributionStatusResponseBody['contribution_status'] = {
  allowed: false,
  reason: 'email_verification_required',
}

const unknownStatus: ContributionStatusResponseBody['contribution_status'] = {
  allowed: false,
}

export const AccountTooNew: Story = {
  render: () => (
    <EntityStoryFrame title='Contribution Gating — Account Too New'>
      <div className='max-w-2xl space-y-4'>
        <h1 className='text-2xl font-bold'>New Discussion</h1>
        <ContributionGatedCta
          status={accountTooNewStatus}
          actionNoun='start a discussion'
        />
      </div>
    </EntityStoryFrame>
  ),
}

export const EmailVerificationRequired: Story = {
  render: () => (
    <EntityStoryFrame title='Contribution Gating — Email Verification Required'>
      <div className='max-w-2xl space-y-4'>
        <h1 className='text-2xl font-bold'>New Review</h1>
        <ContributionGatedCta
          status={emailVerificationStatus}
          actionNoun='write a review'
        />
      </div>
    </EntityStoryFrame>
  ),
}

export const UnknownReason: Story = {
  render: () => (
    <EntityStoryFrame title='Contribution Gating — Unknown Reason'>
      <div className='max-w-2xl space-y-4'>
        <h1 className='text-2xl font-bold'>New Data Point</h1>
        <ContributionGatedCta
          status={unknownStatus}
          actionNoun='share a data point'
        />
      </div>
    </EntityStoryFrame>
  ),
}

export const AllVariants: Story = {
  render: () => (
    <EntityStoryFrame title='Contribution Gating — All Variants'>
      <div className='max-w-2xl space-y-8'>
        <StoryCard title='account_too_new'>
          <ContributionGatedCta status={accountTooNewStatus} />
        </StoryCard>
        <StoryCard title='email_verification_required'>
          <ContributionGatedCta status={emailVerificationStatus} />
        </StoryCard>
        <StoryCard title='unknown reason (fallback)'>
          <ContributionGatedCta status={unknownStatus} />
        </StoryCard>
      </div>
    </EntityStoryFrame>
  ),
}
