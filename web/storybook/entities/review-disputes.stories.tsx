import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { DisputesClient } from '@/components/disputes/disputes-client'
import { DisputeContext } from '@/components/disputes/dispute-context'
import { DisputeRow } from '@/components/disputes/dispute-row'
import { MemberDisputeRow } from '@/components/disputes/member-dispute-row'
import { DisputeStatusCard } from '@/components/disputes/dispute-status-card'
import { DisputeAnnotation } from '@/components/disputes/dispute-annotation'
import { TopicClaimReview } from '@/components/admin/topic-claim-review'
import { EntityStoryFrame } from './entity-story-frame'
import {
  pendingDispute,
  resolvedDispute,
  staffData,
  memberData,
  annotation,
  verifiedClaim,
  pendingClaim,
} from './fixtures/review-disputes'

const meta = {
  title: 'Entities/Admin/Review Disputes',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const StaffQueue: Story = {
  render: () => (
    <EntityStoryFrame
      title='Review Disputes — Staff'
      description='Staff queue with AI draft, staged approve/send controls, and resolution actions.'
    >
      <DisputesClient
        viewerTier='staff'
        data={staffData}
      />
    </EntityStoryFrame>
  ),
}

export const MemberQueue: Story = {
  render: () => (
    <EntityStoryFrame
      title='Review Disputes — Member'
      description='Redacted public view: link, reason, and status only.'
    >
      <DisputesClient
        viewerTier='member'
        data={memberData}
      />
    </EntityStoryFrame>
  ),
}

export const StaffRow: Story = {
  render: () => (
    <EntityStoryFrame title='Dispute Row (staff)'>
      <table className='min-w-full divide-y divide-border'>
        <tbody className='divide-y divide-border bg-card'>
          <DisputeRow
            dispute={pendingDispute}
            disabled={false}
            onEdit={fn()}
            onApprove={fn()}
            onSend={fn()}
            onRerunAI={fn()}
            onResolve={fn()}
            onAnnotate={fn()}
          />
        </tbody>
      </table>
    </EntityStoryFrame>
  ),
}

export const Context: Story = {
  render: () => (
    <EntityStoryFrame title='Dispute Context'>
      <DisputeContext dispute={pendingDispute} />
    </EntityStoryFrame>
  ),
}

export const MemberRow: Story = {
  render: () => (
    <EntityStoryFrame title='Dispute Row (member, redacted)'>
      <table className='min-w-full divide-y divide-border'>
        <tbody className='divide-y divide-border bg-card'>
          <MemberDisputeRow dispute={resolvedDispute} />
        </tbody>
      </table>
    </EntityStoryFrame>
  ),
}

export const StatusCard: Story = {
  render: () => (
    <EntityStoryFrame title='Dispute Status Card'>
      <DisputeStatusCard dispute={resolvedDispute} />
    </EntityStoryFrame>
  ),
}

export const Annotation: Story = {
  render: () => (
    <EntityStoryFrame title='Public Rebuttal Annotation'>
      <DisputeAnnotation annotation={annotation} />
    </EntityStoryFrame>
  ),
}

export const ClaimReviewPending: Story = {
  render: () => (
    <EntityStoryFrame title='Topic Claim Review (pending)'>
      <TopicClaimReview claim={pendingClaim} />
    </EntityStoryFrame>
  ),
}

export const ClaimReviewVerified: Story = {
  render: () => (
    <EntityStoryFrame title='Topic Claim Review (verified)'>
      <TopicClaimReview claim={verifiedClaim} />
    </EntityStoryFrame>
  ),
}
