import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityAutomodReviewAction } from '@/components/communities/community-automod-review-action'
import type { CommunityAutomodAction } from '@/types/api-responses'

const meta = {
  title: 'Moderation/CommunityAutomodReviewAction',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const sampleAction: CommunityAutomodAction = {
  source_key: 'post-123',
  source_type: 'agent_moderation',
  post_id: 'post-123',
  community_id: 'community-1',
  agent_moderation_id: 'agent-mod-1',
  moderator_slug: 'spam-filter',
  title: 'Great deal on a new credit card',
  authored_title: 'Great deal on a new credit card',
  declared_language: null,
  lingua_rs_detected_language: 'en',
  markdown_preview: 'Check out this amazing offer for a limited time only...',
  post_type: 'discussion',
  post_href: '/posts/great-deal-on-a-new-credit-card',
  created_at: '2026-06-01T00:00:00.000Z',
  action_at: '2026-06-01T00:05:00.000Z',
  confidence_score: 0.82,
  flagged: true,
  reason: 'Possible spam',
  categories: ['spam', 'promotional'],
  model_output: null,
  current_state: 'rejected',
  feedback_label: null,
}

function CommunityAutomodReviewActionStandalone() {
  const [reason, setReason] = useState<string | undefined>(undefined)
  const [note, setNote] = useState('')

  return (
    <CommunityAutomodReviewAction
      action={sampleAction}
      reason={reason}
      note={note}
      disabled={false}
      onReasonSelect={setReason}
      onNoteChange={setNote}
      onSubmit={() => {}}
    />
  )
}

export const Default: Story = {
  render: () => <CommunityAutomodReviewActionStandalone />,
}

export const Disabled: Story = {
  render: () => (
    <CommunityAutomodReviewAction
      action={sampleAction}
      reason='too_strict'
      note='Reviewed manually, keeping removed.'
      disabled
      onReasonSelect={() => {}}
      onNoteChange={() => {}}
      onSubmit={() => {}}
    />
  ),
}
