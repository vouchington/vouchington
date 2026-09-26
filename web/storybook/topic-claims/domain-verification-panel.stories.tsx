import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DomainVerificationPanel } from '@/components/topic-claims/domain-verification-panel'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import type { TopicClaim } from '@/types/topic-claims'

const feed = topics.find(topic => topic.topic_type === 'rss_feed')!
const claimant = publicUsers[0]!

const claim: TopicClaim = {
  id: 'claim-fintech-daily',
  topic_id: feed.id,
  claimant_user_id: claimant.id,
  verification_method: null,
  claimed_role: 'Publisher',
  evidence: '',
  submitted_at: null,
  verified_at: null,
  verified_by_id: null,
  rejected_at: null,
  rejected_by_id: null,
  rejection_reason: null,
  revoked_at: null,
  revoked_by_id: null,
  revocation_reason: null,
  verification_hostname_id: null,
  verification_token_hash: null,
  verification_token_issued_at: null,
  domain_verified_at: null,
  created_at: now,
  updated_at: now,
}

const meta = {
  title: 'Topic Claims/Domain Verification Panel',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const WithHostname: Story = {
  render: () => (
    <StoryFrame>
      <DomainVerificationPanel
        topicIdOrSlug={feed.slug}
        claim={claim}
        hasHostname
        onVerified={() => undefined}
      />
    </StoryFrame>
  ),
}

export const WithoutHostname: Story = {
  render: () => (
    <StoryFrame>
      <DomainVerificationPanel
        topicIdOrSlug={topics[0]!.slug}
        claim={{ ...claim, topic_id: topics[0]!.id, claimed_role: 'Program editor' }}
        hasHostname={false}
        onVerified={() => undefined}
      />
    </StoryFrame>
  ),
}
