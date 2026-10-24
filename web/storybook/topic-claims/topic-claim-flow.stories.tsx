import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicClaimFlow } from '@/components/topic-claims/topic-claim-flow'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import type { TopicClaim } from '@/types/topic-claims'

const feed = topics.find(topic => topic.topic_type === 'rss_feed')!
const claimant = publicUsers[0]!

const existingClaim = {
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
  verification_token_issued_at: null,
  domain_verified_at: null,
  created_at: now,
  updated_at: now,
} as TopicClaim

const meta = {
  title: 'Topic Claims/Topic Claim Flow',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const NewClaim: Story = {
  render: () => (
    <StoryFrame>
      <TopicClaimFlow topicIdOrSlug={feed.slug} />
    </StoryFrame>
  ),
}

export const ExistingClaimNeedsDomainVerification: Story = {
  render: () => (
    <StoryFrame>
      <TopicClaimFlow
        topicIdOrSlug={feed.slug}
        existingClaim={existingClaim}
      />
    </StoryFrame>
  ),
}
